// pages/yarn/create.js
import { query, insert, update } from '../../utils/db.js'
const app = getApp()

Page({
  data: {
    yarnId: '',
    isEdit: false,
    yarnName: '',
    color: '',
    currentStock: '',
    remark: '',
    colorOptions: [],
    selectedColor: []
  },

  async onLoad(options) {
    await this.loadColorDict()

    if (options.id) {
      this.setData({
        yarnId: options.id,
        isEdit: true
      })
      await this.loadYarn(options.id)
    }
  },

  async loadColorDict() {
    try {
      const colorsResult = await query('color_dict', null, {
        excludeDeleted: true
      })
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

  async loadYarn(yarnId) {
    try {
      wx.showLoading({
        title: '加载中...'
      })

      const yarnRes = await query('yarn_inventory', {
        id: yarnId
      }, {
        excludeDeleted: true
      })

      if (yarnRes.data && yarnRes.data[0]) {
        // 验证租户权限
        const yarnData = yarnRes.data[0]
        if (yarnData.tenantId && yarnData.tenantId !== app.globalData.tenantId) {
          throw new Error('无权访问该纱线数据')
        }

        // 匹配选中的颜色
        let selectedColor = null
        if (yarnData.color) {
          selectedColor = this.data.colorOptions.find(c => c.name === yarnData.color)
        }

        this.setData({
          yarnName: yarnData.yarnName || yarnData.yarn_name || '',
          color: yarnData.color || '',
          currentStock: (yarnData.currentStock || yarnData.current_stock) ? (yarnData.currentStock || yarnData.current_stock).toString() : '',
          remark: yarnData.remark || '',
          selectedColor: selectedColor ? [selectedColor] : []
        })
      }

      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('加载纱线失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  onYarnNameInput(e) {
    this.setData({
      yarnName: e.detail.value
    })
  },

  onColorChange(e) {
    const color = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedColor = Array.isArray(color) ? color[0] : color
    this.setData({
      selectedColor: selectedColor ? [selectedColor] : [],
      color: selectedColor ? (selectedColor.name || selectedColor) : ''
    })
  },

  onStockInput(e) {
    this.setData({
      currentStock: e.detail.value
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  async onSubmit() {
    // 验证必填字段
    if (!this.data.yarnName.trim()) {
      wx.showToast({
        title: '请输入纱线名称',
        icon: 'none'
      })
      return
    }

    if (!this.data.currentStock || parseFloat(this.data.currentStock) < 0) {
      wx.showToast({
        title: '请输入有效的库存数量',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '保存中...'
      })

      const yarnData = {
        yarn_name: this.data.yarnName.trim(),
        color: this.data.color || '',
        current_stock: parseFloat(this.data.currentStock),
        remark: this.data.remark || ''
      }

      if (this.data.isEdit) {
        // 编辑模式
        await update('yarn_inventory', yarnData, {
          id: this.data.yarnId
        })
      } else {
        // 新增模式
        await insert('yarn_inventory', yarnData)
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      wx.hideLoading()
      console.error('保存失败:', error)
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      })
    }
  },

  onCancel() {
    wx.navigateBack()
  }
})

