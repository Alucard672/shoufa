// pages/return/index.js
import { getReturnOrders } from '../../utils/db.js'
import { formatDate, formatAmount } from '../../utils/calc.js'

Page({
  data: {
    totalReturnPieces: 0,
    totalProcessingFee: 0,
    searchKeyword: '',
    returnOrders: [],
    filteredOrders: []
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
    const db = wx.cloud.database()
    const _ = db.command
    
    const orders = await db.collection('return_orders')
      .where({
        deleted: _.eq(false)
      })
      .get()
    
    let totalPieces = 0
    let totalFee = 0
    
    orders.data.forEach(order => {
      totalPieces += order.returnPieces || 0
      totalFee += order.processingFee || 0
    })
    
    this.setData({
      totalReturnPieces: totalPieces,
      totalProcessingFee: totalFee,
      totalProcessingFeeFormatted: totalFee.toFixed(0)
    })
  },

  async loadReturnOrders() {
    const db = wx.cloud.database()
    const _ = db.command
    
    let query = db.collection('return_orders')
      .where({
        deleted: _.eq(false)
      })
    
    if (this.data.searchKeyword) {
      query = query.where({
        returnNo: _.regex({
          regexp: this.data.searchKeyword,
          options: 'i'
        })
      })
    }
    
    const orders = await query.orderBy('returnDate', 'desc').get()
    
    // 关联查询工厂、款号和发料单信息
    const ordersWithDetails = await Promise.all(
      orders.data.map(async (order) => {
        try {
          const [factory, style, issueOrder] = await Promise.all([
            db.collection('factories').doc(order.factoryId).get(),
            db.collection('styles').doc(order.styleId).get(),
            db.collection('issue_orders').doc(order.issueId).get()
          ])
          
          const processingFee = order.processingFee || 0
          const returnPieces = order.returnPieces || 1
          const actualYarnUsage = order.actualYarnUsage || 0
          const pricePerPiece = returnPieces > 0 ? (processingFee / returnPieces) : 0
          
          const styleCode = style.data?.styleCode || ''
          const styleName = style.data?.styleName || style.data?.name || '未知款号'
          const styleDisplay = styleCode ? `${styleCode} ${styleName}` : styleName
          
          return {
            ...order,
            factoryName: factory.data?.name || '未知工厂',
            styleName: styleName,
            styleCode: styleCode,
            styleDisplay: styleDisplay,
            styleImageUrl: style.data?.imageUrl || '',
            issueNo: issueOrder.data?.issueNo || '未知',
            color: order.color || '',
            size: order.size || '',
            returnDateFormatted: formatDate(order.returnDate),
            processingFeeFormatted: formatAmount(processingFee),
            pricePerPieceFormatted: pricePerPiece.toFixed(2),
            actualYarnUsageFormatted: actualYarnUsage.toFixed(2)
          }
        } catch (error) {
          console.error('加载回货单详情失败:', error)
          const processingFee = order.processingFee || 0
          const returnPieces = order.returnPieces || 1
          const actualYarnUsage = order.actualYarnUsage || 0
          const pricePerPiece = returnPieces > 0 ? (processingFee / returnPieces) : 0
          
          return {
            ...order,
            factoryName: '加载失败',
            styleName: '加载失败',
            styleCode: '',
            styleDisplay: '加载失败',
            styleImageUrl: '',
            issueNo: '未知',
            returnDateFormatted: formatDate(order.returnDate),
            processingFeeFormatted: formatAmount(processingFee),
            pricePerPieceFormatted: pricePerPiece.toFixed(2),
            actualYarnUsageFormatted: actualYarnUsage.toFixed(2)
          }
        }
      })
    )
    
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

  navigateToCreate() {
    wx.navigateTo({
      url: '/pages/return/create'
    })
  }
})

