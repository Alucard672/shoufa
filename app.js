// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-3g9cra4h71f647dd', // 云开发环境ID
        traceUser: true,
      })
    }

    // 从缓存恢复登录状态
    const tenantId = wx.getStorageSync('tenantId')
    if (tenantId) {
      this.globalData.tenantId = tenantId
      this.globalData.userInfo = wx.getStorageSync('userInfo')
      this.globalData.tenantInfo = wx.getStorageSync('tenantInfo')
    }
  },

  globalData: {
    userInfo: null,
    tenantId: null,
    tenantInfo: null
  }
})

