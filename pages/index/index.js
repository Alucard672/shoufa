// pages/index/index.js
import { formatDate, formatDateTime, formatQuantity } from '../../utils/calc.js'
import { count, query, queryByIds } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
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
    // 查询未结算的回货单（使用IN查询）
    const result = await query('return_orders', {
      settlementStatus: _.in(['未结算', '部分结算'])
    }, {
      excludeDeleted: true
    })

    let totalAmount = 0
    result.data.forEach(order => {
      const processingFee = order.processingFee || order.processing_fee || 0
      const settledAmount = order.settledAmount || order.settled_amount || 0
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

      // 2. 统一格式并打标
      const activities = [
        ...issueRes.data.map(item => ({
          ...item,
          type: 'issue',
          date: item.issueDate || item.issue_date,
          createTime: item.createTime || item.create_time,
          label: '发料给',
          factoryId: item.factoryId || item.factory_id,
          styleId: item.styleId || item.style_id
        })),
        ...returnRes.data.map(item => ({
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
          styleImageUrl: (style?.imageUrl || style?.image_url || style?.image || '').trim(),
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
    // 默认跳转到发料记录
    wx.switchTab({
      url: '/pages/issue/index'
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

