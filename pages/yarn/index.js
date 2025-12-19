// pages/yarn/index.js
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
      const db = wx.cloud.database()
      const _ = db.command
      let query = db.collection('yarn_inventory')
        .where({
          deleted: _.eq(false)
        })
      
      if (this.data.searchKeyword) {
        query = query.where({
          yarnName: _.regex({
            regexp: this.data.searchKeyword,
            options: 'i'
          })
        })
      }
      
      const result = await query.orderBy('createTime', 'desc').get()
      
      this.setData({
        yarnList: result.data
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




