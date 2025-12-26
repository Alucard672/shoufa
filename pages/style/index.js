// pages/style/index.js
import { query } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    styles: [],
    searchKeyword: ''
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadStyles()
  },

  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadStyles()
  },

  onPullDownRefresh() {
    this.loadStyles().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadStyles() {
    try {
      const result = await query('styles', {}, {
        excludeDeleted: true,
        orderBy: { field: 'createTime', direction: 'DESC' }
      })
      const styles = { data: result.data }

      // 格式化数据
      const formattedStyles = styles.data.map(style => {
        // 兼容旧字段名
        const styleCode = style.styleCode || style.style_code || ''
        const styleName = style.styleName || style.style_name || ''
        const imageUrl = style.imageUrl || style.image_url || ''
        const yarnUsagePerPiece = style.yarnUsagePerPiece || style.yarn_usage_per_piece || 0
        const lossRate = style.lossRate || style.loss_rate || 0
        const processingFeePerDozen = style.processingFeePerDozen || style.processing_fee_per_dozen || 0
        
        const yarnUsageKg = yarnUsagePerPiece / 1000
        const actualUsage = style.actualUsage || style.actual_usage || (yarnUsageKg * (1 + lossRate / 100))

        // 处理颜色和尺码
        let availableColors = style.availableColors || style.available_colors || []
        let availableSizes = style.availableSizes || style.available_sizes || []
        
        // 如果是从JSON字段读取的字符串，需要解析
        if (typeof availableColors === 'string') {
          try {
            availableColors = JSON.parse(availableColors)
          } catch (e) {
            availableColors = []
          }
        }
        if (typeof availableSizes === 'string') {
          try {
            availableSizes = JSON.parse(availableSizes)
          } catch (e) {
            availableSizes = []
          }
        }

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

        return {
          ...style,
          styleCode,
          styleName,
          imageUrl,
          processingFeePerDozen,
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
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/pages/style/create'
    })
  },

  onEditStyle(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const styleId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/style/create?id=${styleId}`
    })
  }
})

