// pages/factory/index.js
import { getFactories } from '../../utils/db.js'
import { formatAmount, formatWeight } from '../../utils/calc.js'
import { count, query } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
import { pickNumber } from '../../utils/summary.js'
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    factoryCount: 0,
    unpaidAmount: 0,
    unpaidAmountFormatted: '¥0',
    factories: [],
    searchKeyword: '',
    showDisabled: false,  // 是否显示已停用的加工厂，默认不显示
    filterOptions: [
      { value: false, label: '仅显示启用' },
      { value: true, label: '显示全部' }
    ],
    filterIndex: 0
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }

    // 检查订阅状态，如果已过期则阻止操作
    const { checkSubscriptionAndBlock } = require('../../utils/auth.js')
    if (checkSubscriptionAndBlock({ showModal: false })) {
      // 已过期，返回上一页
      wx.navigateBack()
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
      const processingFee = pickNumber(order, ['processingFee', 'processing_fee'], 0)
      const settledAmount = pickNumber(order, ['settledAmount', 'settled_amount'], 0)
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
          const [issueById, issueBy_id] = await Promise.all([
            query('issue_orders', { factoryId: factoryId }, { excludeDeleted: true }).catch(() => ({ data: [] })),
            query('issue_orders', { factory_id: factoryId }, { excludeDeleted: true }).catch(() => ({ data: [] }))
          ])
          const issueOrdersData = []
          const issueSeen = new Set()
            // 排除已作废的发料单
            ; (issueById.data || []).concat(issueBy_id.data || []).forEach((o) => {
              if (o.voided) return // 排除已作废的单据
              const key = String(o._id || o.id || '')
              if (!key || issueSeen.has(key)) return
              issueSeen.add(key)
              issueOrdersData.push(o)
            })

          // 查询该工厂的回货单
          const [retById, retBy_id] = await Promise.all([
            query('return_orders', { factoryId: factoryId }, { excludeDeleted: true }).catch(() => ({ data: [] })),
            query('return_orders', { factory_id: factoryId }, { excludeDeleted: true }).catch(() => ({ data: [] }))
          ])
          const returnOrdersData = []
          const retSeen = new Set()
            // 排除已作废的回货单
            ; (retById.data || []).concat(retBy_id.data || []).forEach((o) => {
              if (o.voided) return // 排除已作废的单据
              const key = String(o._id || o.id || '')
              if (!key || retSeen.has(key)) return
              retSeen.add(key)
              returnOrdersData.push(o)
            })

          let totalIssueWeight = 0
          let totalUsedYarn = 0
          let totalProcessingFee = 0
          let totalSettledAmount = 0

          issueOrdersData.forEach(order => {
            totalIssueWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
          })

          returnOrdersData.forEach(order => {
            totalUsedYarn += pickNumber(order, ['actualYarnUsage', 'actual_yarn_usage'], 0)
            totalProcessingFee += pickNumber(order, ['processingFee', 'processing_fee'], 0)
            totalSettledAmount += pickNumber(order, ['settledAmount', 'settled_amount'], 0)
          })

          const unpaidFee = totalProcessingFee - totalSettledAmount

          return {
            ...factory,
            disabled: factory.disabled || false,  // 是否已停用
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

    // 根据筛选条件过滤
    let displayFactories = factoriesWithStats
    if (!this.data.showDisabled) {
      displayFactories = factoriesWithStats.filter(f => !f.disabled)
    }

    // 缓存全部数据用于筛选切换
    this._allFactories = factoriesWithStats

    this.setData({
      factories: displayFactories,
      factoryCount: displayFactories.length  // 更新统计数量
    })
  },

  // 切换是否显示已停用的加工厂
  onFilterChange(e) {
    const index = e.detail.value
    const showDisabled = this.data.filterOptions[index].value

    this.setData({
      filterIndex: index,
      showDisabled: showDisabled
    })

    // 如果已有缓存数据，直接过滤；否则重新加载
    if (this._allFactories) {
      let displayFactories = this._allFactories
      if (!showDisabled) {
        displayFactories = this._allFactories.filter(f => !f.disabled)
      }
      this.setData({
        factories: displayFactories,
        factoryCount: displayFactories.length
      })
    } else {
      this.loadFactories()
    }
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
      url: '/subpages/factory/create'
    })
  },

  navigateToDetail(e) {
    const factoryId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/subpages/factory/detail?id=${factoryId}`
    })
  },

  navigateToSettlement(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    // 注意：使用 catchtap 时不需要 stopPropagation，catchtap 会自动阻止冒泡
    const factoryId = e.currentTarget.dataset.id
    if (!factoryId) {
      wx.showToast({
        title: '无法获取加工厂ID',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: `/subpages/factory/settlement?factoryId=${factoryId}`
    })
  },

  onEditFactory(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    // 注意：使用 catchtap 时不需要 stopPropagation，catchtap 会自动阻止冒泡
    const factoryId = e.currentTarget.dataset.id
    if (!factoryId) {
      wx.showToast({
        title: '无法获取加工厂ID',
        icon: 'none'
      })
      return
    }
    console.log('编辑加工厂，ID:', factoryId)
    wx.navigateTo({
      url: `/subpages/factory/create?id=${factoryId}`
    })
  },

  stopPropagation() {
    // 阻止冒泡
  }
})

