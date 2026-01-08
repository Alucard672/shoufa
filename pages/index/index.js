// pages/index/index.js
import { formatDate, formatDateTime, formatQuantity } from '../../utils/calc.js'
import { count, query, queryByIds } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
import { normalizeImageUrl, batchGetImageUrls } from '../../utils/image.js'
import { pickNumber } from '../../utils/summary.js'
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    factoryCount: 0,
    styleCount: 0,
    unpaidAmount: 0,
    recentActivities: [],
    displayActivities: [] // 用于显示的数据（默认10条）
  },

  // 图片加载失败：降级为占位图
  onStyleImageError(e) {
    const index = e.currentTarget.dataset.index
    if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
      const i = typeof index === 'number' ? index : parseInt(index, 10)
      if (!Number.isNaN(i) && this.data.displayActivities && this.data.displayActivities[i]) {
        this.setData({ [`displayActivities[${i}].styleImageUrl`]: '' })
      }
    }
  },

  onLoad() {
    // 检查登录状态，如果未登录则跳转到登录页
    if (!checkLogin({ showModal: false })) {
      // 检查是否有邀请码，如果有则跳转到登录页
      const inviteTenantId = wx.getStorageSync('inviteTenantId')
      if (inviteTenantId) {
        wx.redirectTo({
          url: '/pages/login/index'
        })
      } else {
        wx.switchTab({
          url: '/pages/mine/index'
        })
      }
      return
    }
    this.loadData()
  },

  onShow() {
    this.loadData()
  },


  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    // 可以在这里实现加载更多最近动态
  },

  async loadData() {
    try {
      // 加载统计数据
      await Promise.all([
        this.loadFactoryCount(),
        this.loadStyleCount(),
        this.loadUnpaidAmount(),
        this.loadRecentActivities()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async loadFactoryCount() {
    const result = await count('factories', {}, {
      excludeDeleted: true
    })
    this.setData({
      factoryCount: result.total
    })
  },

  async loadStyleCount() {
    const result = await count('styles', {}, {
      excludeDeleted: true
    })
    this.setData({
      styleCount: result.total
    })
  },

  async loadUnpaidAmount() {
    // 查询所有回货单，然后在客户端过滤未结算和部分结算（兼容字段名）
    const result = await query('return_orders', {}, {
      excludeDeleted: true
    })

    // 客户端过滤：只统计未结算和部分结算的回货单，排除已作废的单据
    const unpaidOrders = result.data.filter(order => {
      // 排除已作废的单据
      if (order.voided) return false
      const status = order.settlementStatus || order.settlement_status || '未结算'
      return status === '未结算' || status === '部分结算'
    })

    let totalAmount = 0
    unpaidOrders.forEach(order => {
      const processingFee = pickNumber(order, ['processingFee', 'processing_fee'], 0)
      const settledAmount = pickNumber(order, ['settledAmount', 'settled_amount'], 0)
      totalAmount += processingFee - settledAmount
    })

    this.setData({
      unpaidAmount: totalAmount,
      unpaidAmountFormatted: totalAmount.toFixed(0)
    })
  },

  async loadRecentActivities() {
    try {
      // 1. 获取最近的发料单和回货单（各取10条以保证合并后有足够展示）
      const [issueRes, returnRes] = await Promise.all([
        query('issue_orders', {}, {
          excludeDeleted: true,
          orderBy: { field: 'createTime', direction: 'DESC' },
          limit: 10
        }),
        query('return_orders', {}, {
          excludeDeleted: true,
          orderBy: { field: 'createTime', direction: 'DESC' },
          limit: 10
        })
      ])

      // 2. 统一格式并打标（过滤掉已作废的单据）
      const activities = [
        ...issueRes.data
          .filter(item => !item.voided) // 排除已作废的发料单
          .map(item => ({
            ...item,
            type: 'issue',
            date: item.issueDate || item.issue_date,
            createTime: item.createTime || item.create_time,
            label: '发料给',
            factoryId: item.factoryId || item.factory_id,
            styleId: item.styleId || item.style_id
          })),
        ...returnRes.data
          .filter(item => !item.voided) // 排除已作废的回货单
          .map(item => ({
            ...item,
            type: 'return',
            date: item.returnDate || item.return_date,
            createTime: item.createTime || item.create_time,
            label: '回货自',
            factoryId: item.factoryId || item.factory_id,
            styleId: item.styleId || item.style_id
          }))
      ]

      if (activities.length === 0) {
        this.setData({ displayActivities: [] })
        return
      }

      // 3. 按创建时间排序并取前10条
      activities.sort((a, b) => {
        const timeA = a.createTime ? new Date(a.createTime) : new Date(a.date || 0)
        const timeB = b.createTime ? new Date(b.createTime) : new Date(b.date || 0)
        return timeB.getTime() - timeA.getTime()
      })
      const topActivities = activities.slice(0, 10)

      // 4. 批量查询工厂和款号信息
      const factoryIds = [...new Set(topActivities.map(a => a.factoryId).filter(Boolean))]
      const styleIds = [...new Set(topActivities.map(a => a.styleId).filter(Boolean))]

      const [factoriesRes, stylesRes] = await Promise.all([
        factoryIds.length ? queryByIds('factories', factoryIds) : { data: [] },
        styleIds.length ? queryByIds('styles', styleIds) : { data: [] }
      ])

      const factoriesMap = Object.fromEntries(factoriesRes.data.map(f => [f._id || f.id, f]))
      const stylesMap = Object.fromEntries(stylesRes.data.map(s => [s._id || s.id, s]))
      
      // 批量转换图片URL（cloud:// -> 临时链接）
      try {
        const imageUrls = stylesRes.data
          .map(style => normalizeImageUrl(style))
          .filter(url => url && url.startsWith('cloud://'))
        
        if (imageUrls.length > 0) {
          const imageUrlMap = await batchGetImageUrls(imageUrls)
          // 更新 stylesMap 中的图片URL
          stylesRes.data.forEach(style => {
            const id = style._id || style.id
            const originalUrl = normalizeImageUrl(style)
            if (originalUrl && imageUrlMap.has(originalUrl)) {
              stylesMap[id].styleImageUrl = imageUrlMap.get(originalUrl)
            }
          })
        }
      } catch (error) {
        console.error('批量转换图片URL失败:', error)
        // 失败不影响主流程，继续使用原 cloud:// URL
      }

      // 5. 组装显示数据
      const displayActivities = topActivities.map(item => {
        const factory = factoriesMap[item.factoryId]
        const style = stylesMap[item.styleId]
        const issueWeight = item.issueWeight || item.issue_weight || 0
        const returnPieces = item.returnPieces || item.return_pieces || 0
        const issueInfo = item.type === 'issue'
          ? `重量：${issueWeight}kg`
          : `数量：${formatQuantity(returnPieces)}`

        const styleName = style?.styleName || style?.style_name || '未知款号'
        const styleCode = (style?.styleCode || style?.style_code) ? `[${style?.styleCode || style?.style_code}] ` : ''
        return {
          ...item,
          factoryName: factory?.name || '未知工厂',
          styleName: styleName,
          styleImageUrl: normalizeImageUrl(style),
          dateFormatted: formatDateTime(item.createTime || item.create_time || item.date),
          styleDisplay: `${styleCode}${styleName}`,
          actionInfo: `${issueInfo} · ${item.color || ''}`
        }
      })

      this.setData({ displayActivities })
    } catch (error) {
      console.error('加载最近动态失败:', error)
    }
  },

  onShowMoreActivities() {
    // 跳转到新的全部动态页面
    wx.navigateTo({
      url: '/pages/index/activities'
    })
  },

  navigateToIssue() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    // 直接跳转到发料创建页面
    wx.navigateTo({
      url: '/pages/issue/create'
    })
  },

  navigateToReturn() {
    wx.switchTab({
      url: '/pages/return/index'
    })
  },

  navigateToDetail(e) {
    const { id, type } = e.currentTarget.dataset
    if (type === 'issue') {
      wx.navigateTo({
        url: `/pages/issue/detail?id=${id}`
      })
    } else if (type === 'return') {
      wx.navigateTo({
        url: `/pages/return/detail?id=${id}`
      })
    }
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

