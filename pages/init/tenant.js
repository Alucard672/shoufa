// pages/init/tenant.js
// 临时初始化页面：创建第一个租户

Page({
  data: {
    tenantName: '测试租户',
    contact: '管理员',
    phone: '13800138000',
    address: '测试地址',
    loading: false
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: '初始化租户'
    })
  },

  onTenantNameInput(e) {
    this.setData({
      tenantName: e.detail.value
    })
  },

  onContactInput(e) {
    this.setData({
      contact: e.detail.value
    })
  },

  onPhoneInput(e) {
    this.setData({
      phone: e.detail.value
    })
  },

  onAddressInput(e) {
    this.setData({
      address: e.detail.value
    })
  },

  async onCreateTenant() {
    if (!this.data.tenantName.trim()) {
      wx.showToast({
        title: '请输入租户名称',
        icon: 'none'
      })
      return
    }

    try {
      this.setData({ loading: true })
      wx.showLoading({
        title: '创建中...',
        mask: true
      })

      // 调用mysql云函数创建租户（增加超时时间）
      const result = await wx.cloud.callFunction({
        name: 'mysql',
        data: {
          action: 'insert',
          table: 'tenants',
          data: {
            name: this.data.tenantName.trim(),
            contact: this.data.contact.trim() || '',
            phone: this.data.phone.trim() || '',
            address: this.data.address.trim() || ''
          },
          options: {
            tenantId: '' // 创建租户时不需要tenantId
          }
        },
        timeout: 10000 // 设置10秒超时
      })

      wx.hideLoading()

      if (result.result.success) {
        wx.showModal({
          title: '创建成功',
          content: `租户"${this.data.tenantName}"创建成功！\n\n现在可以返回登录页面进行登录了。`,
          showCancel: false,
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              wx.reLaunch({
                url: '/pages/login/index'
              })
            }
          }
        })
      } else {
        throw new Error(result.result.error || '创建失败')
      }
    } catch (error) {
      wx.hideLoading()
      console.error('创建租户失败:', error)
      wx.showModal({
        title: '创建失败',
        content: error.message || '创建租户失败，请检查云函数是否已部署',
        showCancel: false
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})

