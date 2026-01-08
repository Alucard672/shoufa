// app.js
// 导入环境配置
const envConfig = require('./env-config.js')
// 版本号配置（与 package.json 保持一致，需手动同步）
const VERSION = '1.1.6'

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

    // 加载版本号（异步，不阻塞启动）
    this.loadVersionInfo().catch(err => {
      console.error('加载版本号失败:', err)
      // 确保有默认值
      this.globalData.version = VERSION
    })

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
   * 优先从云端读取，失败则使用本地默认值
   */
  async loadVersionInfo() {
    // 先设置本地默认值（确保有值可用）
    let version = VERSION
    this.globalData.version = version

    try {
      // 方式1: 尝试从云端数据库读取版本号（全局配置，不需要 tenantId）
      const db = wx.cloud.database()
      try {
        const appConfigRes = await db.collection('app_config')
          .where({
            key: 'appVersion'
          })
          .limit(1)
          .get()
        
        if (appConfigRes.data && appConfigRes.data.length > 0) {
          const cloudVersion = appConfigRes.data[0].value
          if (cloudVersion && cloudVersion.trim()) {
            version = cloudVersion.trim()
            console.log('从云端读取版本号:', version)
          }
        }
      } catch (cloudError) {
        // 如果集合不存在或查询失败，使用默认值
        console.log('从云端读取版本号失败，使用本地默认值:', cloudError)
        version = VERSION
      }

      // 方式2: 获取小程序环境信息（用于调试）
      try {
        const accountInfo = wx.getAccountInfoSync()
        const miniProgramInfo = accountInfo.miniProgram || {}
        
        // 保存环境信息到 globalData（可用于调试）
        this.globalData.appInfo = {
          appId: miniProgramInfo.appId,
          envVersion: miniProgramInfo.envVersion, // develop/trial/release
          version: version
        }
      } catch (infoError) {
        console.warn('获取小程序信息失败:', infoError)
      }

    } catch (error) {
      console.warn('加载版本号失败，使用默认版本号:', error)
      version = VERSION
    }

    // 设置全局版本号
    this.globalData.version = version
    console.log('小程序版本号:', version)
    console.log('小程序环境:', this.globalData.appInfo?.envVersion || 'unknown')
    
    // 通知已加载版本号的页面更新（使用 setTimeout 延迟执行，避免在页面未完全初始化时调用）
    if (typeof getCurrentPages === 'function') {
      setTimeout(() => {
        try {
          const pages = getCurrentPages()
          pages.forEach(page => {
            if (page && typeof page.setData === 'function') {
              try {
                // 只更新有 globalData 的页面
                if (page.data && page.data.globalData !== undefined) {
                  page.setData({
                    'globalData.version': version
                  })
                }
              } catch (e) {
                // 忽略设置失败（可能是页面已销毁）
                console.warn('更新页面版本号失败:', e)
              }
            }
          })
        } catch (error) {
          console.warn('获取页面列表失败:', error)
        }
      }, 100)
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
    version: VERSION, // 版本号（通过 getAccountInfoSync 获取，失败则使用 package.json）
    appInfo: null // 小程序账号信息（appId, envVersion 等）
  }
})

