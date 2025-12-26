// pages/factory/index.js
import { getFactories } from '../../utils/db.js'
import { formatAmount, formatWeight } from '../../utils/calc.js'
import { count, query } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    factoryCount: 0,
    unpaidAmount: 0,
    unpaidAmountFormatted: '¥0',
    factories: [],
    searchKeyword: ''
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
    // 统计工厂数量
    const factoryCountResult = await count('factories', {}, {
      excludeDeleted: true
    })

    // 统计未结账款（使用IN查询）
    const returnOrdersRes = await query('return_orders', {
      settlementStatus: _.in(['未结算', '部分结算'])
    }, {
      excludeDeleted: true
    })
    const returnOrders = returnOrdersRes.data

    let totalAmount = 0
    returnOrders.forEach(order => {
      const processingFee = order.processingFee || order.processing_fee || 0
      const settledAmount = order.settledAmount || order.settled_amount || 0
      totalAmount += processingFee - settledAmount
    })

    this.setData({
      factoryCount: factoryCountResult.total,
      unpaidAmount: totalAmount,
      unpaidAmountFormatted: formatAmount(totalAmount)
    })
  },

  async loadFactories() {
    const where = {}
    
    // 搜索功能（注意：MySQL需要支持LIKE查询，这里先简单处理）
    // 如果搜索关键词存在，需要在云函数中处理LIKE查询
    const factoriesRes = await query('factories', where, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'ASC' }
    })
    
    // 过滤搜索结果（如果有关键词）
    let factories = factoriesRes.data
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      factories = factories.filter(f => 
        (f.name || '').toLowerCase().includes(keyword) ||
        (f.contact || '').toLowerCase().includes(keyword) ||
        (f.phone || '').includes(keyword)
      )
    }

    // 为每个工厂计算统计数据
    const factoriesWithStats = await Promise.all(
      factories.map(async (factory) => {
        try {
          const factoryId = factory._id || factory.id
          
          // 查询该工厂的发料单
          const issueOrdersRes = await query('issue_orders', {
            factoryId: factoryId
          }, {
            excludeDeleted: true
          })

          // 查询该工厂的回货单
          const returnOrdersRes = await query('return_orders', {
            factoryId: factoryId
          }, {
            excludeDeleted: true
          })

          let totalIssueWeight = 0
          let totalUsedYarn = 0
          let totalProcessingFee = 0
          let totalSettledAmount = 0

          issueOrdersRes.data.forEach(order => {
            totalIssueWeight += order.issueWeight || order.issue_weight || 0
          })

          returnOrdersRes.data.forEach(order => {
            totalUsedYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
            totalProcessingFee += order.processingFee || order.processing_fee || 0
            totalSettledAmount += order.settledAmount || order.settled_amount || 0
          })

          const unpaidFee = totalProcessingFee - totalSettledAmount

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
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
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
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const factoryId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/factory/create?id=${factoryId}`
    })
  },

  stopPropagation() {
    // 阻止冒泡
  }
})

