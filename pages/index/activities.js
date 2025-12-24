// pages/index/activities.js
import { query, queryByIds } from '../../utils/db.js'
import { formatDate, getTimeRange } from '../../utils/calc.js'
const app = getApp()

Page({
  data: {
    activities: [],
    loading: false,
    // 统计数据
    totalIssueWeight: 0,
    totalIssueWeightFormatted: '0.0',
    totalReturnPieces: 0,
    totalProcessingFee: 0,
    totalProcessingFeeFormatted: '0',
    issueCount: 0,
    returnCount: 0,
    // 筛选条件
    typeFilter: 'all', // all, issue, return
    typeFilterIndex: 0,
    timeFilter: 'all',
    timeFilterIndex: 0,
    searchKeyword: '',
    startDate: null,
    endDate: null,
    startDateStr: '',
    endDateStr: ''
  },

  onLoad() {
    Promise.all([
      this.loadStatistics(),
      this.loadAllActivities()
    ])
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadStatistics(),
      this.loadAllActivities()
    ]).then(() => {
      wx.stopPullDownRefresh()
    })
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

  // 操作类型筛选变化
  onTypeFilterChange(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const filters = ['all', 'issue', 'return']
    const filter = filters[index] || 'all'
    this.setData({
      typeFilter: filter,
      typeFilterIndex: index
    }, () => {
      this.loadStatistics()
      this.loadAllActivities()
    })
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    // 实时搜索
    this.loadAllActivities()
  },

  // 搜索（确认时）
  onSearch() {
    this.loadStatistics()
    this.loadAllActivities()
  },


  // 时间筛选变化
  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index)
    const filters = ['all', 'today', 'week', 'month']
    const filter = filters[index] || 'all'

    console.log('时间筛选变化:', { index, filter })

    let startDate = null
    let endDate = null
    let startDateStr = ''
    let endDateStr = ''

    if (filter !== 'all') {
      const timeRange = getTimeRange(filter)
      startDate = timeRange.startDate
      endDate = timeRange.endDate
      // 格式化日期字符串用于 picker 显示
      if (startDate) {
        startDateStr = formatDate(startDate).replace(/\//g, '-')
      }
      if (endDate) {
        endDateStr = formatDate(endDate).replace(/\//g, '-')
      }
      console.log('时间范围:', { startDate, endDate, startDateStr, endDateStr })
    }

    this.setData({
      timeFilter: filter,
      timeFilterIndex: index,
      startDate: startDate,
      endDate: endDate,
      startDateStr: startDateStr,
      endDateStr: endDateStr
    }, () => {
      this.loadAllActivities()
    })
  },

  // 日期范围选择
  onStartDateChange(e) {
    const dateStr = e.detail.value // 格式: YYYY-MM-DD
    const date = new Date(dateStr)
    date.setHours(0, 0, 0, 0)
    this.setData({
      startDate: date,
      startDateStr: dateStr,
      timeFilter: 'custom',
      timeFilterIndex: -1
    }, () => {
      this.loadAllActivities()
    })
  },

  onEndDateChange(e) {
    const dateStr = e.detail.value // 格式: YYYY-MM-DD
    const date = new Date(dateStr)
    date.setHours(23, 59, 59, 999)
    this.setData({
      endDate: date,
      endDateStr: dateStr,
      timeFilter: 'custom',
      timeFilterIndex: -1
    }, () => {
      this.loadAllActivities()
    })
  },


  // 清除筛选
  onClearFilters() {
    this.setData({
      typeFilter: 'all',
      typeFilterIndex: 0,
      timeFilter: 'all',
      timeFilterIndex: 0,
      searchKeyword: '',
      startDate: null,
      endDate: null,
      startDateStr: '',
      endDateStr: ''
    }, () => {
      this.loadStatistics()
      this.loadAllActivities()
    })
  },

  // 加载统计数据（基于筛选后的活动数据计算）
  async loadStatistics() {
    try {
      // 统计数据应该基于筛选后的活动数据计算
      // 这里先设置默认值，实际统计在 loadAllActivities 完成后更新
      this.setData({
        totalIssueWeight: 0,
        totalIssueWeightFormatted: '0.0',
        totalReturnPieces: 0,
        totalProcessingFee: 0,
        totalProcessingFeeFormatted: '0',
        issueCount: 0,
        returnCount: 0
      })
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  async loadAllActivities() {
    try {
      this.setData({
        loading: true
      })

      // 构建查询条件
      let issueWhere = {}
      let returnWhere = {}

      // 日期筛选（数据库层面）
      if (this.data.timeFilter !== 'all' && this.data.startDate && this.data.endDate) {
        issueWhere.issue_date = {
          gte: this.data.startDate,
          lte: this.data.endDate
        }
        returnWhere.return_date = {
          gte: this.data.startDate,
          lte: this.data.endDate
        }
      }

      // 根据类型筛选加载数据
      let issueOrders = { data: [] }
      let returnOrders = { data: [] }

      if (this.data.typeFilter !== 'return') {
        const issueRes = await query('issue_orders', issueWhere, {
          excludeDeleted: true,
          orderBy: { field: 'issue_date', direction: 'DESC' }
        })
        issueOrders = { data: issueRes.data || [] }
      }

      if (this.data.typeFilter !== 'issue') {
        const returnRes = await query('return_orders', returnWhere, {
          excludeDeleted: true,
          orderBy: { field: 'return_date', direction: 'DESC' }
        })
        returnOrders = { data: returnRes.data || [] }
      }

      // 合并数据并添加类型标识
      let allActivities = []

      // 处理发料单
      issueOrders.data.forEach(order => {
        allActivities.push({
          ...order,
          type: 'issue',
          date: order.issueDate || order.issue_date,
          dateFormatted: formatDate(order.issueDate || order.issue_date)
        })
      })

      // 处理回货单
      returnOrders.data.forEach(order => {
        allActivities.push({
          ...order,
          type: 'return',
          date: order.returnDate || order.return_date,
          dateFormatted: formatDate(order.returnDate || order.return_date)
        })
      })

      // 批量查询工厂和款号信息（只查询一次，不是逐个查询）
      const factoryIds = [...new Set(allActivities.map(a => a.factoryId || a.factory_id).filter(Boolean))]
      const styleIds = [...new Set(allActivities.map(a => a.styleId || a.style_id).filter(Boolean))]
      const issueIds = [...new Set(allActivities.filter(a => a.type === 'return').map(a => a.issueId || a.issue_id).filter(Boolean))]

      // 批量查询发料单信息（用于回货单关联）
      const issueOrdersMap = new Map()
      if (issueIds.length > 0) {
        const issueRes = await queryByIds('issue_orders', issueIds)
        issueRes.data.forEach(issueOrder => {
          const issueId = issueOrder.id || issueOrder._id
          issueOrdersMap.set(issueId, issueOrder)
          // 将发料单的 factoryId 和 styleId 也加入查询列表
          const factoryId = issueOrder.factoryId || issueOrder.factory_id
          const styleId = issueOrder.styleId || issueOrder.style_id
          if (factoryId && factoryIds.indexOf(factoryId) < 0) {
            factoryIds.push(factoryId)
          }
          if (styleId && styleIds.indexOf(styleId) < 0) {
            styleIds.push(styleId)
          }
        })
      }

      // 批量查询工厂信息
      const factoriesMap = new Map()
      if (factoryIds.length > 0) {
        const factoriesRes = await queryByIds('factories', factoryIds)
        factoriesRes.data.forEach(factory => {
          factoriesMap.set(factory.id || factory._id, factory)
        })
      }

      // 批量查询款号信息
      const stylesMap = new Map()
      if (styleIds.length > 0) {
        const stylesRes = await queryByIds('styles', styleIds)
        stylesRes.data.forEach(style => {
          stylesMap.set(style.id || style._id, style)
        })
      }

      // 为所有发料单批量加载回货进度信息（使用批量查询，避免 N+1 查询）
      const issueOrderIds = allActivities.filter(a => a.type === 'issue').map(a => a.id || a._id)
      const returnOrdersMap = new Map()
      if (issueOrderIds.length > 0) {
        // 批量查询所有相关的回货单（一次查询，而不是 N 次）
        const allReturnOrdersRes = await query('return_orders', {
          issue_id: issueOrderIds
        }, {
          excludeDeleted: true
        })

        // 按 issueId 分组
        allReturnOrdersRes.data.forEach(returnOrder => {
          const issueId = returnOrder.issueId || returnOrder.issue_id
          if (!returnOrdersMap.has(issueId)) {
            returnOrdersMap.set(issueId, [])
          }
          returnOrdersMap.get(issueId).push(returnOrder)
        })

        // 确保所有发料单都有对应的数组（即使为空）
        issueOrderIds.forEach(issueId => {
          if (!returnOrdersMap.has(issueId)) {
            returnOrdersMap.set(issueId, [])
          }
        })
      }

      // 在内存中关联数据
      const activitiesWithDetails = allActivities.map(activity => {
        if (activity.type === 'issue') {
          // 发料单
          const factoryId = activity.factoryId || activity.factory_id
          const styleId = activity.styleId || activity.style_id
          const activityId = activity.id || activity._id
          
          const factory = factoriesMap.get(factoryId)
          const style = stylesMap.get(styleId)
          const returnOrders = returnOrdersMap.get(activityId) || []
          let totalReturnYarn = 0
          returnOrders.forEach(ro => {
            totalReturnYarn += ro.actualYarnUsage || ro.actual_yarn_usage || 0
          })
          const issueWeight = activity.issueWeight || activity.issue_weight || 0
          const progressPercent = issueWeight > 0
            ? (totalReturnYarn / issueWeight * 100)
            : 0

          const styleCode = style?.styleCode || style?.style_code || ''
          const styleCodeStr = styleCode ? `[${styleCode}] ` : ''
          return {
            ...activity,
            _id: activity._id || activity.id,
            factoryName: factory?.name || '未知工厂',
            styleName: style?.styleName || style?.style_name || style?.name || '未知款号',
            styleCode: styleCode,
            styleImageUrl: style?.imageUrl || style?.image_url || '',
            color: activity.color || '',
            issueWeightFormatted: issueWeight.toFixed(2),
            dateFormatted: formatDate(activity.issueDate || activity.issue_date),
            totalReturnYarn: totalReturnYarn,
            totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
            progressPercent: Math.min(progressPercent, 100),
            styleDisplay: `${styleCodeStr}${style?.styleName || style?.style_name || style?.name || '未知款号'}`,
            actionInfo: `${issueWeight.toFixed(2)}kg · ${activity.color || '未设置'}`
          }
        } else {
          // 回货单
          const issueId = activity.issueId || activity.issue_id
          const issueOrder = issueOrdersMap.get(issueId)
          // 如果回货单没有 factoryId，从关联的发料单获取
          const factoryId = activity.factoryId || activity.factory_id || issueOrder?.factoryId || issueOrder?.factory_id
          const factory = factoryId ? factoriesMap.get(factoryId) : null
          // 如果回货单没有 styleId，从关联的发料单获取
          const styleId = activity.styleId || activity.style_id || issueOrder?.styleId || issueOrder?.style_id
          const styleForReturn = styleId ? stylesMap.get(styleId) : null

          const styleCode = styleForReturn?.styleCode || styleForReturn?.style_code || ''
          const styleName = styleForReturn?.styleName || styleForReturn?.style_name || styleForReturn?.name || '未知款号'
          const processingFee = activity.processingFee || activity.processing_fee || 0
          const returnPieces = activity.returnPieces || activity.return_pieces || 0
          const returnQuantity = activity.returnQuantity || activity.return_quantity || 0
          const actualYarnUsage = activity.actualYarnUsage || activity.actual_yarn_usage || 0

          const styleCodeStr = styleCode ? `[${styleCode}] ` : ''
          return {
            ...activity,
            _id: activity._id || activity.id,
            factoryName: factory?.name || '未知工厂',
            styleName: styleName,
            styleCode: styleCode,
            styleImageUrl: styleForReturn?.imageUrl || styleForReturn?.image_url || '',
            issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
            color: activity.color || '',
            size: activity.size || '',
            returnQuantity: returnQuantity,
            returnPieces: returnPieces,
            returnQuantityFormatted: `${returnQuantity}打 ${returnPieces}件`,
            dateFormatted: formatDate(activity.returnDate || activity.return_date),
            actualYarnUsageFormatted: actualYarnUsage.toFixed(2),
            processingFeeFormatted: processingFee.toFixed(2),
            styleDisplay: `${styleCodeStr}${styleName}`,
            actionInfo: `${returnQuantity}打 ${returnPieces}件 · ${activity.color || '未设置'}`
          }
        }
      })

      // 按时间排序
      activitiesWithDetails.sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date)
        const dateB = b.date instanceof Date ? b.date : new Date(b.date)
        return dateB.getTime() - dateA.getTime()
      })

      // 日期筛选已在数据库层面完成，这里直接使用
      let filteredData = activitiesWithDetails

      // 搜索筛选（模糊查询单号、加工厂、款号）
      if (this.data.searchKeyword && this.data.searchKeyword.trim()) {
        const keyword = this.data.searchKeyword.trim().toLowerCase()
        filteredData = filteredData.filter(item => {
          // 搜索单号
          const searchNo = item.type === 'issue' ? item.issueNo : item.returnNo
          const noMatch = searchNo && searchNo.toLowerCase().includes(keyword)

          // 搜索工厂名称
          const factoryMatch = item.factoryName && item.factoryName.toLowerCase().includes(keyword)

          // 搜索款号名称或款号代码
          const styleNameMatch = item.styleName && item.styleName.toLowerCase().includes(keyword)
          const styleCodeMatch = item.styleCode && item.styleCode.toLowerCase().includes(keyword)

          return noMatch || factoryMatch || styleNameMatch || styleCodeMatch
        })
      }

      // 基于筛选后的数据计算统计数据
      let totalIssueWeight = 0
      let totalReturnPieces = 0
      let totalProcessingFee = 0
      let issueCount = 0
      let returnCount = 0

      filteredData.forEach(item => {
        if (item.type === 'issue') {
          totalIssueWeight += item.issueWeight || item.issue_weight || 0
          issueCount++
        } else {
          totalReturnPieces += item.returnPieces || item.return_pieces || 0
          totalProcessingFee += item.processingFee || item.processing_fee || 0
          returnCount++
        }
      })

      // 格式化统计数据
      const totalIssueWeightFormatted = totalIssueWeight.toFixed(1)
      const totalProcessingFeeFormatted = totalProcessingFee.toFixed(0)

      console.log('统计数据:', {
        totalIssueWeight,
        totalIssueWeightFormatted,
        totalReturnPieces,
        totalProcessingFee,
        totalProcessingFeeFormatted,
        issueCount,
        returnCount,
        filteredDataLength: filteredData.length
      })

      this.setData({
        activities: filteredData,
        totalIssueWeight: totalIssueWeight,
        totalIssueWeightFormatted: totalIssueWeightFormatted,
        totalReturnPieces: totalReturnPieces,
        totalProcessingFee: totalProcessingFee,
        totalProcessingFeeFormatted: totalProcessingFeeFormatted,
        issueCount: issueCount,
        returnCount: returnCount,
        loading: false
      })
    } catch (error) {
      console.error('加载动态失败:', error)
      this.setData({
        loading: false
      })
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  }
})

