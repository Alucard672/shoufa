// pages/return/index.js
import { getReturnOrders } from '../../utils/db.js'
import { formatDate, formatAmount, formatQuantity } from '../../utils/calc.js'
import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    totalReturnPieces: 0,
    totalReturnQuantityDisp: '', // 累计回货显示
    totalProcessingFee: 0,
    timeFilter: 'all',
    timeFilterIndex: 0,
    searchKeyword: '',
    returnOrders: [],
    filteredOrders: []
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
        this.loadReturnOrders()
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
    const where = {}

    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        where.returnDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    const result = await query('return_orders', where, {
      excludeDeleted: true
    })

    let totalPieces = 0
    let totalFee = 0

    result.data.forEach(order => {
      totalPieces += Math.floor(order.returnPieces || order.return_pieces || 0)
      totalFee += order.processingFee || order.processing_fee || 0
    })

    this.setData({
      totalReturnPieces: totalPieces,
      totalReturnQuantityDisp: formatQuantity(totalPieces),
      totalProcessingFee: totalFee,
      totalProcessingFeeFormatted: totalFee.toFixed(0)
    })
  },

  async loadReturnOrders() {
    const where = {}

    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        where.returnDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    // 查询回货单（搜索在客户端过滤）
    const ordersRes = await query('return_orders', where, {
      excludeDeleted: true,
      orderBy: { field: 'returnDate', direction: 'DESC' }
    })

    // 客户端过滤搜索关键词
    let orders = ordersRes.data || []
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      orders = orders.filter(order => {
        const returnNo = (order.returnNo || order.return_no || '').toLowerCase()
        return returnNo.includes(keyword)
      })
    }

    // 批量查询工厂、款号和发料单信息
    const factoryIds = [...new Set(orders.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(orders.map(order => order.styleId || order.style_id).filter(Boolean))]
    const issueIds = [...new Set(orders.map(order => order.issueId || order.issue_id).filter(Boolean))]

    const [factoriesRes, stylesRes, issueOrdersRes] = await Promise.all([
      factoryIds.length > 0 ? queryByIds('factories', factoryIds, { excludeDeleted: true }) : { data: [] },
      styleIds.length > 0 ? queryByIds('styles', styleIds, { excludeDeleted: true }) : { data: [] },
      issueIds.length > 0 ? queryByIds('issue_orders', issueIds, { excludeDeleted: true }) : { data: [] }
    ])

    const factoriesMap = Object.fromEntries(factoriesRes.data.map(f => [f._id || f.id, f]))
    const stylesMap = Object.fromEntries(stylesRes.data.map(s => [s._id || s.id, s]))
    const issueOrdersMap = Object.fromEntries(issueOrdersRes.data.map(o => [o._id || o.id, o]))

    // 关联查询工厂、款号和发料单信息
    const ordersWithDetails = orders.map(order => {
      try {
        const factoryId = order.factoryId || order.factory_id
        const styleId = order.styleId || order.style_id
        const issueId = order.issueId || order.issue_id

        const factory = factoriesMap[factoryId]
        const style = stylesMap[styleId]
        const issueOrder = issueOrdersMap[issueId]

        const processingFee = order.processingFee || order.processing_fee || 0
        const returnPieces = Math.floor(order.returnPieces || order.return_pieces || 0)
        const actualYarnUsage = order.actualYarnUsage || order.actual_yarn_usage || 0
        const pricePerPiece = returnPieces > 0 ? (processingFee / returnPieces) : 0

        const styleCode = style?.styleCode || style?.style_code || ''
        const styleName = style?.styleName || style?.style_name || '未知款号'
        const styleDisplay = styleCode ? `${styleCode} ${styleName}` : styleName

        return {
          ...order,
          factoryName: factory?.name || '未知工厂',
          styleName: styleName,
          styleCode: styleCode,
          styleDisplay: styleDisplay,
          styleImageUrl: style?.imageUrl || style?.image_url || '',
          issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
          color: order.color || '',
          size: order.size || '',
          returnPieces: returnPieces,
          quantityFormatted: formatQuantity(returnPieces),
          returnDateFormatted: formatDate(order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          pricePerPieceFormatted: pricePerPiece.toFixed(2),
          actualYarnUsageFormatted: actualYarnUsage.toFixed(2)
        }
      } catch (error) {
        console.error('加载回货单详情失败:', error)
        const processingFee = order.processingFee || order.processing_fee || 0
        const returnPieces = order.returnPieces || order.return_pieces || 1
        const actualYarnUsage = order.actualYarnUsage || order.actual_yarn_usage || 0
        const pricePerPiece = returnPieces > 0 ? (processingFee / returnPieces) : 0

        return {
          ...order,
          factoryName: '加载失败',
          styleName: '加载失败',
          styleCode: '',
          styleDisplay: '加载失败',
          styleImageUrl: '',
          issueNo: '未知',
          returnPieces: Math.floor(returnPieces),
          quantityFormatted: formatQuantity(Math.floor(returnPieces)),
          returnDateFormatted: formatDate(order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          pricePerPieceFormatted: pricePerPiece.toFixed(2),
          actualYarnUsageFormatted: actualYarnUsage.toFixed(2)
        }
      }
    })

    this.setData({
      returnOrders: ordersWithDetails,
      filteredOrders: ordersWithDetails
    })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadReturnOrders()
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    this.setData({
      timeFilter: filters[index] || 'all',
      timeFilterIndex: index
    })
    this.loadData()
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/pages/return/create'
    })
  }
})

