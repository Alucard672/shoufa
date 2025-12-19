// pages/issue/create.js
import { createIssueOrder } from '../../utils/db.js'
import { generateIssueNo, formatDate } from '../../utils/calc.js'

Page({
  data: {
    factories: [],
    styles: [],
    colorOptions: [],
    selectedFactory: null,
    selectedStyle: null,
    selectedColor: null,
    selectedColors: [],
    issueWeight: '',
    issueDate: '',
    planId: ''
  },

  async onLoad(options) {
    if (options.planId) {
      this.setData({
        planId: options.planId
      })
    }
    await Promise.all([
      this.loadFactories(),
      this.loadStyles(),
      this.loadColorDict()
    ])
    this.setData({
      issueDate: formatDate(new Date())
    })
  },

  async loadFactories() {
    const db = wx.cloud.database()
    const factories = await db.collection('factories')
      .where({
        deleted: wx.cloud.database().command.neq(true)
      })
      .get()
    this.setData({
      factories: factories.data
    })
  },

  async loadStyles() {
    const db = wx.cloud.database()
    const styles = await db.collection('styles').get()
    this.setData({
      styles: styles.data
    })
  },

  async loadColorDict() {
    const db = wx.cloud.database()
    try {
      const colorsResult = await db.collection('color_dict').get()
      this.setData({
        colorOptions: colorsResult.data || []
      })
    } catch (error) {
      console.error('加载颜色字典失败:', error)
      this.setData({
        colorOptions: []
      })
    }
  },

  onFactoryChange(e) {
    const factory = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedFactory = Array.isArray(factory) ? factory[0] : factory
    this.setData({
      selectedFactory: selectedFactory,
      selectedFactoryId: selectedFactory?._id || ''
    })
  },

  onStyleChange(e) {
    const style = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedStyle = Array.isArray(style) ? style[0] : style
    this.setData({
      selectedStyle: selectedStyle,
      selectedStyleId: selectedStyle?._id || '',
      selectedColor: null,
      selectedColors: []
    })
  },

  onColorChange(e) {
    const color = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedColor = Array.isArray(color) ? color[0] : color
    this.setData({
      selectedColor: selectedColor,
      selectedColors: selectedColor ? [selectedColor] : []
    })
  },

  onDateChange(e) {
    this.setData({
      issueDate: e.detail.value
    })
  },


  onWeightInput(e) {
    this.setData({
      issueWeight: e.detail.value
    })
  },

  async onSubmit() {
    // 表单验证
    if (!this.data.selectedFactory || !this.data.selectedFactoryId) {
      wx.showToast({
        title: '请选择加工厂',
        icon: 'none'
      })
      return
    }
    
    if (!this.data.selectedStyle || !this.data.selectedStyleId) {
      wx.showToast({
        title: '请选择款号',
        icon: 'none'
      })
      return
    }
    
    if (!this.data.selectedColor) {
      wx.showToast({
        title: '请选择颜色',
        icon: 'none'
      })
      return
    }
    
    if (!this.data.issueWeight || parseFloat(this.data.issueWeight) <= 0) {
      wx.showToast({
        title: '请输入有效的发料重量',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '创建中...'
      })

      const issueNo = generateIssueNo()
      const issueDate = new Date(this.data.issueDate)
      const colorName = this.data.selectedColor.name || this.data.selectedColor

      // 使用云函数创建发料单（支持事务操作）
      const result = await wx.cloud.callFunction({
        name: 'createIssueOrder',
        data: {
          issueOrder: {
            issueNo,
            factoryId: this.data.selectedFactoryId,
            styleId: this.data.selectedStyleId,
            color: colorName,
            issueWeight: parseFloat(this.data.issueWeight),
            issueDate,
            planId: this.data.planId || ''
          }
        }
      })

      if (result.result.success) {
        wx.hideLoading()
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(result.result.error || '创建失败')
      }
    } catch (error) {
      wx.hideLoading()
      console.error('创建发料单失败:', error)
      wx.showToast({
        title: error.message || '创建失败',
        icon: 'none'
      })
    }
  }
})

