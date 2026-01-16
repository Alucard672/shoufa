// pages/statistics/factory.js
import { query, queryByIds } from '../../utils/db.js'
import { formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber, pickId, pickFirst } from '../../utils/summary.js'
const app = getApp()

Page({
  data: {
    timeFilter: 'all',
    timeFilterLabel: '全部时间',
    factoryStats: [],
    filteredFactoryStats: [],
    factoryKeyword: '',
    summary: {
      factoryCount: 0,
      styleCount: 0,
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

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
      await this.loadFactoryStatistics()
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

  async loadFactoryStatistics() {
    // 1. 查询所有发料单
    const issueOrdersRes = await query('issue_orders', {}, {
      excludeDeleted: true
    })
    let issueOrders = issueOrdersRes.data || []

    // 客户端进行时间筛选（使用统一 hybrid 日期口径）
    issueOrders = filterByTimeFilter(issueOrders, this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
    )

    // 2. 获取所有相关的工厂和款号ID
    const factoryIds = [...new Set(issueOrders.map(order => pickId(order, ['factoryId', 'factory_id'])).filter(Boolean))]
    const styleIds = [...new Set(issueOrders.map(order => pickId(order, ['styleId', 'style_id'])).filter(Boolean))]

    // 批量查询工厂和款号信息
    const factoriesRes = factoryIds.length > 0 ? await queryByIds('factories', factoryIds) : { data: [] }
    const stylesRes = styleIds.length > 0 ? await queryByIds('styles', styleIds) : { data: [] }

    const factoriesMap = new Map()
    factoriesRes.data.forEach(factory => {
      const id = pickId(factory, ['_id', 'id'])
      if (id) factoriesMap.set(id, factory)
    })

    const stylesMap = new Map()
    stylesRes.data.forEach(style => {
      const id = pickId(style, ['_id', 'id'])
      if (id) stylesMap.set(id, style)
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

    // 4. 按工厂统计（排除已作废的发料单）
    const factoryStatsMap = new Map()

    issueOrders.filter(order => !order.voided).forEach(order => {
      const factoryId = pickId(order, ['factoryId', 'factory_id'])
      if (!factoryId) return

      if (!factoryStatsMap.has(factoryId)) {
        const factory = factoriesMap.get(factoryId)
        factoryStatsMap.set(factoryId, {
          factoryId: factoryId,
          factoryName: pickFirst(factory, ['name']) || '未知工厂',
          totalIssueCount: 0,
          totalIssueWeight: 0,
          totalReturnPieces: 0,
          totalReturnWeight: 0,
          styles: new Set()
        })
      }

      const stat = factoryStatsMap.get(factoryId)
      stat.totalIssueCount++
      stat.totalIssueWeight += pickNumber(order, ['issueWeight', 'issue_weight'], 0)
      const styleId = pickId(order, ['styleId', 'style_id'])
      if (styleId) stat.styles.add(styleId)
    })

    // 统计回货数据（基于筛选后的回货单）
    const issueIdsSet = new Set(issueIds)
    filteredReturnOrders.forEach(ro => {
      const roIssueId = pickId(ro, ['issueId', 'issue_id'])
      if (!roIssueId || !issueIdsSet.has(roIssueId)) return

      // 找到该发料单对应的工厂
      const issueOrder = issueOrders.find(o => pickId(o, ['_id', 'id']) === roIssueId)
      const factoryId = pickId(issueOrder, ['factoryId', 'factory_id'])
      if (!factoryId) return

      const stat = factoryStatsMap.get(factoryId)
      if (stat) {
        stat.totalReturnPieces += pickNumber(ro, ['returnPieces', 'return_pieces'], 0)
        stat.totalReturnWeight += pickNumber(ro, ['actualYarnUsage', 'actual_yarn_usage'], 0)
      }
    })

    // 5. 转换为数组并格式化
    const factoryStats = Array.from(factoryStatsMap.values()).map(stat => ({
      ...stat,
      styles: Array.from(stat.styles),
      styleCount: stat.styles.size,
      totalIssueWeightFormatted: formatWeight(stat.totalIssueWeight),
      totalReturnPiecesFormatted: formatQuantity(stat.totalReturnPieces),
      totalReturnWeightFormatted: formatWeight(stat.totalReturnWeight)
    }))

    // 按发料单数倒序排序
    factoryStats.sort((a, b) => b.totalIssueCount - a.totalIssueCount)

    this.setData({
      factoryStats: factoryStats
    })
    this.applyFilters()
  },

  onFactoryKeywordInput(e) {
    this.setData({
      factoryKeyword: e.detail.value
    })
    this.applyFilters()
  },

  onFactoryKeywordSearch() {
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
    this.loadFactoryStatistics()
  },

  applyFilters() {
    let filtered = this.data.factoryStats

    // 加工厂名称关键词筛选
    if (this.data.factoryKeyword && this.data.factoryKeyword.trim()) {
      const keyword = this.data.factoryKeyword.trim().toLowerCase()
      filtered = filtered.filter(stat => {
        const factoryName = (stat.factoryName || '').toLowerCase()
        return factoryName.includes(keyword)
      })
    }

    // 为列表项补齐展示字段
    const enriched = filtered.map(it => ({
      ...it,
      avgIssuePerStyleText: this.formatAvg(it.totalIssueCount || 0, it.styleCount || 1)
    }))

    this.setData({
      filteredFactoryStats: enriched,
      summary: this.calculateSummary(filtered)
    })
  },

  calculateSummary(list) {
    const styleIdSet = new Set()
    let totalIssueCount = 0
    let totalIssueWeight = 0
    let totalReturnPieces = 0
    let totalReturnWeight = 0

    list.forEach(f => {
      totalIssueCount += f.totalIssueCount || 0
      totalIssueWeight += f.totalIssueWeight || 0
      totalReturnPieces += f.totalReturnPieces || 0
      totalReturnWeight += f.totalReturnWeight || 0
      const styles = f.styles || []
      styles.forEach(sid => styleIdSet.add(String(sid)))
    })

    return {
      factoryCount: list.length,
      styleCount: styleIdSet.size,
      totalIssueCount,
      totalIssueWeight,
      totalIssueWeightFormatted: formatWeight(totalIssueWeight),
      totalReturnPieces,
      totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
      totalReturnWeight,
      totalReturnWeightFormatted: formatWeight(totalReturnWeight)
    }
  },

  onFactoryItemClick(e) {
    const factoryId = e.currentTarget.dataset.factoryId
    const factoryName = e.currentTarget.dataset.factoryName || ''
    wx.navigateTo({
      url: `/subpages/statistics/factory-detail?factoryId=${factoryId}&factoryName=${encodeURIComponent(factoryName)}&timeFilter=${encodeURIComponent(this.data.timeFilter)}`
    })
  }
})
