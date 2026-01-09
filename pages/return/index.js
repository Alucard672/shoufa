// pages/return/index.js
import { getReturnOrders } from '../../utils/db.js'
import { formatDate, formatDateTime, formatAmount, formatQuantity, formatWeight } from '../../utils/calc.js'
import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl, batchGetImageUrls } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber } from '../../utils/summary.js'
const app = getApp()

Page({
  data: {
    loading: false,
    // 分享画布尺寸（必须和导出一致，否则可能出现底部黑/重叠）
    canvasWidth: 750,
    canvasHeight: 1200,
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
    displayOrders: [],
    pageSize: 10,
    showShareModal: false,
    shareImagePath: '',
    sharingReturnOrder: null,
    swipeStartX: 0, // 左滑开始位置
    swipeStartOffset: 0, // 开始滑动时的偏移量
    currentSwipeIndex: -1 // 当前滑动的项索引
  },

  // 设计稿按钮点击：复用原来的 filter-tabs 逻辑
  onTimeSegTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10) || 0
    this.onTimeFilterChange({ detail: { index } })
  },

  onStatusSegTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10) || 0
    this.onStatusFilterChange({ detail: { index } })
  },

  // 图片加载失败：降级为占位图
  onStyleImageError(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
      const i = typeof index === 'number' ? index : parseInt(index, 10)
      if (!Number.isNaN(i) && this.data.displayOrders && this.data.displayOrders[i]) {
        this.setData({ [`displayOrders[${i}].styleImageUrl`]: '' })
      }
    }

    if (!id) return
    const match = (o) => String(o?._id || o?.id || '') === String(id)

    const updateById = (listName) => {
      const list = this.data[listName] || []
      const idx = list.findIndex(match)
      if (idx >= 0) {
        this.setData({ [`${listName}[${idx}].styleImageUrl`]: '' })
      }
    }

    updateById('returnOrders')
    updateById('filteredOrders')
  },

  onLoad(options) {
    // ...
  },

  // 预览图片
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
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
    if (this.data.loading) return
    this.setData({ loading: true })
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
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadStatistics() {
    // 查询所有数据，然后在客户端进行时间筛选
    const result = await query('return_orders', {}, {
      excludeDeleted: true
    })

    let orders = result.data || []
    
    // 客户端进行时间筛选（hybrid：returnDate 优先，缺失用 createTime 兜底）
    orders = filterByTimeFilter(orders, this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['returnDate', 'return_date'], ['createTime', 'create_time'])
    )

    let totalPieces = 0
    let totalFee = 0

    // 排除已作废的单据
    const validOrders = orders.filter(order => !order.voided)
    
    validOrders.forEach(order => {
      totalPieces += Math.floor(pickNumber(order, ['returnPieces', 'return_pieces'], 0))
      totalFee += pickNumber(order, ['processingFee', 'processing_fee'], 0)
    })

    this.setData({
      totalReturnPieces: totalPieces,
      totalReturnQuantityDisp: formatQuantity(totalPieces),
      totalProcessingFee: totalFee,
      totalProcessingFeeFormatted: totalFee.toFixed(0)
    })
  },

  async loadReturnOrders() {
    // 查询所有回货单，然后在客户端进行时间筛选（更可靠）
    const ordersRes = await query('return_orders', {}, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'DESC' }
    })

    // 客户端进行时间筛选（hybrid：returnDate 优先，缺失用 createTime 兜底）
    let orders = filterByTimeFilter(ordersRes.data || [], this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['returnDate', 'return_date'], ['createTime', 'create_time'])
    )

    // 客户端过滤搜索关键词
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

    const factoriesMap = Object.fromEntries(factoriesRes.data.map(f => [String(f._id || f.id), f]))
    const stylesMap = Object.fromEntries(stylesRes.data.map(s => [String(s._id || s.id), s]))
    const issueOrdersMap = Object.fromEntries(issueOrdersRes.data.map(o => [String(o._id || o.id), o]))
    
    // 批量转换图片URL（cloud:// -> 临时链接）
    try {
      const imageUrls = stylesRes.data
        .map(style => normalizeImageUrl(style))
        .filter(url => url && url.startsWith('cloud://'))
      
      if (imageUrls.length > 0) {
        const imageUrlMap = await batchGetImageUrls(imageUrls)
        // 更新 stylesMap 中的图片URL
        stylesRes.data.forEach(style => {
          const id = String(style._id || style.id)
          const originalUrl = normalizeImageUrl(style)
          if (originalUrl && imageUrlMap.has(originalUrl)) {
            stylesMap[id].styleImageUrl = imageUrlMap.get(originalUrl)
          }
        })
      }
    } catch (error) {
      console.error('批量转换图片URL失败:', error)
      // 失败不影响主流程，继续使用原 cloud:// URL
    }

    // 关联查询工厂、款号和发料单信息
    const ordersWithDetails = orders.map(order => {
      try {
        const factoryId = order.factoryId || order.factory_id
        const styleId = order.styleId || order.style_id
        const issueId = order.issueId || order.issue_id

        const factory = factoriesMap[String(factoryId)]
        const style = stylesMap[String(styleId)]
        const issueOrder = issueOrdersMap[String(issueId)]

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

        // 优先使用已转换的临时URL，如果是cloud://格式则使用空字符串避免500错误
        let styleImageUrl = style?.styleImageUrl || ''
        if (!styleImageUrl || styleImageUrl.startsWith('cloud://')) {
          styleImageUrl = ''
        }

        return {
          ...order,
          voided: order.voided || false, // 是否已作废
          factoryName: factory?.name || '未知工厂',
          styleName: styleName,
          styleCode: styleCode,
          styleDisplay: styleDisplay,
          styleImageUrl: styleImageUrl,
          issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
          issueWeight: issueOrder?.issueWeight || issueOrder?.issue_weight || 0,
          issueWeightFormatted: formatWeight(issueOrder?.issueWeight || issueOrder?.issue_weight || 0),
          issueDate: issueOrder?.issueDate || issueOrder?.issue_date,
          issueDateFormatted: formatDateTime(issueOrder?.createTime || issueOrder?.create_time || issueOrder?.issueDate || issueOrder?.issue_date),
          color: order.color || '',
          size: order.size || '',
          returnPieces: returnPieces,
          returnQuantity: returnQuantity,
          returnQuantityFormatted: formatQuantity(returnQuantity),
          quantityFormatted: formatQuantity(returnPieces),
          returnPiecesFormatted: formatQuantity(returnPieces),
          returnDateFormatted: formatDateTime(order.createTime || order.create_time || order.returnDate || order.return_date),
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
          returnDateFormatted: formatDateTime(order.createTime || order.create_time || order.returnDate || order.return_date),
          processingFeeFormatted: formatAmount(processingFee),
          pricePerPieceFormatted: pricePerPiece.toFixed(2),
          actualYarnUsageFormatted: actualYarnUsage.toFixed(2)
        }
      }
    })

    // 应用状态筛选
    let finalOrders = ordersWithDetails || []
    
    if (this.data.statusFilter === '已作废') {
      // 只显示已作废的单据
      finalOrders = ordersWithDetails.filter(order => order.voided)
    } else if (this.data.statusFilter !== 'all') {
      // 排除已作废的单据，按状态筛选
      finalOrders = ordersWithDetails
        .filter(order => !order.voided)
        .filter(order => {
          const orderStatus = order.status || '进行中'
          return orderStatus === this.data.statusFilter
        })
    } else {
      // 如果选择"全部"，排除已作废的单据
      finalOrders = ordersWithDetails.filter(order => !order.voided)
    }

    // 更新统计数量（与明细列表保持一致）
    let totalPieces = 0
    let totalFee = 0
    finalOrders.forEach(order => {
      totalPieces += Math.floor(pickNumber(order, ['returnPieces', 'return_pieces'], 0))
      totalFee += pickNumber(order, ['processingFee', 'processing_fee'], 0)
    })

    this.setData({
      returnOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      displayOrders: finalOrders.slice(0, this.data.pageSize).map(order => ({
        ...order,
        swipeOffset: 0 // 初始化左滑偏移量
      })),
      totalReturnPieces: totalPieces,
      totalReturnQuantityDisp: formatQuantity(totalPieces),
      totalProcessingFee: totalFee,
      totalProcessingFeeFormatted: totalFee.toFixed(0)
    })
  },

  onLoadMore(e) {
    const { displayCount } = e.detail
    this.setData({
      displayOrders: this.data.filteredOrders.slice(0, displayCount).map(order => ({
        ...order,
        swipeOffset: order.swipeOffset || 0 // 保留已有的滑动状态
      }))
    })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadReturnOrders()
  },

  navigateToDetail(e) {
    const id = e.currentTarget.dataset.id
    const index = parseInt(e.currentTarget.dataset.index, 10)
    
    // 如果当前项已展开，点击卡片时先收回
    if (this.data.currentSwipeIndex === index) {
      const displayOrders = this.data.displayOrders
      if (displayOrders && displayOrders[index]) {
        displayOrders[index].swipeOffset = 0
        this.setData({
          displayOrders: displayOrders,
          currentSwipeIndex: -1
        })
      }
      return
    }
    
    // 如果有其他项展开，先收回
    if (this.data.currentSwipeIndex >= 0 && this.data.currentSwipeIndex !== index) {
      const displayOrders = this.data.displayOrders
      if (displayOrders && displayOrders[this.data.currentSwipeIndex]) {
        displayOrders[this.data.currentSwipeIndex].swipeOffset = 0
        this.setData({
          displayOrders: displayOrders,
          currentSwipeIndex: -1
        })
      }
    }
    
    wx.navigateTo({
      url: `/pages/return/detail?id=${id}`
    })
  },

  // 左滑相关方法
  onSwipeStart(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    // 安全检查：确保索引有效且元素存在
    if (isNaN(index) || !this.data.displayOrders || !this.data.displayOrders[index]) {
      console.warn('onSwipeStart: 无效的索引或元素不存在', { index, displayOrdersLength: this.data.displayOrders?.length })
      return
    }
    
    const touch = e.touches[0]
    const currentOffset = this.data.displayOrders[index].swipeOffset || 0
    this.setData({
      swipeStartX: touch.clientX,
      swipeStartOffset: currentOffset, // 记录开始滑动时的偏移量
      currentSwipeIndex: index
    })
  },

  onSwipeMove(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    // 安全检查：确保索引有效且元素存在
    if (isNaN(index) || !this.data.displayOrders || !this.data.displayOrders[index]) {
      return
    }
    
    const touch = e.touches[0]
    const deltaX = touch.clientX - this.data.swipeStartX
    const startOffset = this.data.swipeStartOffset || 0
    
    // 计算新的偏移量
    let newOffset = startOffset + deltaX
    
    // 限制在 -140 到 0 之间（两个按钮各 70px）
    newOffset = Math.max(-140, Math.min(0, newOffset))
    
    const displayOrders = this.data.displayOrders
    // 再次检查元素是否存在（防止在移动过程中数据被更新）
    if (displayOrders[index]) {
      displayOrders[index].swipeOffset = newOffset
      this.setData({
        displayOrders: displayOrders
      })
    }
  },

  onSwipeEnd(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    // 安全检查：确保索引有效且元素存在
    if (isNaN(index) || !this.data.displayOrders || !this.data.displayOrders[index]) {
      console.warn('onSwipeEnd: 无效的索引或元素不存在', { index, displayOrdersLength: this.data.displayOrders?.length })
      return
    }
    
    const displayOrders = this.data.displayOrders
    const currentOffset = displayOrders[index].swipeOffset || 0
    
    // 如果滑动超过一半，则完全展开，否则收回
    let finalOffset = 0
    if (currentOffset < -70) {
      finalOffset = -140 // 完全展开（两个按钮各 70px）
    } else if (currentOffset < 0) {
      finalOffset = 0 // 收回
    }
    
    // 如果其他项已展开，先收回（需要检查元素是否存在）
    if (this.data.currentSwipeIndex >= 0 && this.data.currentSwipeIndex !== index) {
      if (displayOrders[this.data.currentSwipeIndex]) {
        displayOrders[this.data.currentSwipeIndex].swipeOffset = 0
      }
    }
    
    // 再次检查元素是否存在（防止在滑动过程中数据被更新）
    if (displayOrders[index]) {
      displayOrders[index].swipeOffset = finalOffset
      this.setData({
        displayOrders: displayOrders,
        currentSwipeIndex: finalOffset < 0 ? index : -1
      })
    }
  },

  // 编辑回货单
  onEditReturn(e) {
    const id = e.currentTarget.dataset.id
    const index = parseInt(e.currentTarget.dataset.index, 10)
    
    // 收回滑动（安全检查）
    if (!isNaN(index) && this.data.displayOrders && this.data.displayOrders[index]) {
      const displayOrders = this.data.displayOrders
      displayOrders[index].swipeOffset = 0
      this.setData({
        displayOrders: displayOrders,
        currentSwipeIndex: -1
      })
    }
    
    wx.navigateTo({
      url: `/pages/return/create?id=${id}`
    })
  },

  // 作废/恢复回货单
  async onVoidReturn(e) {
    const id = e.currentTarget.dataset.id
    const index = parseInt(e.currentTarget.dataset.index, 10)
    
    // 安全检查：确保索引有效且元素存在
    if (isNaN(index) || !this.data.displayOrders || !this.data.displayOrders[index]) {
      console.warn('onVoidReturn: 无效的索引或元素不存在', { index, displayOrdersLength: this.data.displayOrders?.length })
      wx.showToast({
        title: '操作失败，数据已更新',
        icon: 'none'
      })
      return
    }
    
    const item = this.data.displayOrders[index]
    const isVoided = item.voided || false
    const action = isVoided ? '恢复' : '作废'
    
    // 收回滑动
    const displayOrders = this.data.displayOrders
    if (displayOrders[index]) {
      displayOrders[index].swipeOffset = 0
      this.setData({
        displayOrders: displayOrders,
        currentSwipeIndex: -1
      })
    }
    
    wx.showModal({
      title: `确认${action}`,
      content: `确定要${action}回货单 "${item.returnNo || ''}" 吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: `${action}中...` })

            const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
            const docId = String(id || item._id || item.id || '')
            const res2 = await wx.cloud.callFunction({
              name: 'createReturnOrder',
              data: {
                action: 'toggleVoid',
                tenantId: tenantId,
                returnOrderId: docId,
                voided: !isVoided
              }
            })
            if (!res2.result || !res2.result.success) {
              throw new Error((res2.result && (res2.result.error || res2.result.msg)) || '操作失败')
            }
            
            wx.hideLoading()
            wx.showToast({
              title: `${action}成功`,
              icon: 'success'
            })
            
            // 重新加载数据
            await this.loadReturnOrders()
          } catch (error) {
            wx.hideLoading()
            console.error(`${action}失败:`, error)
            wx.showToast({
              title: `${action}失败: ${error.message || '未知错误'}`,
              icon: 'none',
              duration: 3000
            })
          }
        }
      }
    })
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
    const filters = ['all', '进行中', '已完成', '已作废']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index
    })
    // 重新加载数据以应用状态筛选
    this.loadReturnOrders()
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    
    // 检查订阅状态，如果已过期则阻止操作
    const { checkSubscriptionAndBlock } = require('../../utils/auth.js')
    if (checkSubscriptionAndBlock()) {
      return // 已过期，已阻止操作
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
    console.log('分享回货单，ID:', returnOrderId)
    console.log('当前 returnOrders 数量:', this.data.returnOrders.length)
    
    const returnOrder = this.data.returnOrders.find(order => {
      const orderId = order._id || order.id
      return orderId === returnOrderId || String(orderId) === String(returnOrderId)
    })
    
    console.log('找到的回货单:', returnOrder)
    
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
        title: '生成失败: ' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      })
    }
  },

  async generateShareImage() {
    return new Promise(async (resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const returnOrder = this.data.sharingReturnOrder

      if (!returnOrder) {
        reject(new Error('数据加载中，请稍后再试'))
        return
      }

      try {
        // 1. 预加载图片
        const imageUrl = returnOrder.styleImageUrl
        let localImagePath = null
        if (imageUrl && (imageUrl.startsWith('cloud://') || imageUrl.startsWith('http'))) {
          localImagePath = await new Promise(res => {
            wx.getImageInfo({
              src: imageUrl,
              success: (info) => res(info.path),
              fail: () => res(null)
            })
          })
        }

        // 2. 动态计算画布高度
        // 修复点：之前没把“款式信息卡片高度”算进去，导致底部系统戳画在卡片上发生重叠；
        // 同时 canvas 在 wxml 里是固定高度，导出时可能出现底部黑屏。
        const headerHeight = 320
        const summaryHeight = 620 // 3x2 网格高度
        const styleCardHeight = 160
        const footerHeight = 120
        const canvasWidth = 750
        const gapAfterCard = 40
        const canvasHeight = headerHeight + summaryHeight + styleCardHeight + gapAfterCard + footerHeight

        // 让 canvas 真实高度跟着动态高度走（否则会出现底部黑）
        this.setData({ canvasWidth, canvasHeight })

        // 3. 绘制背景
        ctx.setFillStyle('#F8FAFC')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 4. 绘制青色浸入式头部 (回货单使用青色/翠绿色)
        const grd = ctx.createLinearGradient(0, 0, canvasWidth, 320)
        grd.addColorStop(0, '#10B981')
        grd.addColorStop(1, '#059669')
        ctx.setFillStyle(grd)
        ctx.fillRect(0, 0, canvasWidth, 320)

        const padding = 40
        const cardPadding = 32

        // 头部标题和图标盒
        ctx.save()
        ctx.setGlobalAlpha(0.15)
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, 60, 96, 96, 24)
        ctx.fill()
        ctx.restore()
        
        ctx.setFillStyle('#FFFFFF')
        ctx.setFontSize(44)
        ctx.setTextAlign('center')
        ctx.fillText('回', padding + 48, 125)

        ctx.setTextAlign('left')
        ctx.setFontSize(48)
        ctx.fillText(returnOrder.factoryName || '加工厂', padding + 120, 105)
        ctx.setFontSize(26)
        ctx.setGlobalAlpha(0.8)
        ctx.fillText(`单号: ${returnOrder.returnNo || '-'}`, padding + 120, 148)
        ctx.setGlobalAlpha(1)

        // 时间日期
        ctx.setFontSize(24)
        ctx.fillText(`📅 回货日期: ${returnOrder.returnDateFormatted || '-'}`, padding, 250)

        // 5. 汇总统计网格 (3x2)
        const gridY = 290
        const itemWidth = (canvasWidth - padding * 2 - 20) / 2
        const itemHeight = 160
        const gap = 20

        const summaryItems = [
          { label: '回货数量', value: returnOrder.quantityFormatted || '0打0件' },
          { label: '实际用纱', value: `${returnOrder.actualYarnUsageFormatted}kg` },
          { label: '发料单号', value: returnOrder.issueNo || '-' },
          { label: '加工单价', value: `¥${returnOrder.pricePerDozenFormatted}/打` },
          { label: '加工费总额', value: `¥${returnOrder.processingFeeFormatted}` },
          { label: '结算状态', value: returnOrder.settlementStatus || '未结算' }
        ]

        summaryItems.forEach((item, index) => {
          const col = index % 2
          const row = Math.floor(index / 2)
          const x = padding + col * (itemWidth + gap)
          const y = gridY + row * (itemHeight + gap)

          ctx.save()
          ctx.shadowColor = 'rgba(0, 0, 0, 0.05)'
          ctx.shadowBlur = 10
          ctx.shadowOffsetY = 4
          ctx.setFillStyle('#FFFFFF')
          this.drawRoundedRect(ctx, x, y, itemWidth, itemHeight, 24)
          ctx.fill()
          ctx.restore()

          ctx.setFillStyle('#64748B')
          ctx.setFontSize(24)
          ctx.fillText(item.label, x + cardPadding, y + 54)

          const isHighlight = item.label === '加工费总额'
          const isWarning = item.label === '结算状态' && item.value !== '已结算'
          ctx.setFillStyle(isHighlight ? '#10B981' : (isWarning ? '#F59E0B' : '#1E293B'))
          ctx.setFontSize(isHighlight ? 40 : 34)
          ctx.fillText(item.value, x + cardPadding, y + 115)
        });

        // 6. 款式信息预览卡片
        let currentY = gridY + 3 * (itemHeight + gap) + 40
        ctx.save()
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, currentY, canvasWidth - padding * 2, styleCardHeight, 24)
        ctx.fill()
        ctx.restore()

        if (localImagePath) {
          ctx.save()
          this.drawRoundedRect(ctx, padding + 24, currentY + 30, 100, 100, 16)
          ctx.clip()
          ctx.drawImage(localImagePath, padding + 24, currentY + 30, 100, 100)
          ctx.restore()
        } else {
          ctx.setFillStyle('#F1F5F9')
          this.drawRoundedRect(ctx, padding + 24, currentY + 30, 100, 100, 16)
          ctx.fill()
        }

        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(32)
        ctx.fillText(returnOrder.styleName || '未知款号', padding + 150, currentY + 70)
        ctx.setFillStyle('#64748B')
        ctx.setFontSize(26)
        ctx.fillText(`款号: ${returnOrder.styleCode || '-'}  ·  颜色: ${returnOrder.color || '-'}`, padding + 150, currentY + 115)

        // 8. 底部信息（放在款式卡片之后，避免重叠）
        const footerY = currentY + styleCardHeight + gapAfterCard + 60
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.setTextAlign('center')
        ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, footerY)

        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'shareCanvas',
              width: canvasWidth,
              height: canvasHeight,
              destWidth: canvasWidth,
              destHeight: canvasHeight,
              success: (res) => resolve(res.tempFilePath),
              fail: (err) => reject(err)
            }, this)
          }, 1000)
        })
      } catch (err) {
        console.error('generateShareImage error:', err)
        reject(err)
      }
    })
  },

  // 辅助函数：绘制圆角矩形
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.arcTo(x + width, y, x + width, y + radius, radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
    ctx.lineTo(x + radius, y + height)
    ctx.arcTo(x, y + height, x, y + height - radius, radius)
    ctx.lineTo(x, y + radius)
    ctx.arcTo(x, y, x + radius, y, radius)
    ctx.closePath()
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

