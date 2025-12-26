// pages/accounting/index.js
import { query } from '../../utils/db.js'
import { checkLogin, getTenantId } from '../../utils/auth.js'
import { formatAmount } from '../../utils/calc.js'
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

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
        orderBy: 'createTime',
        order: 'desc'
      })

      const factories = factoriesResult.data || []

      // 为每个加工厂计算账款汇总
      const factoriesWithAccounting = await Promise.all(
        factories.map(async (factory) => {
          const factoryId = factory._id || factory.id

          // 查询该加工厂的所有回货单
          const returnOrdersRes = await db.collection('return_orders')
            .where({
              tenantId: tenantId,
              factoryId: factoryId,
              deleted: false
            })
            .get()

          const returnOrders = returnOrdersRes.data || []

          // 计算汇总
          const summary = returnOrders.reduce((acc, order) => {
            const processingFee = order.processingFee || 0
            const settledAmount = order.settledAmount || 0
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
      url: `/pages/accounting/detail?id=${factoryId}`
    })
  }
})
