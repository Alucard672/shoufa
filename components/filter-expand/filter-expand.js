// components/filter-expand/filter-expand.js
Component({
  properties: {
    // 是否默认展开
    defaultExpanded: {
      type: Boolean,
      value: false
    },
    // 展开时的文本
    expandText: {
      type: String,
      value: '更多筛选'
    },
    // 收起时的文本
    collapseText: {
      type: String,
      value: '收起筛选'
    }
  },
  data: {
    expanded: false
  },
  lifetimes: {
    attached() {
      this.setData({
        expanded: this.properties.defaultExpanded
      })
    }
  },
  methods: {
    onToggle() {
      this.setData({
        expanded: !this.data.expanded
      })
      this.triggerEvent('toggle', {
        expanded: this.data.expanded
      })
    }
  }
})

