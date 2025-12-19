// pages/factory/detail.js
import { formatDate, formatAmount, formatWeight } from '../../utils/calc.js'

Page({
  data: {
    factoryId: '',
    factory: null,
    issueOrders: [],
    returnOrders: [],
    totalIssueWeight: 0,
    totalUsedYarn: 0,
    unpaidFee: 0
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        factoryId: options.id
      })
      this.loadData()
    }
  },

  async loadData() {
    const db = wx.cloud.database()
    const _ = db.command

    // 加载工厂信息
    const factory = await db.collection('factories').doc(this.data.factoryId).get()

    // 加载发料单
    const issueOrders = await db.collection('issue_orders')
      .where({
        factoryId: this.data.factoryId,
        deleted: _.neq(true)
      })
      .orderBy('issueDate', 'desc')
      .get()

    // 加载回货单
    const returnOrders = await db.collection('return_orders')
      .where({
        factoryId: this.data.factoryId,
        deleted: _.neq(true)
      })
      .orderBy('returnDate', 'desc')
      .get()

    // 计算统计数据
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

    // 关联查询款号信息
    const issueOrdersWithDetails = await Promise.all(
      issueOrders.data.map(async (order) => {
        try {
          const style = await db.collection('styles').doc(order.styleId).get()
          return {
            ...order,
            styleName: style.data?.styleName || '未知款号',
            issueDateFormatted: formatDate(order.issueDate)
          }
        } catch (error) {
          return {
            ...order,
            styleName: '加载失败',
            issueDateFormatted: formatDate(order.issueDate)
          }
        }
      })
    )

    const returnOrdersWithDetails = await Promise.all(
      returnOrders.data.map(async (order) => {
        try {
          const style = await db.collection('styles').doc(order.styleId).get()
          return {
            ...order,
            styleName: style.data?.styleName || '未知款号',
            returnDateFormatted: formatDate(order.returnDate)
          }
        } catch (error) {
          return {
            ...order,
            styleName: '加载失败',
            returnDateFormatted: formatDate(order.returnDate)
          }
        }
      })
    )

    this.setData({
      factory: factory.data,
      issueOrders: issueOrdersWithDetails,
      returnOrders: returnOrdersWithDetails.map(order => ({
        ...order,
        processingFeeFormatted: (order.processingFee || 0).toFixed(2)
      })),
      totalIssueWeight,
      totalIssueWeightFormatted: totalIssueWeight.toFixed(2),
      totalUsedYarn,
      totalUsedYarnFormatted: totalUsedYarn.toFixed(2),
      unpaidFee,
      unpaidFeeFormatted: unpaidFee.toFixed(2)
    })
  },

  navigateToSettlement() {
    wx.navigateTo({
      url: `/pages/factory/settlement?factoryId=${this.data.factoryId}`
    })
  }
})
