import { query, queryByIds, getStyleById } from '../../utils/db.js'
import { getTimeRange, formatWeight, formatQuantity, formatDateTime } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'

Page({
  data: {
    styleId: '',
    styleCode: '',
    styleName: '',
    styleImageUrl: '',
    timeFilter: 'all',
    factoryKeyword: '',
    issueOrders: [],
    filteredIssueOrders: [],
    summary: {
      totalIssueCount: 0,
      totalIssueWeight: 0,
      totalReturnPieces: 0,
      totalReturnWeight: 0
    }
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
        const imageUrl = (style.imageUrl || style.image_url || style.image || '').trim()
        console.log('款号明细 - 样式图片:', imageUrl)
        this.setData({
          styleImageUrl: imageUrl,
          styleCode: style.styleCode || style.style_code || this.data.styleCode,
          styleName: style.styleName || style.style_name || style.name || this.data.styleName
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
    const factoryIds = [...new Set(issueOrders.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const factoriesRes = factoryIds.length > 0 ? await queryByIds('factories', factoryIds) : { data: [] }
    const factoriesMap = new Map()
    factoriesRes.data.forEach(f => factoriesMap.set(String(f._id || f.id), f))

    // 3. 批量查询回货单 (使用内存匹配兜底)
    const issueIds = issueOrders.map(order => order._id || order.id)
    const _ = wx.cloud.database().command
    
    // 获取该款号下的所有回货单（如果 issueId 查询不准，可以按 styleId 过滤）
    const allReturnOrdersRes = await query('return_orders', {
      styleId: this.data.styleId
    }, { excludeDeleted: true })
    
    const allReturnOrders = allReturnOrdersRes.data || []
    const issueIdsStr = issueIds.map(id => String(id))

    const returnOrdersMap = new Map()
    allReturnOrders.forEach(ro => {
      const roIssueId = ro.issueId || ro.issue_id
      if (!roIssueId) return
      
      const roIssueIdStr = String(roIssueId)
      // 检查该回货单是否属于我们查询到的发料单
      if (issueIdsStr.includes(roIssueIdStr) || issueIds.includes(roIssueId)) {
        if (!returnOrdersMap.has(roIssueIdStr)) returnOrdersMap.set(roIssueIdStr, [])
        returnOrdersMap.get(roIssueIdStr).push(ro)
      }
    })

    // 4. 组装数据并计算每个发料单的进度
    const ordersWithDetails = issueOrders.map(order => {
      const orderIdStr = String(order._id || order.id)
      const factory = factoriesMap.get(String(order.factoryId || order.factory_id))
      const returnOrders = returnOrdersMap.get(orderIdStr) || []
      
      let totalReturnPieces = 0
      let totalReturnWeight = 0
      let latestReturnDate = null

      returnOrders.forEach(ro => {
        totalReturnPieces += (ro.returnPieces || ro.return_pieces || 0)
        totalReturnWeight += (ro.actualYarnUsage || ro.actual_yarn_usage || 0)
        const date = ro.createTime || ro.create_time || ro.returnDate || ro.return_date
        if (!latestReturnDate || new Date(date) > new Date(latestReturnDate)) latestReturnDate = date
      })

      const remainingYarn = (order.issueWeight || 0) - totalReturnWeight
      
      // 状态逻辑
      let status = order.status || '未回货'
      if (status !== '已完成') {
        if (totalReturnWeight > 0) {
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
        issueWeightFormatted: formatWeight(order.issueWeight || 0),
        remainingYarnFormatted: formatWeight(remainingYarn),
        issueDateFormatted: formatDateTime(order.createTime || order.create_time || order.issueDate),
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
    this.setData({ timeFilter: filters[index] || 'all' })
    this.applyFilters()
  },

  applyFilters() {
    let filtered = this.data.issueOrders

    // 1. 时间筛选
    if (this.data.timeFilter !== 'all') {
      const range = getTimeRange(this.data.timeFilter)
      if (range.startDate && range.endDate) {
        const start = range.startDate.getTime()
        const end = range.endDate.getTime()
        filtered = filtered.filter(order => {
          const date = new Date(order.createTime || order.create_time || order.issueDate).getTime()
          return date >= start && date <= end
        })
      }
    }

    // 2. 工厂筛选
    if (this.data.factoryKeyword.trim()) {
      const kw = this.data.factoryKeyword.trim().toLowerCase()
      filtered = filtered.filter(o => o.factoryName.toLowerCase().includes(kw))
    }

    // 3. 计算汇总
    const summary = filtered.reduce((acc, o) => {
      acc.totalIssueCount++
      acc.totalIssueWeight += (o.issueWeight || 0)
      acc.totalReturnPieces += (o.totalReturnPieces || 0)
      acc.totalReturnWeight += (o.totalReturnWeight || 0)
      return acc
    }, { totalIssueCount: 0, totalIssueWeight: 0, totalReturnPieces: 0, totalReturnWeight: 0 })

    this.setData({
      filteredIssueOrders: filtered,
      summary: {
        ...summary,
        totalIssueWeightFormatted: formatWeight(summary.totalIssueWeight),
        totalReturnPiecesFormatted: formatQuantity(summary.totalReturnPieces),
        totalReturnWeightFormatted: formatWeight(summary.totalReturnWeight)
      }
    })
  },

  onOrderItemClick(e) {
    const id = e.currentTarget.dataset.id
    // 可选：跳转到发料详情或相关页面
  }
})

