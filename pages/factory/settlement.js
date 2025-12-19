// pages/factory/settlement.js
import { formatDate, formatAmount } from '../../utils/calc.js'

Page({
  data: {
    factoryId: '',
    factory: null,
    returnOrders: [], // 未结算的回货单列表
    selectedOrders: [], // 选中的回货单ID列表
    settlementDate: '', // 结算日期
    settlementAmount: 0, // 结算总金额
    settlementAmountFormatted: '0.00',
    remark: '', // 备注
    loading: false
  },

  onLoad(options) {
    if (options.factoryId) {
      this.setData({
        factoryId: options.factoryId,
        settlementDate: this.getTodayDate()
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
    const db = wx.cloud.database()
    const factory = await db.collection('factories').doc(this.data.factoryId).get()
    this.setData({
      factory: factory.data
    })
  },

  async loadReturnOrders() {
    const db = wx.cloud.database()
    const _ = db.command
    
    // 查询未结算的回货单
    const returnOrders = await db.collection('return_orders')
      .where({
        factoryId: this.data.factoryId,
        settlementStatus: _.in(['未结算', '部分结算']),
        deleted: _.eq(false)
      })
      .orderBy('returnDate', 'desc')
      .get()
    
    // 查询该工厂的所有结算单，计算每个回货单的已结算金额
    const settlements = await db.collection('settlements')
      .where({
        factoryId: this.data.factoryId,
        deleted: _.eq(false)
      })
      .get()
    
    // 计算每个回货单的已结算金额（从settlements集合中累计）
    const settledAmountMap = new Map()
    settlements.data.forEach(settlement => {
      if (settlement.returnOrderIds && Array.isArray(settlement.returnOrderIds)) {
        // 计算每个回货单在该结算单中的金额（平均分配）
        const amountPerOrder = settlement.totalAmount / settlement.returnOrderIds.length
        settlement.returnOrderIds.forEach(orderId => {
          const currentAmount = settledAmountMap.get(orderId) || 0
          settledAmountMap.set(orderId, currentAmount + amountPerOrder)
        })
      }
    })
    
    // 关联查询款号和发料单信息
    const ordersWithDetails = await Promise.all(
      returnOrders.data.map(async (order) => {
        try {
          const style = await db.collection('styles').doc(order.styleId).get()
          const issueOrder = await db.collection('issue_orders').doc(order.issueId).get()
          
          // 计算已结算金额（优先使用数据库字段，否则从settlements集合查询）
          const settledAmount = order.settledAmount || settledAmountMap.get(order._id) || 0
          const remainingAmount = order.processingFee - settledAmount
          
          return {
            ...order,
            styleName: style.data?.styleName || style.data?.name || '未知款号',
            styleCode: style.data?.styleCode || '',
            issueNo: issueOrder.data?.issueNo || '未知',
            returnDateFormatted: formatDate(order.returnDate),
            processingFeeFormatted: formatAmount(order.processingFee),
            settledAmount: settledAmount,
            settledAmountFormatted: formatAmount(settledAmount),
            remainingAmount: remainingAmount,
            remainingAmountFormatted: formatAmount(remainingAmount),
            selected: false,
            settlementAmount: remainingAmount // 默认结算剩余金额
          }
        } catch (error) {
          console.error('加载回货单详情失败:', error)
          return {
            ...order,
            styleName: '加载失败',
            styleCode: '',
            issueNo: '未知',
            returnDateFormatted: formatDate(order.returnDate),
            processingFeeFormatted: formatAmount(order.processingFee),
            settledAmount: 0,
            settledAmountFormatted: '0.00',
            remainingAmount: order.processingFee,
            remainingAmountFormatted: formatAmount(order.processingFee),
            selected: false,
            settlementAmount: order.processingFee
          }
        }
      })
    )
    
    this.setData({
      returnOrders: ordersWithDetails
    })
  },

  onToggleOrder(e) {
    const orderId = e.currentTarget.dataset.id
    const orders = this.data.returnOrders.map(order => {
      if (order._id === orderId) {
        return {
          ...order,
          selected: !order.selected
        }
      }
      return order
    })
    
    const selectedOrders = orders.filter(order => order.selected)
    const settlementAmount = selectedOrders.reduce((sum, order) => sum + (order.settlementAmount || 0), 0)
    
    this.setData({
      returnOrders: orders,
      selectedOrders: selectedOrders.map(order => order._id),
      settlementAmount: settlementAmount,
      settlementAmountFormatted: settlementAmount.toFixed(2)
    })
  },

  onSettlementAmountInput(e) {
    const orderId = e.currentTarget.dataset.id
    const value = parseFloat(e.detail.value) || 0
    const orders = this.data.returnOrders.map(order => {
      if (order._id === orderId) {
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

  onDateChange(e) {
    this.setData({
      settlementDate: e.detail.value
    })
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
      
      const db = wx.cloud.database()
      const selectedOrders = this.data.returnOrders.filter(order => order.selected)
      
      // 生成结算单号
      const settlementNo = `JS${Date.now()}`
      
      // 创建结算单
      const settlement = await db.collection('settlements').add({
        data: {
          settlementNo: settlementNo,
          factoryId: this.data.factoryId,
          factoryName: this.data.factory?.name || '未知工厂',
          settlementDate: new Date(this.data.settlementDate),
          totalAmount: this.data.settlementAmount,
          remark: this.data.remark,
          returnOrderIds: selectedOrders.map(order => order._id),
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          deleted: false
        }
      })
      
      // 更新回货单的结算状态
      const updatePromises = selectedOrders.map(order => {
        const newSettledAmount = (order.settledAmount || 0) + order.settlementAmount
        const processingFee = order.processingFee
        
        let settlementStatus = '未结算'
        if (newSettledAmount >= processingFee - 0.01) {
          settlementStatus = '已结算'
        } else if (newSettledAmount > 0) {
          settlementStatus = '部分结算'
        }
        
        return db.collection('return_orders').doc(order._id).update({
          data: {
            settledAmount: newSettledAmount,
            settlementStatus: settlementStatus,
            updateTime: db.serverDate()
          }
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

