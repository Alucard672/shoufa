// pages/factory/detail.js
import { formatDate, formatAmount, formatWeight } from '../../utils/calc.js'
import { query, queryByIds } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    factoryId: '',
    factory: null,
    issueOrders: [],
    returnOrders: [],
    settlements: [],
    currentTab: 0,
    totalIssueWeight: 0,
    totalUsedYarn: 0,
    remainingYarn: 0,
    unpaidFee: 0
  },

  onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    if (options.id) {
      this.setData({
        factoryId: options.id
      })
      this.loadData()
    }
  },

  async loadData() {
    // 加载工厂信息
    const factoryRes = await queryByIds('factories', [this.data.factoryId], {
      excludeDeleted: true
    })
    
    if (!factoryRes.data || factoryRes.data.length === 0) {
      wx.showToast({
        title: '工厂不存在',
        icon: 'none'
      })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    const factory = factoryRes.data[0]

    // 验证租户权限
    if (factory.tenantId && factory.tenantId !== app.globalData.tenantId) {
      wx.showToast({
        title: '无权访问',
        icon: 'none'
      })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 加载发料单
    const issueOrdersRes = await query('issue_orders', {
      factoryId: this.data.factoryId
    }, {
      excludeDeleted: true,
      orderBy: { field: 'issueDate', direction: 'DESC' }
    })

    // 加载回货单
    const returnOrdersRes = await query('return_orders', {
      factoryId: this.data.factoryId
    }, {
      excludeDeleted: true,
      orderBy: { field: 'returnDate', direction: 'DESC' }
    })

    // 加载结算单
    const settlementsRes = await query('settlements', {
      factoryId: this.data.factoryId
    }, {
      excludeDeleted: true,
      orderBy: { field: 'settlementDate', direction: 'DESC' }
    })

    // 计算统计数据
    let totalIssueWeight = 0
    let totalUsedYarn = 0
    let totalSettledAmount = 0
    let totalProcessingFee = 0

    issueOrdersRes.data.forEach(order => {
      totalIssueWeight += order.issueWeight || order.issue_weight || 0
    })

    returnOrdersRes.data.forEach(order => {
      totalUsedYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
      totalProcessingFee += order.processingFee || order.processing_fee || 0
      totalSettledAmount += order.settledAmount || order.settled_amount || 0
    })

    const unpaidFee = totalProcessingFee - totalSettledAmount
    const remainingYarn = totalIssueWeight - totalUsedYarn

    // 批量查询款号信息
    const styleIds = [...new Set([
      ...issueOrdersRes.data.map(o => o.styleId || o.style_id),
      ...returnOrdersRes.data.map(o => o.styleId || o.style_id)
    ].filter(Boolean))]

    const stylesRes = styleIds.length > 0 
      ? await queryByIds('styles', styleIds, { excludeDeleted: true })
      : { data: [] }
    
    const stylesMap = Object.fromEntries(stylesRes.data.map(s => [s._id || s.id, s]))

    // 关联查询款号信息
    const issueOrdersWithDetails = issueOrdersRes.data.map(order => {
      const style = stylesMap[order.styleId || order.style_id]
      return {
        ...order,
        styleName: style?.styleName || style?.style_name || '未知款号',
        styleCode: style?.styleCode || style?.style_code || '',
        issueDateFormatted: formatDate(order.issueDate || order.issue_date)
      }
    })

    const returnOrdersWithDetails = returnOrdersRes.data.map(order => {
      const style = stylesMap[order.styleId || order.style_id]
      return {
        ...order,
        returnPieces: Math.floor(order.returnPieces || order.return_pieces || 0),
        styleName: style?.styleName || style?.style_name || '未知款号',
        styleCode: style?.styleCode || style?.style_code || '',
        returnDateFormatted: formatDate(order.returnDate || order.return_date)
      }
    })

    this.setData({
      factory: factory,
      issueOrders: issueOrdersWithDetails,
      returnOrders: returnOrdersWithDetails.map(order => ({
        ...order,
        processingFeeFormatted: (order.processingFee || order.processing_fee || 0).toFixed(2)
      })),
      settlements: settlementsRes.data.map(item => ({
        ...item,
        totalAmountFormatted: (item.totalAmount || item.total_amount || 0).toFixed(2),
        settlementDateFormatted: formatDate(item.settlementDate || item.settlement_date)
      })),
      totalIssueWeight,
      totalIssueWeightFormatted: totalIssueWeight.toFixed(2),
      totalUsedYarn,
      totalUsedYarnFormatted: totalUsedYarn.toFixed(2),
      remainingYarn,
      remainingYarnFormatted: remainingYarn.toFixed(2),
      unpaidFee,
      unpaidFeeFormatted: unpaidFee.toFixed(2)
    })
  },

  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({
      currentTab: index
    })
  },

  navigateToSettlement() {
    wx.navigateTo({
      url: `/pages/factory/settlement?factoryId=${this.data.factoryId}`
    })
  }
})
