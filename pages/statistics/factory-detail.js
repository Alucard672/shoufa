import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange, formatWeight, formatQuantity, formatDateTime } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'

Page({
  data: {
    factoryId: '',
    factoryName: '',
    timeFilter: 'all',
    styleKeyword: '',
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
    if (options.factoryId) {
      this.setData({
        factoryId: options.factoryId,
        factoryName: options.factoryName ? decodeURIComponent(options.factoryName) : '',
        timeFilter: options.timeFilter ? decodeURIComponent(options.timeFilter) : 'all'
      })
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
    const styleIds = [...new Set(issueOrders.map(order => order.styleId || order.style_id).filter(Boolean))]
    const stylesRes = styleIds.length > 0 ? await queryByIds('styles', styleIds) : { data: [] }
    const stylesMap = new Map()
    stylesRes.data.forEach(s => stylesMap.set(String(s._id || s.id), s))

    // 3. 批量查询回货单
    const issueIds = issueOrders.map(order => order._id || order.id)
    const _ = wx.cloud.database().command
    let returnOrdersRes = { data: [] }
    if (issueIds.length > 0) {
      try {
        returnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, { excludeDeleted: true })
      } catch (e) {
        returnOrdersRes = await query('return_orders', {
          issue_id: _.in(issueIds)
        }, { excludeDeleted: true })
      }
    }

    const returnOrdersMap = new Map()
    returnOrdersRes.data.forEach(ro => {
      const id = String(ro.issueId || ro.issue_id || '')
      if (!returnOrdersMap.has(id)) returnOrdersMap.set(id, [])
      returnOrdersMap.get(id).push(ro)
    })

    // 4. 组装数据
    const ordersWithDetails = issueOrders.map(order => {
      const style = stylesMap.get(String(order.styleId || order.style_id))
      const returnOrders = returnOrdersMap.get(String(order._id || order.id)) || []
      
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
        styleCode: style?.styleCode || '',
        styleName: style?.styleName || '未知款号',
        styleImageUrl: (style?.imageUrl || style?.image_url || style?.image || '').trim(),
        status,
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

    // 2. 款号筛选
    if (this.data.styleKeyword.trim()) {
      const kw = this.data.styleKeyword.trim().toLowerCase()
      filtered = filtered.filter(o => 
        o.styleCode.toLowerCase().includes(kw) || 
        o.styleName.toLowerCase().includes(kw)
      )
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

