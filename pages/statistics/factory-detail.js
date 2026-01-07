// pages/statistics/factory-detail.js
import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange, formatWeight, formatQuantity, formatDateTime } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber, pickId, pickFirst } from '../../utils/summary.js'

Page({
  data: {
    factoryId: '',
    factoryName: '',
    timeFilter: 'all',
    timeFilterLabel: '全部时间',
    styleKeyword: '',
    issueOrders: [],
    filteredIssueOrders: [],
    summary: {
      totalIssueCount: 0,
      totalIssueWeight: 0,
      totalReturnPieces: 0,
      totalReturnWeight: 0,
      styleCount: 0,
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

  onLoad(options) {
    if (!checkLogin()) {
      return
    }
    if (options.factoryId) {
      this.setData({
        factoryId: options.factoryId,
        factoryName: options.factoryName ? decodeURIComponent(options.factoryName) : '',
        timeFilter: options.timeFilter ? decodeURIComponent(options.timeFilter) : 'all'
      })
      this.setData({ timeFilterLabel: this.getTimeFilterLabel(this.data.timeFilter) })
      wx.setNavigationBarTitle({
        title: this.data.factoryName || '工厂明细'
      })
      this.loadData()
    }
  },

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
      await this.loadIssueOrders()
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

  async loadIssueOrders() {
    // 1. 查询该工厂的所有发料单
    const ordersRes = await query('issue_orders', {
      factoryId: this.data.factoryId
    }, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'DESC' }
    })
    
    let issueOrders = ordersRes.data || []

    // 2. 批量查询款号信息
    const styleIds = [...new Set(issueOrders.map(order => pickId(order, ['styleId', 'style_id'])).filter(Boolean))]
    const stylesRes = styleIds.length > 0 ? await queryByIds('styles', styleIds) : { data: [] }
    const stylesMap = new Map()
    stylesRes.data.forEach(s => stylesMap.set(pickId(s, ['_id', 'id']), s))

    // 3. 批量查询回货单
    const issueIds = issueOrders.map(order => pickId(order, ['_id', 'id']))
    const _ = wx.cloud.database().command
    
    // 获取该工厂下的所有回货单
    const allReturnOrdersRes = await query('return_orders', {
      factoryId: this.data.factoryId
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
      const style = stylesMap.get(pickId(order, ['styleId', 'style_id']))
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
        styleCode: pickFirst(style, ['styleCode', 'style_code']) || '',
        styleName: pickFirst(style, ['styleName', 'style_name', 'name']) || '未知款号',
        styleImageUrl: normalizeImageUrl(style),
        status,
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

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  },

  onStyleKeywordInput(e) {
    this.setData({ styleKeyword: e.detail.value })
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

    // 1. 时间筛选
    if (this.data.timeFilter !== 'all') {
      filtered = filterByTimeFilter(filtered, this.data.timeFilter, (o) =>
        pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
      )
    }

    // 2. 款号筛选
    if (this.data.styleKeyword.trim()) {
      const kw = this.data.styleKeyword.trim().toLowerCase()
      filtered = filtered.filter(o => 
        o.styleCode.toLowerCase().includes(kw) || 
        o.styleName.toLowerCase().includes(kw)
      )
    }

    // 3. 计算汇总
    const styleIdSet = new Set()
    const summaryRaw = filtered.reduce((acc, o) => {
      acc.totalIssueCount++
      const iWeight = pickNumber(o, ['issueWeight', 'issue_weight'], 0)
      acc.totalIssueWeight += iWeight
      acc.totalReturnPieces += (o.totalReturnPieces || 0)
      acc.totalReturnWeight += (o.totalReturnWeight || 0)
      if (o.totalReturnWeight > 0) acc.returnedIssueCount++
      const sid = pickId(o, ['styleId', 'style_id'])
      if (sid) styleIdSet.add(sid)
      return acc
    }, { totalIssueCount: 0, totalIssueWeight: 0, totalReturnPieces: 0, totalReturnWeight: 0, returnedIssueCount: 0 })

    this.setData({
      filteredIssueOrders: filtered,
      summary: {
        totalIssueCount: summaryRaw.totalIssueCount,
        totalIssueWeight: summaryRaw.totalIssueWeight,
        totalReturnPieces: summaryRaw.totalReturnPieces,
        totalReturnWeight: summaryRaw.totalReturnWeight,
        styleCount: styleIdSet.size,
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
