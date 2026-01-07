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

      const db = wx.cloud.database()
      let piecesPerDozen = 12 // 默认值
      let paramsRes = { data: [] }

      try {
        // 先尝试简单查询，检查集合是否存在（不添加 where 条件，避免权限问题）
        try {
          await db.collection('system_params').limit(1).get()
          // 集合存在，继续查询
        } catch (checkError) {
          // 集合不存在，尝试创建
          if (checkError.errCode === -502005 || checkError.message?.includes('collection not exists')) {
            console.log('集合不存在，尝试创建')
            try {
              await this.createDefaultParams(tenantId)
              // 创建后再次查询
            } catch (createError) {
              console.error('创建集合失败:', createError)
              // 集合创建失败，使用默认值
              this.setData({
                piecesPerDozen: 12,
                params: []
              })
              return
            }
          } else {
            // 其他错误（可能是权限问题），记录但不阻塞
            console.warn('检查集合时出错:', checkError)
          }
        }

        // 查询系统参数
        paramsRes = await db.collection('system_params')
          .where({
            tenantId: tenantId
          })
          .get()

        if (paramsRes.data && paramsRes.data.length > 0) {
          // 查找"一打是几件"参数
          const piecesParam = paramsRes.data.find(p => p.key === 'piecesPerDozen')
          if (piecesParam) {
            piecesPerDozen = parseInt(piecesParam.value) || 12
          } else {
            // 参数不存在，创建默认参数
            console.log('参数不存在，创建默认参数')
            await this.createDefaultParams(tenantId)
            piecesPerDozen = 12
          }
        } else {
          // 没有数据，创建默认参数
          console.log('没有参数数据，创建默认参数')
          await this.createDefaultParams(tenantId)
          piecesPerDozen = 12
        }
      } catch (error) {
        console.error('加载系统参数失败:', error)
        // 使用默认值，不显示错误提示
      }

      this.setData({
        piecesPerDozen: piecesPerDozen,
        params: paramsRes.data || []
      })
    } catch (error) {
      console.error('加载系统参数失败:', error)
      // 使用默认值，不显示错误提示（避免影响用户体验）
      // 用户可以在保存时手动触发创建集合
      this.setData({
        piecesPerDozen: 12,
        params: []
      })
    }
  },

  async createDefaultParams(tenantId) {
    try {
      // 使用云函数创建集合和默认参数
      const result = await wx.cloud.callFunction({
        name: 'initDatabase',
        data: {
          collections: ['system_params']
        }
      })

      if (result.result && result.result.success) {
        // 集合创建成功，再添加默认参数
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
        console.log('默认系统参数创建成功')
      } else {
        // 如果云函数不支持，尝试直接添加（可能会失败）
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
        console.log('默认系统参数创建成功')
      }
    } catch (error) {
      // 如果创建失败，提示用户手动创建集合
      console.error('创建默认参数失败:', error)
      if (error.errCode === -502005) {
        wx.showModal({
          title: '集合不存在',
          content: '系统参数集合不存在，请在云开发控制台手动创建"system_params"集合，或联系管理员',
          showCancel: false,
          confirmText: '知道了'
        })
      }
      throw error
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
      
      try {
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
      } catch (dbError) {
        // 如果集合不存在，使用云函数创建
        if (dbError.errCode === -502005 || dbError.message?.includes('collection not exists')) {
          console.log('集合不存在，使用云函数创建集合')
          try {
            // 先创建集合
            await wx.cloud.callFunction({
              name: 'initDatabase',
              data: {
                collections: ['system_params']
              }
            })
            // 再添加参数
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
          } catch (createError) {
            wx.showModal({
              title: '保存失败',
              content: '系统参数集合不存在，请在云开发控制台手动创建"system_params"集合',
              showCancel: false,
              confirmText: '知道了'
            })
            throw createError
          }
        } else {
          throw dbError
        }
      }

      wx.hideLoading()

      this.setData({
        editing: false
      })

      // 触发全局参数更新
      app.globalData.piecesPerDozen = piecesPerDozen
      wx.setStorageSync('piecesPerDozen', piecesPerDozen)
      wx.setStorageSync('systemParam_piecesPerDozen', String(piecesPerDozen))
      
      wx.showToast({
        title: '保存成功',
        icon: 'success'
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

