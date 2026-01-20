// pages/statistics/style.js
const { query, queryByIds, getStyleById, getFactories, getStyles } = require('./utils/db.js')
const { getTimeRange, formatWeight, formatQuantity } = require('./utils/calc.js')
const { checkLogin } = require('./utils/auth.js')
const { normalizeImageUrl } = require('./utils/image.js')
const { pickDateHybrid, filterByTimeFilter, pickNumber, pickId } = require('./utils/summary.js')
const app = getApp()

Page({
  data: {
    timeFilter: 'all',
    timeFilterLabel: '全部时间',
    styleStats: [],
    filteredStyleStats: [],
    styleKeyword: '',
    summary: {
      styleCount: 0,
      factoryCount: 0,
      totalIssueCount: 0,
      totalIssueWeight: 0,
      totalIssueWeightFormatted: '0.00kg',
      totalReturnPieces: 0,
      totalReturnPiecesFormatted: '0打0件',
      totalReturnWeight: 0,
      totalReturnWeightFormatted: '0.00kg'
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

  formatAvg(num, den) {
    const n = Number(num) || 0
    const d = Number(den) || 1
    const v = d > 0 ? (n / d) : 0
    return v.toFixed(1)
  },

  // 图片加载失败：降级为占位图
  onStyleImageError(e) {
    const styleId = e.currentTarget.dataset.styleId
    const index = e.currentTarget.dataset.index

    // 优先更新当前渲染列表
    if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
      const i = typeof index === 'number' ? index : parseInt(index, 10)
      if (!Number.isNaN(i) && this.data.filteredStyleStats && this.data.filteredStyleStats[i]) {
        this.setData({ [`filteredStyleStats[${i}].styleImageUrl`]: '' })
      }
    }

    if (!styleId) return
    const match = (o) => String(o?.styleId || '') === String(styleId)

    const updateByStyleId = (listName) => {
      const list = this.data[listName] || []
      const idx = list.findIndex(match)
      if (idx >= 0) {
        this.setData({ [`${listName}[${idx}].styleImageUrl`]: '' })
      }
    }

    updateByStyleId('styleStats')
  },

  onLoad(options) {
    if (!checkLogin()) {
      return
    }
    if (options.timeFilter) {
      this.setData({
        timeFilter: decodeURIComponent(options.timeFilter)
      })
    }
    this.setData({ timeFilterLabel: this.getTimeFilterLabel(this.data.timeFilter) })
    this.loadData()
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

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
      await this.loadStyleStatistics()
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

  async loadStyleStatistics() {
    // 1. 查询所有发料单
    const issueOrdersRes = await query('issue_orders', {}, {
      excludeDeleted: true
    })
    let issueOrders = issueOrdersRes.data || []

    // 客户端进行时间筛选（使用统一 hybrid 日期口径）
    issueOrders = filterByTimeFilter(issueOrders, this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
    )

    // 2. 获取所有相关的款号和工厂ID
    const styleIds = [...new Set(issueOrders.map(order => pickId(order, ['styleId', 'style_id'])).filter(Boolean))]
    const factoryIds = [...new Set(issueOrders.map(order => pickId(order, ['factoryId', 'factory_id'])).filter(Boolean))]

    // 批量查询款号和工厂信息
    const stylesRes = styleIds.length > 0 ? await queryByIds('styles', styleIds) : { data: [] }
    const factoriesRes = factoryIds.length > 0 ? await queryByIds('factories', factoryIds) : { data: [] }

    const stylesMap = new Map()
    stylesRes.data.forEach(style => {
      const id = pickId(style, ['_id', 'id'])
      if (id) stylesMap.set(id, style)
    })

    const factoriesMap = new Map()
    factoriesRes.data.forEach(factory => {
      const id = pickId(factory, ['_id', 'id'])
      if (id) factoriesMap.set(id, factory)
    })

    // 3. 获取回货单并进行时间筛选
    const issueIds = issueOrders.map(order => pickId(order, ['_id', 'id']))
    const _ = wx.cloud.database().command
    let filteredReturnOrders = []

    if (issueIds.length > 0) {
      try {
        const [byIssueId, byIssue_id] = await Promise.all([
          query('return_orders', { issueId: _.in(issueIds) }, { excludeDeleted: true }).catch(() => ({ data: [] })),
          query('return_orders', { issue_id: _.in(issueIds) }, { excludeDeleted: true }).catch(() => ({ data: [] }))
        ])

        const merged = []
        const seen = new Set()
          // 排除已作废的回货单
          ; (byIssueId.data || []).concat(byIssue_id.data || []).forEach(ro => {
            if (ro.voided) return // 排除已作废的单据
            const key = pickId(ro, ['_id', 'id'])
            if (key && !seen.has(key)) {
              seen.add(key)
              merged.push(ro)
            }
          })

        // 使用统一 hybrid 筛选口径
        filteredReturnOrders = filterByTimeFilter(merged, this.data.timeFilter, (o) =>
          pickDateHybrid(o, ['returnDate', 'return_date'], ['createTime', 'create_time'])
        )
      } catch (e) {
        console.error('查询回货单失败:', e)
      }
    }

    // 4. 按款号统计（排除已作废的发料单）
    const styleStatsMap = new Map()

    issueOrders.filter(order => !order.voided).forEach(order => {
      const styleId = pickId(order, ['styleId', 'style_id'])
      if (!styleId) return

      if (!styleStatsMap.has(styleId)) {
        const style = stylesMap.get(styleId)
        const yarnUsagePerPiece = pickNumber(style, ['yarnUsagePerPiece', 'yarn_usage_per_piece'], 0)
        const lossRate = pickNumber(style, ['lossRate', 'loss_rate'], 0)
        styleStatsMap.set(styleId, {
          styleId: styleId,
          styleCode: pickFirst(style, ['styleCode', 'style_code']) || '',
          styleName: pickFirst(style, ['styleName', 'style_name', 'name']) || '',
          styleImageUrl: normalizeImageUrl(style),
          yarnUsagePerPiece,
          lossRate,
          totalIssueCount: 0,
          totalIssueWeight: 0,
          totalReturnPieces: 0,
          totalReturnWeight: 0,
          factories: new Set()
        })
      }

      const stat = styleStatsMap.get(styleId)
      stat.totalIssueCount++
      stat.totalIssueWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
      const factoryId = pickId(order, ['factoryId', 'factory_id'])
      if (factoryId) stat.factories.add(factoryId)
    })

    // 按 styleId 分组回货记录
    const styleReturnMap = new Map()
    filteredReturnOrders.forEach(ro => {
      const sId = pickId(ro, ['styleId', 'style_id'])
      if (sId) {
        if (!styleReturnMap.has(sId)) styleReturnMap.set(sId, [])
        styleReturnMap.get(sId).push(ro)
      }
    })

    // 5. 格式化并计算
    const styleStats = Array.from(styleStatsMap.values()).map(stat => {
      const returnOrders = styleReturnMap.get(stat.styleId) || []
      returnOrders.forEach(ro => {
        stat.totalReturnPieces += pickNumber(ro, ['returnPieces', 'return_pieces'], 0)
        stat.totalReturnWeight += pickNumber(ro, ['actualYarnUsage', 'actual_yarn_usage'], 0)
      })

      return {
        ...stat,
        factories: Array.from(stat.factories),
        factoryCount: stat.factories.size,
        totalIssueWeightFormatted: formatWeight(stat.totalIssueWeight),
        totalReturnPiecesFormatted: formatQuantity(stat.totalReturnPieces),
        totalReturnWeightFormatted: formatWeight(stat.totalReturnWeight),
        yarnUsagePerPieceFormatted: stat.yarnUsagePerPiece ? `${stat.yarnUsagePerPiece.toFixed(1)}g/件` : '',
        lossRateFormatted: stat.lossRate ? `损耗${stat.lossRate}%` : ''
      }
    })

    // 按发料单数倒序排序
    styleStats.sort((a, b) => b.totalIssueCount - a.totalIssueCount)

    this.setData({
      styleStats: styleStats
    })
    this.applyFilters()
  },

  onStyleKeywordInput(e) {
    this.setData({
      styleKeyword: e.detail.value
    })
    this.applyFilters()
  },

  onStyleKeywordSearch() {
    this.applyFilters()
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      timeFilter: selectedFilter,
      timeFilterLabel: this.getTimeFilterLabel(selectedFilter)
    })
    this.loadStyleStatistics()
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

  applyFilters() {
    let filtered = this.data.styleStats

    // 款号关键词筛选
    if (this.data.styleKeyword && this.data.styleKeyword.trim()) {
      const keyword = this.data.styleKeyword.trim().toLowerCase()
      filtered = filtered.filter(stat => {
        const styleCode = (stat.styleCode || '').toLowerCase()
        const styleName = (stat.styleName || '').toLowerCase()
        return styleCode.includes(keyword) || styleName.includes(keyword)
      })
    }

    // 计算顶部汇总
    const factoryIdSet = new Set()
    let totalIssueCount = 0
    let totalIssueWeight = 0
    let totalReturnPieces = 0
    let totalReturnWeight = 0

    filtered.forEach(s => {
      totalIssueCount += s.totalIssueCount || 0
      totalIssueWeight += s.totalIssueWeight || 0
      totalReturnPieces += s.totalReturnPieces || 0
      totalReturnWeight += s.totalReturnWeight || 0
      const factories = s.factories || []
      factories.forEach(fid => factoryIdSet.add(String(fid)))
    })

    // 为列表项补齐展示字段（避免 WXML 调用 toFixed 导致编译失败）
    const enriched = filtered.map(it => ({
      ...it,
      avgIssuePerFactoryText: this.formatAvg(it.totalIssueCount || 0, it.factoryCount || 1)
    }))

    this.setData({
      filteredStyleStats: enriched,
      summary: {
        styleCount: filtered.length,
        factoryCount: factoryIdSet.size,
        totalIssueCount,
        totalIssueWeight,
        totalIssueWeightFormatted: formatWeight(totalIssueWeight),
        totalReturnPieces,
        totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
        totalReturnWeight,
        totalReturnWeightFormatted: formatWeight(totalReturnWeight)
      }
    })
  },

  onStyleItemClick(e) {
    const styleId = e.currentTarget.dataset.styleId
    const styleCode = e.currentTarget.dataset.styleCode || ''
    const styleName = e.currentTarget.dataset.styleName || ''
    wx.navigateTo({
      url: `/subpages/statistics/style-detail?styleId=${styleId}&styleCode=${encodeURIComponent(styleCode)}&styleName=${encodeURIComponent(styleName)}&timeFilter=${encodeURIComponent(this.data.timeFilter)}`
    })
  }
})

function pickFirst(obj, keys) {
  if (!obj) return null
  for (let key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key]
  }
  return null
}
