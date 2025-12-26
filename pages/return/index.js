// pages/return/index.js
import { getReturnOrders } from '../../utils/db.js'
import { formatDate, formatAmount, formatQuantity, formatWeight } from '../../utils/calc.js'
import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    totalReturnPieces: 0,
    totalReturnQuantityDisp: '', // 累计回货显示
    totalProcessingFee: 0,
    timeFilter: 'all',
    timeFilterIndex: 0,
    statusFilter: 'all',
    statusFilterIndex: 0,
    searchKeyword: '',
    returnOrders: [],
    filteredOrders: [],
    showShareModal: false,
    shareImagePath: '',
    sharingReturnOrder: null
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadData()
  },

  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    try {
      await Promise.all([
        this.loadStatistics(),
        this.loadReturnOrders()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async loadStatistics() {
    const where = {}

    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        where.returnDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    const result = await query('return_orders', where, {
      excludeDeleted: true
    })

    let totalPieces = 0
    let totalFee = 0

    result.data.forEach(order => {
      totalPieces += Math.floor(order.returnPieces || order.return_pieces || 0)
      totalFee += order.processingFee || order.processing_fee || 0
    })

    this.setData({
      totalReturnPieces: totalPieces,
      totalReturnQuantityDisp: formatQuantity(totalPieces),
      totalProcessingFee: totalFee,
      totalProcessingFeeFormatted: totalFee.toFixed(0)
    })
  },

  async loadReturnOrders() {
    const where = {}

    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        where.returnDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    // 查询回货单（搜索在客户端过滤）
    const ordersRes = await query('return_orders', where, {
      excludeDeleted: true,
      orderBy: { field: 'returnDate', direction: 'DESC' }
    })

    // 客户端过滤搜索关键词
    let orders = ordersRes.data || []
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      orders = orders.filter(order => {
        const returnNo = (order.returnNo || order.return_no || '').toLowerCase()
        return returnNo.includes(keyword)
      })
    }

    // 批量查询工厂、款号和发料单信息
    const factoryIds = [...new Set(orders.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(orders.map(order => order.styleId || order.style_id).filter(Boolean))]
    const issueIds = [...new Set(orders.map(order => order.issueId || order.issue_id).filter(Boolean))]

    const [factoriesRes, stylesRes, issueOrdersRes] = await Promise.all([
      factoryIds.length > 0 ? queryByIds('factories', factoryIds, { excludeDeleted: true }) : { data: [] },
      styleIds.length > 0 ? queryByIds('styles', styleIds, { excludeDeleted: true }) : { data: [] },
      issueIds.length > 0 ? queryByIds('issue_orders', issueIds, { excludeDeleted: true }) : { data: [] }
    ])

    const factoriesMap = Object.fromEntries(factoriesRes.data.map(f => [f._id || f.id, f]))
    const stylesMap = Object.fromEntries(stylesRes.data.map(s => [s._id || s.id, s]))
    const issueOrdersMap = Object.fromEntries(issueOrdersRes.data.map(o => [o._id || o.id, o]))

    // 关联查询工厂、款号和发料单信息
    const ordersWithDetails = orders.map(order => {
      try {
        const factoryId = order.factoryId || order.factory_id
        const styleId = order.styleId || order.style_id
        const issueId = order.issueId || order.issue_id

        const factory = factoriesMap[factoryId]
        const style = stylesMap[styleId]
        const issueOrder = issueOrdersMap[issueId]

        const processingFee = order.processingFee || order.processing_fee || 0
        const returnPieces = Math.floor(order.returnPieces || order.return_pieces || 0)
        const actualYarnUsage = order.actualYarnUsage || order.actual_yarn_usage || 0
        const pricePerPiece = returnPieces > 0 ? (processingFee / returnPieces) : 0

        const styleCode = style?.styleCode || style?.style_code || ''
        const styleName = style?.styleName || style?.style_name || '未知款号'
        const styleDisplay = styleCode ? `${styleCode} ${styleName}` : styleName

        // 计算加工单价（元/打）
        const returnQuantity = order.returnQuantity || order.return_quantity || 0
        const pricePerDozen = returnQuantity > 0 ? (processingFee / returnQuantity) : 0

        return {
          ...order,
          factoryName: factory?.name || '未知工厂',
          styleName: styleName,
          styleCode: styleCode,
          styleDisplay: styleDisplay,
          styleImageUrl: style?.imageUrl || style?.image_url || '',
          issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
          issueWeight: issueOrder?.issueWeight || issueOrder?.issue_weight || 0,
          issueWeightFormatted: formatWeight(issueOrder?.issueWeight || issueOrder?.issue_weight || 0),
          issueDate: issueOrder?.issueDate || issueOrder?.issue_date,
          issueDateFormatted: formatDate(issueOrder?.issueDate || issueOrder?.issue_date),
          color: order.color || '',
          size: order.size || '',
          returnPieces: returnPieces,
          returnQuantity: returnQuantity,
          returnQuantityFormatted: formatQuantity(returnQuantity),
          quantityFormatted: formatQuantity(returnPieces),
          returnPiecesFormatted: `${Math.floor(returnPieces / 12)}打${returnPieces % 12}件`,
          returnDateFormatted: formatDate(order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          pricePerPieceFormatted: pricePerPiece.toFixed(2),
          pricePerDozenFormatted: pricePerDozen.toFixed(2),
          actualYarnUsageFormatted: actualYarnUsage.toFixed(2),
          settlementStatus: order.settlementStatus || order.settlement_status || '未结算',
          settledAmount: order.settledAmount || order.settled_amount || 0,
          settledAmountFormatted: formatAmount(order.settledAmount || order.settled_amount || 0),
          status: order.status || '进行中'
        }
      } catch (error) {
        console.error('加载回货单详情失败:', error)
        const processingFee = order.processingFee || order.processing_fee || 0
        const returnPieces = order.returnPieces || order.return_pieces || 1
        const actualYarnUsage = order.actualYarnUsage || order.actual_yarn_usage || 0
        const pricePerPiece = returnPieces > 0 ? (processingFee / returnPieces) : 0

        return {
          ...order,
          factoryName: '加载失败',
          styleName: '加载失败',
          styleCode: '',
          styleDisplay: '加载失败',
          styleImageUrl: '',
          issueNo: '未知',
          returnPieces: Math.floor(returnPieces),
          quantityFormatted: formatQuantity(Math.floor(returnPieces)),
          returnDateFormatted: formatDate(order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          pricePerPieceFormatted: pricePerPiece.toFixed(2),
          actualYarnUsageFormatted: actualYarnUsage.toFixed(2)
        }
      }
    })

    // 应用状态筛选
    let finalOrders = ordersWithDetails || []
    if (this.data.statusFilter !== 'all') {
      finalOrders = ordersWithDetails.filter(order => {
        const orderStatus = order.status || '进行中'
        return orderStatus === this.data.statusFilter
      })
    }

    this.setData({
      returnOrders: ordersWithDetails,
      filteredOrders: finalOrders
    })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadReturnOrders()
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    this.setData({
      timeFilter: filters[index] || 'all',
      timeFilterIndex: index
    })
    this.loadData()
  },

  onStatusFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '进行中', '已完成']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index
    })
    // 重新过滤订单列表
    let finalOrders = this.data.returnOrders || []
    if (selectedFilter !== 'all') {
      finalOrders = this.data.returnOrders.filter(order => {
        const orderStatus = order.status || '进行中'
        return orderStatus === selectedFilter
      })
    }
    this.setData({
      filteredOrders: finalOrders
    })
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/pages/return/create'
    })
  },

  stopPropagation(e) {
    // 阻止事件冒泡
  },

  async onShareReturnOrder(e) {
    const returnOrderId = e.currentTarget.dataset.id
    const returnOrder = this.data.returnOrders.find(order => (order._id || order.id) === returnOrderId)
    
    if (!returnOrder) {
      wx.showToast({
        title: '回货单不存在',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '生成图片中...'
      })

      this.setData({
        sharingReturnOrder: returnOrder
      })

      const imagePath = await this.generateShareImage()
      
      this.setData({
        shareImagePath: imagePath,
        showShareModal: true
      })

      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('生成分享图片失败:', error)
      wx.showToast({
        title: '生成失败',
        icon: 'none'
      })
    }
  },

  async generateShareImage() {
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const returnOrder = this.data.sharingReturnOrder

      if (!returnOrder) {
        reject(new Error('回货单数据不存在'))
        return
      }

      // 画布尺寸
      const canvasWidth = 750
      const canvasHeight = 1200
      const padding = 40
      const contentWidth = canvasWidth - padding * 2

      // 背景
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      let y = padding

      // 标题
      ctx.setFillStyle('#333333')
      ctx.setFontSize(36)
      ctx.setTextAlign('center')
      ctx.fillText('回货单', canvasWidth / 2, y)
      y += 60

      // 回货单号
      ctx.setFillStyle('#666666')
      ctx.setFontSize(24)
      ctx.setTextAlign('center')
      ctx.fillText(`单号：${returnOrder.returnNo || ''}`, canvasWidth / 2, y)
      y += 50

      // 分隔线
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 加工厂信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(28)
      ctx.setTextAlign('left')
      ctx.fillText('加工厂：', padding, y)
      ctx.setFillStyle('#2b7fff')
      ctx.setFontSize(32)
      ctx.fillText(returnOrder.factoryName || '未知工厂', padding + 120, y)
      y += 50

      // 款号信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(28)
      ctx.fillText('款号：', padding, y)
      const styleText = returnOrder.styleCode ? `[${returnOrder.styleCode}] ${returnOrder.styleName}` : returnOrder.styleName
      ctx.setFillStyle('#101828')
      ctx.setFontSize(32)
      ctx.fillText(styleText || '未知款号', padding + 120, y)
      y += 50

      // 关联发料单信息
      if (returnOrder.issueNo && returnOrder.issueNo !== '未知') {
        ctx.setFillStyle('#333333')
        ctx.setFontSize(28)
        ctx.fillText('发料单号：', padding, y)
        ctx.setFillStyle('#101828')
        ctx.setFontSize(28)
        ctx.fillText(returnOrder.issueNo, padding + 140, y)
        y += 50

        if (returnOrder.issueDateFormatted) {
          ctx.setFillStyle('#333333')
          ctx.setFontSize(28)
          ctx.fillText('发料日期：', padding, y)
          ctx.setFillStyle('#666666')
          ctx.setFontSize(28)
          ctx.fillText(returnOrder.issueDateFormatted, padding + 140, y)
          y += 50
        }

        if (returnOrder.issueWeight > 0) {
          ctx.setFillStyle('#333333')
          ctx.setFontSize(28)
          ctx.fillText('发毛数：', padding, y)
          ctx.setFillStyle('#666666')
          ctx.setFontSize(28)
          ctx.fillText(`${returnOrder.issueWeightFormatted} kg`, padding + 140, y)
          y += 50
        }
      }

      // 分隔线
      y += 20
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 回货信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText('回货信息', padding, y)
      y += 50

      ctx.setFontSize(28)
      
      // 回货日期
      ctx.setFillStyle('#666666')
      ctx.fillText('回货日期：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.fillText(returnOrder.returnDateFormatted || '', padding + 140, y)
      y += 45

      // 回货数量
      ctx.setFillStyle('#666666')
      ctx.fillText('回货数量：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      if (returnOrder.returnQuantity > 0) {
        ctx.fillText(`${returnOrder.returnQuantityFormatted} (${returnOrder.returnPiecesFormatted})`, padding + 140, y)
      } else {
        ctx.fillText(returnOrder.quantityFormatted || '', padding + 140, y)
      }
      y += 45

      // 实际用纱量
      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('实际用纱：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.fillText(`${returnOrder.actualYarnUsageFormatted} kg`, padding + 140, y)
      y += 45

      // 分隔线
      y += 20
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 加工费信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText('加工费信息', padding, y)
      y += 50

      ctx.setFontSize(28)
      
      // 加工单价
      if (returnOrder.pricePerDozenFormatted) {
        ctx.setFillStyle('#666666')
        ctx.fillText('加工单价：', padding, y)
        ctx.setFillStyle('#333333')
        ctx.fillText(`¥${returnOrder.pricePerDozenFormatted} /打`, padding + 140, y)
        y += 45
      }

      // 加工费总额
      ctx.setFillStyle('#666666')
      ctx.fillText('加工费总额：', padding, y)
      ctx.setFillStyle('#2b7fff')
      ctx.setFontSize(36)
      ctx.fillText(`¥${returnOrder.processingFeeFormatted}`, padding + 180, y)
      y += 55

      // 结算状态
      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('结算状态：', padding, y)
      const statusColor = returnOrder.settlementStatus === '已结算' ? '#10b981' : 
                          returnOrder.settlementStatus === '部分结算' ? '#f59e0b' : '#f56565'
      ctx.setFillStyle(statusColor)
      ctx.fillText(returnOrder.settlementStatus || '未结算', padding + 140, y)
      y += 45

      // 已结算金额（如果有）
      if (returnOrder.settledAmount > 0) {
        ctx.setFillStyle('#666666')
        ctx.fillText('已结算：', padding, y)
        ctx.setFillStyle('#10b981')
        ctx.fillText(`¥${returnOrder.settledAmountFormatted}`, padding + 140, y)
        y += 45
      }

      // 底部信息
      y = canvasHeight - 60
      ctx.setFillStyle('#999999')
      ctx.setFontSize(20)
      ctx.setTextAlign('center')
      ctx.fillText(`生成时间：${new Date().toLocaleString('zh-CN')}`, canvasWidth / 2, y)

      ctx.draw(false, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'shareCanvas',
            width: canvasWidth,
            height: canvasHeight,
            destWidth: canvasWidth,
            destHeight: canvasHeight,
            success: (res) => {
              resolve(res.tempFilePath)
            },
            fail: (err) => {
              console.error('canvasToTempFilePath 失败:', err)
              reject(err)
            }
          }, this)
        }, 800)
      })
    })
  },

  saveImageToAlbum() {
    if (!this.data.shareImagePath) {
      wx.showToast({
        title: '图片未生成',
        icon: 'none'
      })
      return
    }

    // 检查授权状态
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          // 已授权，直接保存
          this.doSaveImage(this.data.shareImagePath)
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          // 已拒绝授权，需要引导用户打开设置
          wx.showModal({
            title: '提示',
            content: '需要授权保存图片到相册，请在设置中开启',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.writePhotosAlbum']) {
                      this.doSaveImage(this.data.shareImagePath)
                    }
                  }
                })
              }
            }
          })
        } else {
          // 未询问过，请求授权
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => {
              this.doSaveImage(this.data.shareImagePath)
            },
            fail: () => {
              wx.showToast({
                title: '需要授权才能保存图片',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  },

  doSaveImage(imagePath) {
    wx.saveImageToPhotosAlbum({
      filePath: imagePath,
      success: () => {
        wx.showToast({
          title: '图片已保存到相册',
          icon: 'success'
        })
        this.closeShareModal()
      },
      fail: (err) => {
        console.error('保存图片失败:', err)
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示',
            content: '需要授权保存图片到相册，请在设置中开启',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              }
            }
          })
        } else {
          wx.showToast({
            title: '保存失败',
            icon: 'none'
          })
        }
      }
    })
  },

  previewImage() {
    if (!this.data.shareImagePath) {
      wx.showToast({
        title: '图片未生成',
        icon: 'none'
      })
      return
    }

    wx.previewImage({
      urls: [this.data.shareImagePath],
      current: this.data.shareImagePath
    })
  },

  closeShareModal() {
    this.setData({
      showShareModal: false,
      shareImagePath: '',
      sharingReturnOrder: null
    })
  }
})

