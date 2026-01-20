// pages/accounting/index.js
const { query } = require('../utils/db.js')
const { checkLogin, getTenantId } = require('../utils/auth.js')
const { formatAmount } = require('../utils/calc.js')
const { pickNumber } = require('../utils/summary.js')
const app = getApp()
// 延迟初始化
let _db = null, _cmd = null
function getDb() { if (!_db) _db = wx.cloud.database(); return _db }
function getCmd() { if (!_cmd) _cmd = getDb().command; return _cmd }
const db = new Proxy({}, { get(t, p) { return getDb()[p] } })
const _ = new Proxy({}, { get(t, p) { return getCmd()[p] } })

Page({
  data: {
    factories: [],
    loading: false
  },

  async onLoad() {
    if (!checkLogin()) {
      return
    }
    await this.loadFactoriesWithAccounting()
  },

  async onShow() {
    if (!checkLogin()) {
      return
    }
    await this.loadFactoriesWithAccounting()
  },

  async loadFactoriesWithAccounting() {
    this.setData({ loading: true })

    try {
      const tenantId = getTenantId()
      if (!tenantId) {
        return
      }

      // 加载所有加工厂
      const factoriesResult = await query('factories', {}, {
        excludeDeleted: true,
        orderBy: { field: 'createTime', direction: 'DESC' }
      })

      const factories = factoriesResult.data || []

      // 一次性拉取该租户全部回货单（避免每个工厂单独查询导致慢/丢数据）
      const allReturnOrders = []
      let skip = 0
      const pageSize = 100
      while (true) {
        const res = await db.collection('return_orders')
          .where({ tenantId: tenantId, deleted: false })
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get()
          .catch(() => ({ data: [] }))
        const batch = res.data || []
        allReturnOrders.push(...batch)
        if (batch.length < pageSize) break
        skip += pageSize
      }

      // 排除已作废的回货单
      const validReturnOrders = allReturnOrders.filter(order => !order.voided)

      // 按 factoryId / factory_id 分组
      const roByFactory = new Map()
      validReturnOrders.forEach((ro) => {
        const fid = ro.factoryId || ro.factory_id
        if (!fid) return
        const key = String(fid)
        if (!roByFactory.has(key)) roByFactory.set(key, [])
        roByFactory.get(key).push(ro)
      })

      // 为每个加工厂计算账款汇总
      const factoriesWithAccounting = await Promise.all(
        factories.map(async (factory) => {
          const factoryId = factory._id || factory.id
          const returnOrders = roByFactory.get(String(factoryId)) || []

          // 计算汇总
          const summary = returnOrders.reduce((acc, order) => {
            const processingFee = pickNumber(order, ['processingFee', 'processing_fee'], 0)
            const settledAmount = pickNumber(order, ['settledAmount', 'settled_amount'], 0)
            acc.totalAmount += processingFee
            acc.settledAmount += settledAmount
            acc.unpaidAmount += (processingFee - settledAmount)
            return acc
          }, { totalAmount: 0, settledAmount: 0, unpaidAmount: 0 })

          return {
            ...factory,
            summary: summary,
            summaryFormatted: {
              totalAmount: formatAmount(summary.totalAmount),
              settledAmount: formatAmount(summary.settledAmount),
              unpaidAmount: formatAmount(summary.unpaidAmount)
            },
            orderCount: returnOrders.length
          }
        })
      )

      this.setData({
        factories: factoriesWithAccounting
      })
    } catch (error) {
      console.error('加载账款数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onFactoryTap(e) {
    const factoryId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/subpages/business/accounting/detail?id=${factoryId}`
    })
  },

  onSettleFactory(e) {
    const factoryId = e.currentTarget.dataset.id
    if (!factoryId) return
    wx.navigateTo({
      url: `/subpages/factory/settlement?factoryId=${factoryId}`
    })
  }
})
