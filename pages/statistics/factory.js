// pages/statistics/factory.js
import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    timeFilter: 'all',
    factoryStats: [],
    filteredFactoryStats: [],
    factoryKeyword: ''
  },

  stylesMap: null, // 不再需要用于工厂名称搜索，但保留以防万一用到款号信息

  onLoad(options) {
    if (!checkLogin()) {
      return
    }
    if (options.timeFilter) {
      this.setData({
        timeFilter: decodeURIComponent(options.timeFilter)
      })
    }
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
    // 查询所有发料单
    const issueOrdersRes = await query('issue_orders', {}, {
      excludeDeleted: true
    })
    let issueOrders = issueOrdersRes.data || []

    // 客户端进行时间筛选
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
        const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

        issueOrders = issueOrders.filter(order => {
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
            return false
          }
        })
      }
    }

    // 获取所有相关的工厂和款号ID
    const factoryIds = [...new Set(issueOrders.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(issueOrders.map(order => order.styleId || order.style_id).filter(Boolean))]

    // 批量查询工厂和款号信息
    const factoriesRes = factoryIds.length > 0 ? await queryByIds('factories', factoryIds) : { data: [] }
    const stylesRes = styleIds.length > 0 ? await queryByIds('styles', styleIds) : { data: [] }

    const factoriesMap = new Map()
    factoriesRes.data.forEach(factory => {
      const id = String(factory._id || factory.id || '')
      if (id) factoriesMap.set(id, factory)
    })

    const stylesMap = new Map()
    stylesRes.data.forEach(style => {
      const id = String(style._id || style.id || '')
      if (id) stylesMap.set(id, style)
    })
    // 保存 stylesMap 用于关键词筛选（保存到实例变量，不放在 data 中）
    this.stylesMap = stylesMap

    // 获取所有回货单
    const issueIds = issueOrders.map(order => order._id || order.id)
    const _ = wx.cloud.database().command
    let returnOrdersRes = { data: [] }
    
    if (issueIds.length > 0) {
      try {
        returnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
      } catch (e) {
        try {
          returnOrdersRes = await query('return_orders', {
            issue_id: _.in(issueIds)
          }, {
            excludeDeleted: true
          })
        } catch (e2) {
          console.error('查询回货单失败:', e2)
        }
      }

      // 根据时间筛选回货单
      if (this.data.timeFilter !== 'all') {
        const timeRange = getTimeRange(this.data.timeFilter)
        if (timeRange.startDate && timeRange.endDate) {
          const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
          const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

          returnOrdersRes.data = returnOrdersRes.data.filter(order => {
            const date = order.createTime || order.create_time || order.returnDate || order.return_date
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
    }

    // 按工厂统计
    const factoryStatsMap = new Map()

    issueOrders.forEach(order => {
      const factoryIdRaw = order.factoryId || order.factory_id
      if (!factoryIdRaw) return
      const factoryId = String(factoryIdRaw)

      if (!factoryStatsMap.has(factoryId)) {
        const factory = factoriesMap.get(factoryId)
        factoryStatsMap.set(factoryId, {
          factoryId: factoryId,
          factoryName: factory?.name || '',
          totalIssueCount: 0,
          totalIssueWeight: 0,
          totalReturnPieces: 0,
          totalReturnWeight: 0,
          styles: new Set() // 用于记录涉及的款号
        })
      }

      const stat = factoryStatsMap.get(factoryId)
      stat.totalIssueCount++
      stat.totalIssueWeight += parseFloat(order.issueWeight || order.issue_weight || 0)
      const styleIdRaw = order.styleId || order.style_id
      if (styleIdRaw) {
        stat.styles.add(String(styleIdRaw))
      }
    })

    // 统计回货数据
    returnOrdersRes.data.forEach(returnOrder => {
      const issueId = String(returnOrder.issueId || returnOrder.issue_id || '')
      const issueOrder = issueOrders.find(order => String(order._id || order.id) === issueId)
      if (!issueOrder) return

      const factoryId = issueOrder.factoryId || issueOrder.factory_id
      if (!factoryId) return

      const stat = factoryStatsMap.get(factoryId)
      if (stat) {
        stat.totalReturnPieces += parseFloat(returnOrder.returnPieces || returnOrder.return_pieces || 0)
        stat.totalReturnWeight += parseFloat(returnOrder.actualYarnUsage || returnOrder.actual_yarn_usage || 0)
      }
    })

    // 转换为数组并格式化
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
      timeFilter: selectedFilter
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

    this.setData({
      filteredFactoryStats: filtered
    })
  },

  onFactoryItemClick(e) {
    const factoryId = e.currentTarget.dataset.factoryId
    const factoryName = e.currentTarget.dataset.factoryName || ''
    wx.navigateTo({
      url: `/pages/statistics/factory-detail?factoryId=${factoryId}&factoryName=${encodeURIComponent(factoryName)}&timeFilter=${encodeURIComponent(this.data.timeFilter)}`
    })
  }
})

