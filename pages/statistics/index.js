// pages/statistics/index.js
import { query, queryByIds, getStyleById } from '../../utils/db.js'
import { getTimeRange, formatDate, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    totalIssueCount: 0,
    returnedCount: 0,
    timeFilter: 'all',
    statusFilter: 'all',
    searchKeyword: '',
    statistics: []
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadData()
  },

  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    try {
      await Promise.all([
        this.loadStatistics(),
        this.loadStatisticsList()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async loadStatistics() {
    let whereClause = {}

    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        whereClause.issueDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    const issueOrdersRes = await query('issue_orders', whereClause, {
      excludeDeleted: true
    })

    const issueIds = issueOrdersRes.data.map(order => order.id || order._id)
    let totalReturnPieces = 0
    let totalReturnWeight = 0
    let returnedCount = 0

    if (issueIds.length > 0) {
      const _ = wx.cloud.database().command
      const returnOrdersRes = await query('return_orders', {
        issue_id: _.in(issueIds)
      }, {
        excludeDeleted: true
      })

      returnOrdersRes.data.forEach(order => {
        totalReturnPieces += order.returnPieces || order.return_pieces || 0
        totalReturnWeight += order.actualYarnUsage || order.actual_yarn_usage || 0
      })
    }

    issueOrdersRes.data.forEach(order => {
      if (order.status === '已回货' || order.status === '已完成') {
        returnedCount++
      }
    })

    this.setData({
      totalIssueCount: issueOrdersRes.data.length,
      returnedCount,
      totalReturnPieces: Math.floor(totalReturnPieces),
      totalReturnWeightFormatted: totalReturnWeight.toFixed(2)
    })
  },

  async loadStatisticsList() {
    let whereClause = {}

    // 时间筛选
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        whereClause.issueDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    // 状态筛选
    if (this.data.statusFilter !== 'all') {
      whereClause.status = this.data.statusFilter
    }

    // 搜索
    if (this.data.searchKeyword) {
      whereClause.issue_no = this.data.searchKeyword
    }

    const issueOrdersRes = await query('issue_orders', whereClause, {
      excludeDeleted: true,
      orderBy: { field: 'issueDate', direction: 'DESC' }
    })
    const issueOrders = { data: issueOrdersRes.data || [] }

    // 批量查询回货单
    const issueIds = issueOrders.data.map(order => order.id || order._id)
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      const _ = wx.cloud.database().command
      const returnOrdersRes = await query('return_orders', {
        issue_id: _.in(issueIds)
      }, {
        excludeDeleted: true
      })
      
      returnOrdersRes.data.forEach(order => {
        const issueId = order.issueId || order.issue_id
        if (!returnOrdersMap.has(issueId)) {
          returnOrdersMap.set(issueId, [])
        }
        returnOrdersMap.get(issueId).push(order)
      })
    }

    // 批量查询款号
    const styleIds = [...new Set(issueOrders.data.map(order => order.styleId || order.style_id).filter(Boolean))]
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds)
      stylesRes.data.forEach(style => {
        stylesMap.set(style.id || style._id, style)
      })
    }

    // 为每个发料单加载回货信息和计算统计
    const statistics = await Promise.all(
      issueOrders.data.map(async (issueOrder) => {
        const styleId = issueOrder.styleId || issueOrder.style_id
        const style = stylesMap.get(styleId) || {}
        const returnOrders = returnOrdersMap.get(issueOrder.id || issueOrder._id) || []

        let totalReturnQuantity = 0
        let totalReturnPieces = 0
        let totalReturnYarn = 0
        let latestReturnDate = null

        returnOrders.forEach(order => {
          totalReturnQuantity += order.returnQuantity || order.return_quantity || 0
          totalReturnPieces += Math.floor(order.returnPieces || order.return_pieces || 0)
          totalReturnYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
          const returnDate = order.returnDate || order.return_date
          if (!latestReturnDate || new Date(returnDate) > new Date(latestReturnDate)) {
            latestReturnDate = returnDate
          }
        })

        const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
        const yarnUsagePerPiece = style.yarnUsagePerPiece || style.yarn_usage_per_piece || 0
        const remainingYarn = issueWeight - totalReturnYarn
        const remainingPieces = Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
        const remainingQuantity = remainingPieces / 12

        // 计算损耗率相关数据
        const lossRate = style.lossRate || style.loss_rate || 0
        const planYarnUsage = (totalReturnPieces * yarnUsagePerPiece) / 1000 // 计划用纱量（kg）
        const actualYarnUsage = totalReturnYarn // 实际用纱量（kg）
        const lossAmount = actualYarnUsage - planYarnUsage // 损耗量（kg）
        const actualLossRate = planYarnUsage > 0 ? ((lossAmount / planYarnUsage) * 100) : 0 // 实际损耗率（%）

        // 动态判断状态
        let displayStatus = issueOrder.status
        if (issueOrder.status !== '已完成') {
          if (totalReturnYarn > 0) {
            if (remainingYarn <= 0.01) {
              displayStatus = '已回货'
            } else {
              displayStatus = '部分回货'
            }
          } else {
            displayStatus = '未回货'
          }
        }

        return {
          ...issueOrder,
          _id: issueOrder._id || issueOrder.id,
          status: displayStatus,
          styleName: style.styleName || style.style_name || style.name || '未知款号',
          styleCode: style.styleCode || style.style_code || '',
          styleImageUrl: style.imageUrl || style.image_url || '',
          yarnUsagePerPiece: yarnUsagePerPiece,
          lossRate: lossRate, // 款号设定的损耗率
          planYarnUsage: planYarnUsage, // 计划用纱量
          actualYarnUsage: actualYarnUsage, // 实际用纱量
          lossAmount: lossAmount, // 损耗量
          actualLossRate: actualLossRate, // 实际损耗率
          lossRateFormatted: lossRate.toFixed(1) + '%',
          planYarnUsageFormatted: formatWeight(planYarnUsage),
          lossAmountFormatted: formatWeight(Math.abs(lossAmount)),
          actualLossRateFormatted: actualLossRate.toFixed(1) + '%',
          totalReturnQuantity: totalReturnQuantity.toFixed(1),
          totalReturnPieces: Math.floor(totalReturnPieces),
          totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
          totalReturnYarn,
          remainingYarn,
          remainingPieces: Math.floor(remainingPieces),
          remainingPiecesFormatted: formatQuantity(remainingPieces),
          remainingQuantity,
          remainingQuantityFormatted: remainingQuantity.toFixed(1),
          latestReturnDate,
          issueDateFormatted: formatDate(issueOrder.issueDate || issueOrder.issue_date),
          latestReturnDateFormatted: latestReturnDate ? formatDate(latestReturnDate) : null,
          issueWeightFormatted: formatWeight(issueWeight),
          totalReturnYarnFormatted: formatWeight(totalReturnYarn),
          remainingYarnFormatted: formatWeight(remainingYarn),
          returnOrders: returnOrders
            .slice()
            .sort((a, b) => {
              const dateA = a.returnDate || a.return_date
              const dateB = b.returnDate || b.return_date
              const dateAObj = dateA instanceof Date ? dateA : new Date(dateA)
              const dateBObj = dateB instanceof Date ? dateB : new Date(dateB)
              return dateBObj.getTime() - dateAObj.getTime()
            })
            .map((order, index) => ({
              ...order,
              returnPieces: Math.floor(order.returnPieces || order.return_pieces || 0),
              quantityFormatted: formatQuantity(order.returnPieces || order.return_pieces),
              returnDateFormatted: formatDate(order.returnDate || order.return_date),
              actualYarnUsageFormatted: (order.actualYarnUsage || order.actual_yarn_usage || 0).toFixed(2),
              returnOrderIndex: returnOrders.length - index
            }))
        }
      })
    )

    this.setData({
      statistics
    })
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    console.log('统计页面时间筛选变化:', index, selectedFilter)
    this.setData({
      timeFilter: selectedFilter
    })
    this.loadStatisticsList()
  },

  onStatusFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货']
    const selectedFilter = filters[index] || 'all'
    console.log('统计页面状态筛选变化:', index, selectedFilter)
    this.setData({
      statusFilter: selectedFilter
    })
    this.loadStatisticsList()
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadStatisticsList()
  }
})

