// pages/settings/color.js
const { query, insert, update, remove } = require('./utils/db.js')
const app = getApp()

Page({
  data: {
    colors: [],
    searchKeyword: '',
    showAddModal: false,
    editColor: null,
    colorName: '',
    colorCode: ''
  },

  onLoad() {
    this.loadColors()
  },

  onShow() {
    this.loadColors()
  },

  async loadColors() {
    try {
      const colorsRes = await query('color_dict', null, {
        excludeDeleted: true,
        orderBy: { field: 'createTime', direction: 'DESC' }
      })

      this.setData({
        colors: colorsRes.data || []
      })
    } catch (error) {
      console.error('加载颜色失败:', error)
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
    this.loadColors()
  },

  onAddColor() {
    this.setData({
      showAddModal: true,
      editColor: null,
      colorName: '',
      colorCode: ''
    })
  },

  onEditColor(e) {
    const color = e.currentTarget.dataset.color
    this.setData({
      showAddModal: true,
      editColor: color,
      colorName: color.name || '',
      colorCode: color.code || ''
    })
  },

  onCloseModal() {
    this.setData({
      showAddModal: false,
      editColor: null,
      colorName: '',
      colorCode: ''
    })
  },

  onColorNameInput(e) {
    this.setData({
      colorName: e.detail.value
    })
  },

  onColorCodeInput(e) {
    this.setData({
      colorCode: e.detail.value
    })
  },

  async onSave() {
    if (!this.data.colorName.trim()) {
      wx.showToast({
        title: '请输入颜色名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '保存中...'
      })

      const colorData = {
        name: this.data.colorName.trim(),
        code: this.data.colorCode.trim() || ''
      }

      if (this.data.editColor) {
        // 编辑模式
        await update('color_dict', colorData, {
          id: this.data.editColor.id || this.data.editColor._id
        })
      } else {
        // 新增模式
        await insert('color_dict', colorData)
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.onCloseModal()
      this.loadColors()
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
    const color = e.currentTarget.dataset.color

    wx.showModal({
      title: '确认删除',
      content: `确定要删除颜色"${color.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: '删除中...'
            })

            await remove('color_dict', {
              id: color.id || color._id
            })

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadColors()
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

