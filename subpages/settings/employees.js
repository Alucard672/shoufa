// pages/settings/employees.js
const { checkLogin, getTenantId } = require('./utils/auth.js')
const { formatDate } = require('./utils/calc.js')
const { query } = require('./utils/db.js')
const app = getApp()

Page({
  data: {
    employees: [],
    loading: false,
    showAddModal: false,
    showEditModal: false,
    phoneNumber: '',
    addName: '',
    editEmployee: null,
    editName: '',
    editNickName: '',
    editPhone: ''
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
    // 优化：如果已经有数据，可以延迟加载或跳过（但员工列表通常需要实时性，所以保持加载）
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
      // 优先尝试使用云函数，如果云函数不存在则降级为直接查询
      let employees = []

      try {
        const result = await wx.cloud.callFunction({
          name: 'employees',
          data: {
            action: 'listEmployees',
            payload: {
              tenantId: tenantId,
              pageNum: 1,
              pageSize: 200
            }
          }
        })

        if (result.result.code === 0) {
          employees = result.result.data.list || []
        } else {
          throw new Error(result.result.msg || '云函数返回错误')
        }
      } catch (cloudError) {
        // 云函数不存在或调用失败，降级为直接查询数据库
        console.log('云函数调用失败，降级为直接查询:', cloudError)
        const result = await query('users', {
          tenantId: tenantId
        }, {
          excludeDeleted: true,
          orderBy: { field: 'createTime', direction: 'DESC' },
          limit: 200
        })
        employees = result.data || []
      }

      // 格式化员工数据，添加格式化的日期
      const formattedEmployees = employees.map(emp => ({
        ...emp,
        createTimeFormatted: emp.createTime ? formatDate(emp.createTime) : ''
      }))
      this.setData({
        employees: formattedEmployees
      })
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
      phoneNumber: '',
      addName: ''
    })
  },

  onCloseModal() {
    this.setData({
      showAddModal: false,
      phoneNumber: '',
      addName: ''
    })
  },

  onAddNameInput(e) {
    this.setData({
      addName: e.detail.value
    })
  },

  onCloseEditModal() {
    this.setData({
      showEditModal: false,
      editEmployee: null,
      editName: '',
      editNickName: '',
      editPhone: ''
    })
  },

  onEditEmployee(e) {
    const employee = e.currentTarget.dataset.employee
    this.setData({
      showEditModal: true,
      editEmployee: employee,
      editName: employee.name || '',
      editNickName: employee.nickName || '',
      editPhone: employee.phone || ''
    })
  },

  onEditNameInput(e) {
    this.setData({
      editName: e.detail.value
    })
  },

  onEditNickNameInput(e) {
    this.setData({
      editNickName: e.detail.value
    })
  },

  onEditPhoneInput(e) {
    this.setData({
      editPhone: e.detail.value
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
    const name = this.data.addName.trim()

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
        name: 'employees',
        data: {
          action: 'bindEmployee',
          payload: {
            tenantId: tenantId,
            phone: phoneNumber,
            name: name || undefined,
            nickName: name || undefined
          }
        }
      })

      wx.hideLoading()

      if (result.result.code === 0 && result.result.data.success) {
        wx.showToast({
          title: '绑定成功',
          icon: 'success'
        })
        this.onCloseModal()
        this.loadEmployees()
      } else {
        wx.showToast({
          title: result.result.msg || result.result.data?.msg || '绑定失败',
          icon: 'none',
          duration: 3000
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('绑定失败:', error)
      wx.showToast({
        title: error.message || '绑定失败',
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
              name: 'employees',
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
  },

  async onUpdateEmployee() {
    const { editEmployee, editName, editNickName, editPhone } = this.data

    if (!editEmployee || !editEmployee._id) {
      wx.showToast({
        title: '员工信息缺失',
        icon: 'none'
      })
      return
    }

    // 验证手机号格式（如果修改了手机号）
    if (editPhone && editPhone !== editEmployee.phone) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(editPhone)) {
        wx.showToast({
          title: '手机号格式不正确',
          icon: 'none'
        })
        return
      }
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
        title: '更新中...',
        mask: true
      })

      const result = await wx.cloud.callFunction({
        name: 'employees',
        data: {
          action: 'updateEmployee',
          payload: {
            tenantId: tenantId,
            userId: editEmployee._id,
            name: editName.trim(),
            nickName: editNickName.trim(),
            phone: editPhone.trim()
          }
        }
      })

      wx.hideLoading()

      if (result.result.code === 0) {
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        })
        this.onCloseEditModal()
        this.loadEmployees()
      } else {
        wx.showToast({
          title: result.result.msg || '更新失败',
          icon: 'none',
          duration: 3000
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('更新失败:', error)
      wx.showToast({
        title: error.message || '更新失败',
        icon: 'none'
      })
    }
  }
})

