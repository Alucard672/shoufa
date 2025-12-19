// components/list-pagination/list-pagination.js
Component({
  properties: {
    // 列表数据
    list: {
      type: Array,
      value: []
    },
    // 每页显示数量
    pageSize: {
      type: Number,
      value: 10
    },
    // 是否显示"更多"按钮
    showMoreButton: {
      type: Boolean,
      value: true
    }
  },
  data: {
    displayCount: 10, // 当前显示的数量
    showMore: false // 是否显示更多按钮
  },
  observers: {
    'list': function(list) {
      // 当列表数据变化时，重置显示数量
      this.setData({
        displayCount: this.properties.pageSize,
        showMore: list && list.length > this.properties.pageSize
      })
    }
  },
  lifetimes: {
    attached() {
      // 初始化显示数量
      const pageSize = this.properties.pageSize || 10
      const list = this.properties.list || []
      this.setData({
        displayCount: pageSize,
        showMore: list.length > pageSize
      })
    }
  },
  methods: {
    onLoadMore() {
      const currentCount = this.data.displayCount
      const totalCount = this.properties.list.length
      const pageSize = this.properties.pageSize || 10
      
      // 每次加载更多时，增加 pageSize 条
      const newCount = Math.min(currentCount + pageSize, totalCount)
      
      this.setData({
        displayCount: newCount,
        showMore: newCount < totalCount
      })
      
      // 触发事件通知父组件
      this.triggerEvent('loadmore', {
        displayCount: newCount,
        totalCount: totalCount
      })
    }
  }
})

