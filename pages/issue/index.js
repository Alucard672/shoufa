// pages/issue/index.js
import { getIssueOrders, calculateIssueProgress, getReturnOrdersByIssueId, update, query, queryByIds } from '../../utils/db.js'
import { getTimeRange, formatDate, formatDateTime, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    totalIssueWeight: 0,
    totalIssueCount: 0,
    timeFilter: 'all',
    timeFilterIndex: 0, // 添加索引用于组件绑定
    statusFilter: 'all',
    statusFilterIndex: 0, // 添加索引用于组件绑定
    searchKeyword: '',
    issueOrders: [],
    filteredOrders: [],
    displayOrders: [], // 用于分页显示的数据
    pageSize: 10, // 每页显示数量
    showShareModal: false,
    shareImagePath: '',
    sharingIssueOrder: null
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
        this.loadIssueOrders()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 从已有数据计算回货进度，避免重复查询
  async calculateProgressFromData(issueOrder, style, returnOrdersList) {
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0

    let totalReturnPieces = 0
    let totalReturnYarn = 0
    let totalReturnQuantity = 0

    returnOrdersList.forEach(order => {
      totalReturnPieces += order.returnPieces || order.return_pieces || 0
      totalReturnYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
      totalReturnQuantity += order.returnQuantity || order.return_quantity || 0
    })

    const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
    const remainingYarn = issueWeight - totalReturnYarn
    const remainingPieces = yarnUsagePerPiece > 0
      ? Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
      : 0
    const remainingQuantity = remainingPieces / 12

    // 判断状态
    let status = '未回货'
    // 如果订单状态是已完成，使用已完成状态
    if (issueOrder.status === '已完成') {
      status = '已完成'
    } else if (totalReturnYarn > 0) {
      if (remainingYarn <= 0.01) {
        // 回货完成，标记为已完成
        status = '已完成'
      } else {
        status = '部分回货'
      }
    }

    return {
      totalReturnPieces: Math.floor(totalReturnPieces),
      totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
      totalReturnYarn,
      totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
      totalReturnQuantity,
      totalReturnQuantityFormatted: totalReturnQuantity.toFixed(1),
      remainingYarn,
      remainingYarnFormatted: remainingYarn.toFixed(2),
      remainingPieces: Math.floor(remainingPieces),
      remainingPiecesFormatted: formatQuantity(remainingPieces),
      remainingQuantity,
      remainingQuantityFormatted: remainingQuantity.toFixed(1),
      status
    }
  },

  async loadStatistics() {
    // 查询所有数据，然后在客户端进行时间筛选
    const result = await query('issue_orders', {}, {
      excludeDeleted: true
    })

    let orders = result.data || []
    
    // 客户端进行时间筛选
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
        const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

        orders = orders.filter(order => {
          const date = order.issueDate || order.issue_date
          if (!date) return false

          let orderDate
          try {
            if (date instanceof Date) {
              orderDate = date
            } else if (typeof date === 'string') {
              const dateStr = date.replace(/\//g, '-')
              orderDate = new Date(dateStr)
            } else if (date && typeof date === 'object') {
              if (typeof date.getTime === 'function') {
                orderDate = new Date(date.getTime())
              } else if (date._seconds) {
                orderDate = new Date(date._seconds * 1000)
              } else {
                orderDate = new Date(date)
              }
            } else {
              orderDate = new Date(date)
            }

            if (isNaN(orderDate.getTime())) {
              return false
            }

            const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())
            const filterStartOnly = new Date(filterStart.getFullYear(), filterStart.getMonth(), filterStart.getDate())
            const filterEndOnly = new Date(filterEnd.getFullYear(), filterEnd.getMonth(), filterEnd.getDate())

            return orderDateOnly.getTime() >= filterStartOnly.getTime() && orderDateOnly.getTime() <= filterEndOnly.getTime()
          } catch (e) {
            return false
          }
        })
      }
    }

    let totalWeight = 0
    orders.forEach(order => {
      totalWeight += order.issueWeight || order.issue_weight || 0
    })

    this.setData({
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2),
      totalIssueCount: orders.length
    })
  },

  async loadIssueOrders() {
    console.log('开始加载发料单，筛选条件:', {
      timeFilter: this.data.timeFilter,
      statusFilter: this.data.statusFilter,
      searchKeyword: this.data.searchKeyword
    })

    // 先查询所有数据，然后在客户端进行时间筛选（更可靠）
    const ordersRes = await query('issue_orders', {}, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'DESC' }
    })

    // 客户端进行时间筛选
    let filteredData = ordersRes.data || []
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
        const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

        filteredData = filteredData.filter(order => {
          // 使用创建时间进行筛选
          const date = order.createTime || order.create_time
          if (!date) return false

          let orderDate
          try {
            if (date instanceof Date) {
              orderDate = date
            } else if (typeof date === 'string') {
              const dateStr = date.replace(/\//g, '-')
              orderDate = new Date(dateStr)
            } else if (date && typeof date === 'object') {
              if (typeof date.getTime === 'function') {
                orderDate = new Date(date.getTime())
              } else if (date._seconds) {
                orderDate = new Date(date._seconds * 1000)
              } else {
                orderDate = new Date(date)
              }
            } else {
              orderDate = new Date(date)
            }

            if (isNaN(orderDate.getTime())) {
              return false
            }

            const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())
            const filterStartOnly = new Date(filterStart.getFullYear(), filterStart.getMonth(), filterStart.getDate())
            const filterEndOnly = new Date(filterEnd.getFullYear(), filterEnd.getMonth(), filterEnd.getDate())

            return orderDateOnly.getTime() >= filterStartOnly.getTime() && orderDateOnly.getTime() <= filterEndOnly.getTime()
          } catch (e) {
            console.error('日期解析错误:', order.createTime, e)
            return false
          }
        })
      }
    }

    console.log('查询到的订单数量:', filteredData.length)

    // 批量查询工厂和款号信息
    const factoryIds = [...new Set(filteredData.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(filteredData.map(order => order.styleId || order.style_id).filter(Boolean))]
    const issueIds = filteredData.map(order => order._id || order.id)

    // 批量查询工厂信息
    const factoriesMap = new Map()
    if (factoryIds.length > 0) {
      const factoriesRes = await queryByIds('factories', factoryIds, { excludeDeleted: true })
      factoriesRes.data.forEach(factory => {
        const id = factory._id || factory.id
        factoriesMap.set(id, factory)
      })
    }

    // 批量查询款号信息
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds, { excludeDeleted: true })
      stylesRes.data.forEach(style => {
        const id = style._id || style.id
        stylesMap.set(id, style)
      })
    }

    // 批量查询所有回货单
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      // 初始化 Map
      issueIds.forEach(id => {
        returnOrdersMap.set(id, [])
      })

      // 批量查询回货单
      try {
        const _ = wx.cloud.database().command
        const allReturnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })

        // 按 issueId 分组
        allReturnOrdersRes.data.forEach(order => {
          const issueId = order.issueId || order.issue_id
          const id = issueId.toString()
          if (returnOrdersMap.has(id)) {
            returnOrdersMap.get(id).push(order)
          }
        })
      } catch (error) {
        console.error('批量查询回货单失败:', error)
        // 回退到逐个查询
        const returnOrdersPromises = issueIds.map(issueId =>
          getReturnOrdersByIssueId(issueId).catch(() => ({ data: [] }))
        )
        const returnOrdersResults = await Promise.all(returnOrdersPromises)
        returnOrdersResults.forEach((result, index) => {
          const id = issueIds[index].toString()
          returnOrdersMap.set(id, result.data || [])
        })
      }
    }

    // 关联查询工厂和款号信息，并计算回货进度
    const ordersWithDetails = await Promise.all(
      filteredData.map(async (order) => {
        try {
          const factoryId = order.factoryId || order.factory_id
          const styleId = order.styleId || order.style_id
          const orderId = order._id || order.id
          
          const factory = factoriesMap.get(factoryId)
          const style = stylesMap.get(styleId)
          const returnOrdersList = returnOrdersMap.get(orderId.toString()) || []

          // 计算回货进度（使用已查询的数据）
          const progress = await this.calculateProgressFromData(order, style, returnOrdersList)

          // 格式化回货单列表，按日期倒序排列，并添加序号
          const totalReturnCount = returnOrdersList.length

          const sortedReturnOrders = returnOrdersList
            .slice() // 创建副本避免修改原数组
            .sort((a, b) => {
              let dateA = a.returnDate || a.return_date
              let dateB = b.returnDate || b.return_date

              // 转换为 Date 对象
              if (!(dateA instanceof Date)) {
                dateA = new Date(dateA)
              }
              if (!(dateB instanceof Date)) {
                dateB = new Date(dateB)
              }

              // 确保日期有效
              const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime()
              const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime()

              return timeB - timeA // 倒序：最新的在前
            })
            .map((ro, index) => {
              // 序号从总数开始递减，例如：如果有3条记录，序号为 3, 2, 1
              // 确保序号是数字类型，且大于0
              const returnOrderIndex = totalReturnCount > 0 ? (totalReturnCount - index) : 0
              const returnPieces = ro.returnPieces || ro.return_pieces || 0
              const returnDate = ro.returnDate || ro.return_date
              const actualYarnUsage = ro.actualYarnUsage || ro.actual_yarn_usage || 0
              return {
                ...ro,
                returnPieces: Math.floor(returnPieces),
                quantityFormatted: formatQuantity(returnPieces),
                returnDateFormatted: formatDateTime(ro.createTime || ro.create_time || returnDate),
                actualYarnUsageFormatted: actualYarnUsage.toFixed(2),
                returnOrderIndex: returnOrderIndex,
                color: ro.color || '',
                size: ro.size || ''
              }
            })

          const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
          const issueWeight = order.issueWeight || order.issue_weight || 0
          const issueDate = order.issueDate || order.issue_date

          // 计算发料件数：发料重量(kg) / (单件用量(g) / 1000)
          const issuePieces = yarnUsagePerPiece > 0
            ? Math.floor((issueWeight * 1000) / yarnUsagePerPiece)
            : 0

          // 判断回货件数是否大于发料件数
          const canComplete = progress.totalReturnPieces > issuePieces && order.status !== '已完成'

          // 获取图片URL，兼容多字段并去除空白
          const imageUrl = (style?.imageUrl || style?.image_url || style?.image || '').trim()
          
          // 获取损耗率
          const lossRate = style?.lossRate || style?.loss_rate || 0
          
          return {
            ...order,
            factoryName: factory?.name || '未知工厂',
            styleName: style?.styleName || style?.style_name || '未知款号',
            styleCode: style?.styleCode || style?.style_code || '',
            styleImageUrl: imageUrl,
            color: order.color || '',
            size: order.size || '',
            yarnUsagePerPiece: yarnUsagePerPiece,
            yarnUsagePerPieceFormatted: yarnUsagePerPiece > 0 ? yarnUsagePerPiece.toFixed(0) : '',
            lossRate: lossRate,
            lossRateFormatted: lossRate > 0 ? lossRate.toFixed(1) : '',
            progress,
            returnOrders: sortedReturnOrders,
            issueDateFormatted: formatDateTime(order.createTime || order.create_time || issueDate),
            issueWeightFormatted: formatWeight(issueWeight),
            issuePieces,
            canComplete
          }
        } catch (error) {
          console.error('加载订单详情失败:', error)
          return {
            ...order,
            factoryName: '加载失败',
            styleName: '加载失败',
            yarnUsagePerPiece: 0,
            progress: {
              totalReturnPieces: 0,
              totalReturnYarn: 0,
              totalReturnQuantity: 0,
              remainingYarn: order.issueWeight,
              remainingPieces: 0,
              remainingQuantity: 0,
              status: order.status
            },
            returnOrders: [],
            issueDateFormatted: formatDateTime(order.createTime || order.create_time || order.issueDate),
            issueWeightFormatted: formatWeight(order.issueWeight),
            issuePieces: 0,
            canComplete: false
          }
        }
      })
    )

    // 先应用搜索筛选（此时 factoryName 已经关联）
    let ordersAfterSearch = ordersWithDetails || []
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      ordersAfterSearch = ordersWithDetails.filter(order => {
        const issueNo = (order.issueNo || order.issue_no || '').toLowerCase()
        const factoryName = (order.factoryName || '').toLowerCase()
        return issueNo.includes(keyword) || factoryName.includes(keyword)
      })
    }

    // 应用状态筛选
    let finalOrders = ordersAfterSearch || []
    if (this.data.statusFilter !== 'all') {
      finalOrders = ordersAfterSearch.filter(order => {
        // 优先使用 order.status（数据库中的实际状态），如果是已完成则直接使用
        // 否则使用 progress.status（计算出的回货状态）
        const orderStatus = order.status === '已完成' ? '已完成' : (order.progress?.status || order.status)
        // 直接匹配状态
        return orderStatus === this.data.statusFilter
      })
    } else {
      // 如果选择"全部"，显示所有状态（包括已完成）
      finalOrders = ordersAfterSearch
    }

    // 默认只显示前 pageSize 条
    const displayCount = this.data.pageSize || 10
    const displayOrders = finalOrders.slice(0, displayCount)

    this.setData({
      issueOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      displayOrders: displayOrders
    })
  },

  onTimeFilterChange(e) {
    console.log('时间筛选变化:', e)
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    console.log('选中的筛选:', selectedFilter, '索引:', index)
    this.setData({
      timeFilter: selectedFilter,
      timeFilterIndex: index
    })
    this.loadIssueOrders()
  },

  onStatusFilterChange(e) {
    console.log('状态筛选变化:', e)
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货', '已完成']
    const selectedFilter = filters[index] || 'all'
    console.log('选中的筛选:', selectedFilter, '索引:', index)
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index
    })
    this.loadIssueOrders()
  },

  onLoadMore() {
    const currentCount = this.data.displayOrders.length
    const totalCount = this.data.filteredOrders.length
    const pageSize = this.data.pageSize || 10

    // 每次加载更多时，增加 pageSize 条
    const newCount = Math.min(currentCount + pageSize, totalCount)
    const displayOrders = this.data.filteredOrders.slice(0, newCount)

    this.setData({
      displayOrders: displayOrders
    })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadIssueOrders()
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/pages/issue/create'
    })
  },

  navigateToReturn(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const issueId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/return/create?issueId=${issueId}`
    })
  },

  async onCompleteIssue(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    
    const issueId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认完成',
      content: '确定要将此发料单标记为已完成吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: '处理中...'
            })

            // 将_id转换为id（如果是字符串，尝试转换为数字）
            const id = typeof issueId === 'string' && /^\d+$/.test(issueId) ? parseInt(issueId) : issueId
            await update('issue_orders', {
              status: '已完成'
            }, {
              id: id
            })

            wx.hideLoading()
            wx.showToast({
              title: '标记成功',
              icon: 'success'
            })

            // 刷新数据
            this.loadData()
          } catch (error) {
            wx.hideLoading()
            console.error('标记失败:', error)
            wx.showToast({
              title: '标记失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  formatDateForQuery(date) {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  stopPropagation(e) {
    // 阻止事件冒泡
  },

  async onShareIssueOrder(e) {
    const issueOrderId = e.currentTarget.dataset.id
    console.log('分享发料单，ID:', issueOrderId)
    console.log('当前 issueOrders 数量:', this.data.issueOrders.length)
    
    const issueOrder = this.data.issueOrders.find(order => {
      const orderId = order._id || order.id
      return orderId === issueOrderId || String(orderId) === String(issueOrderId)
    })
    
    console.log('找到的发料单:', issueOrder)
    
    if (!issueOrder) {
      wx.showToast({
        title: '发料单不存在',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '生成图片中...'
      })

      this.setData({
        sharingIssueOrder: issueOrder
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
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const issueOrder = this.data.sharingIssueOrder

      if (!issueOrder) {
        reject(new Error('发料单数据不存在'))
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
      ctx.fillText('发料单', canvasWidth / 2, y)
      y += 60

      // 发料单号
      ctx.setFillStyle('#666666')
      ctx.setFontSize(24)
      ctx.setTextAlign('center')
      ctx.fillText(`单号：${issueOrder.issueNo || ''}`, canvasWidth / 2, y)
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
      ctx.fillText(issueOrder.factoryName || '未知工厂', padding + 120, y)
      y += 50

      // 款号信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(28)
      ctx.fillText('款号：', padding, y)
      const styleText = issueOrder.styleCode ? `[${issueOrder.styleCode}] ${issueOrder.styleName}` : issueOrder.styleName
      ctx.setFillStyle('#101828')
      ctx.setFontSize(32)
      ctx.fillText(styleText || '未知款号', padding + 120, y)
      y += 50

      // 颜色信息
      if (issueOrder.color) {
        ctx.setFillStyle('#333333')
        ctx.setFontSize(28)
        ctx.fillText('颜色：', padding, y)
        ctx.setFillStyle('#666666')
        ctx.setFontSize(28)
        ctx.fillText(issueOrder.color, padding + 120, y)
        y += 45
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

      // 发料信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText('发料信息', padding, y)
      y += 50

      ctx.setFontSize(28)
      
      // 发料日期
      ctx.setFillStyle('#666666')
      ctx.fillText('发料日期：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.fillText(issueOrder.issueDateFormatted || '', padding + 140, y)
      y += 45

      // 发料重量
      ctx.setFillStyle('#666666')
      ctx.fillText('发料重量：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText(`${issueOrder.issueWeightFormatted} kg`, padding + 140, y)
      y += 45

      // 发料件数（如果有）
      if (issueOrder.issuePieces && issueOrder.issuePieces > 0) {
        ctx.setFillStyle('#666666')
        ctx.setFontSize(28)
        ctx.fillText('发料件数：', padding, y)
        ctx.setFillStyle('#333333')
        ctx.fillText(`${formatQuantity(issueOrder.issuePieces)}`, padding + 140, y)
        y += 45
      }

      // 加工单价（如果有）
      if (issueOrder.processingFeePerDozen && issueOrder.processingFeePerDozen > 0) {
        ctx.setFillStyle('#666666')
        ctx.fillText('加工单价：', padding, y)
        ctx.setFillStyle('#333333')
        ctx.fillText(`¥${issueOrder.processingFeePerDozen.toFixed(2)} /打`, padding + 140, y)
        y += 45
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

      // 回货进度信息（如果有）
      if (issueOrder.progress && (issueOrder.progress.totalReturnPieces > 0 || issueOrder.progress.totalReturnYarn > 0)) {
        ctx.setFillStyle('#333333')
        ctx.setFontSize(32)
        ctx.fillText('回货进度', padding, y)
        y += 50

        ctx.setFontSize(28)
        
        // 已回货数量
        ctx.setFillStyle('#666666')
        ctx.fillText('已回货：', padding, y)
        ctx.setFillStyle('#10b981')
        ctx.fillText(`${issueOrder.progress.totalReturnPiecesFormatted} (${issueOrder.progress.totalReturnYarnFormatted} kg)`, padding + 140, y)
        y += 45

        // 剩余待回
        if (issueOrder.progress.remainingPieces > 0 || issueOrder.progress.remainingYarn > 0) {
          ctx.setFillStyle('#666666')
          ctx.fillText('剩余待回：', padding, y)
          ctx.setFillStyle('#f59e0b')
          ctx.fillText(`${issueOrder.progress.remainingPiecesFormatted} (${issueOrder.progress.remainingYarnFormatted} kg)`, padding + 140, y)
          y += 45
        }

        // 回货状态
        ctx.setFillStyle('#666666')
        ctx.fillText('回货状态：', padding, y)
        const statusColor = issueOrder.progress.status === '已回货' ? '#10b981' : 
                            issueOrder.progress.status === '部分回货' ? '#f59e0b' : '#f56565'
        ctx.setFillStyle(statusColor)
        ctx.fillText(issueOrder.progress.status || '未回货', padding + 140, y)
        y += 45
      } else {
        // 如果没有回货进度，显示状态
        ctx.setFillStyle('#333333')
        ctx.setFontSize(32)
        ctx.fillText('回货状态', padding, y)
        y += 50

        ctx.setFontSize(28)
        ctx.setFillStyle('#666666')
        ctx.fillText('状态：', padding, y)
        ctx.setFillStyle('#f56565')
        ctx.fillText('未回货', padding + 140, y)
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
      current: this.data.shareImagePath,
      success: () => {
        // 预览成功后，提示用户可以长按保存或分享
        wx.showToast({
          title: '长按图片可保存或分享',
          icon: 'none',
          duration: 2000
        })
      }
    })
  },

  closeShareModal() {
    this.setData({
      showShareModal: false,
      shareImagePath: '',
      sharingIssueOrder: null
    })
  }
})

