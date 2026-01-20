// app.js
// 导入环境配置
const envConfig = require('./env-config.js')
// 版本号默认值（硬编码，可通过云端数据库动态更新）
// 更新版本号时，修改这里的值，或通过云端 app_config 集合更新
const VERSION = '1.2.2'

const accountInfo = wx.getAccountInfoSync()
const isDev = accountInfo.miniProgram.envVersion === 'develop'

App({
  async onLaunch(options) {
    // 检查是否有扫码进入的参数
    if (options.query && options.query.scene) {
      // 扫码进入，scene 就是 tenantId
      wx.setStorageSync('inviteTenantId', options.query.scene)
    } else if (options.query && options.query.inviteTenantId) {
      // 转发链接进入（员工邀请）
      wx.setStorageSync('inviteTenantId', options.query.inviteTenantId)
    } else if (options.query && options.query.shareCode) {
      // 分享链接进入（客户分享）
      wx.setStorageSync('shareCode', options.query.shareCode)
      wx.setStorageSync('shareType', options.query.shareType || 'tenant')
    }

    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      // env-config.js 由部署脚本自动生成，直接包含当前环境的 envId
      const envId = envConfig.envId
      if (!envId) {
        console.error('云开发环境ID未配置，请检查 env-config.js')
      } else {
        wx.cloud.init({
          env: envId,
          traceUser: true,
        })
        console.log('云开发环境已初始化，envId:', envId)
      }
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

      // 从服务端重新获取租户信息（带重试机制）
      this.refreshTenantInfoWithRetry()

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

      // 方式2: 尝试从小程序环境信息获取版本号（如果云端没有）
      // 注意：wx.getAccountInfoSync().miniProgram.version 可能不是上传时的版本号
      // 但如果云端也没有配置，可以尝试使用这个值
      try {
        const accountInfo = wx.getAccountInfoSync()
        const miniProgramInfo = accountInfo.miniProgram || {}

        // 如果云端没有获取到版本号，且小程序环境有版本号，则使用它
        if (version === VERSION && miniProgramInfo.version) {
          version = miniProgramInfo.version
          console.log('从小程序环境信息获取版本号:', version)
        }

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

  /**
   * 从服务端刷新租户信息
   */
  async refreshTenantInfo() {
    const tenantId = this.globalData.tenantId || wx.getStorageSync('tenantId')
    if (!tenantId) {
      return
    }

    try {
      // 调用云函数获取租户信息
      const res = await wx.cloud.callFunction({
        name: 'tenants',
        data: {
          action: 'get',
          payload: {
            tenantId: tenantId
          }
        }
      })

      // tenants 云函数统一返回 { code, msg, data }
      // 其中 data.get 返回结构为 { tenantId, data: tenantInfo }
      if (res.result && res.result.code === 0 && res.result.data && res.result.data.data) {
        const tenantInfo = res.result.data.data

        // 更新缓存
        wx.setStorageSync('tenantInfo', tenantInfo)
        // 更新全局数据
        this.globalData.tenantInfo = tenantInfo

        console.log('从服务端获取租户信息成功')
      } else {
        throw new Error(res.result?.msg || '获取租户信息失败')
      }
    } catch (error) {
      console.error('刷新租户信息失败:', error)
      throw error
    }
  },

  /**
   * 从服务端刷新租户信息（带重试机制）
   * 如果失败，提示用户重试，点击确定后再次尝试
   * 如果再次失败，再次提示，直到成功为止
   */
  async refreshTenantInfoWithRetry() {
    // 先保存旧的 tenantInfo，以防获取失败时保留它
    const oldTenantInfo = this.globalData.tenantInfo || wx.getStorageSync('tenantInfo')

    try {
      await this.refreshTenantInfo()
    } catch (err) {
      console.error('获取租户信息失败:', err)

      // 如果获取失败但没有旧的 tenantInfo，说明是首次获取，需要清除并阻止使用
      if (!oldTenantInfo) {
        this.globalData.tenantInfo = null
        wx.removeStorageSync('tenantInfo')
      } else {
        // 如果有旧的 tenantInfo，保留它，确保页面可以正常加载
        // 但是数据可能不是最新的，需要继续重试
        console.log('保留旧的租户信息，继续重试获取最新信息')
      }

      // 如果获取失败，提示用户重试
      wx.showModal({
        title: '获取租户信息失败',
        content: '无法获取租户信息，请点击确定重试',
        showCancel: false,
        confirmText: '重试',
        success: async (res) => {
          if (res.confirm) {
            // 用户点击确定后，再次尝试获取
            try {
              await this.refreshTenantInfo()
              console.log('重试获取租户信息成功')
            } catch (retryErr) {
              console.error('重试获取租户信息失败:', retryErr)
              // 如果再次失败，递归调用，再次提示
              this.refreshTenantInfoWithRetry()
            }
          }
        },
        fail: () => {
          // 如果提示框显示失败，也递归调用重试
          this.refreshTenantInfoWithRetry()
        }
      })
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
    appInfo: null, // 小程序账号信息（appId, envVersion 等）
    enablePayment: envConfig.enablePayment !== false // 默认开启；生产环境可在 env-config.prod.js 里关闭
  }
})

