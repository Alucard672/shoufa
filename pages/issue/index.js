// pages/issue/index.js
import { getIssueOrders, calculateIssueProgress, getReturnOrdersByIssueId, update, query, queryByIds } from '../../utils/db.js'
import { getTimeRange, formatDate, formatDateTime, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl, batchGetImageUrls, getImageUrl } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber } from '../../utils/summary.js'
const app = getApp()

Page({
  data: {
    loading: false,
    // 分享画布尺寸（必须和导出一致，否则会出现底部黑屏）
    canvasWidth: 750,
    canvasHeight: 1200,
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
    sharingIssueOrder: null,
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

  // 图片加载失败：尝试获取临时链接，失败则降级为占位图
  async onStyleImageError(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const url = e.currentTarget.dataset.url || ''
    console.error('图片加载失败:', { id, index, url })

    // 如果是 cloud:// 格式，尝试获取临时链接
    if (url && url.startsWith('cloud://')) {
      try {
        const tempUrl = await getImageUrl(url)
        if (tempUrl && tempUrl !== url) {
          // 成功获取临时链接，更新显示
          if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
            const i = typeof index === 'number' ? index : parseInt(index, 10)
            if (!Number.isNaN(i) && this.data.displayOrders && this.data.displayOrders[i]) {
              this.setData({ [`displayOrders[${i}].styleImageUrl`]: tempUrl })
              return // 已更新，不再降级
            }
          }

          if (id) {
            const match = (o) => String(o?._id || o?.id || '') === String(id)
            const updateById = (listName) => {
              const list = this.data[listName] || []
              const idx = list.findIndex(match)
              if (idx >= 0) {
                this.setData({ [`${listName}[${idx}].styleImageUrl`]: tempUrl })
              }
            }
            updateById('issueOrders')
            updateById('filteredOrders')
            return // 已更新，不再降级
          }
        }
      } catch (error) {
        console.error('获取临时链接失败:', error)
      }
    }

    // 无法获取临时链接或不是 cloud:// 格式，降级为占位图
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

    updateById('issueOrders')
    updateById('filteredOrders')
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
    if (this.data.loading) return
    this.setData({ loading: true })
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
    } finally {
      this.setData({ loading: false })
    }
  },

  // 从已有数据计算回货进度，避免重复查询
  async calculateProgressFromData(issueOrder, style, returnOrdersList) {
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0

    let totalReturnPieces = 0
    let totalReturnYarn = 0
    let totalReturnQuantity = 0

    returnOrdersList.forEach(order => {
      totalReturnPieces += parseFloat(order.returnPieces || order.return_pieces || 0) || 0
      totalReturnYarn += parseFloat(order.actualYarnUsage || order.actual_yarn_usage || 0) || 0
      totalReturnQuantity += parseFloat(order.returnQuantity || order.return_quantity || 0) || 0
    })

    const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
    const issuePieces = yarnUsagePerPiece > 0 ? Math.floor((issueWeight * 1000) / yarnUsagePerPiece) : 0
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
    } else if (totalReturnYarn > 0 || totalReturnPieces > 0) {
      if (remainingYarn <= 0.01 || (issuePieces > 0 && totalReturnPieces >= issuePieces)) {
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
    
    // 客户端进行时间筛选（hybrid：issueDate 优先，缺失用 createTime 兜底）
    orders = filterByTimeFilter(orders, this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
    )

    // 排除已作废的单据
    orders = orders.filter(order => !order.voided)

    // 如果需要搜索筛选，先关联工厂信息
    if (this.data.searchKeyword) {
      const factoryIds = [...new Set(orders.map(order => order.factoryId || order.factory_id).filter(Boolean))]
      const factoriesMap = new Map()
      if (factoryIds.length > 0) {
        const factoriesRes = await queryByIds('factories', factoryIds, { excludeDeleted: true })
        factoriesRes.data.forEach(factory => {
          const id = factory._id || factory.id
          factoriesMap.set(String(id), factory)
        })
      }

      // 应用搜索筛选
      const keyword = this.data.searchKeyword.toLowerCase()
      orders = orders.filter(order => {
        const issueNo = (order.issueNo || order.issue_no || '').toLowerCase()
        const factoryId = order.factoryId || order.factory_id
        const factory = factoriesMap.get(String(factoryId))
        const factoryName = (factory?.name || '').toLowerCase()
        return issueNo.includes(keyword) || factoryName.includes(keyword)
      })
    }

    // 应用状态筛选（与明细列表逻辑一致）
    if (this.data.statusFilter === '已作废') {
      // 只统计已作废的单据（但上面已经排除了，所以这里应该为空）
      orders = []
    } else if (this.data.statusFilter !== 'all') {
      // 按状态筛选（需要计算回货进度状态）
      // 为了性能，这里简化处理：只检查数据库中的 status 字段
      // 如果需要精确匹配计算出的状态，需要查询回货单，但会影响性能
      orders = orders.filter(order => {
        // 排除已作废（上面已排除，这里双重保险）
        if (order.voided) return false
        // 简单匹配：如果数据库状态匹配，或者状态不是"已完成"且筛选条件不是"已完成"
        if (this.data.statusFilter === '已完成') {
          return order.status === '已完成'
        } else {
          // 对于"未回货"、"部分回货"、"已回货"，需要计算回货进度
          // 为了性能，这里只做简单判断：如果状态不是"已完成"，则可能匹配
          // 精确匹配需要在 loadIssueOrders 中计算
          return order.status !== '已完成'
        }
      })
    } else {
      // 如果选择"全部"，排除"已完成"和"已作废"（已作废上面已排除）
      orders = orders.filter(order => {
        const isCompleted = order.status === '已完成'
        return !isCompleted
      })
    }

    let totalWeight = 0
    orders.forEach(order => {
      totalWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
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

    // 客户端进行时间筛选（hybrid：issueDate 优先，缺失用 createTime 兜底）
    let filteredData = filterByTimeFilter(ordersRes.data || [], this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
    )

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
        factoriesMap.set(String(id), factory)
      })
    }

    // 批量查询款号信息
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds, { excludeDeleted: true })
      stylesRes.data.forEach(style => {
        const id = style._id || style.id
        stylesMap.set(String(id), style)
      })
      
      // 批量转换图片URL（cloud:// -> 临时链接）
      try {
        const imageUrls = Array.from(stylesMap.values())
          .map(style => normalizeImageUrl(style))
          .filter(url => url && url.startsWith('cloud://'))
        
        if (imageUrls.length > 0) {
          const imageUrlMap = await batchGetImageUrls(imageUrls)
          // 更新 stylesMap 中的图片URL
          stylesMap.forEach((style, id) => {
            const originalUrl = normalizeImageUrl(style)
            if (originalUrl && originalUrl.startsWith('cloud://')) {
              // 保存原始URL
              style.originalImageUrl = originalUrl
              
              // 只有成功转换的URL才使用（不是cloud://格式）
              if (imageUrlMap.has(originalUrl)) {
                const tempUrl = imageUrlMap.get(originalUrl)
                if (tempUrl && !tempUrl.startsWith('cloud://')) {
                  style.styleImageUrl = tempUrl
                } else {
                  // 转换失败，使用空字符串避免500错误
                  style.styleImageUrl = ''
                }
              } else {
                // 转换失败，使用空字符串避免500错误
                style.styleImageUrl = ''
              }
            }
          })
        }
      } catch (error) {
        console.error('批量转换图片URL失败:', error)
        // 失败不影响主流程，继续使用原 cloud:// URL
      }
    }

    // 批量查询所有回货单
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      // 初始化 Map
      issueIds.forEach(id => {
        returnOrdersMap.set(String(id), [])
      })

      // 批量查询回货单
      try {
        const _ = wx.cloud.database().command
        // 先拉全量作为兜底（解决 issueId/issue_id & 类型不一致）
        const allReturnOrdersFallbackRes = await query('return_orders', {}, { excludeDeleted: true })
        const allReturnOrdersFallback = allReturnOrdersFallbackRes.data || []

        // 先尝试 issueId，再尝试 issue_id，然后合并
        let byIssueId = { data: [] }
        let byIssue_id = { data: [] }
        try {
          byIssueId = await query('return_orders', { issueId: _.in(issueIds) }, { excludeDeleted: true })
        } catch (e) {
          console.log('批量查询回货单 issueId 失败，尝试 issue_id:', e)
        }
        try {
          byIssue_id = await query('return_orders', { issue_id: _.in(issueIds) }, { excludeDeleted: true })
        } catch (e) {
          // ignore
        }

        const merged = []
        const seen = new Set()
        ;(byIssueId.data || []).concat(byIssue_id.data || []).forEach(ro => {
          const key = String(ro._id || ro.id || `${ro.issueId || ro.issue_id}-${ro.createTime || ro.create_time || ''}`)
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(ro)
          }
        })

        // 如果仍然为空，用内存匹配兜底
        let allReturnOrders = merged
        if (allReturnOrders.length === 0 && allReturnOrdersFallback.length > 0) {
          const issueIdStrSet = new Set(issueIds.map(id => String(id)))
          allReturnOrders = allReturnOrdersFallback.filter(ro => {
            const roIssueId = ro.issueId || ro.issue_id
            if (roIssueId === undefined || roIssueId === null) return false
            return issueIdStrSet.has(String(roIssueId))
          })
        }

        // 按 issueId 分组
        allReturnOrders.forEach(order => {
          const issueId = order.issueId || order.issue_id
          if (issueId !== undefined && issueId !== null) {
            const id = String(issueId)
            if (!returnOrdersMap.has(id)) returnOrdersMap.set(id, [])
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
          const id = String(issueIds[index])
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
          
          const factory = factoriesMap.get(String(factoryId))
          const style = stylesMap.get(String(styleId))
          // 兼容 string 和 number 类型的 key
          const returnOrdersList = returnOrdersMap.get(String(orderId)) || []

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
              const actualYarnUsage = parseFloat(ro.actualYarnUsage || ro.actual_yarn_usage || 0) || 0
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

          // 获取图片URL（优先使用已转换的临时URL，如果是cloud://格式则使用空字符串避免500错误）
          let imageUrl = style?.styleImageUrl || normalizeImageUrl(style) || ''
          if (imageUrl && imageUrl.startsWith('cloud://')) {
            imageUrl = ''
          }
          
          // 获取损耗率
          const lossRate = style?.lossRate || style?.loss_rate || 0
          
          return {
            ...order,
            _id: orderId,
            voided: order.voided || false, // 是否已作废
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
    
    if (this.data.statusFilter === '已作废') {
      // 只显示已作废的单据
      finalOrders = ordersAfterSearch.filter(order => order.voided)
    } else if (this.data.statusFilter !== 'all') {
      // 排除已作废的单据，按状态筛选
      finalOrders = ordersAfterSearch
        .filter(order => !order.voided)
        .filter(order => {
          // 优先使用数据库中的实际状态，或者是计算出的回货进度状态
          const orderStatus = order.status === '已完成' ? '已完成' : (order.progress?.status || order.status)
          return orderStatus === this.data.statusFilter
        })
    } else {
      // 如果选择"全部"，只显示"进行中"的单据，排除"已完成"和"已作废"
      finalOrders = ordersAfterSearch.filter(order => {
        if (order.voided) return false // 排除已作废
        const isCompleted = order.status === '已完成' || (order.progress && order.progress.status === '已完成')
        return !isCompleted
      })
    }

    // 默认只显示前 pageSize 条
    const displayCount = this.data.pageSize || 10
    const displayOrders = finalOrders.slice(0, displayCount).map(order => ({
      ...order,
      swipeOffset: 0 // 初始化左滑偏移量
    }))

    // 更新统计数量（与明细列表保持一致）
    let totalWeight = 0
    finalOrders.forEach(order => {
      totalWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
    })

    this.setData({
      issueOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      displayOrders: displayOrders,
      totalIssueCount: finalOrders.length,
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2)
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
    const filters = ['all', '未回货', '部分回货', '已回货', '已完成', '已作废']
    const selectedFilter = filters[index] || 'all'
    console.log('选中的筛选:', selectedFilter, '索引:', index)
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index
    })
    this.loadIssueOrders()
  },

  onLoadMore(e) {
    const { displayCount } = e.detail
    const displayOrders = this.data.filteredOrders.slice(0, displayCount).map(order => ({
      ...order,
      swipeOffset: order.swipeOffset || 0 // 保留已有的滑动状态
    }))

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

  navigateToDetail(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    
    // 如果当前项已展开，点击卡片时先收回
    if (this.data.currentSwipeIndex === index) {
      const displayOrders = this.data.displayOrders
      displayOrders[index].swipeOffset = 0
      this.setData({
        displayOrders: displayOrders,
        currentSwipeIndex: -1
      })
      return
    }
    
    // 如果有其他项展开，先收回
    if (this.data.currentSwipeIndex >= 0 && this.data.currentSwipeIndex !== index) {
      const displayOrders = this.data.displayOrders
      displayOrders[this.data.currentSwipeIndex].swipeOffset = 0
      this.setData({
        displayOrders: displayOrders,
        currentSwipeIndex: -1
      })
    }
    
    wx.navigateTo({
      url: `/pages/issue/detail?id=${id}`
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

  // 编辑发料单
  onEditIssue(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    
    // 收回滑动
    const displayOrders = this.data.displayOrders
    displayOrders[index].swipeOffset = 0
    this.setData({
      displayOrders: displayOrders,
      currentSwipeIndex: -1
    })
    
    wx.navigateTo({
      url: `/pages/issue/create?id=${id}`
    })
  },

  // 作废/恢复发料单
  async onVoidIssue(e) {
    const id = e.currentTarget.dataset.id
    const index = parseInt(e.currentTarget.dataset.index, 10)
    
    // 安全检查：确保索引有效且元素存在
    if (isNaN(index) || !this.data.displayOrders || !this.data.displayOrders[index]) {
      console.warn('onVoidIssue: 无效的索引或元素不存在', { index, displayOrdersLength: this.data.displayOrders?.length })
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
      content: `确定要${action}发料单 "${item.issueNo || ''}" 吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: `${action}中...` })

            const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
            const docId = String(id || item._id || item.id || '')
            const res2 = await wx.cloud.callFunction({
              name: 'createIssueOrder',
              data: {
                action: 'toggleVoid',
                tenantId: tenantId,
                issueOrderId: docId,
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
            await this.loadIssueOrders()
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

            const db = wx.cloud.database()
            const docId = String(issueId || '')
            let updated = 0

            // 1) 优先按 doc(_id) 更新
            try {
              const r1 = await db.collection('issue_orders').doc(docId).update({
                data: { status: '已完成', updateTime: db.serverDate() }
              })
              // 某些 SDK 版本可能没有 stats.updated，这里只要不抛错就认为成功
              updated = (r1 && r1.stats && typeof r1.stats.updated === 'number') ? r1.stats.updated : 1
            } catch (e1) {
              // ignore
            }

            // 2) 回退：按自定义 id 更新（数字 id）
            if (updated === 0) {
              const tenantId = app?.globalData?.tenantId || wx.getStorageSync('tenantId')
              const idStr = docId
              const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null
              if (tenantId && idNum !== null) {
                const r2 = await db.collection('issue_orders')
                  .where({ tenantId: tenantId, deleted: false, id: idNum })
                  .update({ data: { status: '已完成', updateTime: db.serverDate() } })
                updated = (r2 && r2.stats && typeof r2.stats.updated === 'number') ? r2.stats.updated : 1
              }
            }

            if (updated === 0) {
              throw new Error('未找到要更新的单据')
            }

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
    return new Promise(async (resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const issueOrder = this.data.sharingIssueOrder

      if (!issueOrder) {
        reject(new Error('数据加载中，请稍后再试'))
        return
      }

      try {
        // 1. 预加载图片
        const imageUrl = issueOrder.styleImageUrl
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

        // 预加载回货明细图片（如果有）
        const returnItems = (issueOrder.returnOrders || []).slice(0, 5)

        // 2. 动态计算画布高度（按你要求的顺序：先背景铺满 → 款式置顶 → 发料等信息）
        const canvasWidth = 750
        const headerHeight = 320
        const padding = 40
        const cardPadding = 32
        const gap = 20

        const styleCardHeight = 180
        const gridItemHeight = 160
        const gridRows = 3
        const summaryHeight = gridRows * gridItemHeight + (gridRows - 1) * gap + 40

        const titleHeight = 80
        const cardHeight = 220
        const cardGap = 16
        const footerHeight = 120

        // 款式卡片放在最上（在汇总网格之前）
        const styleCardY = 260
        const gridY = styleCardY + styleCardHeight + 40

        let currentY = gridY + summaryHeight + 40
        if (returnItems.length > 0) {
          currentY += titleHeight + (cardHeight + cardGap) * returnItems.length + 20
        }
        const canvasHeight = currentY + footerHeight

        // 让 canvas 真实高度跟随（否则导出会出现“半屏黑”）
        this.setData({ canvasWidth, canvasHeight })

        // 3. 绘制背景
        ctx.setFillStyle('#F8FAFC')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 4. 绘制橙色浸入式头部 (发料单使用橙色)
        const grd = ctx.createLinearGradient(0, 0, canvasWidth, headerHeight)
        grd.addColorStop(0, '#F59E0B')
        grd.addColorStop(1, '#D97706')
        ctx.setFillStyle(grd)
        ctx.fillRect(0, 0, canvasWidth, headerHeight)

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
        ctx.fillText('发', padding + 48, 125)

        ctx.setTextAlign('left')
        ctx.setFontSize(48)
        ctx.fillText(issueOrder.factoryName || '加工厂', padding + 120, 105)
        ctx.setFontSize(26)
        ctx.setGlobalAlpha(0.8)
        ctx.fillText(`单号: ${issueOrder.issueNo || '-'}`, padding + 120, 148)
        ctx.setGlobalAlpha(1)

        // 时间日期
        ctx.setFontSize(24)
        ctx.fillText(`📅 发料日期: ${issueOrder.issueDateFormatted || '-'}`, padding, 250)

        // 5. 款式信息预览卡片（放最上）
        ctx.save()
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, styleCardY, canvasWidth - padding * 2, styleCardHeight, 24)
        ctx.fill()
        ctx.restore()

        if (localImagePath) {
          ctx.save()
          this.drawRoundedRect(ctx, padding + 24, styleCardY + 40, 100, 100, 16)
          ctx.clip()
          ctx.drawImage(localImagePath, padding + 24, styleCardY + 40, 100, 100)
          ctx.restore()
        } else {
          ctx.setFillStyle('#F1F5F9')
          this.drawRoundedRect(ctx, padding + 24, styleCardY + 40, 100, 100, 16)
          ctx.fill()
        }

        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(32)
        ctx.fillText(issueOrder.styleName || '未知款号', padding + 150, styleCardY + 85)
        ctx.setFillStyle('#64748B')
        ctx.setFontSize(26)
        ctx.fillText(`款号: ${issueOrder.styleCode || '-'}  ·  颜色: ${issueOrder.color || '-'}`, padding + 150, styleCardY + 130)

        // 6. 汇总统计网格 (3x2)（发料等信息）
        const itemWidth = (canvasWidth - padding * 2 - 20) / 2
        const itemHeight = gridItemHeight

        // 统一处理 kg，避免“kgkg”
        const stripKg = (v) => String(v ?? '').replace(/\\s*kg$/i, '').trim()

        const summaryItems = [
          { label: '发料重量', value: `${stripKg(issueOrder.issueWeightFormatted)} kg` },
          { label: '预计件数', value: formatQuantity(issueOrder.issuePieces) },
          { label: '已回重量', value: `${stripKg(issueOrder.progress?.totalReturnYarnFormatted || '0.00')} kg` },
          { label: '已回件数', value: issueOrder.progress?.totalReturnPiecesFormatted || '0打0件' },
          { label: '剩余重量', value: `${stripKg(issueOrder.progress?.remainingYarnFormatted || '0.00')} kg` },
          { label: '回货状态', value: issueOrder.progress?.status || '未回货' }
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

          const isWarning = item.label === '回货状态' && item.value !== '已完成'
          ctx.setFillStyle(isWarning ? '#F59E0B' : '#1E293B')
          ctx.setFontSize(36)
          ctx.fillText(item.value, x + cardPadding, y + 115)
        });

        // 7. 回货明细（在汇总之后）
        currentY = gridY + 3 * (itemHeight + gap) + 60
        if (returnItems.length > 0) {
          ctx.setFillStyle('#F59E0B')
          this.drawRoundedRect(ctx, padding, currentY - 28, 8, 36, 4)
          ctx.fill()
          ctx.setFillStyle('#1E293B')
          ctx.setFontSize(34)
          ctx.fillText('最近回货明细', padding + 28, currentY)
          currentY += 60

          returnItems.forEach((ro) => {
            const x = padding
            const y = currentY

            ctx.save()
            ctx.setFillStyle('#FFFFFF')
            this.drawRoundedRect(ctx, x, y, canvasWidth - padding * 2, cardHeight, 20)
            ctx.fill()
            ctx.restore()

            ctx.setFillStyle('#1E293B')
            ctx.setFontSize(30)
            ctx.fillText(ro.returnDateFormatted, x + cardPadding, y + 60)
            
            ctx.setFillStyle('#10B981')
            ctx.setFontSize(32)
            ctx.setTextAlign('right')
            ctx.fillText(`+${ro.quantityFormatted}`, canvasWidth - padding - cardPadding, y + 60)
            ctx.setTextAlign('left')

            // 回货重量
            ctx.setFillStyle('#F8FAFC')
            this.drawRoundedRect(ctx, x + cardPadding, y + 90, canvasWidth - padding * 2 - cardPadding * 2, 90, 12)
            ctx.fill()

            ctx.setFillStyle('#64748B'); ctx.setFontSize(24)
            ctx.fillText('实际用纱', x + cardPadding + 20, y + 145)
            ctx.setFillStyle('#1E293B'); ctx.setFontSize(28)
            ctx.setTextAlign('right')
            ctx.fillText(`${ro.actualYarnUsageFormatted}kg`, canvasWidth - padding - cardPadding - 20, y + 145)
            ctx.setTextAlign('left')

            currentY += cardHeight + cardGap
          })
        }

        // 8. 底部信息
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.setTextAlign('center')
        ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, canvasHeight - 60)

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

