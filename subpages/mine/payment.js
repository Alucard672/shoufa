// pages/mine/payment.js
// 付费页面

const app = getApp()
const { checkSubscriptionAndBlock } = require('./utils/auth.js')

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
    loading: false,
    enablePayment: app.globalData.enablePayment !== false
  },

  onLoad() {
    // 生产环境关闭支付时直接提示并返回
    if (app.globalData.enablePayment === false) {
      wx.showModal({
        title: '暂未开通在线支付',
        content: '当前版本暂未开通在线支付，请联系管理员处理续费。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }
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
    } = require('./utils/subscription.js')

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
    if (app.globalData.enablePayment === false) {
      wx.showModal({
        title: '暂未开通在线支付',
        content: '当前版本暂未开通在线支付，请联系管理员处理续费。',
        showCancel: false
      })
      return
    }
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
          description: `订阅服务 - ${this.data.selectedPackage.name}`,
          packageInfo: {
            id: this.data.selectedPackage.id,
            name: this.data.selectedPackage.name,
            days: this.data.selectedPackage.days
          }
        }
      })

      if (res.result && res.result.success) {
        const { paymentParams, outTradeNo } = res.result

        // 调用微信支付
        wx.requestPayment({
          ...paymentParams,
          success: async (payRes) => {
            wx.showLoading({
              title: '确认支付结果...',
              mask: true
            })

            try {
              // 支付成功，调用云函数确认并更新状态
              const confirmRes = await wx.cloud.callFunction({
                name: 'payment',
                data: {
                  action: 'handlePaymentSuccess',
                  outTradeNo: outTradeNo
                }
              })

              wx.hideLoading()

              if (confirmRes.result && confirmRes.result.success) {
                wx.showToast({
                  title: '支付成功',
                  icon: 'success'
                })

                // 刷新订阅状态
                setTimeout(() => {
                  this.loadSubscriptionStatus()
                  // 通知"我的"页面更新
                  const pages = getCurrentPages()
                  const prevPage = pages[pages.length - 2]
                  if (prevPage && prevPage.loadSubscriptionStatus) {
                    prevPage.loadSubscriptionStatus()
                  }
                }, 1500)
              } else {
                throw new Error(confirmRes.result.error || '确认支付失败')
              }
            } catch (confirmErr) {
              wx.hideLoading()
              console.error('确认支付失败:', confirmErr)
              wx.showModal({
                title: '支付确认中',
                content: '支付已完成，但系统更新状态稍有延迟，请稍后刷新查看。',
                showCancel: false
              })
            }
          },
          fail: (err) => {
            console.error('用户取消或支付失败:', err)
            if (err.errMsg.indexOf('cancel') === -1) {
              wx.showToast({
                title: '支付失败',
                icon: 'none'
              })
            }
          }
        })
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

