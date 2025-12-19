// pages/statistics/index.js
import { getIssueOrders, getReturnOrdersByIssueId } from '../../utils/db.js'
import { getTimeRange, formatDate, formatWeight } from '../../utils/calc.js'

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
    this.loadData()
  },

  onShow() {
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
    const db = wx.cloud.database()
    const _ = db.command
    
    const issueOrders = await db.collection('issue_orders')
      .where({
        deleted: _.eq(false)
      })
      .get()
    
    let returnedCount = 0
    issueOrders.data.forEach(order => {
      if (order.status === '已回货') {
        returnedCount++
      }
    })
    
    this.setData({
      totalIssueCount: issueOrders.data.length,
      returnedCount
    })
  },

  async loadStatisticsList() {
    const db = wx.cloud.database()
    const _ = db.command
    
    let query = db.collection('issue_orders')
      .where({
        deleted: _.eq(false)
      })
    
    // 时间筛选
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        query = query.where({
          issueDate: _.gte(timeRange.startDate).and(_.lte(timeRange.endDate))
        })
      }
    }
    
    // 状态筛选
    if (this.data.statusFilter !== 'all') {
      query = query.where({
        status: this.data.statusFilter
      })
    }
    
    // 搜索
    if (this.data.searchKeyword) {
      query = query.where({
        issueNo: _.regex({
          regexp: this.data.searchKeyword,
          options: 'i'
        })
      })
    }
    
    const issueOrders = await query.orderBy('issueDate', 'desc').get()
    
    // 为每个发料单加载回货信息和计算统计
    const statistics = await Promise.all(
      issueOrders.data.map(async (issueOrder) => {
        const [style, returnOrders] = await Promise.all([
          db.collection('styles').doc(issueOrder.styleId).get(),
          getReturnOrdersByIssueId(issueOrder._id)
        ])
        
        let totalReturnQuantity = 0
        let totalReturnPieces = 0
        let totalReturnYarn = 0
        let latestReturnDate = null
        
        returnOrders.data.forEach(order => {
          totalReturnQuantity += order.returnQuantity || 0
          totalReturnPieces += order.returnPieces || 0
          totalReturnYarn += order.actualYarnUsage || 0
          if (!latestReturnDate || new Date(order.returnDate) > new Date(latestReturnDate)) {
            latestReturnDate = order.returnDate
          }
        })
        
        const remainingYarn = issueOrder.issueWeight - totalReturnYarn
        const remainingPieces = Math.floor(remainingYarn / (style.data.yarnUsagePerPiece / 1000))
        const remainingQuantity = remainingPieces / 12
        
        // 计算损耗率相关数据
        const lossRate = style.data?.lossRate || 0
        const planYarnUsage = (totalReturnPieces * style.data.yarnUsagePerPiece) / 1000 // 计划用纱量（kg）
        const actualYarnUsage = totalReturnYarn // 实际用纱量（kg）
        const lossAmount = actualYarnUsage - planYarnUsage // 损耗量（kg）
        const actualLossRate = planYarnUsage > 0 ? ((lossAmount / planYarnUsage) * 100) : 0 // 实际损耗率（%）
        
        return {
          ...issueOrder,
          styleName: style.data?.styleName || '未知款号',
          styleCode: style.data?.styleCode || '',
          styleImageUrl: style.data?.imageUrl || '',
          yarnUsagePerPiece: style.data?.yarnUsagePerPiece || 0,
          lossRate: lossRate, // 款号设定的损耗率
          planYarnUsage: planYarnUsage, // 计划用纱量
          actualYarnUsage: actualYarnUsage, // 实际用纱量
          lossAmount: lossAmount, // 损耗量
          actualLossRate: actualLossRate, // 实际损耗率
          lossRateFormatted: lossRate.toFixed(1) + '%',
          planYarnUsageFormatted: formatWeight(planYarnUsage),
          lossAmountFormatted: formatWeight(Math.abs(lossAmount)),
          actualLossRateFormatted: actualLossRate.toFixed(1) + '%',
          totalReturnQuantity,
          totalReturnPieces,
          totalReturnYarn,
          remainingYarn,
          remainingPieces,
          remainingQuantity,
          remainingQuantityFormatted: remainingQuantity.toFixed(1),
          latestReturnDate,
          issueDateFormatted: formatDate(issueOrder.issueDate),
          latestReturnDateFormatted: latestReturnDate ? formatDate(latestReturnDate) : null,
          issueWeightFormatted: formatWeight(issueOrder.issueWeight),
          totalReturnYarnFormatted: formatWeight(totalReturnYarn),
          remainingYarnFormatted: formatWeight(remainingYarn),
          returnOrders: returnOrders.data
            .slice()
            .sort((a, b) => {
              const dateA = a.returnDate instanceof Date ? a.returnDate : new Date(a.returnDate)
              const dateB = b.returnDate instanceof Date ? b.returnDate : new Date(b.returnDate)
              return dateB.getTime() - dateA.getTime()
            })
            .map((order, index) => ({
              ...order,
              returnDateFormatted: formatDate(order.returnDate),
              actualYarnUsageFormatted: (order.actualYarnUsage || 0).toFixed(2),
              returnOrderIndex: returnOrders.data.length - index
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

