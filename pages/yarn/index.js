// pages/yarn/index.js
import { query } from '../../utils/db.js'
const app = getApp()

Page({
  data: {
    yarnList: [],
    searchKeyword: ''
  },

  onLoad() {
    this.loadYarnList()
  },

  onShow() {
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
        orderBy: { field: 'create_time', direction: 'DESC' }
      })

      this.setData({
        yarnList: result.data || []
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
    wx.navigateTo({
      url: '/pages/yarn/create'
    })
  },

  onEditYarn(e) {
    const yarnId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/yarn/create?id=${yarnId}`
    })
  }
})




