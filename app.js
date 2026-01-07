// app.js
// 导入环境配置
const envConfig = require('./env-config.js')
// 从 package.json 读取版本号（最直接的方式）
const packageJson = require('./package.json')
const VERSION = packageJson.version || '1.1.6'

App({
  async onLaunch(options) {
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
    }

    // 加载版本号（同步，立即生效）
    this.loadVersionInfo()

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

  /**
   * 获取版本号
   * 方式2: 使用 wx.getAccountInfoSync() 获取小程序信息
   * 注意：虽然不能直接获取上传版本号，但可以获取环境信息
   */
  loadVersionInfo() {
    let version = VERSION // 默认值

    try {
      // 方式2: 尝试从微信API获取小程序信息
      const accountInfo = wx.getAccountInfoSync()
      console.log('小程序账号信息:', accountInfo)
      
      // accountInfo.miniProgram 包含：
      // - appId: 小程序 appId
      // - envVersion: 当前环境版本（develop/trial/release）
      // - version: 基础库版本（如果可用）
      
      const miniProgramInfo = accountInfo.miniProgram || {}
      
      // 尝试获取版本号（虽然通常不可用，但保留尝试）
      if (miniProgramInfo.version) {
        version = miniProgramInfo.version
        console.log('从 wx.getAccountInfoSync() 读取版本号:', version)
      } else {
        // 如果获取不到，使用 package.json 的版本号
        version = VERSION
        console.log('从 package.json 读取版本号:', version)
      }

      // 保存环境信息到 globalData（可用于调试）
      this.globalData.appInfo = {
        appId: miniProgramInfo.appId,
        envVersion: miniProgramInfo.envVersion, // develop/trial/release
        version: version
      }

    } catch (error) {
      console.warn('获取小程序信息失败，使用默认版本号:', error)
      version = VERSION
    }

    // 设置全局版本号
    this.globalData.version = version
    console.log('小程序版本号:', version)
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
    version: VERSION, // 版本号（通过 getAccountInfoSync 获取，失败则使用 package.json）
    appInfo: null // 小程序账号信息（appId, envVersion 等）
  }
})

