// pages/mine/invite.js
const app = getApp()

Page({
  data: {
    tenantInfo: null,
    qrCodeUrl: '',
    shareCode: '',
    sharePath: '',
    currentTab: 'employee', // 'employee' | 'customer' - 当前标签页
    customerQRCodeUrl: '' // 客户分享二维码
  },

  onLoad() {
    const tenantInfo = wx.getStorageSync('tenantInfo')
    const tenantId = wx.getStorageSync('tenantId')
    
    this.setData({
      tenantInfo
    })

    // 生成员工邀请二维码
    this.generateInviteQR(tenantId)
    
    // 生成客户分享链接
    this.generateCustomerShareLink(tenantId)
  },
  
  // 切换标签页
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      currentTab: tab
    })
    
    if (tab === 'customer' && !this.data.customerQRCodeUrl) {
      // 如果切换到客户分享且还没有生成二维码，则生成
      const tenantId = wx.getStorageSync('tenantId')
      this.generateCustomerShareQR(tenantId)
    }
  },
  
  // 生成客户分享链接
  async generateCustomerShareLink(tenantId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'share',
        data: {
          action: 'generateShareLink',
          tenantId: tenantId
        }
      })
      
      if (res.result && res.result.success) {
        this.setData({
          shareCode: res.result.shareCode,
          sharePath: res.result.sharePath
        })
      }
    } catch (err) {
      console.error('生成分享链接失败:', err)
    }
  },
  
  // 生成客户分享二维码
  async generateCustomerShareQR(tenantId) {
    try {
      const accountInfo = wx.getAccountInfoSync()
      const envVersion = accountInfo.miniProgram.envVersion
      
      const shareCode = this.data.shareCode || await this.getShareCode(tenantId)
      
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'getInviteQRCode',
          scene: `share_${shareCode}`,
          envVersion: envVersion
        }
      })
      
      if (res.result && res.result.success) {
        this.setData({
          customerQRCodeUrl: res.result.qrCodeUrl
        })
      }
    } catch (err) {
      console.error('生成客户分享二维码失败:', err)
      wx.showToast({
        title: '生成二维码失败',
        icon: 'none'
      })
    }
  },
  
  // 获取分享码
  async getShareCode(tenantId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'share',
        data: {
          action: 'generateShareLink',
          tenantId: tenantId
        }
      })
      
      if (res.result && res.result.success) {
        return res.result.shareCode
      }
    } catch (err) {
      console.error('获取分享码失败:', err)
    }
    return ''
  },

  async generateInviteQR(tenantId) {
    try {
      // 获取当前环境版本
      const accountInfo = wx.getAccountInfoSync();
      const envVersion = accountInfo.miniProgram.envVersion; // develop, trial, release

      // 使用小程序码接口生成二维码
      // scene 参数带上租户ID，长度限制32字符
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'getInviteQRCode',
          scene: tenantId,
          envVersion: envVersion
        }
      })

      if (res.result.success) {
        this.setData({
          qrCodeUrl: res.result.qrCodeUrl
        })
      } else {
        throw new Error(res.result.msg)
      }
    } catch (err) {
      console.error('生成二维码失败:', err)
      wx.showToast({
        title: '生成二维码失败',
        icon: 'none'
      })
    }
  },

  onShareAppMessage() {
    const tenantInfo = this.data.tenantInfo
    const tenantId = wx.getStorageSync('tenantId')
    
    // 根据当前标签页决定分享内容
    if (this.data.currentTab === 'customer') {
      // 客户分享
      const sharePath = this.data.sharePath || `/pages/index/index?shareCode=${this.data.shareCode}&shareType=tenant`
      return {
        title: `推荐使用 ${tenantInfo.name} 的纱线收发管理系统`,
        path: sharePath,
        imageUrl: '/images/logo.png'
      }
    } else {
      // 员工邀请
      return {
        title: `邀请您加入 ${tenantInfo.name}`,
        path: `/pages/index/index?inviteTenantId=${tenantId}`,
        imageUrl: '/images/logo.png'
      }
    }
  },
  
  // 复制分享链接
  onCopyShareLink() {
    const sharePath = this.data.sharePath
    if (!sharePath) {
      wx.showToast({
        title: '分享链接生成中',
        icon: 'none'
      })
      return
    }
    
    wx.setClipboardData({
      data: sharePath,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        })
      }
    })
  }
})
