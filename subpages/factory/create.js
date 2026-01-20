// pages/factory/create.js
const { formatAmount } = require('./utils/calc.js')
const { queryByIds, insert, update } = require('./utils/db.js')
const { checkLogin } = require('./utils/auth.js')
const app = getApp()
Page({
  data: {
    factoryId: '',
    isEdit: false,
    disabled: false,     // 是否已停用
    name: '',
    contact: '',
    phone: '',
    settlementMethod: '月结',
    settlementMethodIndex: 0,
    remark: '',
    settlementMethods: ['月结', '单次结算'],
    submitting: false
  },

  async onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    console.log('加工厂编辑页面 onLoad，options:', options)
    if (options.id) {
      console.log('检测到编辑模式，ID:', options.id)
      this.setData({
        factoryId: options.id,
        isEdit: true
      })
      await this.loadFactory(options.id)
    } else {
      console.log('新增模式')
      // 新增模式，重置表单
      this.setData({
        factoryId: '',
        isEdit: false,
        name: '',
        contact: '',
        phone: '',
        settlementMethod: '月结',
        settlementMethodIndex: 0,
        remark: ''
      })
    }
  },

  async loadFactory(factoryId) {
    try {
      wx.showLoading({
        title: '加载中...'
      })

      console.log('开始加载加工厂数据，ID:', factoryId)

      const result = await queryByIds('factories', [factoryId], {
        excludeDeleted: true
      })

      console.log('查询结果:', result)

      if (result.data && result.data.length > 0) {
        const factoryData = result.data[0]
        console.log('加工厂原始数据:', factoryData)

        // 验证租户权限
        if (factoryData.tenantId && factoryData.tenantId !== app.globalData.tenantId) {
          throw new Error('无权访问该加工厂')
        }

        // 使用数据库中的实际 _id 作为 factoryId（确保ID类型一致）
        const actualId = factoryData._id || factoryData.id || factoryId

        const settlementMethod = factoryData.settlementMethod || factoryData.settlement_method || '月结'
        const settlementMethodIndex = this.data.settlementMethods.indexOf(settlementMethod)

        const formData = {
          factoryId: actualId, // 保存实际的数据库ID
          disabled: factoryData.disabled || false, // 是否已停用
          name: factoryData.name || '',
          contact: factoryData.contact || '',
          phone: factoryData.phone || '',
          settlementMethod: settlementMethod,
          settlementMethodIndex: settlementMethodIndex >= 0 ? settlementMethodIndex : 0,
          remark: factoryData.remark || ''
        }

        console.log('设置表单数据:', formData)
        this.setData(formData)

        wx.hideLoading()
        wx.showToast({
          title: '加载成功',
          icon: 'success',
          duration: 1000
        })
      } else {
        wx.hideLoading()
        console.error('未找到加工厂数据')
        wx.showToast({
          title: '未找到加工厂数据',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('加载加工厂失败:', error)
      wx.showToast({
        title: '加载失败: ' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      })
    }
  },

  onNameInput(e) {
    this.setData({
      name: e.detail.value
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


  onSettlementMethodChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      settlementMethod: this.data.settlementMethods[index],
      settlementMethodIndex: index
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  async onSubmit() {
    // 防止重复提交
    if (this.data.submitting) {
      return
    }

    // 验证必填字段（手机号改为非必填）
    if (!this.data.name || !this.data.contact) {
      wx.showToast({
        title: '请填写必填字段（加工厂名称、联系人）',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      const factoryData = {
        name: this.data.name,
        contact: this.data.contact,
        phone: this.data.phone || '',
        settlementMethod: this.data.settlementMethod,
        remark: this.data.remark || ''
      }

      if (this.data.isEdit) {
        // 编辑模式：优先使用 _id，如果没有则使用 id
        const id = this.data.factoryId
        await update('factories', factoryData, {
          _id: id // 使用 _id 确保类型匹配
        })
      } else {
        // 新增模式
        await insert('factories', factoryData)
      }

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      console.error('保存失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
      this.setData({ submitting: false })
    }
  },

  onCancel() {
    wx.navigateBack()
  },

  // 停用/启用加工厂
  async onToggleDisabled() {
    const newStatus = !this.data.disabled
    const action = newStatus ? '停用' : '启用'

    // 如果要停用，先检查是否有未完成的发料单
    if (newStatus) {
      try {
        wx.showLoading({ title: '检查中...' })

        const db = wx.cloud.database()
        const _ = db.command

        // 查询该加工厂下所有未完成的发料单（未删除、未作废、状态不是"已完成"）
        const issueOrdersRes = await db.collection('issue_orders')
          .where({
            factoryId: this.data.factoryId,
            deleted: _.neq(true),
            voided: _.neq(true),
            status: _.neq('已完成')
          })
          .get()

        const incompleteOrders = (issueOrdersRes.data || []).filter(order => {
          // 双重检查：确保不是已完成、未删除、未作废
          return order.status !== '已完成' &&
            order.deleted !== true &&
            order.voided !== true
        })

        wx.hideLoading()

        if (incompleteOrders.length > 0) {
          wx.showModal({
            title: '无法停用',
            content: `该加工厂还有 ${incompleteOrders.length} 个未完成的发料单，请先完成相关单据后再停用。\n\n发料单编号：${incompleteOrders.slice(0, 3).map(o => o.issueNo || o.issue_no || '未知').join('、')}${incompleteOrders.length > 3 ? '...' : ''}`,
            showCancel: false,
            confirmText: '我知道了',
            success: () => {
              // 可选：跳转到发料单列表
              wx.navigateTo({
                url: '/pages/issue/index'
              })
            }
          })
          return
        }
      } catch (error) {
        wx.hideLoading()
        console.error('检查未完成发料单失败:', error)
        // 如果检查失败，为了安全起见，不允许停用
        wx.showModal({
          title: '检查失败',
          content: '无法检查该加工厂的发料单状态，为安全起见，暂不允许停用。请稍后重试。',
          showCancel: false
        })
        return
      }
    }

    wx.showModal({
      title: '确认' + action,
      content: `确定要${action}加工厂 "${this.data.name}" 吗？${newStatus ? '停用后该加工厂将不会出现在选择列表中。' : ''}`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })

            console.log('开始' + action + '加工厂:', this.data.factoryId)

            const db = wx.cloud.database()
            const result = await db.collection('factories')
              .doc(this.data.factoryId)
              .update({
                data: {
                  disabled: newStatus,
                  updateTime: db.serverDate()
                }
              })

            console.log(action + '结果:', result)

            if (result.stats.updated === 0) {
              throw new Error('权限不足或记录不存在，请检查数据库权限设置')
            }

            wx.hideLoading()
            wx.showToast({
              title: action + '成功',
              icon: 'success'
            })

            // 延迟返回列表
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
          } catch (error) {
            wx.hideLoading()
            console.error(action + '失败:', error)
            wx.showToast({
              title: action + '失败: ' + (error.message || '未知错误'),
              icon: 'none',
              duration: 3000
            })
          }
        }
      }
    })
  }
})

