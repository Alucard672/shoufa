// components/filter-tabs/filter-tabs.js
Component({
  properties: {
    // 选项列表
    options: {
      type: Array,
      value: []
    },
    // 当前选中的索引
    current: {
      type: Number,
      value: 0
    }
  },
  data: {
    internalCurrent: 0
  },
  observers: {
    'current': function(current) {
      // 当父组件传入的 current 变化时，同步到内部状态
      this.setData({
        internalCurrent: current
      })
    }
  },
  lifetimes: {
    attached() {
      // 初始化时同步 current 到内部状态
      this.setData({
        internalCurrent: this.properties.current || 0
      })
    }
  },
  methods: {
    onTabTap(e) {
      const index = parseInt(e.currentTarget.dataset.index)
      console.log('filter-tabs 点击:', index, '选项:', this.properties.options[index])
      
      // 更新内部状态
      this.setData({
        internalCurrent: index
      })
      
      // 触发事件通知父组件
      this.triggerEvent('change', {
        index: index,
        value: this.properties.options[index]
      })
    }
  }
})

