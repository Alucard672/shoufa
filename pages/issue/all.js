// pages/issue/all.js
import { query, queryByIds, update, count } from '../../utils/db.js'
import { getTimeRange, formatDate, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    issueOrders: [],
    filteredOrders: [],
    loading: false,
    // 筛选条件
    timeFilter: 'all',
    timeFilterIndex: 0,
    statusFilter: 'all',
    statusFilterIndex: 0,
    searchKeyword: '',
    // 统计数据
    totalIssueWeight: 0,
    totalIssueWeightFormatted: '0.0',
    totalReturnPieces: 0,
    totalReturnWeightFormatted: '0.0',
    totalIssueCount: 0
  },

  // 预览图片
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  },

  onLoad() {
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
        this.loadIssueOrders()
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
    // 1. 获取所有发料单计算发料总量
    const ordersRes = await query('issue_orders', null, {
      excludeDeleted: true
    })

    let totalWeight = 0
    ordersRes.data.forEach(order => {
      totalWeight += order.issueWeight || 0
    })

    // 2. 获取所有回货单计算回货总量
    const returnRes = await query('return_orders', null, {
      excludeDeleted: true
    })

    let totalReturnPieces = 0
    let totalReturnWeight = 0
    returnRes.data.forEach(order => {
      totalReturnPieces += order.returnPieces || 0
      totalReturnWeight += order.actualYarnUsage || 0
    })

    this.setData({
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2),
      totalReturnPieces: totalReturnPieces,
      totalReturnWeightFormatted: totalReturnWeight.toFixed(2),
      totalIssueCount: ordersRes.data.length
    })
  },

  async loadIssueOrders() {
    console.log('开始加载发料单，筛选条件:', {
      timeFilter: this.data.timeFilter,
      statusFilter: this.data.statusFilter,
      searchKeyword: this.data.searchKeyword
    })

    // 构建查询条件
    const whereClause = {}

    // 搜索
    if (this.data.searchKeyword) {
      whereClause.issueNo = this.data.searchKeyword
    }

    const ordersRes = await query('issue_orders', whereClause, {
      excludeDeleted: true,
      orderBy: { field: 'issueDate', direction: 'DESC' }
    })
    const orders = ordersRes.data || []
    console.log('查询到的订单数量:', orders.length)

    // 在内存中进行时间筛选
    let filteredData = orders || []
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
        const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

        filteredData = filteredData.filter(order => {
          const date = order.issueDate || order.issue_date
          if (!date) return false

          let orderDate
          try {
            if (date instanceof Date) {
              orderDate = date
            } else if (typeof date === 'string') {
              const dateStr = date.replace(/\//g, '-')
              orderDate = new Date(dateStr)
            } else if (date && typeof date === 'object') {
              if (typeof date.getTime === 'function') {
                orderDate = new Date(date.getTime())
              } else if (date._seconds) {
                orderDate = new Date(date._seconds * 1000)
              } else if (typeof date === 'number') {
                orderDate = new Date(date)
              } else {
                orderDate = new Date(date)
              }
            } else {
              orderDate = new Date(date)
            }

            if (isNaN(orderDate.getTime())) {
              return false
            }

            const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())
            const filterStartOnly = new Date(filterStart.getFullYear(), filterStart.getMonth(), filterStart.getDate())
            const filterEndOnly = new Date(filterEnd.getFullYear(), filterEnd.getMonth(), filterEnd.getDate())

            return orderDateOnly.getTime() >= filterStartOnly.getTime() && orderDateOnly.getTime() <= filterEndOnly.getTime()
          } catch (e) {
            console.error('日期解析错误:', order.issueDate, e)
            return false
          }
        })
      }
    }

    // 批量查询工厂和款号信息
    const factoryIds = [...new Set(filteredData.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(filteredData.map(order => order.styleId || order.style_id).filter(Boolean))]
    const issueIds = filteredData.map(order => order._id || order.id)

    // 批量查询工厂信息
    const factoriesMap = new Map()
    if (factoryIds.length > 0) {
      const factoriesRes = await queryByIds('factories', factoryIds)
      factoriesRes.data.forEach(factory => {
        factoriesMap.set(factory._id || factory.id, factory)
      })
    }

    // 批量查询款号信息
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds)
      stylesRes.data.forEach(style => {
        stylesMap.set(style._id || style.id, style)
      })
    }

    // 批量查询所有回货单
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      issueIds.forEach(id => {
        returnOrdersMap.set(id, [])
      })

      try {
        const _ = wx.cloud.database().command
        const allReturnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })

        allReturnOrdersRes.data.forEach(order => {
          const issueId = order.issueId || order.issue_id
          if (returnOrdersMap.has(issueId)) {
            returnOrdersMap.get(issueId).push(order)
          }
        })
      } catch (error) {
        console.error('批量查询回货单失败:', error)
      }
    }

    // 关联查询工厂和款号信息，并计算回货进度
    const ordersWithDetails = await Promise.all(
      filteredData.map(async (order) => {
        try {
          const factoryId = order.factoryId || order.factory_id
          const styleId = order.styleId || order.style_id
          const orderId = order.id || order._id
          
          const factory = factoriesMap.get(factoryId)
          const style = stylesMap.get(styleId)
          const returnOrdersList = returnOrdersMap.get(orderId) || []

          const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
          const issuePieces = order.issuePieces || order.issue_pieces || 0

          const progress = this.calculateProgressFromData(order, style, returnOrdersList)

          // 按回货日期排序回货单
          const sortedReturnOrders = returnOrdersList
            .map((ro, index) => ({
              ...ro,
              returnOrderIndex: index + 1,
              returnDateFormatted: formatDate(ro.returnDate || ro.return_date),
              actualYarnUsageFormatted: (ro.actualYarnUsage || ro.actual_yarn_usage || 0).toFixed(2)
            }))
            .sort((a, b) => {
              const dateA = a.returnDate || a.return_date
              const dateB = b.returnDate || b.return_date
              const dateAObj = dateA instanceof Date ? dateA : new Date(dateA)
              const dateBObj = dateB instanceof Date ? dateB : new Date(dateB)
              return dateBObj.getTime() - dateAObj.getTime()
            })

          const canComplete = progress.totalReturnPieces > issuePieces && order.status !== '已完成'

          return {
            ...order,
            _id: order._id || order.id,
            factoryName: factory?.name || '未知工厂',
            styleName: style?.styleName || style?.style_name || style?.name || '未知款号',
            styleCode: style?.styleCode || style?.style_code || '',
            styleImageUrl: style?.imageUrl || style?.image_url || '',
            color: order.color || '',
            size: order.size || '',
            yarnUsagePerPiece: yarnUsagePerPiece,
            progress,
            returnOrders: sortedReturnOrders,
            issueDateFormatted: formatDate(order.issueDate || order.issue_date),
            issueWeightFormatted: formatWeight(order.issueWeight || order.issue_weight),
            issuePieces,
            canComplete
          }
        } catch (error) {
          console.error('加载订单详情失败:', error)
          return {
            ...order,
            _id: order._id || order.id,
            factoryName: '加载失败',
            styleName: '加载失败',
            yarnUsagePerPiece: 0,
            progress: {
              totalReturnPieces: 0,
              totalReturnYarn: 0,
              totalReturnQuantity: 0,
              remainingYarn: order.issueWeight || order.issue_weight,
              remainingPieces: 0,
              remainingQuantity: 0,
              status: order.status
            },
            returnOrders: [],
            issueDateFormatted: formatDate(order.issueDate || order.issue_date),
            issueWeightFormatted: formatWeight(order.issueWeight || order.issue_weight),
            issuePieces: 0,
            canComplete: false
          }
        }
      })
    )

    // 应用状态筛选
    let finalOrders = ordersWithDetails || []
    if (this.data.statusFilter !== 'all') {
      finalOrders = ordersWithDetails.filter(order => {
        // 优先使用 order.status（数据库中的实际状态），如果是已完成则直接使用
        // 否则使用 progress.status（计算出的回货状态）
        const orderStatus = order.status === '已完成' ? '已完成' : (order.progress?.status || order.status)
        // 如果筛选的不是"已完成"，则排除已完成状态的单据
        if (this.data.statusFilter !== '已完成' && orderStatus === '已完成') {
          return false
        }
        return orderStatus === this.data.statusFilter
      })
    } else {
      // 如果选择"全部"，显示所有状态（包括已完成）
      finalOrders = ordersWithDetails
    }

    this.setData({
      issueOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      loading: false
    })
  },

  // 从已有数据计算回货进度
  calculateProgressFromData(issueOrder, style, returnOrdersList) {
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0

    let totalReturnPieces = 0
    let totalReturnYarn = 0
    let totalReturnQuantity = 0

    returnOrdersList.forEach(order => {
      totalReturnPieces += order.returnPieces || order.return_pieces || 0
      totalReturnYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
      totalReturnQuantity += order.returnQuantity || order.return_quantity || 0
    })

    const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
    const remainingYarn = issueWeight - totalReturnYarn
    const remainingPieces = yarnUsagePerPiece > 0
      ? Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
      : 0
    const remainingQuantity = remainingPieces / 12

    // 判断状态
    let status = '未回货'
    if (totalReturnYarn > 0) {
      if (remainingYarn <= 0.01) {
        status = '已回货'
      } else {
        status = '部分回货'
      }
    }

    // 如果订单状态是已完成，使用已完成状态
    if (issueOrder.status === '已完成') {
      status = '已完成'
    }

    return {
      totalReturnPieces,
      totalReturnYarn,
      totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
      totalReturnQuantity,
      totalReturnQuantityFormatted: totalReturnQuantity.toFixed(1),
      remainingYarn,
      remainingYarnFormatted: remainingYarn.toFixed(2),
      remainingPieces,
      remainingQuantity,
      remainingQuantityFormatted: remainingQuantity.toFixed(1),
      status
    }
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      timeFilter: selectedFilter,
      timeFilterIndex: index,
      loading: true
    })
    this.loadIssueOrders()
  },

  onStatusFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货', '已完成']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index,
      loading: true
    })
    this.loadIssueOrders()
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value,
      loading: true
    })
    this.loadIssueOrders()
  },

  navigateToReturn(e) {
    const issueId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/return/create?issueId=${issueId}`
    })
  },

  async onCompleteIssue(e) {
    const issueId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认完成',
      content: '确定要将此发料单标记为已完成吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: '处理中...'
            })

            await update('issue_orders', {
              status: '已完成'
            }, {
              id: issueId
            })

            wx.hideLoading()
            wx.showToast({
              title: '标记成功',
              icon: 'success'
            })

            // 重新加载数据
            this.loadIssueOrders()
          } catch (error) {
            console.error('标记完成失败:', error)
            wx.hideLoading()
            wx.showToast({
              title: '标记失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

