// pages/issue/index.js
import { getIssueOrders, calculateIssueProgress, getReturnOrdersByIssueId, update } from '../../utils/db.js'
import { getTimeRange, formatDate, formatWeight, formatQuantity } from '../../utils/calc.js'
import { query, queryByIds } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    totalIssueWeight: 0,
    totalIssueCount: 0,
    timeFilter: 'all',
    timeFilterIndex: 0, // 添加索引用于组件绑定
    statusFilter: 'all',
    statusFilterIndex: 0, // 添加索引用于组件绑定
    searchKeyword: '',
    issueOrders: [],
    filteredOrders: [],
    displayOrders: [], // 用于分页显示的数据
    pageSize: 10 // 每页显示数量
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

  // 从已有数据计算回货进度，避免重复查询
  async calculateProgressFromData(issueOrder, style, returnOrdersList) {
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0

    let totalReturnPieces = 0
    let totalReturnYarn = 0
    let totalReturnQuantity = 0

    returnOrdersList.forEach(order => {
      totalReturnPieces += order.returnPieces || order.return_pieces || 0
      totalReturnYarn += order.actualYarnUsage || order.actual_yarn_usage || 0
      totalReturnQuantity += order.returnQuantity || order.return_quantity || 0
    })

    const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
    const remainingYarn = issueWeight - totalReturnYarn
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
      totalReturnPieces: Math.floor(totalReturnPieces),
      totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
      totalReturnYarn,
      totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
      totalReturnQuantity,
      totalReturnQuantityFormatted: totalReturnQuantity.toFixed(1),
      remainingYarn,
      remainingYarnFormatted: remainingYarn.toFixed(2),
      remainingPieces: Math.floor(remainingPieces),
      remainingPiecesFormatted: formatQuantity(remainingPieces),
      remainingQuantity,
      remainingQuantityFormatted: remainingQuantity.toFixed(1),
      status
    }
  },

  async loadStatistics() {
    const where = {}
    
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        where.issueDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    const result = await query('issue_orders', where, {
      excludeDeleted: true
    })

    let totalWeight = 0
    result.data.forEach(order => {
      totalWeight += order.issueWeight || order.issue_weight || 0
    })

    this.setData({
      totalIssueWeight: totalWeight,
      totalIssueWeightFormatted: totalWeight.toFixed(2),
      totalIssueCount: result.data.length
    })
  },

  async loadIssueOrders() {
    console.log('开始加载发料单，筛选条件:', {
      timeFilter: this.data.timeFilter,
      statusFilter: this.data.statusFilter,
      searchKeyword: this.data.searchKeyword
    })

    const where = {}

    // 1. 时间筛选
    if (this.data.timeFilter !== 'all') {
      const timeRange = getTimeRange(this.data.timeFilter)
      if (timeRange.startDate && timeRange.endDate) {
        where.issueDate = {
          gte: timeRange.startDate,
          lte: timeRange.endDate
        }
      }
    }

    // 2. 搜索（注意：MySQL需要支持LIKE查询，这里先简单处理）
    // 如果搜索关键词存在，需要在客户端过滤
    const ordersRes = await query('issue_orders', where, {
      excludeDeleted: true,
      orderBy: { field: 'issueDate', direction: 'DESC' }
    })

    // 客户端过滤搜索关键词
    let filteredData = ordersRes.data || []
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredData = filteredData.filter(order => {
        const issueNo = (order.issueNo || order.issue_no || '').toLowerCase()
        const factoryName = (order.factoryName || '').toLowerCase()
        return issueNo.includes(keyword) || factoryName.includes(keyword)
      })
    }

    console.log('查询到的订单数量:', filteredData.length)

    // 批量查询工厂和款号信息
    const factoryIds = [...new Set(filteredData.map(order => order.factoryId || order.factory_id).filter(Boolean))]
    const styleIds = [...new Set(filteredData.map(order => order.styleId || order.style_id).filter(Boolean))]
    const issueIds = filteredData.map(order => order._id || order.id)

    // 批量查询工厂信息
    const factoriesMap = new Map()
    if (factoryIds.length > 0) {
      const factoriesRes = await queryByIds('factories', factoryIds, { excludeDeleted: true })
      factoriesRes.data.forEach(factory => {
        const id = factory._id || factory.id
        factoriesMap.set(id, factory)
      })
    }

    // 批量查询款号信息
    const stylesMap = new Map()
    if (styleIds.length > 0) {
      const stylesRes = await queryByIds('styles', styleIds, { excludeDeleted: true })
      stylesRes.data.forEach(style => {
        const id = style._id || style.id
        stylesMap.set(id, style)
      })
    }

    // 批量查询所有回货单
    const returnOrdersMap = new Map()
    if (issueIds.length > 0) {
      // 初始化 Map
      issueIds.forEach(id => {
        returnOrdersMap.set(id, [])
      })

      // 批量查询回货单
      try {
        const _ = wx.cloud.database().command
        const allReturnOrdersRes = await query('return_orders', {
          issue_id: _.in(issueIds)
        }, {
          excludeDeleted: true
        })

        // 按 issueId 分组
        allReturnOrdersRes.data.forEach(order => {
          const issueId = order.issueId || order.issue_id
          const id = issueId.toString()
          if (returnOrdersMap.has(id)) {
            returnOrdersMap.get(id).push(order)
          }
        })
      } catch (error) {
        console.error('批量查询回货单失败:', error)
        // 回退到逐个查询
        const returnOrdersPromises = issueIds.map(issueId =>
          getReturnOrdersByIssueId(issueId).catch(() => ({ data: [] }))
        )
        const returnOrdersResults = await Promise.all(returnOrdersPromises)
        returnOrdersResults.forEach((result, index) => {
          const id = issueIds[index].toString()
          returnOrdersMap.set(id, result.data || [])
        })
      }
    }

    // 关联查询工厂和款号信息，并计算回货进度
    const ordersWithDetails = await Promise.all(
      filteredData.map(async (order) => {
        try {
          const factoryId = order.factoryId || order.factory_id
          const styleId = order.styleId || order.style_id
          const orderId = order._id || order.id
          
          const factory = factoriesMap.get(factoryId)
          const style = stylesMap.get(styleId)
          const returnOrdersList = returnOrdersMap.get(orderId.toString()) || []

          // 计算回货进度（使用已查询的数据）
          const progress = await this.calculateProgressFromData(order, style, returnOrdersList)

          // 格式化回货单列表，按日期倒序排列，并添加序号
          const totalReturnCount = returnOrdersList.length

          const sortedReturnOrders = returnOrdersList
            .slice() // 创建副本避免修改原数组
            .sort((a, b) => {
              let dateA = a.returnDate || a.return_date
              let dateB = b.returnDate || b.return_date

              // 转换为 Date 对象
              if (!(dateA instanceof Date)) {
                dateA = new Date(dateA)
              }
              if (!(dateB instanceof Date)) {
                dateB = new Date(dateB)
              }

              // 确保日期有效
              const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime()
              const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime()

              return timeB - timeA // 倒序：最新的在前
            })
            .map((ro, index) => {
              // 序号从总数开始递减，例如：如果有3条记录，序号为 3, 2, 1
              // 确保序号是数字类型，且大于0
              const returnOrderIndex = totalReturnCount > 0 ? (totalReturnCount - index) : 0
              const returnPieces = ro.returnPieces || ro.return_pieces || 0
              const returnDate = ro.returnDate || ro.return_date
              const actualYarnUsage = ro.actualYarnUsage || ro.actual_yarn_usage || 0
              return {
                ...ro,
                returnPieces: Math.floor(returnPieces),
                quantityFormatted: formatQuantity(returnPieces),
                returnDateFormatted: formatDate(returnDate),
                actualYarnUsageFormatted: actualYarnUsage.toFixed(2),
                returnOrderIndex: returnOrderIndex,
                color: ro.color || '',
                size: ro.size || ''
              }
            })

          const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
          const issueWeight = order.issueWeight || order.issue_weight || 0
          const issueDate = order.issueDate || order.issue_date

          // 计算发料件数：发料重量(kg) / (单件用量(g) / 1000)
          const issuePieces = yarnUsagePerPiece > 0
            ? Math.floor((issueWeight * 1000) / yarnUsagePerPiece)
            : 0

          // 判断回货件数是否大于发料件数
          const canComplete = progress.totalReturnPieces > issuePieces && order.status !== '已完成'

          return {
            ...order,
            factoryName: factory?.name || '未知工厂',
            styleName: style?.styleName || style?.style_name || '未知款号',
            styleCode: style?.styleCode || style?.style_code || '',
            styleImageUrl: style?.imageUrl || style?.image_url || '',
            color: order.color || '',
            size: order.size || '',
            yarnUsagePerPiece: yarnUsagePerPiece,
            progress,
            returnOrders: sortedReturnOrders,
            issueDateFormatted: formatDate(issueDate),
            issueWeightFormatted: formatWeight(issueWeight),
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

    // 默认只显示前 pageSize 条
    const displayCount = this.data.pageSize || 10
    const displayOrders = finalOrders.slice(0, displayCount)

    this.setData({
      issueOrders: ordersWithDetails,
      filteredOrders: finalOrders,
      displayOrders: displayOrders
    })
  },

  onTimeFilterChange(e) {
    console.log('时间筛选变化:', e)
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', 'today', 'week', 'month']
    const selectedFilter = filters[index] || 'all'
    console.log('选中的筛选:', selectedFilter, '索引:', index)
    this.setData({
      timeFilter: selectedFilter,
      timeFilterIndex: index
    })
    this.loadIssueOrders()
  },

  onStatusFilterChange(e) {
    console.log('状态筛选变化:', e)
    const index = parseInt(e.detail.index) || 0
    const filters = ['all', '未回货', '部分回货', '已回货', '已完成']
    const selectedFilter = filters[index] || 'all'
    console.log('选中的筛选:', selectedFilter, '索引:', index)
    this.setData({
      statusFilter: selectedFilter,
      statusFilterIndex: index
    })
    this.loadIssueOrders()
  },

  onLoadMore() {
    const currentCount = this.data.displayOrders.length
    const totalCount = this.data.filteredOrders.length
    const pageSize = this.data.pageSize || 10

    // 每次加载更多时，增加 pageSize 条
    const newCount = Math.min(currentCount + pageSize, totalCount)
    const displayOrders = this.data.filteredOrders.slice(0, newCount)

    this.setData({
      displayOrders: displayOrders
    })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadIssueOrders()
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/pages/issue/create'
    })
  },

  navigateToReturn(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const issueId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/return/create?issueId=${issueId}`
    })
  },

  async onCompleteIssue(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    
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

            // 将_id转换为id（如果是字符串，尝试转换为数字）
            const id = typeof issueId === 'string' && /^\d+$/.test(issueId) ? parseInt(issueId) : issueId
            await update('issue_orders', {
              status: '已完成'
            }, {
              id: id
            })

            wx.hideLoading()
            wx.showToast({
              title: '标记成功',
              icon: 'success'
            })

            // 刷新数据
            this.loadData()
          } catch (error) {
            wx.hideLoading()
            console.error('标记失败:', error)
            wx.showToast({
              title: '标记失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  formatDateForQuery(date) {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})

