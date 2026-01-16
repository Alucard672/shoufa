// utils/auth.js
// 登录状态检查工具

const app = getApp()

/**
 * 检查是否已登录
 * @returns {boolean} 是否已登录
 */
export function isLoggedIn() {
  const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
  return !!tenantId
}

/**
 * 检查登录状态，如果未登录则提示并跳转到登录页
 * @param {Object} options 配置选项
 * @param {string} options.title 提示标题，默认'未登录'
 * @param {string} options.content 提示内容，默认'请先登录'
 * @param {boolean} options.showModal 是否显示模态框，默认true
 * @returns {boolean} 是否已登录
 */
export function checkLogin(options = {}) {
  const {
    title = '未登录',
    content = '请先登录',
    showModal = true
  } = options

  const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')

  if (!tenantId) {
    if (showModal) {
      wx.showModal({
        title: title,
        content: content,
        showCancel: false,
        confirmText: '去登录',
        success: () => {
          // 跳转到"我的"页面，用户可以在那里点击头像登录
          wx.switchTab({
            url: '/pages/mine/index'
          })
        }
      })
    } else {
      // 不跳转，只返回 false
    }
    return false
  }

  // 确保 globalData 中有租户信息
  if (!app.globalData.tenantId) {
    app.globalData.tenantId = tenantId
    app.globalData.userInfo = wx.getStorageSync('userInfo')
    app.globalData.tenantInfo = wx.getStorageSync('tenantInfo')
  }

  return true
}

/**
 * 获取当前租户ID
 * @returns {string|null} 租户ID
 */
export function getTenantId() {
  const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
  return tenantId || null
}

/**
 * 获取当前用户信息
 * @returns {Object|null} 用户信息
 */
export function getUserInfo() {
  const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
  if (!tenantId) {
    return null
  }
  return app.globalData.userInfo || wx.getStorageSync('userInfo')
}

/**
 * 检查订阅是否已过期（需要阻止操作）
 * @returns {boolean} 是否已过期
 */
export function isSubscriptionExpired() {
  const tenantInfo = app.globalData.tenantInfo || wx.getStorageSync('tenantInfo')
  if (!tenantInfo) {
    return true // 没有租户信息，视为已过期
  }

  const { isExpired } = require('./subscription.js')
  const expireDate = tenantInfo.expireDate || tenantInfo.expire_date
  return isExpired(expireDate)
}

/**
 * 检查并阻止已过期用户的操作
 * @param {Object} options 配置选项
 * @param {string} options.title 提示标题，默认'订阅已过期'
 * @param {string} options.content 提示内容
 * @param {Function} options.onConfirm 确认回调（跳转到付费页面）
 * @returns {boolean} 是否已过期（true表示已过期，已阻止操作）
 */
export function checkSubscriptionAndBlock(options = {}) {
  const {
    title = '订阅已过期',
    content = '您的订阅已过期，请续费后继续使用',
    onConfirm,
    showModal = true
  } = options

  if (isSubscriptionExpired()) {
    if (showModal) {
      wx.showModal({
        title: title,
        content: content,
        showCancel: true,
        confirmText: '立即续费',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            if (onConfirm) {
              onConfirm()
            } else {
              // 默认跳转到付费页面
              wx.navigateTo({
                url: '/subpages/mine/payment'
              })
            }
          }
        }
      })
    }
    return true // 已过期，已阻止操作
  }

  return false // 未过期，可以继续操作
}

/**
 * 退出登录
 */
export function logout() {
  // 清除本地存储
  wx.removeStorageSync('tenantId')
  wx.removeStorageSync('userInfo')
  wx.removeStorageSync('tenantInfo')

  // 清除全局数据
  app.globalData.tenantId = null
  app.globalData.userInfo = null
  app.globalData.tenantInfo = null

  // 跳转到"我的"页面，用户可以在那里登录
  wx.switchTab({
    url: '/pages/mine/index'
  })
}

