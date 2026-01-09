// pages/mine/index.js
import { isLoggedIn } from '../../utils/auth.js'
import { 
  formatRemainingDays, 
  formatExpireDate, 
  getTenantSubscriptionStatus,
  getReminderMessage,
  shouldShowReminder
} from '../../utils/subscription.js'
const app = getApp()

// 获取默认版本号（尝试从小程序环境信息获取，失败则使用硬编码值）
function getDefaultVersion() {
  try {
    const accountInfo = wx.getAccountInfoSync()
    const miniProgramInfo = accountInfo?.miniProgram || {}
    // 如果小程序环境有版本号，优先使用
    if (miniProgramInfo.version) {
      return miniProgramInfo.version
    }
  } catch (error) {
    console.warn('获取小程序版本号失败:', error)
  }
  // Fallback 到硬编码值（如果所有方式都失败）
  return '1.1.6'
}

Page({
  data: {
    isLoggedIn: false, // 是否已登录
    showLogin: false, // 是否显示登录弹窗
    hasAvatar: false, // 是否显示头像图片
    userInfo: null, // 用户信息
    tenantInfo: null, // 租户信息
    avatarText: '用', // 头像文字
    subscriptionStatus: null, // 订阅状态
    remainingDaysText: '', // 剩余天数文本
    expireDateText: '', // 过期日期文本
    // 登录相关
    loading: false,
    isDev: false,
    avatarUrl: '',
    nickName: '',
    phoneNumber: '',
    hasPhoneNumber: false,
    phoneCode: '',
    menuItems: [
      {
        id: 'factory',
        title: '加工厂管理',
        desc: '管理加工厂信息',
        icon: '/images/icons/factory.png',
        bgColor: '#EFF6FF',
        path: '/pages/factory/index'
      },
      {
        id: 'style',
        title: '款号管理',
        desc: '管理款式信息',
        icon: '/images/icons/shirt.png',
        bgColor: '#FAF5FF',
        path: '/pages/style/index'
      },
      {
        id: 'yarn',
        title: '纱线管理',
        desc: '管理纱线库存',
        icon: '/images/icons/yarn.png',
        bgColor: '#F0FDF4',
        path: '/pages/yarn/index'
      },
      {
        id: 'auth',
        title: '授权管理',
        desc: '员工扫码加入企业',
        icon: '/images/icons/user.svg',
        bgColor: '#FEF2F2',
        path: '/pages/mine/invite',
        adminOnly: true // 标记仅管理员可见
      },
      {
        id: 'employees',
        title: '员工管理',
        desc: '查看和管理所有员工',
        icon: '/images/icons/user.svg',
        bgColor: '#F0FDF4',
        path: '/pages/settings/employees',
        adminOnly: true // 标记仅管理员可见
      },
      {
        id: 'settings',
        title: '基础信息设置',
        desc: '管理颜色、尺码等基础数据',
        icon: '/images/icons/settings.png',
        bgColor: '#FFF7ED',
        path: '/pages/settings/index'
      },
      {
        id: 'accounting',
        title: '账款管理',
        desc: '查看和管理加工账款',
        icon: '/images/icons/user.svg',
        bgColor: '#F0FDF4',
        path: '/pages/accounting/index'
      },
      {
        id: 'system',
        title: '系统参数',
        desc: '管理系统配置参数',
        icon: '/images/icons/settings.png',
        bgColor: '#F5F5F5',
        path: '/pages/settings/system'
      }
    ]
  },

  onLoad() {
    this.checkLoginStatus()
    // 判断是否为开发环境
    const accountInfo = wx.getAccountInfoSync()
    this.setData({
      isDev: accountInfo.miniProgram.envVersion === 'develop' || accountInfo.miniProgram.envVersion === 'trial',
      globalData: {
        version: app.globalData.version || getDefaultVersion()
      }
    })
  },
  
  async onShow() {
    // 更新版本号
    this.setData({
      'globalData.version': app.globalData.version || getDefaultVersion()
    })
    
    // 先检查登录状态
    this.checkLoginStatus()
    
    // 如果已登录，从数据库重新获取最新的租户信息（确保订阅状态是最新的）
    const loggedIn = isLoggedIn()
    if (loggedIn) {
      await this.refreshTenantInfo()
    }
  },
  
  // 从数据库刷新租户信息
  async refreshTenantInfo() {
    const tenantId = wx.getStorageSync('tenantId') || app.globalData.tenantId
    if (!tenantId) {
      return
    }
    
    try {
      // 改为调用云函数获取租户信息，避免前端直接访问 ADMINONLY 集合导致的权限问题
      const res = await wx.cloud.callFunction({
        name: 'tenants',
        data: {
          action: 'getTenant',
          payload: {
            tenantId: tenantId
          }
        }
      })
      
      if (res.result && res.result.data) {
        const tenantInfo = res.result.data
        
        // 调试：打印原始数据
        console.log('从云函数获取的租户信息:', tenantInfo)
        
        // 更新缓存
        wx.setStorageSync('tenantInfo', tenantInfo)
        // 更新全局数据
        app.globalData.tenantInfo = tenantInfo
        
        // 更新页面数据（包括用户信息）
        const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
        
        // 生成头像文字
        let avatarText = '用'
        if (userInfo.nickName && userInfo.nickName.length > 0) {
          avatarText = userInfo.nickName.charAt(0)
        } else if (userInfo.phone && userInfo.phone.length > 0) {
          avatarText = userInfo.phone.charAt(userInfo.phone.length - 1)
        }
        
        this.setData({
          tenantInfo: tenantInfo,
          userInfo: userInfo,
          avatarText: avatarText,
          hasAvatar: !!userInfo.avatarUrl
        })
        
        // 重新加载订阅状态
        this.checkSubscriptionStatus()
      }
    } catch (err) {
      console.error('刷新租户信息失败:', err)
      // 失败时继续使用缓存数据，但也要检查订阅状态
      this.checkSubscriptionStatus()
    }
  },

  checkLoginStatus() {
    const loggedIn = isLoggedIn()
    this.setData({
      isLoggedIn: loggedIn
    })
    if (loggedIn) {
      this.loadUserInfo()
    }
  },

  showLoginModal() {
    this.setData({
      showLogin: true
    })
  },

  hideLoginModal() {
    this.setData({
      showLogin: false
    })
  },

  stopPropagation() {
    // 阻止事件冒泡到背景层
  },

  onFormSectionClick() {
    // 点击表单区域
  },

  loadUserInfo() {
    // 从全局数据或本地存储获取用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    const tenantInfo = app.globalData.tenantInfo || wx.getStorageSync('tenantInfo') || {}
    
    // 生成头像文字（取昵称第一个字符，如果没有则取"用"）
    let avatarText = '用'
    if (userInfo.nickName && userInfo.nickName.length > 0) {
      avatarText = userInfo.nickName.charAt(0)
    } else if (userInfo.phone && userInfo.phone.length > 0) {
      avatarText = userInfo.phone.charAt(userInfo.phone.length - 1)
    }
    
    this.setData({
      userInfo: userInfo,
      tenantInfo: tenantInfo,
      avatarText: avatarText,
      hasAvatar: !!userInfo.avatarUrl
    })
    
    // 注意：不在 loadUserInfo 中调用 checkSubscriptionStatus
    // 让 refreshTenantInfo 来处理订阅状态的更新，确保使用最新的数据
  },
  
  // 检查订阅状态
  checkSubscriptionStatus() {
    const tenantInfo = wx.getStorageSync('tenantInfo') || app.globalData.tenantInfo
    if (!tenantInfo) {
      return
    }
    
    const expireDate = tenantInfo.expireDate || tenantInfo.expire_date
    const subscriptionStatus = getTenantSubscriptionStatus(tenantInfo)
    const remainingDaysText = formatRemainingDays(expireDate)
    const expireDateText = formatExpireDate(expireDate)
    
    // 强制更新数据，确保UI刷新
    this.setData({
      subscriptionStatus: subscriptionStatus,
      remainingDaysText: remainingDaysText,
      expireDateText: expireDateText
    }, () => {
      // 数据更新完成后的回调
      console.log('订阅状态已更新:', {
        status: subscriptionStatus.status,
        remainingDays: subscriptionStatus.remainingDays,
        expireDate: expireDateText
      })
    })
    
    // 检查是否需要提醒
    const reminder = getReminderMessage(tenantInfo.expireDate || tenantInfo.expire_date)
    if (reminder) {
      // 使用防抖，避免频繁提醒
      const lastReminderTime = wx.getStorageSync('lastReminderTime') || 0
      const now = Date.now()
      
      // 已过期时，每次进入都提醒；未过期时，每5分钟最多提醒一次
      const shouldShow = reminder.isExpired 
        ? true 
        : (now - lastReminderTime > 5 * 60 * 1000)
      
      if (shouldShow) {
        // 已过期时使用 Modal 提示，更醒目
        if (reminder.isExpired) {
          wx.showModal({
            title: reminder.title,
            content: reminder.message,
            showCancel: false,
            confirmText: '我知道了'
          })
        } else {
          wx.showToast({
            title: reminder.message,
            icon: 'none',
            duration: 3000
          })
        }
        
        if (!reminder.isExpired) {
          wx.setStorageSync('lastReminderTime', now)
        }
      }
    }
  },
  
  // 登出功能
  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync('tenantId')
          wx.removeStorageSync('userInfo')
          wx.removeStorageSync('tenantInfo')
          wx.removeStorageSync('lastReminderTime')
          
          // 清除全局数据
          app.globalData.tenantId = null
          app.globalData.userInfo = null
          app.globalData.tenantInfo = null
          
          // 更新页面状态
          this.setData({
            isLoggedIn: false,
            userInfo: null,
            tenantInfo: null,
            subscriptionStatus: null,
            remainingDaysText: '',
            expireDateText: ''
          })
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
        }
      }
    })
  },

  onMenuItemTap(e) {
    // 检查订阅状态，如果已过期则阻止操作
    const { checkSubscriptionAndBlock } = require('../../utils/auth.js')
    if (checkSubscriptionAndBlock()) {
      return // 已过期，已阻止操作
    }
    
    const path = e.currentTarget.dataset.path
    wx.navigateTo({
      url: path
    })
  },
  
  // 处理付费
  handlePayment() {
    // 跳转到付费页面
    wx.navigateTo({
      url: '/pages/mine/payment'
    })
  },

  // 登录相关方法
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      avatarUrl: avatarUrl
    })
  },

  onNickNameInput(e) {
    const nickName = e.detail.value
    console.log('昵称同步中:', nickName)
    // 立即更新，不加延迟
    this.data.nickName = nickName
    this.setData({
      nickName: nickName
    })
  },

  onPhoneInput(e) {
    const phoneNumber = e.detail.value
    console.log('手机号同步中:', phoneNumber)
    this.data.phoneNumber = phoneNumber
    this.setData({
      phoneNumber: phoneNumber
    })
  },

  async onGetPhoneNumber(e) {
    const { code, errMsg } = e.detail
    if (errMsg !== 'getPhoneNumber:ok') {
      // 弱化提示，不再显示“授权失败”，而是提醒手动输入
      wx.showToast({
        title: '请手动输入手机号',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '正在获取...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'getPhoneNumber',
          code: code
        }
      })

      if (res.result.success) {
        this.setData({
          phoneNumber: res.result.phoneNumber,
          hasPhoneNumber: true,
          phoneCode: code
        })
        wx.showToast({ title: '获取成功', icon: 'success' })
      } else {
        throw new Error(res.result.msg)
      }
    } catch (err) {
      console.error('获取手机号失败:', err)
      this.setData({
        hasPhoneNumber: true, // 标记为已尝试授权，即使解析失败也保存 code
        phoneCode: code
      })
      wx.showToast({
        title: '解析失败，请登录后重试',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  async handleLogin() {
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'mockLogin'
        }
      })

      const { success, user, tenant, msg } = res.result

      if (success) {
        wx.setStorageSync('userInfo', user)
        wx.setStorageSync('tenantInfo', tenant)
        wx.setStorageSync('tenantId', tenant._id)

        app.globalData.userInfo = user
        app.globalData.tenantId = tenant._id
        app.globalData.tenantInfo = tenant

        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })

        this.setData({
          showLogin: false
        })
        this.checkLoginStatus()
      } else {
        wx.showModal({
          title: '登录失败',
          content: msg || '初始化失败，请检查数据库配置',
          showCancel: false
        })
      }
    } catch (err) {
      console.error('登录失败:', err)
      wx.showToast({
        title: '系统错误',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleWeChatLogin() {
    // 强制获取输入框的最新的真实值，防止 setData 同步延迟
    const nickName = this.data.nickName || '';
    const phoneNumber = this.data.phoneNumber || '';

    // 检查是否有邀请租户ID
    const inviteTenantId = wx.getStorageSync('inviteTenantId')

    if (!nickName || nickName.trim() === '') {
      wx.showToast({
        title: '请先输入或选择昵称',
        icon: 'none'
      })
      return
    }

    if (!phoneNumber || phoneNumber.trim() === '') {
      wx.showToast({
        title: '请先获取或输入手机号',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    try {
      // 如果有邀请ID，统一调用 employees 云函数的 joinTenant（与登录页一致）
      if (inviteTenantId) {
        const res = await wx.cloud.callFunction({
          name: 'employees',
          data: {
            action: 'joinTenant',
            payload: {
              tenantId: inviteTenantId,
              code: this.data.phoneCode || '',
              phoneNumber: phoneNumber,
              avatarUrl: this.data.avatarUrl,
              nickName: nickName
            }
          }
        })

        // employees 云函数返回格式为 { code, msg, data }
        if (res.result.code === 0 && res.result.data.success) {
          const { user, tenant } = res.result.data
          
          wx.removeStorageSync('inviteTenantId')
          
          wx.setStorageSync('userInfo', user)
          wx.setStorageSync('tenantInfo', tenant)
          wx.setStorageSync('tenantId', tenant._id)

          app.globalData.userInfo = user
          app.globalData.tenantId = tenant._id
          app.globalData.tenantInfo = tenant

          wx.showToast({
            title: '加入成功',
            icon: 'success'
          })

          this.setData({
            showLogin: false
          })
          this.checkLoginStatus()
        } else {
          wx.showModal({
            title: '加入失败',
            content: res.result.msg || '加入企业失败，请稍后重试',
            showCancel: false
          })
        }
        return
      }
      
      // 正常登录逻辑，使用 auth 云函数
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'login',
          code: this.data.phoneCode || '',
          phoneNumber: phoneNumber,
          avatarUrl: this.data.avatarUrl,
          nickName: nickName
        }
      })

      const { success, user, tenant, msg } = res.result

      if (success) {
        wx.setStorageSync('userInfo', user || { phone: phoneNumber, nickName, avatarUrl: this.data.avatarUrl })
        wx.setStorageSync('tenantInfo', tenant)
        wx.setStorageSync('tenantId', tenant._id)

        app.globalData.userInfo = wx.getStorageSync('userInfo')
        app.globalData.tenantId = tenant._id
        app.globalData.tenantInfo = tenant

        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })

        this.setData({
          showLogin: false
        })
        this.checkLoginStatus()
      } else {
        wx.showModal({
          title: '登录失败',
          content: msg || '手机号未在系统中登记，请联系管理员',
          showCancel: false
        })
      }
    } catch (err) {
      console.error('登录失败:', err)
      wx.showToast({
        title: '系统错误，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})

