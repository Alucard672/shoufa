// pages/style/index.js
const { query } = require('../utils/db.js')
const { checkLogin } = require('../utils/auth.js')
const { normalizeImageUrl, batchGetImageUrls } = require('../utils/image.js')
const app = getApp()

Page({
  data: {
    styles: [],
    searchKeyword: '',
    styleCount: 0,
    showDisabled: false,  // 是否显示已停用的款号，默认不显示
    filterOptions: [
      { value: false, label: '仅显示启用' },
      { value: true, label: '显示全部' }
    ],
    filterIndex: 0
  },

  _loading: false,  // 加载锁

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }

    // 检查订阅状态，如果已过期则阻止操作
    const { checkSubscriptionAndBlock } = require('../utils/auth.js')
    if (checkSubscriptionAndBlock({ showModal: false })) {
      // 已过期，返回上一页
      wx.navigateBack()
      return
    }

    this.loadStyles()
  },

  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    // onShow 时重新加载，确保数据最新
    this.loadStyles()
  },

  onPullDownRefresh() {
    this.loadStyles().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async onStyleImageError(e) {
    const index = e.currentTarget.dataset.index
    if (index === undefined || index === null) return

    const style = this.data.styles[index]
    const originalUrl = e.currentTarget.dataset.originalUrl || style.originalImageUrl

    // 如果是 cloud:// URL，尝试重新获取临时URL
    if (originalUrl && originalUrl.startsWith('cloud://')) {
      try {
        const res = await wx.cloud.getTempFileURL({
          fileList: [originalUrl]
        })
        if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          const path = `styles[${index}].imageUrl`
          this.setData({
            [path]: res.fileList[0].tempFileURL
          })
          return
        }
      } catch (err) {
        console.warn('重新获取临时URL失败:', err)
      }
    }

    // 清空图片地址，触发占位图显示，避免"空白块"
    const path = `styles[${index}].imageUrl`
    this.setData({
      [path]: ''
    })
  },

  async loadStyles() {
    // 防止重复加载
    if (this._loading) {
      console.log('loadStyles: 正在加载中，跳过')
      return
    }
    this._loading = true

    try {
      const result = await query('styles', {}, {
        excludeDeleted: true,
        orderBy: { field: 'createTime', direction: 'DESC' }
      })

      console.log('=== 款号列表查询结果 ===')
      console.log('数据库返回记录数:', result.data.length)
      console.log('记录ID列表:', result.data.map(s => s._id))
      console.log('记录款号列表:', result.data.map(s => s.styleCode || s.style_code))

      const styles = { data: result.data }

      // 格式化数据
      const formattedStyles = styles.data.map(style => {
        // 兼容旧字段名
        const styleCode = style.styleCode || style.style_code || ''
        const styleName = style.styleName || style.style_name || ''
        const imageUrl = normalizeImageUrl(style)
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
          originalImageUrl: imageUrl,  // 保存原始URL用于重试
          processingFeePerDozen,
          yarnUsagePerPieceFormatted: yarnUsageKg.toFixed(2) + ' kg',
          actualUsageFormatted: actualUsage.toFixed(3),
          availableColors: availableColors,
          availableSizes: availableSizes,
          disabled: style.disabled || false  // 是否已停用
        }
      })

      // 批量转换 cloud:// URL 为临时URL
      const cloudUrls = formattedStyles
        .map(s => s.imageUrl)
        .filter(url => url && url.startsWith('cloud://'))

      if (cloudUrls.length > 0) {
        try {
          const urlMap = await batchGetImageUrls(cloudUrls)
          formattedStyles.forEach(style => {
            if (style.originalImageUrl && urlMap.has(style.originalImageUrl)) {
              style.imageUrl = urlMap.get(style.originalImageUrl)
            }
          })
        } catch (e) {
          console.warn('批量转换图片URL失败:', e)
        }
      }

      // 打印每条款号的停用状态
      console.log('款号停用状态:', formattedStyles.map(s => ({
        code: s.styleCode,
        disabled: s.disabled
      })))

      // 根据筛选条件过滤
      let displayStyles = formattedStyles
      console.log('当前筛选条件 showDisabled:', this.data.showDisabled)
      if (!this.data.showDisabled) {
        displayStyles = formattedStyles.filter(s => s.disabled !== true)
      }

      console.log('过滤后款号数量:', displayStyles.length, '(总数:', formattedStyles.length, ')')

      // 缓存全部数据用于筛选切换
      this._allStyles = formattedStyles

      this.setData({
        styles: displayStyles,
        styleCount: displayStyles.length
      })

      console.log('setData 完成，当前 styles 长度:', this.data.styles.length)
    } catch (error) {
      console.error('加载款号失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this._loading = false
    }
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadStyles()
  },

  // 切换是否显示已停用的款号
  onFilterChange(e) {
    const index = e.detail.value
    const showDisabled = this.data.filterOptions[index].value

    this.setData({
      filterIndex: index,
      showDisabled: showDisabled
    })

    // 如果已有缓存数据，直接过滤；否则重新加载
    if (this._allStyles) {
      let displayStyles = this._allStyles
      if (!showDisabled) {
        displayStyles = this._allStyles.filter(s => !s.disabled)
      }
      this.setData({
        styles: displayStyles,
        styleCount: displayStyles.length
      })
    } else {
      this.loadStyles()
    }
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/subpages/business/style/create'
    })
  },

  onEditStyle(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    // 注意：使用 catchtap 时不需要 stopPropagation，catchtap 会自动阻止冒泡
    const styleId = e.currentTarget.dataset.id
    if (!styleId) {
      wx.showToast({
        title: '无法获取款号ID',
        icon: 'none'
      })
      return
    }
    console.log('编辑款号，ID:', styleId)
    wx.navigateTo({
      url: `/subpages/business/style/create?id=${styleId}`
    })
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  }
})

