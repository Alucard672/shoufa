// components/search-box/search-box.js
Component({
  properties: {
    // 占位符文本
    placeholder: {
      type: String,
      value: '搜索'
    },
    // 搜索值
    value: {
      type: String,
      value: ''
    }
  },
  data: {
    inputValue: ''
  },
  methods: {
    onInput(e) {
      this.setData({
        inputValue: e.detail.value
      })
      this.triggerEvent('input', {
        value: e.detail.value
      })
    },
    onSearch() {
      this.triggerEvent('search', {
        value: this.data.inputValue
      })
    },
    onClear() {
      this.setData({
        inputValue: ''
      })
      this.triggerEvent('clear')
    }
  },
  lifetimes: {
    attached() {
      this.setData({
        inputValue: this.properties.value
      })
    }
  }
})





