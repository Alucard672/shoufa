// pages/yarn/create.js
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

  async loadYarn(yarnId) {
    try {
      wx.showLoading({
        title: '加载中...'
      })
      
      const db = wx.cloud.database()
      const yarn = await db.collection('yarn_inventory').doc(yarnId).get()
      
      if (yarn.data) {
        const yarnData = yarn.data
        
        // 匹配选中的颜色
        let selectedColor = null
        if (yarnData.color) {
          selectedColor = this.data.colorOptions.find(c => c.name === yarnData.color)
        }
        
        this.setData({
          yarnName: yarnData.yarnName || '',
          color: yarnData.color || '',
          currentStock: yarnData.currentStock ? yarnData.currentStock.toString() : '',
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

      const db = wx.cloud.database()
      
      const yarnData = {
        yarnName: this.data.yarnName.trim(),
        color: this.data.color || '',
        currentStock: parseFloat(this.data.currentStock),
        remark: this.data.remark || '',
        updateTime: db.serverDate()
      }

      if (this.data.isEdit) {
        // 编辑模式
        await db.collection('yarn_inventory').doc(this.data.yarnId).update({
          data: yarnData
        })
      } else {
        // 新增模式
        await db.collection('yarn_inventory').add({
          data: {
            ...yarnData,
            createTime: db.serverDate(),
            deleted: false
          }
        })
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

