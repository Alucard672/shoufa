// pages/settings/size.js
const { query, insert, update, remove } = require('./utils/db.js')
const app = getApp()

Page({
  data: {
    sizes: [],
    searchKeyword: '',
    showAddModal: false,
    editSize: null,
    sizeName: '',
    sizeCode: '',
    sizeOrder: ''
  },

  onLoad() {
    this.loadSizes()
  },

  onShow() {
    this.loadSizes()
  },

  async loadSizes() {
    try {
      const sizesRes = await query('size_dict', null, {
        excludeDeleted: true,
        orderBy: { field: 'order', direction: 'ASC' }
      })

      this.setData({
        sizes: sizesRes.data || []
      })
    } catch (error) {
      console.error('加载尺码失败:', error)
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
    this.loadSizes()
  },

  onAddSize() {
    this.setData({
      showAddModal: true,
      editSize: null,
      sizeName: '',
      sizeCode: '',
      sizeOrder: ''
    })
  },

  onEditSize(e) {
    const size = e.currentTarget.dataset.size
    this.setData({
      showAddModal: true,
      editSize: size,
      sizeName: size.name || '',
      sizeCode: size.code || '',
      sizeOrder: size.order ? size.order.toString() : ''
    })
  },

  onCloseModal() {
    this.setData({
      showAddModal: false,
      editSize: null,
      sizeName: '',
      sizeCode: '',
      sizeOrder: ''
    })
  },

  onSizeNameInput(e) {
    this.setData({
      sizeName: e.detail.value
    })
  },

  onSizeCodeInput(e) {
    this.setData({
      sizeCode: e.detail.value
    })
  },

  onSizeOrderInput(e) {
    this.setData({
      sizeOrder: e.detail.value
    })
  },

  async onSave() {
    if (!this.data.sizeName.trim()) {
      wx.showToast({
        title: '请输入尺码名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '保存中...'
      })

      const sizeData = {
        name: this.data.sizeName.trim(),
        code: this.data.sizeCode.trim() || '',
        order: this.data.sizeOrder ? parseInt(this.data.sizeOrder) : 0
      }

      if (this.data.editSize) {
        // 编辑模式
        await update('size_dict', sizeData, {
          id: this.data.editSize.id || this.data.editSize._id
        })
      } else {
        // 新增模式
        await insert('size_dict', sizeData)
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.onCloseModal()
      this.loadSizes()
    } catch (error) {
      wx.hideLoading()
      console.error('保存失败:', error)
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      })
    }
  },

  async onDelete(e) {
    const size = e.currentTarget.dataset.size

    wx.showModal({
      title: '确认删除',
      content: `确定要删除尺码"${size.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: '删除中...'
            })

            await remove('size_dict', {
              id: size.id || size._id
            })

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadSizes()
          } catch (error) {
            wx.hideLoading()
            console.error('删除失败:', error)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

