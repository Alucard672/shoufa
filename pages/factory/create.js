// pages/factory/create.js
import { formatAmount } from '../../utils/calc.js'
import { queryByIds, insert, update } from '../../utils/db.js'
const app = getApp()
Page({
  data: {
    factoryId: '',
    isEdit: false,
    name: '',
    contact: '',
    phone: '',
    defaultPrice: '',
    settlementMethod: '月结',
    settlementMethodIndex: 0,
    remark: '',
    settlementMethods: ['月结', '单次结算']
  },

  async onLoad(options) {
    if (options.id) {
      this.setData({
        factoryId: options.id,
        isEdit: true
      })
      await this.loadFactory(options.id)
    }
  },

  async loadFactory(factoryId) {
    try {
      wx.showLoading({
        title: '加载中...'
      })

      const result = await queryByIds('factories', [factoryId], {
        excludeDeleted: true
      })

      if (result.data && result.data.length > 0) {
        const factoryData = result.data[0]
        
        // 验证租户权限
        if (factoryData.tenantId && factoryData.tenantId !== app.globalData.tenantId) {
          throw new Error('无权访问该加工厂')
        }

        const settlementMethodIndex = this.data.settlementMethods.indexOf(factoryData.settlementMethod || factoryData.settlement_method)

        this.setData({
          name: factoryData.name || '',
          contact: factoryData.contact || '',
          phone: factoryData.phone || '',
          defaultPrice: (factoryData.defaultPrice || factoryData.default_price) ? (factoryData.defaultPrice || factoryData.default_price).toString() : '',
          settlementMethod: factoryData.settlementMethod || factoryData.settlement_method || '月结',
          settlementMethodIndex: settlementMethodIndex >= 0 ? settlementMethodIndex : 0,
          remark: factoryData.remark || ''
        })
      }

      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('加载加工厂失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
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

  onPriceInput(e) {
    this.setData({
      defaultPrice: e.detail.value
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
    // 验证必填字段
    if (!this.data.name || !this.data.contact || !this.data.phone || !this.data.defaultPrice) {
      wx.showToast({
        title: '请填写必填字段',
        icon: 'none'
      })
      return
    }

    try {
      const factoryData = {
        name: this.data.name,
        contact: this.data.contact,
        phone: this.data.phone,
        default_price: parseFloat(this.data.defaultPrice),
        settlement_method: this.data.settlementMethod,
        remark: this.data.remark || ''
      }

      if (this.data.isEdit) {
        // 编辑模式
        const id = typeof this.data.factoryId === 'string' && /^\d+$/.test(this.data.factoryId) 
          ? parseInt(this.data.factoryId) 
          : this.data.factoryId
        await update('factories', factoryData, {
          id: id
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
    }
  },

  onCancel() {
    wx.navigateBack()
  }
})

