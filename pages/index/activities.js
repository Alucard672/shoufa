// pages/index/activities.js
import { formatDate, getTimeRange } from '../../utils/calc.js'

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

      const db = wx.cloud.database()
      const _ = db.command
      
      // 先进行数据库层面的基础筛选（类型和日期），减少加载的数据量
      let issueQuery = db.collection('issue_orders').where({ deleted: _.eq(false) })
      let returnQuery = db.collection('return_orders').where({ deleted: _.eq(false) })
      
      // 日期筛选（数据库层面）
      if (this.data.timeFilter !== 'all' && this.data.startDate && this.data.endDate) {
        issueQuery = issueQuery.where({
          issueDate: _.gte(this.data.startDate).and(_.lte(this.data.endDate))
        })
        returnQuery = returnQuery.where({
          returnDate: _.gte(this.data.startDate).and(_.lte(this.data.endDate))
        })
      }
      
      // 根据类型筛选加载数据
      let issueOrders = { data: [] }
      let returnOrders = { data: [] }
      
      if (this.data.typeFilter !== 'return') {
        issueOrders = await issueQuery.orderBy('issueDate', 'desc').get()
      }
      
      if (this.data.typeFilter !== 'issue') {
        returnOrders = await returnQuery.orderBy('returnDate', 'desc').get()
      }
      
      // 合并数据并添加类型标识
      let allActivities = []
      
      // 处理发料单
      issueOrders.data.forEach(order => {
        allActivities.push({
          ...order,
          type: 'issue',
          date: order.issueDate,
          dateFormatted: formatDate(order.issueDate)
        })
      })
      
      // 处理回货单
      returnOrders.data.forEach(order => {
        allActivities.push({
          ...order,
          type: 'return',
          date: order.returnDate,
          dateFormatted: formatDate(order.returnDate)
        })
      })
      
      // 批量查询工厂和款号信息（只查询一次，不是逐个查询）
      const factoryIds = [...new Set(allActivities.map(a => a.factoryId).filter(Boolean))]
      const styleIds = [...new Set(allActivities.map(a => a.styleId).filter(Boolean))]
      const issueIds = [...new Set(allActivities.filter(a => a.type === 'return').map(a => a.issueId).filter(Boolean))]
      
      // 批量查询发料单信息（用于回货单关联）
      const issueOrdersMap = new Map()
      if (issueIds.length > 0) {
        // 批量查询发料单（使用 Promise.all 并行查询，但只查询一次）
        const issuePromises = issueIds.map(id => 
          db.collection('issue_orders').doc(id).get().catch(() => ({ data: null }))
        )
        const issueResults = await Promise.all(issuePromises)
        issueResults.forEach((result, index) => {
          if (result.data) {
            issueOrdersMap.set(issueIds[index], result.data)
            // 将发料单的 factoryId 和 styleId 也加入查询列表
            if (result.data.factoryId && factoryIds.indexOf(result.data.factoryId) < 0) {
              factoryIds.push(result.data.factoryId)
            }
            if (result.data.styleId && styleIds.indexOf(result.data.styleId) < 0) {
              styleIds.push(result.data.styleId)
            }
          }
        })
      }
      
      // 批量查询工厂信息（并行查询，但只查询一次）
      const factoriesMap = new Map()
      if (factoryIds.length > 0) {
        const factoriesPromises = factoryIds.map(id => 
          db.collection('factories').doc(id).get().catch(() => ({ data: null }))
        )
        const factoriesResults = await Promise.all(factoriesPromises)
        factoriesResults.forEach((result, index) => {
          if (result.data) {
            factoriesMap.set(factoryIds[index], result.data)
          }
        })
      }
      
      // 批量查询款号信息（并行查询，但只查询一次）
      const stylesMap = new Map()
      if (styleIds.length > 0) {
        const stylesPromises = styleIds.map(id => 
          db.collection('styles').doc(id).get().catch(() => ({ data: null }))
        )
        const stylesResults = await Promise.all(stylesPromises)
        stylesResults.forEach((result, index) => {
          if (result.data) {
            stylesMap.set(styleIds[index], result.data)
          }
        })
      }
      
      // 为所有发料单批量加载回货进度信息（使用批量查询，避免 N+1 查询）
      const issueOrderIds = allActivities.filter(a => a.type === 'issue').map(a => a._id)
      const returnOrdersMap = new Map()
      if (issueOrderIds.length > 0) {
        // 批量查询所有相关的回货单（一次查询，而不是 N 次）
        const allReturnOrders = await db.collection('return_orders')
          .where({
            issueId: _.in(issueOrderIds),
            deleted: _.eq(false)
          })
          .get()
        
        // 按 issueId 分组
        allReturnOrders.data.forEach(returnOrder => {
          const issueId = returnOrder.issueId
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
          const factory = factoriesMap.get(activity.factoryId)
          const style = stylesMap.get(activity.styleId)
          const returnOrders = returnOrdersMap.get(activity._id) || []
          let totalReturnYarn = 0
          returnOrders.forEach(ro => {
            totalReturnYarn += ro.actualYarnUsage || 0
          })
          const progressPercent = activity.issueWeight > 0 
            ? (totalReturnYarn / activity.issueWeight * 100) 
            : 0
          
          return {
            ...activity,
            factoryName: factory?.name || '未知工厂',
            styleName: style?.styleName || style?.name || '未知款号',
            styleCode: style?.styleCode || '',
            styleImageUrl: style?.imageUrl || '',
            color: activity.color || '',
            issueWeightFormatted: (activity.issueWeight || 0).toFixed(2),
            dateFormatted: formatDate(activity.issueDate),
            totalReturnYarn: totalReturnYarn,
            totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
            progressPercent: Math.min(progressPercent, 100)
          }
        } else {
          // 回货单
          const issueOrder = issueOrdersMap.get(activity.issueId)
          // 如果回货单没有 factoryId，从关联的发料单获取
          const factoryId = activity.factoryId || issueOrder?.factoryId
          const factory = factoryId ? factoriesMap.get(factoryId) : null
          // 如果回货单没有 styleId，从关联的发料单获取
          const styleId = activity.styleId || issueOrder?.styleId
          const styleForReturn = styleId ? stylesMap.get(styleId) : null
          
          const styleCode = styleForReturn?.styleCode || ''
          const styleName = styleForReturn?.styleName || styleForReturn?.name || '未知款号'
          const processingFee = activity.processingFee || 0
          const returnPieces = activity.returnPieces || 0
          const returnQuantity = activity.returnQuantity || 0
          const actualYarnUsage = activity.actualYarnUsage || 0
          
          return {
            ...activity,
            factoryName: factory?.name || '未知工厂',
            styleName: styleName,
            styleCode: styleCode,
            styleImageUrl: styleForReturn?.imageUrl || '',
            issueNo: issueOrder?.issueNo || '未知',
            color: activity.color || '',
            size: activity.size || '',
            returnQuantity: returnQuantity,
            returnPieces: returnPieces,
            returnQuantityFormatted: `${returnQuantity}打 ${returnPieces}件`,
            dateFormatted: formatDate(activity.returnDate),
            actualYarnUsageFormatted: actualYarnUsage.toFixed(2),
            processingFeeFormatted: processingFee.toFixed(2)
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
          totalIssueWeight += item.issueWeight || 0
          issueCount++
        } else {
          totalReturnPieces += item.returnPieces || 0
          totalProcessingFee += item.processingFee || 0
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

