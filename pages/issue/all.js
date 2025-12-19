// pages/issue/all.js
import { getIssueOrders, calculateIssueProgress, getReturnOrdersByIssueId } from '../../utils/db.js'
import { getTimeRange, formatDate, formatWeight } from '../../utils/calc.js'

Page({
  data: {
    issueOrders: [],
    filteredOrders: [],
    loading: false,
    // 筛选条件
    timeFilter: 'all',
    timeFilterIndex: 0,
    statusFilter: 'all',
    statusFilterIndex: 0,
    searchKeyword: '',
    // 统计数据
    totalIssueWeight: 0,
    totalIssueWeightFormatted: '0.0',
    totalIssueCount: 0
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

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    try {
      await Promise.all([
        this.loadStatistics(),
        this.loadIssueOrders()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async loadStatistics() {
    const db = wx.cloud.database()
    const _ = db.command
    
    // 计算累计发料总量（使用 eq(false) 代替 neq(true) 以支持索引）
    const orders = await db.collection('issue_orders')
      .where({
        deleted: _.eq(false)
      })
      .get()
    
    let totalWeight = 0
    orders.data.forEach(order => {
      totalWeight += order.issueWeight || 0
    })
    
    this.setData({
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2),
      totalIssueCount: orders.data.length
    })
  },

  async loadIssueOrders() {
    console.log('开始加载发料单，筛选条件:', {
      timeFilter: this.data.timeFilter,
      statusFilter: this.data.statusFilter,
      searchKeyword: this.data.searchKeyword
    })
    
    const db = wx.cloud.database()
    const _ = db.command
    
    let query = db.collection('issue_orders')
      .where({
        deleted: _.eq(false)
      })
    
    // 搜索
    if (this.data.searchKeyword) {
      query = query.where({
        issueNo: _.regex({
          regexp: this.data.searchKeyword,
          options: 'i'
        })
      })
    }
    
    const orders = await query.orderBy('issueDate', 'desc').get()
    console.log('查询到的订单数量:', orders.data.length)
    
    // 在内存中进行时间筛选
    let filteredData = orders.data || []
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        const filterStart = new Date(timeRange.startDate.getFullYear(), timeRange.startDate.getMonth(), timeRange.startDate.getDate(), 0, 0, 0, 0)
        const filterEnd = new Date(timeRange.endDate.getFullYear(), timeRange.endDate.getMonth(), timeRange.endDate.getDate(), 23, 59, 59, 999)
        
        filteredData = filteredData.filter(order => {
          if (!order.issueDate) return false
          
          let orderDate
          try {
            if (order.issueDate instanceof Date) {
              orderDate = order.issueDate
            } else if (typeof order.issueDate === 'string') {
              const dateStr = order.issueDate.replace(/\//g, '-')
              orderDate = new Date(dateStr)
            } else if (order.issueDate && typeof order.issueDate === 'object') {
              if (typeof order.issueDate.getTime === 'function') {
                orderDate = new Date(order.issueDate.getTime())
              } else if (order.issueDate._seconds) {
                orderDate = new Date(order.issueDate._seconds * 1000)
              } else if (typeof order.issueDate === 'number') {
                orderDate = new Date(order.issueDate)
              } else {
                orderDate = new Date(order.issueDate)
              }
            } else {
              orderDate = new Date(order.issueDate)
            }
            
            if (isNaN(orderDate.getTime())) {
              return false
            }
            
            const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())
            const filterStartOnly = new Date(filterStart.getFullYear(), filterStart.getMonth(), filterStart.getDate())
            const filterEndOnly = new Date(filterEnd.getFullYear(), filterEnd.getMonth(), filterEnd.getDate())
            
            return orderDateOnly.getTime() >= filterStartOnly.getTime() && orderDateOnly.getTime() <= filterEndOnly.getTime()
          } catch (e) {
            console.error('日期解析错误:', order.issueDate, e)
            return false
          }
        })
      }
    }
    
    // 批量查询工厂和款号信息
    const factoryIds = [...new Set(filteredData.map(order => order.factoryId).filter(Boolean))]
    const styleIds = [...new Set(filteredData.map(order => order.styleId).filter(Boolean))]
    const issueIds = filteredData.map(order => order._id)
    
    // 批量查询工厂信息
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
    
    // 批量查询款号信息
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
    
    // 批量查询所有回货单
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      issueIds.forEach(id => {
        returnOrdersMap.set(id, [])
      })
      
      try {
        const allReturnOrders = await db.collection('return_orders')
          .where({
            issueId: _.in(issueIds),
            deleted: _.eq(false)
          })
          .get()
        
        allReturnOrders.data.forEach(order => {
          const issueId = order.issueId
          if (returnOrdersMap.has(issueId)) {
            returnOrdersMap.get(issueId).push(order)
          }
        })
      } catch (error) {
        console.error('批量查询回货单失败:', error)
        const returnOrdersPromises = issueIds.map(issueId =>
          getReturnOrdersByIssueId(issueId).catch(() => ({ data: [] }))
        )
        const returnOrdersResults = await Promise.all(returnOrdersPromises)
        returnOrdersResults.forEach((result, index) => {
          returnOrdersMap.set(issueIds[index], result.data || [])
        })
      }
    }
    
    // 关联查询工厂和款号信息，并计算回货进度
    const ordersWithDetails = await Promise.all(
      filteredData.map(async (order) => {
        try {
          const factory = factoriesMap.get(order.factoryId)
          const style = stylesMap.get(order.styleId)
          const returnOrdersList = returnOrdersMap.get(order._id) || []
          
          const yarnUsagePerPiece = style?.data?.yarnUsagePerPiece || 0
          const issuePieces = order.issuePieces || 0
          
          const progress = this.calculateProgressFromData(order, style?.data, returnOrdersList)
          
          // 按回货日期排序回货单
          const sortedReturnOrders = returnOrdersList
            .map((ro, index) => ({
              ...ro,
              returnOrderIndex: index + 1,
              returnDateFormatted: formatDate(ro.returnDate),
              actualYarnUsageFormatted: (ro.actualYarnUsage || 0).toFixed(2)
            }))
            .sort((a, b) => {
              const dateA = a.returnDate instanceof Date ? a.returnDate : new Date(a.returnDate)
              const dateB = b.returnDate instanceof Date ? b.returnDate : new Date(b.returnDate)
              return dateB.getTime() - dateA.getTime()
            })
          
          const canComplete = progress.totalReturnPieces > issuePieces && order.status !== '已完成'
          
          return {
            ...order,
            factoryName: factory?.data?.name || '未知工厂',
            styleName: style?.data?.styleName || style?.data?.name || '未知款号',
            styleCode: style?.data?.styleCode || '',
            styleImageUrl: style?.data?.imageUrl || '',
            color: order.color || '',
            size: order.size || '',
            yarnUsagePerPiece: yarnUsagePerPiece,
            progress,
            returnOrders: sortedReturnOrders,
            issueDateFormatted: formatDate(order.issueDate),
            issueWeightFormatted: formatWeight(order.issueWeight),
            issuePieces,
            canComplete
          }
        } catch (error) {
          console.error('加载订单详情失败:', error)
          return {
            ...order,
            factoryName: '加载失败',
            styleName: '加载失败',
            yarnUsagePerPiece: 0,
            progress: {
              totalReturnPieces: 0,
              totalReturnYarn: 0,
              totalReturnQuantity: 0,
              remainingYarn: order.issueWeight,
              remainingPieces: 0,
              remainingQuantity: 0,
              status: order.status
            },
            returnOrders: [],
            issueDateFormatted: formatDate(order.issueDate),
            issueWeightFormatted: formatWeight(order.issueWeight),
            issuePieces: 0,
            canComplete: false
          }
        }
      })
    )
    
    // 应用状态筛选
    let finalOrders = ordersWithDetails || []
    if (this.data.statusFilter !== 'all') {
      finalOrders = ordersWithDetails.filter(order => {
        // 优先使用 order.status（数据库中的实际状态），如果是已完成则直接使用
        // 否则使用 progress.status（计算出的回货状态）
        const orderStatus = order.status === '已完成' ? '已完成' : (order.progress?.status || order.status)
        // 如果筛选的不是"已完成"，则排除已完成状态的单据
        if (this.data.statusFilter !== '已完成' && orderStatus === '已完成') {
          return false
        }
        return orderStatus === this.data.statusFilter
      })
    } else {
      // 如果选择"全部"，显示所有状态（包括已完成）
      finalOrders = ordersWithDetails
    }
    
    this.setData({
      issueOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      loading: false
    })
  },

  // 从已有数据计算回货进度
  calculateProgressFromData(issueOrder, style, returnOrdersList) {
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || 0

    let totalReturnPieces = 0
    let totalReturnYarn = 0
    let totalReturnQuantity = 0

    returnOrdersList.forEach(order => {
      totalReturnPieces += order.returnPieces || 0
      totalReturnYarn += order.actualYarnUsage || 0
      totalReturnQuantity += order.returnQuantity || 0
    })

    const remainingYarn = issueOrder.issueWeight - totalReturnYarn
    const remainingPieces = yarnUsagePerPiece > 0 
      ? Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
      : 0
    const remainingQuantity = remainingPieces / 12

    // 判断状态
    let status = '未回货'
    if (totalReturnYarn > 0) {
      if (remainingYarn <= 0.01) {
        status = '已回货'
      } else {
        status = '部分回货'
      }
    }

    // 如果订单状态是已完成，使用已完成状态
    if (issueOrder.status === '已完成') {
      status = '已完成'
    }

    return {
      totalReturnPieces,
      totalReturnYarn,
      totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
      totalReturnQuantity,
      totalReturnQuantityFormatted: totalReturnQuantity.toFixed(1),
      remainingYarn,
      remainingYarnFormatted: remainingYarn.toFixed(2),
      remainingPieces,
      remainingQuantity,
      remainingQuantityFormatted: remainingQuantity.toFixed(1),
      status
    }
  },

  onTimeFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      timeFilter: selectedFilter,
      timeFilterIndex: index,
      loading: true
    })
    this.loadIssueOrders()
  },

  onStatusFilterChange(e) {
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货', '已完成']
    const selectedFilter = filters[index] || 'all'
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index,
      loading: true
    })
    this.loadIssueOrders()
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value,
      loading: true
    })
    this.loadIssueOrders()
  },

  navigateToReturn(e) {
    const issueId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/return/create?issueId=${issueId}`
    })
  },

  async onCompleteIssue(e) {
    const issueId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认完成',
      content: '确定要将此发料单标记为已完成吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: '处理中...'
            })
            
            const db = wx.cloud.database()
            await db.collection('issue_orders').doc(issueId).update({
              data: {
                status: '已完成',
                updateTime: db.serverDate()
              }
            })
            
            wx.hideLoading()
            wx.showToast({
              title: '标记成功',
              icon: 'success'
            })
            
            // 重新加载数据
            this.loadIssueOrders()
          } catch (error) {
            console.error('标记完成失败:', error)
            wx.hideLoading()
            wx.showToast({
              title: '标记失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

