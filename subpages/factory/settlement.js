const { formatDate, formatAmount, formatQuantity } = require('./utils/calc.js')
const { query, queryByIds, insert, update } = require('./utils/db.js')
const { checkLogin } = require('./utils/auth.js')
const app = getApp()
// 延迟初始化
let _db = null, _cmd = null
function getDb() { if (!_db) _db = wx.cloud.database(); return _db }
function getCmd() { if (!_cmd) _cmd = getDb().command; return _cmd }
const db = new Proxy({}, { get(t, p) { return getDb()[p] } })
const _ = new Proxy({}, { get(t, p) { return getCmd()[p] } })

Page({
  data: {
    factoryId: '',
    factory: null,
    returnOrders: [], // 未结算的回货单列表
    selectedOrders: [], // 选中的回货单ID列表
    totalSelectedQuantityDisp: '0件', // 选中合计显示
    startDate: '', // 结算开始日期
    endDate: '', // 结算结束日期
    settlementDate: '', // 结算日期（用于保存，取结束日期）
    settlementAmount: 0, // 结算总金额
    settlementAmountFormatted: '0.00',
    totalSettledAmount: 0, // 总已结算金额
    totalSettledAmountFormatted: '0.00', // 总已结算金额格式化
    remark: '', // 备注
    loading: false
  },

  onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const factoryId = options.factoryId || options.id
    if (factoryId) {
      const today = this.getTodayDate()
      this.setData({
        factoryId: factoryId,
        startDate: today,
        endDate: today,
        settlementDate: today // 默认使用结束日期作为结算日期
      })
      this.loadData()
    }
  },

  getTodayDate() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      await Promise.all([
        this.loadFactory(),
        this.loadReturnOrders()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadFactory() {
    const result = await queryByIds('factories', [this.data.factoryId], {
      excludeDeleted: true
    })
    if (result.data && result.data.length > 0) {
      this.setData({
        factory: result.data[0]
      })
    }
  },

  async loadReturnOrders() {
    const db = wx.cloud.database()
    const _ = db.command

    // 查询该工厂的所有回货单（兼容 factoryId 和 factory_id）
    // 由于 query 函数不支持 OR 查询，我们需要分别查询然后合并
    const [byFactoryId, byFactory_id] = await Promise.all([
      query('return_orders', {
        factoryId: this.data.factoryId
      }, {
        excludeDeleted: true
      }).catch(() => ({ data: [] })),
      query('return_orders', {
        factory_id: this.data.factoryId
      }, {
        excludeDeleted: true
      }).catch(() => ({ data: [] }))
    ])

    // 合并并去重
    const merged = []
    const seen = new Set()
      ; (byFactoryId.data || []).concat(byFactory_id.data || []).forEach(order => {
        const key = String(order._id || order.id || '')
        if (key && !seen.has(key)) {
          seen.add(key)
          merged.push(order)
        }
      })

    // 在客户端过滤：只显示未结算和部分结算的回货单
    // 兼容 settlementStatus 和 settlement_status 字段
    const filtered = merged.filter(order => {
      // 作废回货单不允许继续参与结算，也不应产生未结算账款
      if (order.voided) return false

      const status = order.settlementStatus || order.settlement_status || '未结算'
      return status === '未结算' || status === '部分结算'
    })

    // 按日期排序
    filtered.sort((a, b) => {
      const dateA = a.returnDate || a.return_date || a.createTime || a.create_time
      const dateB = b.returnDate || b.return_date || b.createTime || b.create_time
      const timeA = dateA ? new Date(dateA).getTime() : 0
      const timeB = dateB ? new Date(dateB).getTime() : 0
      return timeB - timeA // 倒序
    })

    const returnOrdersRes = { data: filtered }

    // 查询该工厂的所有结算单，计算每个回货单的已结算金额
    const settlementsRes = await query('settlements', {
      factoryId: this.data.factoryId
    }, {
      excludeDeleted: true
    })

    // 计算每个回货单的已结算金额（从settlements集合中累计）
    const settledAmountMap = new Map()
    settlementsRes.data.forEach(settlement => {
      const returnOrderIds = settlement.returnOrderIds || settlement.return_order_ids || []
      const settlementItems = settlement.settlementItems || settlement.settlement_items || null
      const voidedReturnOrderIds = settlement.voidedReturnOrderIds || settlement.voided_return_order_ids || []

      // 优先使用 settlementItems（按回货单记录实际结算金额）
      if (Array.isArray(settlementItems) && settlementItems.length > 0) {
        settlementItems.forEach((it) => {
          const orderId = it.returnOrderId || it.return_order_id
          if (!orderId) return
          if (it.voided === true) return
          const id = String(orderId)
          const amount = Number(it.amount || it.settlementAmount || 0) || 0
          const currentAmount = settledAmountMap.get(id) || 0
          settledAmountMap.set(id, currentAmount + amount)
        })
        return
      }

      // 兼容老数据：没有 settlementItems 时，退回平均分摊
      if (Array.isArray(returnOrderIds) && returnOrderIds.length > 0) {
        const activeIds = returnOrderIds
          .map(x => String(x))
          .filter(id => voidedReturnOrderIds.indexOf(id) === -1)

        if (activeIds.length === 0) return

        const totalAmount = Number(settlement.totalAmount || settlement.total_amount || 0) || 0
        const amountPerOrder = totalAmount / activeIds.length
        activeIds.forEach((id) => {
          const currentAmount = settledAmountMap.get(id) || 0
          settledAmountMap.set(id, currentAmount + amountPerOrder)
        })
      }
    })

    // 批量查询款号和发料单信息
    const styleIds = [...new Set(returnOrdersRes.data.map(order => order.styleId || order.style_id).filter(Boolean))]
    const issueIds = [...new Set(returnOrdersRes.data.map(order => order.issueId || order.issue_id).filter(Boolean))]

    const [stylesRes, issueOrdersRes] = await Promise.all([
      styleIds.length > 0 ? queryByIds('styles', styleIds, { excludeDeleted: true }) : { data: [] },
      issueIds.length > 0 ? queryByIds('issue_orders', issueIds, { excludeDeleted: true }) : { data: [] }
    ])

    const stylesMap = Object.fromEntries(stylesRes.data.map(s => [String(s._id || s.id), s]))
    const issueOrdersMap = Object.fromEntries(issueOrdersRes.data.map(o => [String(o._id || o.id), o]))

    // 关联查询款号和发料单信息
    const ordersWithDetails = returnOrdersRes.data.map(order => {
      try {
        const styleId = order.styleId || order.style_id
        const issueId = order.issueId || order.issue_id
        const orderId = String(order._id || order.id || '')

        const style = stylesMap[String(styleId)]
        const issueOrder = issueOrdersMap[String(issueId)]

        // 计算已结算金额（优先使用数据库字段，否则从settlements集合查询）
        const settledAmount = order.settledAmount || order.settled_amount || settledAmountMap.get(orderId.toString()) || 0
        const processingFee = order.processingFee || order.processing_fee || 0
        const remainingAmount = processingFee - settledAmount

        return {
          ...order,
          styleName: style?.styleName || style?.style_name || '',
          styleCode: style?.styleCode || style?.style_code || '',
          issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
          returnDateFormatted: formatDate(order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          settledAmount: settledAmount,
          settledAmountFormatted: formatAmount(settledAmount),
          remainingAmount: remainingAmount,
          remainingAmountFormatted: formatAmount(remainingAmount),
          quantityFormatted: formatQuantity(order.returnPieces || order.return_pieces || 0),
          selected: false,
          settlementAmount: remainingAmount // 默认结算剩余金额
        }
      } catch (error) {
        console.error('加载回货单详情失败:', error)
        const processingFee = order.processingFee || order.processing_fee || 0
        return {
          ...order,
          styleName: '加载失败',
          styleCode: '',
          issueNo: '未知',
          returnDateFormatted: formatDate(order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          settledAmount: 0,
          settledAmountFormatted: '0.00',
          remainingAmount: processingFee,
          remainingAmountFormatted: formatAmount(processingFee),
          selected: false,
          settlementAmount: processingFee
        }
      }
    })

    // 计算总已结算金额（所有回货单的已结算金额之和）
    const totalSettledAmount = ordersWithDetails.reduce((sum, order) => sum + (order.settledAmount || 0), 0)

    this.setData({
      returnOrders: ordersWithDetails,
      totalSettledAmount: totalSettledAmount,
      totalSettledAmountFormatted: formatAmount(totalSettledAmount)
    })
  },

  onToggleOrder(e) {
    const orderId = String(e.currentTarget.dataset.id || '')
    const orders = this.data.returnOrders.map(order => {
      const orderIdStr = String(order._id || order.id || '')
      if (orderIdStr === orderId) {
        return {
          ...order,
          selected: !order.selected
        }
      }
      return order
    })

    const selectedOrders = orders.filter(order => order.selected)
    const settlementAmount = selectedOrders.reduce((sum, order) => sum + (order.settlementAmount || 0), 0)
    const totalPieces = selectedOrders.reduce((sum, order) => sum + (order.returnPieces || order.return_pieces || 0), 0)

    this.setData({
      returnOrders: orders,
      selectedOrders: selectedOrders.map(order => order._id || order.id),
      settlementAmount: settlementAmount,
      settlementAmountFormatted: settlementAmount.toFixed(2),
      totalSelectedQuantityDisp: formatQuantity(totalPieces)
    })
  },

  onSettlementAmountInput(e) {
    const orderId = String(e.currentTarget.dataset.id || '')
    const value = parseFloat(e.detail.value) || 0
    const orders = this.data.returnOrders.map(order => {
      const orderIdStr = String(order._id || order.id || '')
      if (orderIdStr === orderId) {
        const settlementAmount = Math.min(Math.max(0, value), order.remainingAmount)
        return {
          ...order,
          settlementAmount: settlementAmount
        }
      }
      return order
    })

    const selectedOrders = orders.filter(order => order.selected)
    const settlementAmount = selectedOrders.reduce((sum, order) => sum + (order.settlementAmount || 0), 0)

    this.setData({
      returnOrders: orders,
      settlementAmount: settlementAmount,
      settlementAmountFormatted: settlementAmount.toFixed(2)
    })
  },

  onStartDateChange(e) {
    const startDate = e.detail.value
    // 如果开始日期晚于结束日期，自动调整结束日期
    let endDate = this.data.endDate
    if (endDate && startDate > endDate) {
      endDate = startDate
    }
    this.setData({
      startDate: startDate,
      endDate: endDate,
      settlementDate: endDate || startDate // 使用结束日期作为结算日期
    })
    // 日期变更后重新加载回货单（虽然当前不按日期过滤，但保持数据同步）
    this.loadReturnOrders()
  },

  onEndDateChange(e) {
    const endDate = e.detail.value
    // 如果结束日期早于开始日期，自动调整开始日期
    let startDate = this.data.startDate
    if (startDate && endDate < startDate) {
      startDate = endDate
    }
    this.setData({
      startDate: startDate,
      endDate: endDate,
      settlementDate: endDate // 使用结束日期作为结算日期
    })
    // 日期变更后重新加载回货单（虽然当前不按日期过滤，但保持数据同步）
    this.loadReturnOrders()
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  async onSubmit() {
    const selectedOrders = this.data.returnOrders.filter(order => order.selected)

    if (selectedOrders.length === 0) {
      wx.showToast({
        title: '请选择要结算的回货单',
        icon: 'none'
      })
      return
    }

    if (this.data.settlementAmount <= 0) {
      wx.showToast({
        title: '结算金额必须大于0',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认结算',
      content: `确定要结算 ${selectedOrders.length} 笔回货单，总金额 ¥${this.data.settlementAmountFormatted} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          await this.createSettlement()
        }
      }
    })
  },

  async createSettlement() {
    try {
      wx.showLoading({
        title: '处理中...'
      })

      const selectedOrders = this.data.returnOrders.filter(order => order.selected)

      // 生成结算单号
      const settlementNo = `JS${Date.now()}`

      // 创建结算单
      const settlementItems = selectedOrders.map(order => ({
        returnOrderId: order._id || order.id,
        amount: order.settlementAmount,
        voided: false
      }))
      const settlementResult = await insert('settlements', {
        settlementNo: settlementNo,
        factoryId: this.data.factoryId,
        factoryName: this.data.factory?.name || '未知工厂',
        startDate: new Date(this.data.startDate),
        endDate: new Date(this.data.endDate),
        settlementDate: new Date(this.data.settlementDate || this.data.endDate),
        totalAmount: this.data.settlementAmount,
        remark: this.data.remark,
        returnOrderIds: selectedOrders.map(order => order._id || order.id),
        settlementItems: settlementItems
      })

      // 更新回货单的结算状态
      const updatePromises = selectedOrders.map(order => {
        const orderId = order._id || order.id
        const id = typeof orderId === 'string' && /^\d+$/.test(orderId) ? parseInt(orderId) : orderId

        const newSettledAmount = (order.settledAmount || order.settled_amount || 0) + order.settlementAmount
        const processingFee = order.processingFee || order.processing_fee || 0

        let settlementStatus = '未结算'
        if (newSettledAmount >= processingFee - 0.01) {
          settlementStatus = '已结算'
        } else if (newSettledAmount > 0) {
          settlementStatus = '部分结算'
        }

        return update('return_orders', {
          settledAmount: newSettledAmount,
          settlementStatus: settlementStatus
        }, {
          _id: id
        })
      })

      await Promise.all(updatePromises)

      wx.hideLoading()
      wx.showToast({
        title: '结算成功',
        icon: 'success'
      })

      // 返回上一页并刷新
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      console.error('创建结算单失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '结算失败',
        icon: 'none'
      })
    }
  }
})

