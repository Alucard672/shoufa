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

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
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
    } finally {
      wx.hideLoading()
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
    console.log('统计页面loadStatistics - 发料单IDs:', issueIds)
    let totalReturnPieces = 0
    let totalReturnWeight = 0
    let returnedCount = 0

    if (issueIds.length > 0) {
      const _ = wx.cloud.database().command
      // 先尝试使用 issueId，如果失败再尝试 issue_id
      let returnOrdersRes
      try {
        returnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        console.log('统计页面loadStatistics - 使用issueId查询回货单:', returnOrdersRes.data.length, '条')
      } catch (e) {
        console.log('统计页面loadStatistics - issueId查询失败，尝试issue_id:', e)
        returnOrdersRes = await query('return_orders', {
          issue_id: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        console.log('统计页面loadStatistics - 使用issue_id查询回货单:', returnOrdersRes.data.length, '条')
      }

      returnOrdersRes.data.forEach(order => {
        totalReturnPieces += order.returnPieces || order.return_pieces || 0
        totalReturnWeight += order.actualYarnUsage || order.actual_yarn_usage || 0
      })
      console.log('统计页面loadStatistics - 总计回货件数:', totalReturnPieces, '重量:', totalReturnWeight)
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
    console.log('统计页面 - 发料单IDs:', issueIds)
    
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      // 先查询所有回货单，看看实际的 issueId 值
      const allReturnOrdersRes = await query('return_orders', {}, {
        excludeDeleted: true
      })
      console.log('统计页面 - 所有回货单:', allReturnOrdersRes.data.length, '条')
      allReturnOrdersRes.data.forEach(ro => {
        console.log('统计页面 - 回货单详情:', {
          returnNo: ro.returnNo || ro.return_no,
          issueId: ro.issueId || ro.issue_id,
          issueIdType: typeof (ro.issueId || ro.issue_id),
          issueIdStr: String(ro.issueId || ro.issue_id)
        })
      })
      
      const _ = wx.cloud.database().command
      // 先尝试使用 issueId，如果失败再尝试 issue_id
      let returnOrdersRes
      try {
        returnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        console.log('统计页面 - 使用issueId查询回货单:', returnOrdersRes.data.length, '条', returnOrdersRes.data.map(o => ({ id: o._id, issueId: o.issueId || o.issue_id, returnNo: o.returnNo || o.return_no })))
      } catch (e) {
        console.log('统计页面 - issueId查询失败，尝试issue_id:', e)
        returnOrdersRes = await query('return_orders', {
          issue_id: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        console.log('统计页面 - 使用issue_id查询回货单:', returnOrdersRes.data.length, '条', returnOrdersRes.data.map(o => ({ id: o._id, issueId: o.issueId || o.issue_id, returnNo: o.returnNo || o.return_no })))
      }
      
      // 如果查询结果为空，尝试在内存中过滤
      if (returnOrdersRes.data.length === 0 && allReturnOrdersRes.data.length > 0) {
        console.log('统计页面 - 尝试在内存中匹配回货单')
        const issueIdsStr = issueIds.map(id => String(id))
        returnOrdersRes.data = allReturnOrdersRes.data.filter(ro => {
          const roIssueId = ro.issueId || ro.issue_id
          const roIssueIdStr = String(roIssueId)
          const matched = issueIdsStr.includes(roIssueIdStr) || issueIds.includes(roIssueId)
          if (matched) {
            console.log('统计页面 - 内存匹配成功:', roIssueIdStr, '匹配到发料单ID')
          }
          return matched
        })
        console.log('统计页面 - 内存匹配结果:', returnOrdersRes.data.length, '条')
      }
      
      // 按 issueId 分组（直接使用原始issueId作为key，与首页动态页面保持一致）
      returnOrdersRes.data.forEach(returnOrder => {
        const issueId = returnOrder.issueId || returnOrder.issue_id
        if (!returnOrdersMap.has(issueId)) {
          returnOrdersMap.set(issueId, [])
        }
        returnOrdersMap.get(issueId).push(returnOrder)
      })

      // 确保所有发料单都有对应的数组（即使为空）
      issueIds.forEach(issueId => {
        if (!returnOrdersMap.has(issueId)) {
          returnOrdersMap.set(issueId, [])
        }
      })
      
      console.log('统计页面 - 回货单Map:', Array.from(returnOrdersMap.entries()).map(([k, v]) => [k, v.length]))
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
        const issueOrderId = issueOrder.id || issueOrder._id
        // 直接使用原始ID作为key，与首页动态页面保持一致
        const returnOrders = returnOrdersMap.get(issueOrderId) || []

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
