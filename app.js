// app.js
// 导入环境配置
const envConfig = require('./env-config.js')

// 版本号配置
const VERSION = '1.0.0'

App({
  onLaunch(options) {
    // 检查是否有扫码进入的参数
    if (options.query && options.query.scene) {
      // 扫码进入，scene 就是 tenantId
      wx.setStorageSync('inviteTenantId', options.query.scene)
    } else if (options.query && options.query.inviteTenantId) {
      // 转发链接进入
      wx.setStorageSync('inviteTenantId', options.query.inviteTenantId)
    }

    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: envConfig.envId, // 从配置文件读取云开发环境ID
        traceUser: true,
      })
      console.log('云开发环境已初始化，envId:', envConfig.envId)
      console.log('小程序版本号:', VERSION)
    }

    // 从缓存恢复登录状态
    const tenantId = wx.getStorageSync('tenantId')
    if (tenantId) {
      this.globalData.tenantId = tenantId
      this.globalData.userInfo = wx.getStorageSync('userInfo')
      this.globalData.tenantInfo = wx.getStorageSync('tenantInfo')
      
      // 执行一次数据日期格式统一化（迁移）
      this.checkAndMigrateDates()
    }
  },

  async checkAndMigrateDates() {
    const hasMigrated = wx.getStorageSync('date_migrated_v1')
    if (hasMigrated) return

    try {
      console.log('开始同步数据库日期格式...')
      const res = await wx.cloud.callFunction({
        name: 'migrateDates'
      })
      if (res.result && res.result.success) {
        console.log('日期格式统一化成功:', res.result.results)
        wx.setStorageSync('date_migrated_v1', true)
      }
    } catch (e) {
      console.error('日期格式统一化失败:', e)
    }
  },

  globalData: {
    userInfo: null,
    tenantId: null,
    tenantInfo: null,
    version: VERSION // 版本号
  }
})

