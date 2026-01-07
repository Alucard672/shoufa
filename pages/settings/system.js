// pages/settings/system.js
import { query, insert, update } from '../../utils/db.js'
const app = getApp()

Page({
  data: {
    params: [],
    piecesPerDozen: 12, // 一打是几件，默认12
    editing: false
  },

  onLoad() {
    this.loadSystemParams()
  },

  onShow() {
    this.loadSystemParams()
  },

  async loadSystemParams() {
    try {
      const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
      if (!tenantId) {
        wx.showToast({
          title: '未登录',
          icon: 'none'
        })
        return
      }

      // 查询系统参数
      const db = wx.cloud.database()
      let paramsRes = await db.collection('system_params')
        .where({
          tenantId: tenantId
        })
        .get()

      let piecesPerDozen = 12 // 默认值
      
      if (paramsRes.data && paramsRes.data.length > 0) {
        // 查找"一打是几件"参数
        const piecesParam = paramsRes.data.find(p => p.key === 'piecesPerDozen')
        if (piecesParam) {
          piecesPerDozen = parseInt(piecesParam.value) || 12
        }
      } else {
        // 如果没有参数，创建默认参数
        await this.createDefaultParams(tenantId)
      }

      this.setData({
        piecesPerDozen: piecesPerDozen,
        params: paramsRes.data || []
      })
    } catch (error) {
      console.error('加载系统参数失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async createDefaultParams(tenantId) {
    try {
      const db = wx.cloud.database()
      await db.collection('system_params').add({
        data: {
          tenantId: tenantId,
          key: 'piecesPerDozen',
          value: '12',
          label: '一打是几件',
          description: '定义一打包含的件数，用于打数和件数的换算',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    } catch (error) {
      console.error('创建默认参数失败:', error)
    }
  },

  onEdit() {
    this.setData({
      editing: true
    })
  },

  onCancel() {
    this.setData({
      editing: false
    })
    this.loadSystemParams() // 重新加载，恢复原值
  },

  onPiecesPerDozenInput(e) {
    const value = e.detail.value
    // 只允许输入正整数
    if (value && !/^\d+$/.test(value)) {
      return
    }
    this.setData({
      piecesPerDozen: value ? parseInt(value) : ''
    })
  },

  async onSave() {
    const piecesPerDozen = this.data.piecesPerDozen
    if (!piecesPerDozen || piecesPerDozen < 1) {
      wx.showToast({
        title: '请输入有效的件数',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '保存中...'
      })

      const tenantId = app.globalData.tenantId || wx.getStorageSync('tenantId')
      if (!tenantId) {
        wx.hideLoading()
        wx.showToast({
          title: '未登录',
          icon: 'none'
        })
        return
      }

      const db = wx.cloud.database()
      
      // 查找是否已存在该参数
      const paramsRes = await db.collection('system_params')
        .where({
          tenantId: tenantId,
          key: 'piecesPerDozen'
        })
        .get()

      if (paramsRes.data && paramsRes.data.length > 0) {
        // 更新现有参数
        await db.collection('system_params')
          .doc(paramsRes.data[0]._id)
          .update({
            data: {
              value: String(piecesPerDozen),
              updateTime: db.serverDate()
            }
          })
      } else {
        // 创建新参数
        await db.collection('system_params').add({
          data: {
            tenantId: tenantId,
            key: 'piecesPerDozen',
            value: String(piecesPerDozen),
            label: '一打是几件',
            description: '定义一打包含的件数，用于打数和件数的换算',
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.setData({
        editing: false
      })

      // 触发全局参数更新
      app.globalData.piecesPerDozen = piecesPerDozen
      wx.setStorageSync('piecesPerDozen', piecesPerDozen)
      wx.setStorageSync('systemParam_piecesPerDozen', String(piecesPerDozen))
      
      // 清除相关缓存，强制重新加载
      wx.showToast({
        title: '保存成功，请刷新页面',
        icon: 'success',
        duration: 2000
      })

    } catch (error) {
      wx.hideLoading()
      console.error('保存系统参数失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  }
})

