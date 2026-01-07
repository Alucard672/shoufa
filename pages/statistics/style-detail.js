// pages/statistics/style-detail.js
import { query, queryByIds, getStyleById } from '../../utils/db.js'
import { getTimeRange, formatWeight, formatQuantity, formatDateTime } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber, pickId, pickFirst } from '../../utils/summary.js'

Page({
  data: {
    styleId: '',
    styleCode: '',
    styleName: '',
    styleImageUrl: '',
    timeFilter: 'all',
    timeFilterLabel: '全部时间',
    factoryKeyword: '',
    issueOrders: [],
    filteredIssueOrders: [],
    summary: {
      totalIssueCount: 0,
      totalIssueWeight: 0,
      totalReturnPieces: 0,
      totalReturnWeight: 0,
      factoryCount: 0,
      returnedIssueCount: 0
    }
  },

  getTimeFilterLabel(filter) {
    const map = {
      all: '全部时间',
      today: '今天',
      week: '本周',
      month: '本月'
    }
    return map[filter] || '全部时间'
  },

  // 款号头图失败：降级为占位图
  onStyleImageError() {
    this.setData({ styleImageUrl: '' })
  },

  onLoad(options) {
    if (!checkLogin()) {
      return
    }
    if (options.styleId) {
      this.setData({
        styleId: options.styleId,
        styleCode: options.styleCode ? decodeURIComponent(options.styleCode) : '',
        styleName: options.styleName ? decodeURIComponent(options.styleName) : '',
        timeFilter: options.timeFilter ? decodeURIComponent(options.timeFilter) : 'all'
      })
      this.setData({ timeFilterLabel: this.getTimeFilterLabel(this.data.timeFilter) })
      wx.setNavigationBarTitle({
        title: this.data.styleCode ? `款号: ${this.data.styleCode}` : '款号明细'
      })
      this.loadData()
    }
  },

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
      await Promise.all([
        this.loadStyleInfo(),
        this.loadIssueOrders()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  async loadStyleInfo() {
    try {
      const res = await getStyleById(this.data.styleId)
      if (res.data) {
        const style = res.data
        const imageUrl = normalizeImageUrl(style)
        this.setData({
          styleImageUrl: imageUrl,
          styleCode: pickFirst(style, ['styleCode', 'style_code']) || this.data.styleCode,
          styleName: pickFirst(style, ['styleName', 'style_name', 'name']) || this.data.styleName
        })
      }
    } catch (error) {
      console.error('加载款号信息失败:', error)
    }
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  },

  async loadIssueOrders() {
    // 1. 查询该款号的所有发料单
    const ordersRes = await query('issue_orders', {
      styleId: this.data.styleId
    }, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'DESC' }
    })
    
    let issueOrders = ordersRes.data || []

    // 2. 批量查询工厂信息
    const factoryIds = [...new Set(issueOrders.map(order => pickId(order, ['factoryId', 'factory_id'])).filter(Boolean))]
    const factoriesRes = factoryIds.length > 0 ? await queryByIds('factories', factoryIds) : { data: [] }
    const factoriesMap = new Map()
    factoriesRes.data.forEach(f => factoriesMap.set(pickId(f, ['_id', 'id']), f))

    // 3. 批量查询回货单
    const issueIds = issueOrders.map(order => pickId(order, ['_id', 'id']))
    const _ = wx.cloud.database().command
    
    // 获取该款号下的所有回货单
    const allReturnOrdersRes = await query('return_orders', {
      styleId: this.data.styleId
    }, { excludeDeleted: true })
    
    const allReturnOrders = allReturnOrdersRes.data || []
    const issueIdsStrSet = new Set(issueIds.map(id => String(id)))

    const returnOrdersMap = new Map()
    allReturnOrders.forEach(ro => {
      const roIssueId = pickId(ro, ['issueId', 'issue_id'])
      if (!roIssueId) return
      
      if (issueIdsStrSet.has(roIssueId)) {
        if (!returnOrdersMap.has(roIssueId)) returnOrdersMap.set(roIssueId, [])
        returnOrdersMap.get(roIssueId).push(ro)
      }
    })

    // 4. 组装数据并计算每个发料单的进度
    const ordersWithDetails = issueOrders.map(order => {
      const orderIdStr = pickId(order, ['_id', 'id'])
      const factory = factoriesMap.get(pickId(order, ['factoryId', 'factory_id']))
      const returnOrders = returnOrdersMap.get(orderIdStr) || []
      
      let totalReturnPieces = 0
      let totalReturnWeight = 0
      let latestReturnDate = null

      returnOrders.forEach(ro => {
        totalReturnPieces += pickNumber(ro, ['returnPieces', 'return_pieces'], 0)
        totalReturnWeight += pickNumber(ro, ['actualYarnUsage', 'actual_yarn_usage'], 0)
        const date = pickDateHybrid(ro, ['returnDate', 'return_date'], ['createTime', 'create_time'])
        if (!latestReturnDate || date > latestReturnDate) latestReturnDate = date
      })

      const issueWeight = pickNumber(order, ['issueWeight', 'issue_weight'], 0)
      const remainingYarn = issueWeight - totalReturnWeight
      
      // 状态逻辑
      let status = order.status || '未回货'
      if (status !== '已完成') {
        if (totalReturnWeight > 0 || totalReturnPieces > 0) {
          status = remainingYarn <= 0.01 ? '已完成' : '部分回货'
        } else {
          status = '未回货'
        }
      }

      return {
        ...order,
        factoryName: factory?.name || '未知工厂',
        status,
        styleImageUrl: this.data.styleImageUrl,
        styleCode: this.data.styleCode,
        styleName: this.data.styleName,
        totalReturnPieces,
        totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
        totalReturnWeight,
        totalReturnWeightFormatted: formatWeight(totalReturnWeight),
        issueWeightFormatted: formatWeight(issueWeight),
        remainingYarnFormatted: formatWeight(remainingYarn),
        issueDateFormatted: formatDateTime(pickDateHybrid(order, ['issueDate', 'issue_date'], ['createTime', 'create_time'])),
        latestReturnDateFormatted: latestReturnDate ? formatDateTime(latestReturnDate) : '-'
      }
    })

    this.setData({ issueOrders: ordersWithDetails })
    this.applyFilters()
  },

  onFactoryKeywordInput(e) {
    this.setData({ factoryKeyword: e.detail.value })
    this.applyFilters()
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selected = filters[index] || 'all'
    this.setData({
      timeFilter: selected,
      timeFilterLabel: this.getTimeFilterLabel(selected)
    })
    this.applyFilters()
  },

  applyFilters() {
    let filtered = this.data.issueOrders

    // 1. 时间筛选（使用 hybrid 统一口径）
    if (this.data.timeFilter !== 'all') {
      filtered = filterByTimeFilter(filtered, this.data.timeFilter, (o) =>
        pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
      )
    }

    // 2. 工厂筛选
    if (this.data.factoryKeyword.trim()) {
      const kw = this.data.factoryKeyword.trim().toLowerCase()
      filtered = filtered.filter(o => o.factoryName.toLowerCase().includes(kw))
    }

    // 3. 计算汇总
    const summaryRaw = filtered.reduce((acc, o) => {
      acc.totalIssueCount++
      const iWeight = pickNumber(o, ['issueWeight', 'issue_weight'], 0)
      acc.totalIssueWeight += iWeight
      acc.totalReturnPieces += (o.totalReturnPieces || 0)
      acc.totalReturnWeight += (o.totalReturnWeight || 0)
      if (o.totalReturnWeight > 0) acc.returnedIssueCount++
      if (o.factoryName) acc.factoryNameSet.add(String(o.factoryName))
      return acc
    }, { totalIssueCount: 0, totalIssueWeight: 0, totalReturnPieces: 0, totalReturnWeight: 0, returnedIssueCount: 0, factoryNameSet: new Set() })

    this.setData({
      filteredIssueOrders: filtered,
      summary: {
        totalIssueCount: summaryRaw.totalIssueCount,
        totalIssueWeight: summaryRaw.totalIssueWeight,
        totalReturnPieces: summaryRaw.totalReturnPieces,
        totalReturnWeight: summaryRaw.totalReturnWeight,
        factoryCount: summaryRaw.factoryNameSet.size,
        returnedIssueCount: summaryRaw.returnedIssueCount,
        totalIssueWeightFormatted: formatWeight(summaryRaw.totalIssueWeight),
        totalReturnPiecesFormatted: formatQuantity(summaryRaw.totalReturnPieces),
        totalReturnWeightFormatted: formatWeight(summaryRaw.totalReturnWeight)
      }
    })
  },

  navigateToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/issue/detail?id=${id}`
    })
  },

  onOrderItemClick(e) {
    this.navigateToDetail(e)
  }
})
