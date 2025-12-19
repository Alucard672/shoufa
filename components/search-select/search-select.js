// components/search-select/search-select.js
Component({
  properties: {
    // 占位符文本
    placeholder: {
      type: String,
      value: '请选择'
    },
    // 选中的值数组（用于多选）
    selectedValues: {
      type: Array,
      value: []
    },
    // 选项列表
    options: {
      type: Array,
      value: []
    },
    // 显示字段名
    displayKey: {
      type: String,
      value: 'name'
    },
    // 值字段名
    valueKey: {
      type: String,
      value: '_id'
    },
    // 是否多选
    multiple: {
      type: Boolean,
      value: false
    },
    // 是否支持快速新增
    allowAdd: {
      type: Boolean,
      value: false
    },
    // 新增类型（用于区分是颜色还是尺码）
    addType: {
      type: String,
      value: ''
    },
    // 自定义显示格式函数名（在 wxs 中定义）
    formatDisplay: {
      type: String,
      value: ''
    }
  },
  data: {
    showModal: false,
    searchKeyword: '',
    filteredOptions: [],
    internalSelectedValues: [],
    showAddForm: false,
    newItemName: '',
    newItemCode: ''
  },
  observers: {
    'options': function(options) {
      // 当 options 更新时，如果有搜索关键词，需要重新过滤
      const keyword = this.data.searchKeyword || ''
      const displayKey = this.properties.displayKey
      
      let filtered = options || []
      
      // 如果有搜索关键词，进行过滤
      if (keyword && keyword.trim()) {
        filtered = filtered.filter(item => {
          const displayValue = item[displayKey] || ''
          return displayValue.toString().toLowerCase().includes(keyword.toLowerCase())
        })
      }
      
      // 更新过滤后的选项列表
      this.setData({
        filteredOptions: filtered
      })
    },
    'selectedValues': function(selectedValues) {
      // 更新内部选中值，保持弹窗打开状态（如果是多选模式）
      this.setData({
        internalSelectedValues: selectedValues || []
      })
    }
  },
  lifetimes: {
    attached() {
      this.setData({
        internalSelectedValues: this.properties.selectedValues || [],
        filteredOptions: this.properties.options || []
      })
    }
  },
  methods: {
    onOpenModal() {
      this.setData({
        showModal: true,
        searchKeyword: '',
        filteredOptions: this.properties.options || [],
        internalSelectedValues: this.properties.selectedValues || [],
        showAddForm: false,
        newItemName: '',
        newItemCode: ''
      })
    },
    onCloseModal() {
      this.setData({
        showModal: false,
        searchKeyword: '',
        showAddForm: false,
        newItemName: ''
      })
    },
    onSearchInput(e) {
      const keyword = e.detail.value
      const options = this.properties.options || []
      const displayKey = this.properties.displayKey
      
      const filtered = keyword 
        ? options.filter(item => {
            const displayValue = item[displayKey] || ''
            return displayValue.toString().toLowerCase().includes(keyword.toLowerCase())
          })
        : options
      
      this.setData({
        searchKeyword: keyword,
        filteredOptions: filtered,
        showAddForm: false // 搜索时关闭快速新增表单，用户需要点击"快速新增"链接才会打开
      })
    },
    onSelectOption(e) {
      const index = e.currentTarget.dataset.index
      const option = this.data.filteredOptions[index]
      
      if (!option) return
      
      if (this.properties.multiple) {
        // 多选模式
        const selectedValues = [...this.data.internalSelectedValues]
        const valueKey = this.properties.valueKey
        const optionValue = option[valueKey] || option
        
        const existIndex = selectedValues.findIndex(v => {
          if (typeof v === 'object' && v !== null) {
            return (v[valueKey] || v) === optionValue
          }
          return v === optionValue
        })
        
        if (existIndex >= 0) {
          selectedValues.splice(existIndex, 1)
        } else {
          selectedValues.push(option)
        }
        
        this.setData({
          internalSelectedValues: selectedValues
        })
        
        this.triggerEvent('change', {
          value: selectedValues
        })
      } else {
        // 单选模式
        this.setData({
          internalSelectedValues: [option]
        })
        
        this.triggerEvent('change', {
          value: option
        })
        this.onCloseModal()
      }
    },
    onRemoveSelected(e) {
      e.stopPropagation()
      const index = e.currentTarget.dataset.index
      const selectedValues = [...this.data.internalSelectedValues]
      selectedValues.splice(index, 1)
      
      this.setData({
        internalSelectedValues: selectedValues
      })
      
      this.triggerEvent('change', {
        value: selectedValues
      })
    },
    onConfirm() {
      this.triggerEvent('confirm', {
        value: this.data.internalSelectedValues
      })
      this.onCloseModal()
    },
    onShowAddForm(e) {
      // 直接使用搜索框的内容作为新增项的名称
      // 确保获取最新的搜索关键词
      let nameToAdd = (this.data.searchKeyword || '').trim()
      
      console.log('快速新增 - 搜索关键词:', nameToAdd)
      
      // 如果搜索框为空，检查是否需要自动填充默认值
      if (!nameToAdd || nameToAdd.length === 0) {
        if (this.properties.addType === 'color') {
          const options = this.properties.options || []
          const hasWhite = options.some(item => {
            const name = item[this.properties.displayKey] || item
            return name === '白色'
          })
          
          // 如果白色不存在，自动填充"白色"
          if (!hasWhite) {
            nameToAdd = '白色'
          }
        }
      }
      
      // 如果有名称，直接添加，不打开表单
      if (nameToAdd && nameToAdd.length > 0) {
        console.log('直接添加:', nameToAdd)
        // 直接触发新增事件，使用搜索框的内容
        // 清空搜索关键词，让所有选项都显示，包括新添加的项
        this.setData({
          searchKeyword: ''
        })
        // 触发新增事件
        this.triggerEvent('add', {
          name: nameToAdd,
          code: '',
          type: this.properties.addType
        })
        // 不清空表单，不关闭弹窗
        // 父组件更新 options 和 selectedValues 后，组件会自动更新显示
        // 清空搜索关键词后，所有选项都会显示，包括新添加的项
        return
      }
      
      // 如果还是没有名称，打开表单让用户输入
      console.log('打开表单让用户输入')
      this.setData({
        showAddForm: true,
        newItemName: ''
      })
    },
    onNewItemNameInput(e) {
      this.setData({
        newItemName: e.detail.value
      })
    },
    onNewItemCodeInput(e) {
      this.setData({
        newItemCode: e.detail.value
      })
    },
    onCloseAddForm() {
      this.setData({
        showAddForm: false,
        newItemName: '',
        newItemCode: ''
      })
    },
    async onAddNewItem() {
      const name = this.data.newItemName.trim()
      if (!name) {
        wx.showToast({
          title: '请输入名称',
          icon: 'none'
        })
        return
      }

      // 触发新增事件，让父组件处理新增逻辑
      this.triggerEvent('add', {
        name: name,
        code: this.data.newItemCode.trim(),
        type: this.properties.addType
      })
    },
    stopPropagation() {
      // 阻止事件冒泡
    }
  }
})
