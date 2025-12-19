// pages/index/index.js
import { formatDate } from '../../utils/calc.js'

Page({
  data: {
    factoryCount: 0,
    styleCount: 0,
    unpaidAmount: 0,
    recentActivities: [],
    displayActivities: [] // 用于显示的数据（默认10条）
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

  onReachBottom() {
    // 可以在这里实现加载更多最近动态
  },

  async loadData() {
    try {
      // 加载统计数据
      await Promise.all([
        this.loadFactoryCount(),
        this.loadStyleCount(),
        this.loadUnpaidAmount(),
        this.loadRecentActivities()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async loadFactoryCount() {
    const db = wx.cloud.database()
    const _ = db.command
    // 只统计未删除的工厂
    const countResult = await db.collection('factories')
      .where({
        deleted: _.eq(false)
      })
      .count()
    this.setData({
      factoryCount: countResult.total
    })
  },

  async loadStyleCount() {
    const db = wx.cloud.database()
    const _ = db.command
    // 只统计未删除的款号
    const countResult = await db.collection('styles')
      .where({
        deleted: _.eq(false)
      })
      .count()
    this.setData({
      styleCount: countResult.total
    })
  },

  async loadUnpaidAmount() {
    const db = wx.cloud.database()
    const _ = db.command
    
    // 查询未结算的回货单（使用 in 操作符代替 neq，支持索引）
    const returnOrders = await db.collection('return_orders')
      .where({
        settlementStatus: _.in(['未结算', '部分结算']),
        deleted: _.eq(false)
      })
      .get()
    
    let totalAmount = 0
    returnOrders.data.forEach(order => {
      totalAmount += order.processingFee || 0
    })
    
    this.setData({
      unpaidAmount: totalAmount,
      unpaidAmountFormatted: totalAmount.toFixed(0)
    })
  },

  async loadRecentActivities() {
    const db = wx.cloud.database()
    const _ = db.command
    
    // 加载所有动态数据（不限制数量，按时间倒序）
    const activities = await db.collection('issue_orders')
      .where({
        deleted: _.eq(false)
      })
      .orderBy('issueDate', 'desc')
      .get()
    
    if (!activities.data || activities.data.length === 0) {
      this.setData({
        recentActivities: [],
        displayActivities: []
      })
      return
    }
    
    // 批量查询工厂和款号信息（避免 N+1 查询）
    const factoryIds = [...new Set(activities.data.map(a => a.factoryId).filter(Boolean))]
    const styleIds = [...new Set(activities.data.map(a => a.styleId).filter(Boolean))]
    
    const factoriesMap = new Map()
    if (factoryIds.length > 0) {
      const factoriesPromises = factoryIds.map(id => 
        db.collection('factories').doc(id).get().catch(() => ({ data: null }))
      )
      const factoriesResults = await Promise.all(factoriesPromises)
      factoriesResults.forEach((result, index) => {
        if (result.data) {
          factoriesMap.set(factoryIds[index], result.data)
        }
      })
    }
    
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesPromises = styleIds.map(id => 
        db.collection('styles').doc(id).get().catch(() => ({ data: null }))
      )
      const stylesResults = await Promise.all(stylesPromises)
      stylesResults.forEach((result, index) => {
        if (result.data) {
          stylesMap.set(styleIds[index], result.data)
        }
      })
    }
    
    // 在内存中关联数据
    const activitiesWithDetails = activities.data.map(activity => {
      const factory = factoriesMap.get(activity.factoryId)
      const style = stylesMap.get(activity.styleId)
      return {
        ...activity,
        factoryName: factory?.name || '未知工厂',
        styleName: style?.styleName || style?.name || '未知款号',
        styleImageUrl: style?.imageUrl || '',
        color: activity.color,
        issueDateFormatted: formatDate(activity.issueDate)
      }
    })
    
    // 默认显示前10条
    const displayActivities = activitiesWithDetails.slice(0, 10)
    
    this.setData({
      recentActivities: activitiesWithDetails,
      displayActivities: displayActivities
    })
  },

  onShowMoreActivities() {
    // 跳转到所有动态页面
    wx.navigateTo({
      url: '/pages/index/activities'
    })
  },

  navigateToIssue() {
    wx.switchTab({
      url: '/pages/issue/index'
    })
  },

  navigateToReturn() {
    wx.switchTab({
      url: '/pages/return/index'
    })
  }
})

