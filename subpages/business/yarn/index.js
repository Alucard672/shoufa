// pages/yarn/index.js
import { query } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    yarnList: [],
    searchKeyword: ''
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadYarnList()
  },

  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    this.loadYarnList()
  },

  onPullDownRefresh() {
    this.loadYarnList().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadYarnList() {
    try {
      const whereClause = {}

      if (this.data.searchKeyword) {
        whereClause.yarn_name = this.data.searchKeyword
      }

      const result = await query('yarn_inventory', whereClause, {
        excludeDeleted: true,
        orderBy: { field: 'createTime', direction: 'DESC' }
      })

      // 统一字段名格式，兼容 snake_case 和 camelCase
      const yarnList = (result.data || []).map(item => ({
        ...item,
        yarnName: item.yarnName || item.yarn_name || '',
        currentStock: item.currentStock !== undefined ? item.currentStock : (item.current_stock !== undefined ? item.current_stock : 0)
      }))

      this.setData({
        yarnList: yarnList
      })
    } catch (error) {
      console.error('加载纱线库存失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadYarnList()
  },

  navigateToCreate() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    wx.navigateTo({
      url: '/subpages/business/yarn/create'
    })
  },

  onEditYarn(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const yarnId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/subpages/business/yarn/create?id=${yarnId}`
    })
  }
})




