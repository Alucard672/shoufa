// pages/statistics/index.js
import { query, queryByIds, getStyleById, getFactories, getStyles } from '../../utils/db.js'
import { getTimeRange, formatDate, formatWeight, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber, pickId } from '../../utils/summary.js'
const app = getApp()

Page({
  data: {
    totalIssueCount: 0,
    returnedCount: 0,
    styleCount: 0,
    factoryCount: 0,
    timeFilter: 'all',
    statusFilter: 'all',
    searchKeyword: '',
    statistics: []
  },

  // 设计稿按钮点击：复用原 filter-tabs 的逻辑（不改功能）
  onTimeSegTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10) || 0
    this.onTimeFilterChange({ detail: { index } })
  },

  onStatusSegTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10) || 0
    this.onStatusFilterChange({ detail: { index } })
  },

  // 图片加载失败：降级为占位图
  onStyleImageError(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
      const i = typeof index === 'number' ? index : parseInt(index, 10)
      if (!Number.isNaN(i) && this.data.statistics && this.data.statistics[i]) {
        this.setData({ [`statistics[${i}].styleImageUrl`]: '' })
        return
      }
    }

    if (!id) return
    const match = (o) => String(o?._id || o?.id || '') === String(id)
    const list = this.data.statistics || []
    const idx = list.findIndex(match)
    if (idx >= 0) {
      this.setData({ [`statistics[${idx}].styleImageUrl`]: '' })
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

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
      await Promise.all([
        this.loadStatistics(),
        this.loadStatisticsList(),
        this.loadStyleAndFactoryCount()
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

  async loadStatistics() {
    // 查询所有数据，然后在客户端进行时间筛选（hybrid：业务日期优先，缺失用创建时间兜底）
    const issueOrdersRes = await query('issue_orders', {}, {
      excludeDeleted: true
    })
    let issueOrders = issueOrdersRes.data || []

    issueOrders = filterByTimeFilter(issueOrders, this.data.timeFilter, (o) =>
      pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time'])
    )

    // 统计页汇总口径：排除已作废的发料单
    issueOrders = issueOrders.filter(order => !order.voided)

    const issueIds = issueOrders.map(order => order.id || order._id)
    console.log('统计页面loadStatistics - 发料单IDs:', issueIds)
    let totalReturnPieces = 0
    let totalReturnWeight = 0
    let returnedCount = 0

    if (issueIds.length > 0) {
      const _ = wx.cloud.database().command
      
      // 先获取该租户下的所有回货单，用于内存匹配（作为查询失败的兜底）
      const allReturnOrdersRes = await query('return_orders', {}, {
        excludeDeleted: true
      })
      // 统计页汇总口径：排除已作废的回货单
      const allReturnOrders = (allReturnOrdersRes.data || []).filter(order => !order.voided)

      // 先尝试使用 issueId，如果失败再尝试 issue_id
      let returnOrdersRes
      try {
        returnOrdersRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        console.log('统计页面loadStatistics - 使用issueId查询回货单:', returnOrdersRes.data.length, '条')
      } catch (e) {
        console.log('统计页面loadStatistics - issueId查询失败，尝试issue_id:', e)
        returnOrdersRes = await query('return_orders', {
          issue_id: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        console.log('统计页面loadStatistics - 使用issue_id查询回货单:', returnOrdersRes.data.length, '条')
      }

      // 如果查询结果为空，尝试在内存中过滤（解决ID类型不匹配问题）
      if (returnOrdersRes.data.length === 0 && allReturnOrders.length > 0) {
        console.log('统计页面loadStatistics - 尝试在内存中匹配回货单')
        const issueIdsStr = issueIds.map(id => String(id))
        returnOrdersRes.data = allReturnOrders.filter(ro => {
          const roIssueId = ro.issueId || ro.issue_id
          if (!roIssueId) return false
          const roIssueIdStr = String(roIssueId)
          return issueIdsStr.includes(roIssueIdStr) || issueIds.includes(roIssueId)
        })
        console.log('统计页面loadStatistics - 内存匹配结果:', returnOrdersRes.data.length, '条')
      }

      // 根据时间筛选条件过滤回货单（hybrid：returnDate 优先，缺失用 createTime 兜底）
      let filteredReturnOrders = filterByTimeFilter(returnOrdersRes.data || [], this.data.timeFilter, (o) =>
        pickDateHybrid(o, ['returnDate', 'return_date'], ['createTime', 'create_time'])
      )
      // 排除已作废的回货单（避免作废后仍进入统计）
      filteredReturnOrders = (filteredReturnOrders || []).filter(order => !order.voided)

      // 将issueIds转换为字符串集合，以便匹配
      const issueIdsSet = new Set(issueIds.map(id => String(id)))
      
      const returnedIssueIds = new Set()
      filteredReturnOrders.forEach(order => {
        const issueId = String(order.issueId || order.issue_id || '')
        // 确保回货单的issueId在发料单ID列表中
        if (issueId && issueIdsSet.has(issueId)) {
          returnedIssueIds.add(issueId)
          totalReturnPieces += pickNumber(order, ['returnPieces', 'return_pieces'], 0)
          totalReturnWeight += pickNumber(order, ['actualYarnUsage', 'actual_yarn_usage'], 0)
        }
      })
      returnedCount = returnedIssueIds.size
      console.log('统计页面loadStatistics - 总计回货件数:', totalReturnPieces, '重量:', totalReturnWeight, '已回货单数:', returnedCount, '筛选后的回货单数:', filteredReturnOrders.length)
    }

    this.setData({
      totalIssueCount: issueOrders.length,
      returnedCount,
      totalReturnPieces: Math.floor(totalReturnPieces),
      totalReturnWeightFormatted: totalReturnWeight.toFixed(2)
    })
  },

  async loadStyleAndFactoryCount() {
    try {
      // 查询所有发料单，统计涉及的款号和工厂数量
      const issueOrdersRes = await query('issue_orders', {}, {
        excludeDeleted: true
      })
      const issueOrders = issueOrdersRes.data || []

      // 客户端进行时间筛选
      let filteredOrders = issueOrders
      if (this.data.timeFilter !== 'all') {
        const timeRange = getTimeRange(this.data.timeFilter)
        if (timeRange.startDate && timeRange.endDate) {
          const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
          const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

          filteredOrders = issueOrders.filter(order => {
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

      // 统计页汇总口径：排除已作废的发料单
      filteredOrders = (filteredOrders || []).filter(order => !order.voided)

      // 统计唯一的款号和工厂数量
      const styleIds = new Set()
      const factoryIds = new Set()

      filteredOrders.forEach(order => {
        const styleId = order.styleId || order.style_id
        const factoryId = order.factoryId || order.factory_id
        if (styleId) styleIds.add(styleId)
        if (factoryId) factoryIds.add(factoryId)
      })

      this.setData({
        styleCount: styleIds.size,
        factoryCount: factoryIds.size
      })
    } catch (error) {
      console.error('加载款号和工厂统计失败:', error)
    }
  },

  async loadStatisticsList() {
    // 先查询所有数据，然后在客户端进行筛选（更可靠）
    const issueOrdersRes = await query('issue_orders', {}, {
      excludeDeleted: true,
      orderBy: { field: 'createTime', direction: 'DESC' }
    })
    // 排除已作废的发料单
    let issueOrders = { 
      data: (issueOrdersRes.data || []).filter(order => !order.voided)
    }

    // 批量查询回货单
    const issueIds = issueOrders.data.map(order => order.id || order._id)
    console.log('统计页面 - 发料单IDs:', issueIds)
    
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      // 先查询所有回货单，看看实际的 issueId 值
      const allReturnOrdersRes = await query('return_orders', {}, {
        excludeDeleted: true
      })
      // 排除已作废的回货单
      const validReturnOrders = (allReturnOrdersRes.data || []).filter(order => !order.voided)
      console.log('统计页面 - 所有回货单:', validReturnOrders.length, '条（已排除作废）')
      validReturnOrders.forEach(ro => {
        console.log('统计页面 - 回货单详情:', {
          returnNo: ro.returnNo || ro.return_no,
          issueId: ro.issueId || ro.issue_id,
          issueIdType: typeof (ro.issueId || ro.issue_id),
          issueIdStr: String(ro.issueId || ro.issue_id)
        })
      })
      
      const _ = wx.cloud.database().command
      // 先尝试使用 issueId，如果失败再尝试 issue_id
      let returnOrdersRes
      try {
        const rawRes = await query('return_orders', {
          issueId: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        // 排除已作废的回货单
        returnOrdersRes = { data: (rawRes.data || []).filter(order => !order.voided) }
        console.log('统计页面 - 使用issueId查询回货单:', returnOrdersRes.data.length, '条（已排除作废）', returnOrdersRes.data.map(o => ({ id: o._id, issueId: o.issueId || o.issue_id, returnNo: o.returnNo || o.return_no })))
      } catch (e) {
        console.log('统计页面 - issueId查询失败，尝试issue_id:', e)
        const rawRes = await query('return_orders', {
          issue_id: _.in(issueIds)
        }, {
          excludeDeleted: true
        })
        // 排除已作废的回货单
        returnOrdersRes = { data: (rawRes.data || []).filter(order => !order.voided) }
        console.log('统计页面 - 使用issue_id查询回货单:', returnOrdersRes.data.length, '条（已排除作废）', returnOrdersRes.data.map(o => ({ id: o._id, issueId: o.issueId || o.issue_id, returnNo: o.returnNo || o.return_no })))
      }
      
      // 如果查询结果为空，尝试在内存中过滤
      if (returnOrdersRes.data.length === 0 && validReturnOrders.length > 0) {
        console.log('统计页面 - 尝试在内存中匹配回货单')
        const issueIdsStr = issueIds.map(id => String(id))
        returnOrdersRes.data = validReturnOrders.filter(ro => {
          const roIssueId = ro.issueId || ro.issue_id
          const roIssueIdStr = String(roIssueId)
          const matched = issueIdsStr.includes(roIssueIdStr) || issueIds.includes(roIssueId)
          if (matched) {
            console.log('统计页面 - 内存匹配成功:', roIssueIdStr, '匹配到发料单ID')
          }
          return matched
        })
        console.log('统计页面 - 内存匹配结果:', returnOrdersRes.data.length, '条')
      }
      
      // 按 issueId 分组（直接使用 String(issueId) 作为key，确保匹配）
      returnOrdersRes.data.forEach(returnOrder => {
        const issueId = String(returnOrder.issueId || returnOrder.issue_id || '')
        if (issueId) {
          if (!returnOrdersMap.has(issueId)) {
            returnOrdersMap.set(issueId, [])
          }
          returnOrdersMap.get(issueId).push(returnOrder)
        }
      })

      // 确保所有发料单都有对应的数组（即使为空）
      issueIds.forEach(issueId => {
        const id = String(issueId)
        if (!returnOrdersMap.has(id)) {
          returnOrdersMap.set(id, [])
        }
      })
      
      console.log('统计页面 - 回货单Map:', Array.from(returnOrdersMap.entries()).map(([k, v]) => [k, v.length]))
    }

    // 批量查询款号
    const styleIds = [...new Set(issueOrders.data.map(order => order.styleId || order.style_id).filter(Boolean))]
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds)
      stylesRes.data.forEach(style => {
        stylesMap.set(style.id || style._id, style)
      })
    }

    // 为每个发料单加载回货信息和计算统计
    const statistics = await Promise.all(
      issueOrders.data.map(async (issueOrder) => {
        const styleId = issueOrder.styleId || issueOrder.style_id
        const style = stylesMap.get(styleId) || {}
        // 统一使用 String(_id) 作为key，确保与 returnOrdersMap 的key匹配
        const issueOrderId = String(issueOrder._id || issueOrder.id)
        const returnOrders = returnOrdersMap.get(issueOrderId) || []
        
        // 调试日志：检查匹配情况
        if (issueOrders.data.length <= 5) {
          console.log('统计页面 - 发料单匹配:', {
            issueOrderId,
            issueNo: issueOrder.issueNo || issueOrder.issue_no,
            returnOrdersCount: returnOrders.length,
            returnOrdersMapKeys: Array.from(returnOrdersMap.keys()),
            matched: returnOrdersMap.has(issueOrderId)
          })
        }

        let totalReturnQuantity = 0
        let totalReturnPieces = 0
        let totalReturnYarn = 0
        let latestReturnDate = null

        returnOrders.forEach(order => {
          totalReturnQuantity += order.returnQuantity || order.return_quantity || 0
          totalReturnPieces += Math.floor(order.returnPieces || order.return_pieces || 0)
          totalReturnYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
          const returnDate = order.returnDate || order.return_date
          if (!latestReturnDate || new Date(returnDate) > new Date(latestReturnDate)) {
            latestReturnDate = returnDate
          }
        })

        const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
        const yarnUsagePerPiece = style.yarnUsagePerPiece || style.yarn_usage_per_piece || 0
        const issuePieces = yarnUsagePerPiece > 0 ? Math.floor((issueWeight * 1000) / yarnUsagePerPiece) : 0
        const remainingYarn = issueWeight - totalReturnYarn
        const remainingPieces = Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
        const remainingQuantity = remainingPieces / 12

        // 计算损耗率相关数据
        const lossRate = style.lossRate || style.loss_rate || 0
        const planYarnUsage = (totalReturnPieces * yarnUsagePerPiece) / 1000 // 计划用纱量（kg）
        const actualYarnUsage = totalReturnYarn // 实际用纱量（kg）
        const lossAmount = actualYarnUsage - planYarnUsage // 损耗量（kg）
        const actualLossRate = planYarnUsage > 0 ? ((lossAmount / planYarnUsage) * 100) : 0 // 实际损耗率（%）

        // 动态判断状态
        let displayStatus = issueOrder.status
        if (issueOrder.status !== '已完成') {
          if (totalReturnYarn > 0 || totalReturnPieces > 0) {
            if (remainingYarn <= 0.01 || (issuePieces > 0 && totalReturnPieces >= issuePieces)) {
              // 回货完成，标记为已完成
              displayStatus = '已完成'
            } else {
              displayStatus = '部分回货'
            }
          } else {
            displayStatus = '未回货'
          }
        }

        return {
          ...issueOrder,
          _id: issueOrder._id || issueOrder.id,
          status: displayStatus,
          styleName: style.styleName || style.style_name || style.name || '未知款号',
          styleCode: style.styleCode || style.style_code || '',
          styleImageUrl: normalizeImageUrl(style),
          yarnUsagePerPiece: yarnUsagePerPiece,
          lossRate: lossRate, // 款号设定的损耗率
          planYarnUsage: planYarnUsage, // 计划用纱量
          actualYarnUsage: actualYarnUsage, // 实际用纱量
          lossAmount: lossAmount, // 损耗量
          actualLossRate: actualLossRate, // 实际损耗率
          lossRateFormatted: lossRate.toFixed(1) + '%',
          planYarnUsageFormatted: formatWeight(planYarnUsage),
          lossAmountFormatted: formatWeight(Math.abs(lossAmount)),
          actualLossRateFormatted: actualLossRate.toFixed(1) + '%',
          totalReturnQuantity: totalReturnQuantity.toFixed(1),
          totalReturnPieces: Math.floor(totalReturnPieces),
          totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
          totalReturnYarn,
          remainingYarn,
          remainingPieces: Math.floor(remainingPieces),
          remainingPiecesFormatted: formatQuantity(remainingPieces),
          remainingQuantity,
          remainingQuantityFormatted: remainingQuantity.toFixed(1),
          latestReturnDate,
          issueDateFormatted: formatDate(issueOrder.issueDate || issueOrder.issue_date),
          latestReturnDateFormatted: latestReturnDate ? formatDate(latestReturnDate) : null,
          issueWeightFormatted: formatWeight(issueWeight),
          totalReturnYarnFormatted: formatWeight(totalReturnYarn),
          remainingYarnFormatted: formatWeight(remainingYarn),
          returnOrders: returnOrders
            .slice()
            .sort((a, b) => {
              const dateA = a.returnDate || a.return_date
              const dateB = b.returnDate || b.return_date
              const dateAObj = dateA instanceof Date ? dateA : new Date(dateA)
              const dateBObj = dateB instanceof Date ? dateB : new Date(dateB)
              return dateBObj.getTime() - dateAObj.getTime()
            })
            .map((order, index) => ({
              ...order,
              returnPieces: Math.floor(order.returnPieces || order.return_pieces || 0),
              quantityFormatted: formatQuantity(order.returnPieces || order.return_pieces),
              returnDateFormatted: formatDate(order.returnDate || order.return_date),
              actualYarnUsageFormatted: (order.actualYarnUsage || order.actual_yarn_usage || 0).toFixed(2),
              returnOrderIndex: returnOrders.length - index
            }))
        }
      })
    )

    // 应用客户端筛选
    let filteredStatistics = statistics || []

    // 1. 时间筛选
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
        const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)

        filteredStatistics = filteredStatistics.filter(item => {
          // 使用创建时间进行筛选
          const date = item.createTime || item.create_time
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

    // 2. 状态筛选（状态是计算出来的，需要在客户端筛选）
    if (this.data.statusFilter !== 'all') {
      filteredStatistics = filteredStatistics.filter(item => {
        return item.status === this.data.statusFilter
      })
    }
    // 注意：statusFilter === 'all' 时，显示所有状态的单据（包括已完成）
    // 不再排除已完成的单据，因为用户可能想查看所有单据

    // 3. 搜索筛选
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredStatistics = filteredStatistics.filter(item => {
        const issueNo = (item.issueNo || item.issue_no || '').toLowerCase()
        const styleCode = (item.styleCode || '').toLowerCase()
        const styleName = (item.styleName || '').toLowerCase()
        return issueNo.includes(keyword) || styleCode.includes(keyword) || styleName.includes(keyword)
      })
    }

    this.setData({
      statistics: filteredStatistics
    })
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    console.log('统计页面时间筛选变化:', index, selectedFilter)
    this.setData({
      timeFilter: selectedFilter
    })
    this.loadStatistics()
    this.loadStatisticsList()
    this.loadStyleAndFactoryCount()
  },

  onStatusFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货']
    const selectedFilter = filters[index] || 'all'
    console.log('统计页面状态筛选变化:', index, selectedFilter)
    this.setData({
      statusFilter: selectedFilter
    })
    this.loadStatisticsList()
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadStatisticsList()
  },

  onStyleStatsClick() {
    wx.navigateTo({
      url: '/pages/statistics/style?timeFilter=' + encodeURIComponent(this.data.timeFilter)
    })
  },

  onFactoryStatsClick() {
    wx.navigateTo({
      url: '/pages/statistics/factory?timeFilter=' + encodeURIComponent(this.data.timeFilter)
    })
  },

  onTotalIssueClick() {
    wx.navigateTo({
      url: `/pages/issue/all?timeFilter=${encodeURIComponent(this.data.timeFilter)}`
    })
  },

  onTotalReturnClick() {
    wx.navigateTo({
      url: `/pages/return/index?timeFilter=${encodeURIComponent(this.data.timeFilter)}`
    })
  },

  onReturnedIssueClick() {
    wx.navigateTo({
      url: `/pages/issue/all?timeFilter=${encodeURIComponent(this.data.timeFilter)}&statusFilter=${encodeURIComponent('部分回货')}`
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
