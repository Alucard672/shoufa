// pages/issue/all.js
import { query, queryByIds, update, count } from '../../utils/db.js'
import { getTimeRange, formatDate, formatDateTime, formatWeight, formatQuantity, calculateReturnPieces } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber } from '../../utils/summary.js'
const app = getApp()

Page({
  data: {
    issueOrders: [],
    filteredOrders: [],
    loading: false,
    // 筛选条件
    timeFilter: 'all',
    timeFilterIndex: 0,
    statusFilter: 'all',
    statusFilterIndex: 0,
    searchKeyword: '',
    // 统计数据
    totalIssueWeight: 0,
    totalIssueWeightFormatted: '0.0',
    totalReturnPieces: 0,
    totalReturnWeightFormatted: '0.0',
    totalIssueCount: 0
  },

  // 图片加载失败：降级为占位图
  onStyleImageError(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
      const i = typeof index === 'number' ? index : parseInt(index, 10)
      if (!Number.isNaN(i) && this.data.filteredOrders && this.data.filteredOrders[i]) {
        this.setData({ [`filteredOrders[${i}].styleImageUrl`]: '' })
      }
    }

    if (!id) return
    const match = (o) => String(o?._id || o?.id || '') === String(id)
    const list = this.data.issueOrders || []
    const idx = list.findIndex(match)
    if (idx >= 0) {
      this.setData({ [`issueOrders[${idx}].styleImageUrl`]: '' })
    }
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

  onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    
    // 处理从统计页面跳转过来的筛选条件
    if (options.timeFilter) {
      this.setData({
        timeFilter: decodeURIComponent(options.timeFilter)
      })
    }
    if (options.statusFilter) {
      this.setData({
        statusFilter: decodeURIComponent(options.statusFilter)
      })
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

  async loadStatistics() {
    // 1. 获取所有发料单计算发料总量
    const ordersRes = await query('issue_orders', null, {
      excludeDeleted: true
    })

    let totalWeight = 0
    ;(ordersRes.data || []).forEach(order => {
      totalWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
    })

    // 2. 获取所有回货单计算回货总量（排除作废/删除）
    const returnRes = await query('return_orders', null, {
      excludeDeleted: true
    })

    let totalReturnPieces = 0
    let totalReturnWeight = 0
    ;(returnRes.data || []).filter((ro) => !ro?.voided && !ro?.deleted).forEach(order => {
      totalReturnPieces += pickNumber(order, ['returnPieces', 'return_pieces'], 0)
      totalReturnWeight += pickNumber(order, ['actualYarnUsage', 'actual_yarn_usage'], 0)
    })

    this.setData({
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2),
      totalReturnPieces: totalReturnPieces,
      totalReturnWeightFormatted: totalReturnWeight.toFixed(2),
      totalIssueCount: ordersRes.data.length
    })
  },

  async loadIssueOrders() {
    console.log('开始加载发料单，筛选条件:', {
      timeFilter: this.data.timeFilter,
      statusFilter: this.data.statusFilter,
      searchKeyword: this.data.searchKeyword
    })

    // 构建查询条件
    const whereClause = {}

    // 搜索
    if (this.data.searchKeyword) {
      whereClause.issueNo = this.data.searchKeyword
    }

    const ordersRes = await query('issue_orders', whereClause, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'DESC' }
    })
    const orders = ordersRes.data || []
    console.log('查询到的订单数量:', orders.length)

    // 在内存中进行时间筛选（hybrid：issueDate 优先，缺失用 createTime 兜底）
    let filteredData = filterByTimeFilter(orders || [], this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
    )

    // 批量查询工厂和款号信息
    const factoryIds = [...new Set(filteredData.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(filteredData.map(order => order.styleId || order.style_id).filter(Boolean))]
    // 构建发料单候选ID（兼容历史数字 id 与 _id）
    const issueDocIds = filteredData.map(order => String(order._id || order.id || ''))
    const issueCandidateToDocId = new Map() // candidate(String) -> docId(String)
    const issueIdQueryValues = []
    filteredData.forEach((order) => {
      const docId = String(order._id || order.id || '')
      if (!docId) return
      const legacyId = order.id
      const candidates = []
      candidates.push(order._id)
      candidates.push(docId)
      if (legacyId !== undefined && legacyId !== null && legacyId !== '') {
        candidates.push(legacyId)
        candidates.push(String(legacyId))
        const n = Number(legacyId)
        if (!Number.isNaN(n)) candidates.push(n)
      }
      candidates.forEach((c) => {
        if (c === undefined || c === null || c === '') return
        issueIdQueryValues.push(c)
        issueCandidateToDocId.set(String(c), docId)
      })
    })
    const seenQuery = new Set()
    const uniqueIssueIdQueryValues = []
    issueIdQueryValues.forEach((v) => {
      const k = `${typeof v}:${String(v)}`
      if (seenQuery.has(k)) return
      seenQuery.add(k)
      uniqueIssueIdQueryValues.push(v)
    })

    // 批量查询工厂信息
    const factoriesMap = new Map()
    if (factoryIds.length > 0) {
      const factoriesRes = await queryByIds('factories', factoryIds)
      factoriesRes.data.forEach(factory => {
        factoriesMap.set(String(factory._id || factory.id), factory)
      })
    }

    // 批量查询款号信息
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds)
      stylesRes.data.forEach(style => {
        stylesMap.set(String(style._id || style.id), style)
      })
    }

    // 批量查询所有回货单
    const returnOrdersMap = new Map()
    if (issueDocIds.length > 0) {
      issueDocIds.forEach(id => {
        returnOrdersMap.set(String(id), [])
      })

      try {
        const _ = wx.cloud.database().command
        // 同时查询 issueId 与 issue_id，并兼容数字/字符串
        const [r1, r2] = await Promise.all([
          query('return_orders', { issueId: _.in(uniqueIssueIdQueryValues) }, { excludeDeleted: true }).catch(() => ({ data: [] })),
          query('return_orders', { issue_id: _.in(uniqueIssueIdQueryValues) }, { excludeDeleted: true }).catch(() => ({ data: [] }))
        ])
        const merged = (r1.data || []).concat(r2.data || [])
        merged
          .filter((ro) => !ro?.deleted && !ro?.voided)
          .forEach(order => {
            const roIssueId = order.issueId || order.issue_id
            if (roIssueId === undefined || roIssueId === null) return
            const docId = issueCandidateToDocId.get(String(roIssueId))
            if (!docId) return
            if (!returnOrdersMap.has(docId)) returnOrdersMap.set(docId, [])
            returnOrdersMap.get(docId).push(order)
          })
      } catch (error) {
        console.error('批量查询回货单失败:', error)
      }
    }

    // 关联查询工厂和款号信息，并计算回货进度
    const ordersWithDetails = await Promise.all(
      filteredData.map(async (order) => {
        try {
          const factoryId = order.factoryId || order.factory_id
          const styleId = order.styleId || order.style_id
          const orderId = String(order._id || order.id || '')
          
          const factory = factoriesMap.get(String(factoryId))
          const style = stylesMap.get(String(styleId))
          const returnOrdersList = (returnOrdersMap.get(String(orderId)) || []).filter((ro) => !ro?.deleted && !ro?.voided)

          const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
          const issuePieces = order.issuePieces || order.issue_pieces || 0

          const progress = this.calculateProgressFromData(order, style, returnOrdersList)

          // 按回货日期排序回货单
          const sortedReturnOrders = returnOrdersList
            .map((ro, index) => ({
              ...ro,
              returnOrderIndex: index + 1,
              returnDateFormatted: formatDateTime(ro.createTime || ro.create_time || ro.returnDate || ro.return_date),
              actualYarnUsageFormatted: (ro.actualYarnUsage || ro.actual_yarn_usage || 0).toFixed(2)
            }))
            .sort((a, b) => {
              const dateA = a.returnDate || a.return_date
              const dateB = b.returnDate || b.return_date
              const dateAObj = dateA instanceof Date ? dateA : new Date(dateA)
              const dateBObj = dateB instanceof Date ? dateB : new Date(dateB)
              return dateBObj.getTime() - dateAObj.getTime()
            })

          const canComplete = progress.totalReturnPieces > issuePieces && order.status !== '已完成'

          // 获取损耗率
          const lossRate = style?.lossRate || style?.loss_rate || 0
          
          return {
            ...order,
            _id: order._id || order.id,
            factoryName: factory?.name || '未知工厂',
            styleName: style?.styleName || style?.style_name || style?.name || '未知款号',
            styleCode: style?.styleCode || style?.style_code || '',
            styleImageUrl: normalizeImageUrl(style),
            color: order.color || '',
            size: order.size || '',
            yarnUsagePerPiece: yarnUsagePerPiece,
            yarnUsagePerPieceFormatted: yarnUsagePerPiece > 0 ? yarnUsagePerPiece.toFixed(0) : '',
            lossRate: lossRate,
            lossRateFormatted: lossRate > 0 ? lossRate.toFixed(1) : '',
            progress,
            returnOrders: sortedReturnOrders,
            issueDateFormatted: formatDateTime(order.createTime || order.create_time || order.issueDate || order.issue_date),
            issueWeightFormatted: formatWeight(order.issueWeight || order.issue_weight),
            issuePieces,
            canComplete
          }
        } catch (error) {
          console.error('加载订单详情失败:', error)
          return {
            ...order,
            _id: order._id || order.id,
            factoryName: '加载失败',
            styleName: '加载失败',
            yarnUsagePerPiece: 0,
            progress: {
              totalReturnPieces: 0,
              totalReturnYarn: 0,
              totalReturnQuantity: 0,
              remainingYarn: order.issueWeight || order.issue_weight,
              remainingPieces: 0,
              remainingQuantity: 0,
              status: order.status
            },
            returnOrders: [],
            issueDateFormatted: formatDateTime(order.createTime || order.create_time || order.issueDate || order.issue_date),
            issueWeightFormatted: formatWeight(order.issueWeight || order.issue_weight),
            issuePieces: 0,
            canComplete: false
          }
        }
      })
    )

    // 应用状态筛选
    let finalOrders = ordersWithDetails || []
    if (this.data.statusFilter !== 'all') {
      finalOrders = ordersWithDetails.filter(order => {
        // 优先使用数据库中的实际状态，或者是计算出的回货进度状态
        const orderStatus = order.status === '已完成' ? '已完成' : (order.progress?.status || order.status)
        return orderStatus === this.data.statusFilter
      })
    } else {
      // 修改点：如果选择"全部"，只显示“进行中”的单据，排除“已完成”
      finalOrders = ordersWithDetails.filter(order => {
        const isCompleted = order.status === '已完成' || (order.progress && order.progress.status === '已完成')
        return !isCompleted
      })
    }

    // 更新统计数量（与明细列表保持一致）
    let totalWeight = 0
    finalOrders.forEach(order => {
      totalWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
    })

    this.setData({
      issueOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      loading: false,
      totalIssueCount: finalOrders.length,
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2)
    })
  },

  // 从已有数据计算回货进度
  calculateProgressFromData(issueOrder, style, returnOrdersList) {
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0

    let totalReturnPieces = 0
    let totalReturnYarn = 0
    let totalReturnQuantity = 0

    ;(returnOrdersList || []).filter((ro) => !ro?.deleted && !ro?.voided).forEach(order => {
      const rp = pickNumber(order, ['returnPieces', 'return_pieces'], 0)
      const rq = pickNumber(order, ['returnQuantity', 'return_quantity'], 0)
      const pieces = rp > 0 ? rp : (rq > 0 ? calculateReturnPieces(rq) : 0)

      totalReturnPieces += pieces
      totalReturnYarn += pickNumber(order, ['actualYarnUsage', 'actual_yarn_usage'], 0)
      totalReturnQuantity += rq
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
      totalReturnYarn,
      totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
      totalReturnQuantity,
      totalReturnQuantityFormatted: totalReturnQuantity.toFixed(1),
      remainingYarn,
      remainingYarnFormatted: remainingYarn.toFixed(2),
      remainingPieces: Math.floor(remainingPieces),
      remainingQuantity,
      remainingQuantityFormatted: remainingQuantity.toFixed(1),
      status
    }
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      timeFilter: selectedFilter,
      timeFilterIndex: index,
      loading: true
    })
    this.loadIssueOrders()
  },

  onStatusFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货', '已完成']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index,
      loading: true
    })
    this.loadIssueOrders()
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value,
      loading: true
    })
    this.loadIssueOrders()
  },

  navigateToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/issue/detail?id=${id}`
    })
  },

  navigateToReturn(e) {
    const issueId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/return/create?issueId=${issueId}`
    })
  },

  onReturnedIssueClick() {
    // 逻辑
  },

  async onCompleteIssue(e) {
    if (!checkLogin()) return
    
    const issueId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认完成',
      content: '确定要将此发料单标记为已完成吗？结束后将无法继续登记回货。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })
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
            wx.showToast({ title: '标记成功', icon: 'success' })
            this.loadData() // 刷新列表
          } catch (error) {
            wx.hideLoading()
            console.error('标记失败:', error)
            wx.showToast({ title: '标记失败', icon: 'none' })
          }
        }
      }
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

