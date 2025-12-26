// pages/mine/invite.js
const app = getApp()

Page({
  data: {
    tenantInfo: null,
    qrCodeUrl: ''
  },

  onLoad() {
    const tenantInfo = wx.getStorageSync('tenantInfo')
    const tenantId = wx.getStorageSync('tenantId')
    
    this.setData({
      tenantInfo
    })

    this.generateInviteQR(tenantId)
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
    
    return {
      title: `邀请您加入 ${tenantInfo.name}`,
      path: `/pages/index/index?inviteTenantId=${tenantId}`,
      imageUrl: '/images/logo.png'
    }
  }
})

