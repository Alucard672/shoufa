// pages/settings/tenant.js
import { query, insert, update, remove } from '../../utils/db.js'
const app = getApp()

Page({
  data: {
    tenants: [],
    searchKeyword: '',
    showAddModal: false,
    editTenant: null,
    tenantName: '',
    contact: '',
    phone: '',
    address: ''
  },

  onLoad() {
    this.loadTenants()
  },

  onShow() {
    this.loadTenants()
  },

  async loadTenants() {
    try {
      wx.showLoading({
        title: '加载中...'
      })

      const tenantsRes = await query('tenants', null, {
        excludeDeleted: true,
        orderBy: { field: 'create_time', direction: 'DESC' }
      })

      this.setData({
        tenants: tenantsRes.data || []
      })

      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('加载租户失败:', error)
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
    this.loadTenants()
  },

  onAddTenant() {
    this.setData({
      showAddModal: true,
      editTenant: null,
      tenantName: '',
      contact: '',
      phone: '',
      address: ''
    })
  },

  onEditTenant(e) {
    const tenant = e.currentTarget.dataset.tenant
    this.setData({
      showAddModal: true,
      editTenant: tenant,
      tenantName: tenant.name || '',
      contact: tenant.contact || '',
      phone: tenant.phone || '',
      address: tenant.address || ''
    })
  },

  onCloseModal() {
    this.setData({
      showAddModal: false,
      editTenant: null,
      tenantName: '',
      contact: '',
      phone: '',
      address: ''
    })
  },

  onTenantNameInput(e) {
    this.setData({
      tenantName: e.detail.value
    })
  },

  onContactInput(e) {
    this.setData({
      contact: e.detail.value
    })
  },

  onPhoneInput(e) {
    this.setData({
      phone: e.detail.value
    })
  },

  onAddressInput(e) {
    this.setData({
      address: e.detail.value
    })
  },

  async onSave() {
    if (!this.data.tenantName.trim()) {
      wx.showToast({
        title: '请输入租户名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '保存中...'
      })

      const tenantData = {
        name: this.data.tenantName.trim(),
        contact: this.data.contact.trim() || '',
        phone: this.data.phone.trim() || '',
        address: this.data.address.trim() || ''
      }

      if (this.data.editTenant) {
        // 编辑模式
        await update('tenants', tenantData, {
          id: this.data.editTenant.id || this.data.editTenant._id
        })
      } else {
        // 新增模式
        await insert('tenants', tenantData)
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.onCloseModal()
      this.loadTenants()
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
    const tenant = e.currentTarget.dataset.tenant

    wx.showModal({
      title: '确认删除',
      content: `确定要删除租户"${tenant.name}"吗？删除后该租户的所有数据将无法访问。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: '删除中...'
            })

            await remove('tenants', {
              id: tenant.id || tenant._id
            })

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadTenants()
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

