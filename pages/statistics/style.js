// pages/statistics/style.js
import { query, queryByIds } from '../../utils/db.js'
import { getTimeRange, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    timeFilter: 'all',
    styleStats: [],
    filteredStyleStats: [],
    styleKeyword: ''
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

    // 获取所有相关的款号和工厂ID
    const styleIds = [...new Set(issueOrders.map(order => order.styleId || order.style_id).filter(Boolean))]
    const factoryIds = [...new Set(issueOrders.map(order => order.factoryId || order.factory_id).filter(Boolean))]

    // 批量查询款号和工厂信息
    const stylesRes = styleIds.length > 0 ? await queryByIds('styles', styleIds) : { data: [] }
    const factoriesRes = factoryIds.length > 0 ? await queryByIds('factories', factoryIds) : { data: [] }

    const stylesMap = new Map()
    stylesRes.data.forEach(style => {
      const id = String(style._id || style.id || '')
      if (id) stylesMap.set(id, style)
    })

    const factoriesMap = new Map()
    factoriesRes.data.forEach(factory => {
      const id = String(factory._id || factory.id || '')
      if (id) factoriesMap.set(id, factory)
    })

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

    // 按款号统计
    const styleStatsMap = new Map()

    issueOrders.forEach(order => {
      const styleIdRaw = order.styleId || order.style_id
      if (!styleIdRaw) return
      const styleId = String(styleIdRaw)

      if (!styleStatsMap.has(styleId)) {
        const style = stylesMap.get(styleId)
        const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
        const lossRate = style?.lossRate || style?.loss_rate || 0
        styleStatsMap.set(styleId, {
          styleId: styleId,
          styleCode: style?.styleCode || style?.style_code || '',
          styleName: style?.styleName || style?.style_name || '',
          styleImageUrl: (style?.imageUrl || style?.image_url || style?.image || '').trim(),
          yarnUsagePerPiece,
          lossRate,
          totalIssueCount: 0,
          totalIssueWeight: 0,
          totalReturnPieces: 0,
          totalReturnWeight: 0,
          factories: new Set() // 用于记录涉及的工厂
        })
      }

      const stat = styleStatsMap.get(styleId)
      stat.totalIssueCount++
      stat.totalIssueWeight += parseFloat(order.issueWeight || order.issue_weight || 0)
      const factoryIdRaw = order.factoryId || order.factory_id
      if (factoryIdRaw) {
        stat.factories.add(String(factoryIdRaw))
      }
    })

    // 关联回货记录 (使用内存匹配兜底)
    const returnOrdersRes = await query('return_orders', {}, { excludeDeleted: true })
    const allReturnOrders = returnOrdersRes.data || []
    
    // 按 styleId 分组
    const styleReturnMap = new Map()
    allReturnOrders.forEach(ro => {
      const sId = String(ro.styleId || ro.style_id || '')
      if (sId) {
        if (!styleReturnMap.has(sId)) styleReturnMap.set(sId, [])
        styleReturnMap.get(sId).push(ro)
      }
    })

    // 格式化并计算
    const styleStats = Array.from(styleStatsMap.values()).map(stat => {
      const returnOrders = styleReturnMap.get(stat.styleId) || []
      returnOrders.forEach(ro => {
        stat.totalReturnPieces += parseFloat(ro.returnPieces || ro.return_pieces || 0)
        stat.totalReturnWeight += parseFloat(ro.actualYarnUsage || ro.actual_yarn_usage || 0)
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
      timeFilter: selectedFilter
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

    this.setData({
      filteredStyleStats: filtered
    })
  },

  onStyleItemClick(e) {
    const styleId = e.currentTarget.dataset.styleId
    const styleCode = e.currentTarget.dataset.styleCode || ''
    const styleName = e.currentTarget.dataset.styleName || ''
    wx.navigateTo({
      url: `/pages/statistics/style-detail?styleId=${styleId}&styleCode=${encodeURIComponent(styleCode)}&styleName=${encodeURIComponent(styleName)}&timeFilter=${encodeURIComponent(this.data.timeFilter)}`
    })
  }
})


