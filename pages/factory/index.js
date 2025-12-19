// pages/factory/index.js
import { getFactories } from '../../utils/db.js'
import { formatAmount, formatWeight } from '../../utils/calc.js'

Page({
  data: {
    factoryCount: 0,
    unpaidAmount: 0,
    unpaidAmountFormatted: '¥0',
    factories: [],
    searchKeyword: ''
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
        this.loadFactories()
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
    
    // 统计工厂数量
    const factoryCount = await db.collection('factories')
      .where({
        deleted: _.neq(true)
      })
      .count()
    
    // 统计未结账款
    const returnOrders = await db.collection('return_orders')
      .where({
        deleted: _.eq(false),
        settlementStatus: _.in(['未结算', '部分结算'])
      })
      .get()
    
    let totalAmount = 0
    returnOrders.data.forEach(order => {
      totalAmount += order.processingFee || 0
    })
    
    this.setData({
      factoryCount: factoryCount.total,
      unpaidAmount: totalAmount,
      unpaidAmountFormatted: formatAmount(totalAmount)
    })
  },

  async loadFactories() {
    const db = wx.cloud.database()
    const _ = db.command
    let query = db.collection('factories')
      .where({
        deleted: _.neq(true)
      })
    
    // 搜索功能
    if (this.data.searchKeyword) {
      query = query.where({
        name: _.regex({
          regexp: this.data.searchKeyword,
          options: 'i'
        })
      })
    }
    
    const factories = await query.get()
    
    // 为每个工厂计算统计数据
    const factoriesWithStats = await Promise.all(
      factories.data.map(async (factory) => {
        try {
          // 查询该工厂的发料单
          const issueOrders = await db.collection('issue_orders')
            .where({
              factoryId: factory._id,
              deleted: _.neq(true)
            })
            .get()
          
          // 查询该工厂的回货单
          const returnOrders = await db.collection('return_orders')
            .where({
              factoryId: factory._id,
              deleted: _.neq(true)
            })
            .get()
          
          let totalIssueWeight = 0
          let totalUsedYarn = 0
          let unpaidFee = 0
          
          issueOrders.data.forEach(order => {
            totalIssueWeight += order.issueWeight || 0
          })
          
          returnOrders.data.forEach(order => {
            totalUsedYarn += order.actualYarnUsage || 0
            if (order.settlementStatus !== '已结算') {
              unpaidFee += order.processingFee || 0
            }
          })
          
          return {
            ...factory,
            totalIssueWeight,
            totalUsedYarn,
            unpaidFee,
            totalIssueWeightFormatted: formatWeight(totalIssueWeight),
            totalUsedYarnFormatted: formatWeight(totalUsedYarn),
            unpaidFeeFormatted: formatAmount(unpaidFee)
          }
        } catch (error) {
          console.error('加载工厂统计失败:', error)
          return {
            ...factory,
            totalIssueWeight: 0,
            totalUsedYarn: 0,
            unpaidFee: 0,
            totalIssueWeightFormatted: formatWeight(0),
            totalUsedYarnFormatted: formatWeight(0),
            unpaidFeeFormatted: formatAmount(0)
          }
        }
      })
    )
    
    this.setData({
      factories: factoriesWithStats
    })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadFactories()
  },

  navigateToCreate() {
    wx.navigateTo({
      url: '/pages/factory/create'
    })
  },

  navigateToDetail(e) {
    const factoryId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/factory/detail?id=${factoryId}`
    })
  },

  navigateToSettlement(e) {
    const factoryId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/factory/settlement?factoryId=${factoryId}`
    })
  },

  onEditFactory(e) {
    const factoryId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/factory/create?id=${factoryId}`
    })
  }
})

