// pages/mine/payment.js
// 付费页面

const app = getApp()
const { checkSubscriptionAndBlock } = require('../../utils/auth.js')

Page({
  data: {
    subscriptionStatus: null,
    remainingDaysText: '',
    expireDateText: '',
    packages: [
      {
        id: 'month',
        name: '1个月',
        days: 30,
        price: 99, // 价格（元），需要根据实际情况调整
        originalPrice: 120,
        pricePerDay: '3.30', // 平均每天价格
        popular: false
      },
      {
        id: 'quarter',
        name: '3个月',
        days: 90,
        price: 249,
        originalPrice: 300,
        pricePerDay: '2.77', // 平均每天价格
        popular: true
      },
      {
        id: 'halfyear',
        name: '6个月',
        days: 180,
        price: 449,
        originalPrice: 600,
        pricePerDay: '2.49', // 平均每天价格
        popular: false
      },
      {
        id: 'year',
        name: '12个月',
        days: 360,
        price: 799,
        originalPrice: 1200,
        pricePerDay: '2.22', // 平均每天价格
        popular: false
      }
    ],
    selectedPackage: null,
    loading: false
  },

  onLoad() {
    this.loadSubscriptionStatus()
  },
  
  onShow() {
    // 每次显示时检查订阅状态
    this.loadSubscriptionStatus()
  },

  loadSubscriptionStatus() {
    const tenantInfo = wx.getStorageSync('tenantInfo') || app.globalData.tenantInfo
    if (!tenantInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/mine/index'
        })
      }, 1500)
      return
    }

    const { 
      getTenantSubscriptionStatus, 
      formatRemainingDays, 
      formatExpireDate 
    } = require('../../utils/subscription.js')
    
    const subscriptionStatus = getTenantSubscriptionStatus(tenantInfo)
    const remainingDaysText = formatRemainingDays(tenantInfo.expireDate || tenantInfo.expire_date)
    const expireDateText = formatExpireDate(tenantInfo.expireDate || tenantInfo.expire_date)
    
    this.setData({
      subscriptionStatus: subscriptionStatus,
      remainingDaysText: remainingDaysText,
      expireDateText: expireDateText
    })
  },

  // 选择套餐
  onSelectPackage(e) {
    const packageId = e.currentTarget.dataset.id
    const selectedPackage = this.data.packages.find(pkg => pkg.id === packageId)
    
    this.setData({
      selectedPackage: selectedPackage
    })
  },

  // 确认支付
  async handleConfirmPayment() {
    if (!this.data.selectedPackage) {
      wx.showToast({
        title: '请选择套餐',
        icon: 'none'
      })
      return
    }

    const tenantId = wx.getStorageSync('tenantId') || app.globalData.tenantId
    if (!tenantId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    try {
      // 调用支付云函数创建订单
      const res = await wx.cloud.callFunction({
        name: 'payment',
        data: {
          action: 'createOrder',
          tenantId: tenantId,
          amount: this.data.selectedPackage.price * 100, // 转换为分
          description: `订阅服务 - ${this.data.selectedPackage.name}`
        }
      })

      if (res.result && res.result.success) {
        // TODO: 这里需要集成微信支付
        // 目前支付功能待完善，可以先显示提示
        wx.showModal({
          title: '支付功能开发中',
          content: `您选择了 ${this.data.selectedPackage.name} 套餐，价格：¥${this.data.selectedPackage.price}\n支付功能正在开发中，请联系客服完成支付。`,
          showCancel: false,
          confirmText: '我知道了'
        })
        
        // 如果支付功能已集成，这里应该调用 wx.requestPayment
        // wx.requestPayment({
        //   ...res.result.paymentParams,
        //   success: (payRes) => {
        //     // 支付成功，等待回调处理
        //     wx.showToast({
        //       title: '支付成功',
        //       icon: 'success'
        //     })
        //     // 刷新订阅状态
        //     setTimeout(() => {
        //       this.loadSubscriptionStatus()
        //       // 通知"我的"页面更新
        //       const pages = getCurrentPages()
        //       const prevPage = pages[pages.length - 2]
        //       if (prevPage && prevPage.checkSubscriptionStatus) {
        //         prevPage.checkSubscriptionStatus()
        //       }
        //     }, 1000)
        //   },
        //   fail: (err) => {
        //     console.error('支付失败:', err)
        //     wx.showToast({
        //       title: '支付失败',
        //       icon: 'none'
        //     })
        //   }
        // })
      } else {
        throw new Error(res.result.error || '创建订单失败')
      }
    } catch (err) {
      console.error('支付失败:', err)
      wx.showToast({
        title: err.message || '支付失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})

