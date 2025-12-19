// pages/style/index.js
Page({
  data: {
    styles: [],
    searchKeyword: ''
  },

  onLoad() {
    this.loadStyles()
  },

  onShow() {
    this.loadStyles()
  },

  onPullDownRefresh() {
    this.loadStyles().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadStyles() {
    try {
      const db = wx.cloud.database()
      const _ = db.command
      const styles = await db.collection('styles')
        .where({
          deleted: _.eq(false)
        })
        .orderBy('createTime', 'desc')
        .get()
      
      // 格式化数据，确保颜色和尺码是字符串数组
      const formattedStyles = styles.data.map(style => {
        const yarnUsageKg = (style.yarnUsagePerPiece || 0) / 1000
        
        // 确保 availableColors 和 availableSizes 是字符串数组
        let availableColors = style.availableColors || []
        let availableSizes = style.availableSizes || []
        
        // 处理不同的数据格式
        // 如果 availableColors 是字符串（可能是逗号分隔的字符串）
        if (typeof style.availableColors === 'string') {
          availableColors = style.availableColors.split(',').map(c => c.trim()).filter(c => c)
        }
        // 如果 availableColors 是数组，但第一个元素是逗号分隔的字符串
        else if (Array.isArray(availableColors) && availableColors.length === 1 && typeof availableColors[0] === 'string' && availableColors[0].indexOf(',') >= 0) {
          availableColors = availableColors[0].split(',').map(c => c.trim()).filter(c => c)
        }
        
        // 如果 availableSizes 是字符串（可能是逗号分隔的字符串）
        if (typeof style.availableSizes === 'string') {
          availableSizes = style.availableSizes.split(',').map(s => s.trim()).filter(s => s)
        }
        // 如果 availableSizes 是数组，但第一个元素是逗号分隔的字符串
        else if (Array.isArray(availableSizes) && availableSizes.length === 1 && typeof availableSizes[0] === 'string' && availableSizes[0].indexOf(',') >= 0) {
          availableSizes = availableSizes[0].split(',').map(s => s.trim()).filter(s => s)
        }
        
        // 如果保存的是对象数组，转换为字符串数组
        if (availableColors.length > 0 && typeof availableColors[0] === 'object') {
          availableColors = availableColors.map(c => c.name || c._id || String(c))
        }
        if (availableSizes.length > 0 && typeof availableSizes[0] === 'object') {
          availableSizes = availableSizes.map(s => s.name || s._id || String(s))
        }
        
        // 计算实际用量（含损耗）
        const lossRate = style.lossRate || 0
        const actualUsage = yarnUsageKg * (1 + lossRate / 100)
        
        return {
          ...style,
          yarnUsagePerPieceFormatted: yarnUsageKg.toFixed(2) + ' kg',
          actualUsageFormatted: actualUsage.toFixed(3),
          availableColors: availableColors,
          availableSizes: availableSizes
        }
      })
      
      this.setData({
        styles: formattedStyles,
        styleCount: styles.data.length
      })
    } catch (error) {
      console.error('加载款号失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadStyles()
  },

  navigateToCreate() {
    wx.navigateTo({
      url: '/pages/style/create'
    })
  },

  onEditStyle(e) {
    const styleId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/style/create?id=${styleId}`
    })
  }
})

