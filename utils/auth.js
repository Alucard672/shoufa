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

