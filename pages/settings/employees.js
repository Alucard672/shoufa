// pages/settings/employees.js
import { checkLogin, getTenantId } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    employees: [],
    loading: false,
    showAddModal: false,
    phoneNumber: ''
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadEmployees()
  },

  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadEmployees()
  },

  async loadEmployees() {
    const tenantId = getTenantId()
    if (!tenantId) {
      wx.showToast({
        title: '未获取到租户信息',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    try {
      const result = await wx.cloud.callFunction({
        name: 'tenants',
        data: {
          action: 'listEmployees',
          payload: {
            tenantId: tenantId,
            pageNum: 1,
            pageSize: 100
          }
        }
      })

      if (result.result.code === 0) {
        this.setData({
          employees: result.result.data.list || []
        })
      } else {
        wx.showToast({
          title: result.result.msg || '加载失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('加载员工列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onAddEmployee() {
    this.setData({
      showAddModal: true,
      phoneNumber: ''
    })
  },

  onCloseModal() {
    this.setData({
      showAddModal: false,
      phoneNumber: ''
    })
  },

  onPhoneInput(e) {
    this.setData({
      phoneNumber: e.detail.value
    })
  },

  stopPropagation() {
    // 阻止事件冒泡
  },

  async onSave() {
    const phoneNumber = this.data.phoneNumber.trim()
    
    if (!phoneNumber) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      })
      return
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(phoneNumber)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      })
      return
    }

    const tenantId = getTenantId()
    if (!tenantId) {
      wx.showToast({
        title: '未获取到租户信息',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '绑定中...',
        mask: true
      })

      const result = await wx.cloud.callFunction({
        name: 'tenants',
        data: {
          action: 'bindEmployee',
          payload: {
            tenantId: tenantId,
            phoneNumber: phoneNumber
          }
        }
      })

      wx.hideLoading()

      if (result.result.code === 0) {
        wx.showToast({
          title: '绑定成功',
          icon: 'success'
        })
        this.onCloseModal()
        this.loadEmployees()
      } else {
        wx.showToast({
          title: result.result.msg || '绑定失败',
          icon: 'none',
          duration: 3000
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('绑定失败:', error)
      wx.showToast({
        title: '绑定失败',
        icon: 'none'
      })
    }
  },

  async onDelete(e) {
    const employee = e.currentTarget.dataset.employee
    const phoneNumber = employee.phone

    wx.showModal({
      title: '确认解绑',
      content: `确定要解绑手机号"${phoneNumber}"吗？解绑后该员工将无法登录。`,
      success: async (res) => {
        if (res.confirm) {
          const tenantId = getTenantId()
          if (!tenantId) {
            wx.showToast({
              title: '未获取到租户信息',
              icon: 'none'
            })
            return
          }

          try {
            wx.showLoading({
              title: '解绑中...',
              mask: true
            })

            const result = await wx.cloud.callFunction({
              name: 'tenants',
              data: {
                action: 'unbindEmployee',
                payload: {
                  tenantId: tenantId,
                  phoneNumber: phoneNumber
                }
              }
            })

            wx.hideLoading()

            if (result.result.code === 0) {
              wx.showToast({
                title: '解绑成功',
                icon: 'success'
              })
              this.loadEmployees()
            } else {
              wx.showToast({
                title: result.result.msg || '解绑失败',
                icon: 'none',
                duration: 3000
              })
            }
          } catch (error) {
            wx.hideLoading()
            console.error('解绑失败:', error)
            wx.showToast({
              title: '解绑失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

