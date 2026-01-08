// pages/settings/system.js
import { query, insert, update } from '../../utils/db.js'
const app = getApp()

Page({
  data: {
    params: [] // 参数列表，每个参数包含：key, value, label, description, editing, tempValue
  },

  onLoad() {
    this.loadSystemParams()
  },

  onShow() {
    this.loadSystemParams()
  },

  /**
   * 加载系统参数（租户级别）
   * 注意：所有查询必须包含 tenantId 条件，避免全量查询和跨租户数据泄露
   */
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
      let paramsRes = { data: [] }

      // 定义系统参数的默认配置
      const defaultParamsConfig = [
        {
          key: 'piecesPerDozen',
          defaultValue: '12',
          label: '一打是几件',
          description: '定义一打包含的件数，用于打数和件数的换算',
          type: 'number', // 参数类型：number, string, boolean 等
          unit: '件' // 单位
        }
        // 未来可以在这里添加更多系统参数
      ]

      try {
        // 查询当前租户的系统参数（必须包含 tenantId 条件，避免全量查询）
        paramsRes = await db.collection('system_params')
          .where({
            tenantId: tenantId  // 租户隔离：只查询当前租户的参数
          })
          .get()

        // 构建参数列表，确保所有默认参数都存在
        const paramsMap = new Map()
        if (paramsRes.data && paramsRes.data.length > 0) {
          paramsRes.data.forEach(p => {
            paramsMap.set(p.key, p)
          })
        }

        // 如果集合为空或参数不存在，创建默认参数
        if (paramsMap.size === 0) {
          console.log('没有参数数据，创建默认参数')
          await this.createDefaultParams(tenantId)
          // 创建后再次查询
          paramsRes = await db.collection('system_params')
            .where({
              tenantId: tenantId
            })
            .get()
          paramsRes.data.forEach(p => {
            paramsMap.set(p.key, p)
          })
        }

        // 确保所有默认参数都存在
        const finalParams = defaultParamsConfig.map(config => {
          const existing = paramsMap.get(config.key)
          if (existing) {
            return {
              ...existing,
              label: config.label,
              description: config.description,
              type: config.type || 'string',
              unit: config.unit || '',
              editing: false,
              tempValue: existing.value
            }
          } else {
            // 参数不存在，创建它
            this.createSingleParam(tenantId, config).catch(err => {
              console.error('创建参数失败:', err)
            })
            return {
              key: config.key,
              value: config.defaultValue,
              label: config.label,
              description: config.description,
              type: config.type || 'string',
              unit: config.unit || '',
              editing: false,
              tempValue: config.defaultValue,
              _new: true // 标记为新参数，还未保存到数据库
            }
          }
        })

        this.setData({
          params: finalParams
        })
      } catch (error) {
        // 如果集合不存在，尝试创建
        if (error.errCode === -502005 || error.message?.includes('collection not exists')) {
          console.log('集合不存在，尝试创建')
          try {
            await this.createDefaultParams(tenantId)
            // 创建后再次查询（必须包含 tenantId 条件）
            paramsRes = await db.collection('system_params')
              .where({
                tenantId: tenantId  // 租户隔离：只查询当前租户的参数
              })
              .get()

            const paramsMap = new Map()
            if (paramsRes.data && paramsRes.data.length > 0) {
              paramsRes.data.forEach(p => {
                paramsMap.set(p.key, p)
              })
            }

            const defaultParamsConfig = [
              {
                key: 'piecesPerDozen',
                defaultValue: '12',
                label: '一打是几件',
                description: '定义一打包含的件数，用于打数和件数的换算',
                type: 'number',
                unit: '件'
              }
            ]

            const finalParams = defaultParamsConfig.map(config => {
              const existing = paramsMap.get(config.key)
              if (existing) {
                return {
                  ...existing,
                  label: config.label,
                  description: config.description,
                  type: config.type || 'string',
                  unit: config.unit || '',
                  editing: false,
                  tempValue: existing.value
                }
              } else {
                return {
                  key: config.key,
                  value: config.defaultValue,
                  label: config.label,
                  description: config.description,
                  type: config.type || 'string',
                  unit: config.unit || '',
                  editing: false,
                  tempValue: config.defaultValue,
                  _new: true
                }
              }
            })

            this.setData({
              params: finalParams
            })
          } catch (createError) {
            console.error('创建集合失败:', createError)
            // 集合创建失败，使用默认值
            this.setData({
              params: defaultParamsConfig.map(config => ({
                key: config.key,
                value: config.defaultValue,
                label: config.label,
                description: config.description,
                type: config.type || 'string',
                unit: config.unit || '',
                editing: false,
                tempValue: config.defaultValue,
                _new: true
              }))
            })
          }
        } else {
          console.error('加载系统参数失败:', error)
          // 其他错误，使用默认值
          const defaultParamsConfig = [
            {
              key: 'piecesPerDozen',
              defaultValue: '12',
              label: '一打是几件',
              description: '定义一打包含的件数，用于打数和件数的换算',
              type: 'number',
              unit: '件'
            }
          ]
          this.setData({
            params: defaultParamsConfig.map(config => ({
              key: config.key,
              value: config.defaultValue,
              label: config.label,
              description: config.description,
              type: config.type || 'string',
              unit: config.unit || '',
              editing: false,
              tempValue: config.defaultValue,
              _new: true
            }))
          })
        }
      }
    } catch (error) {
      console.error('加载系统参数失败:', error)
      // 使用默认值，不显示错误提示（避免影响用户体验）
      const defaultParamsConfig = [
        {
          key: 'piecesPerDozen',
          defaultValue: '12',
          label: '一打是几件',
          description: '定义一打包含的件数，用于打数和件数的换算',
          type: 'number',
          unit: '件'
        }
      ]
      this.setData({
        params: defaultParamsConfig.map(config => ({
          key: config.key,
          value: config.defaultValue,
          label: config.label,
          description: config.description,
          type: config.type || 'string',
          unit: config.unit || '',
          editing: false,
          tempValue: config.defaultValue,
          _new: true
        }))
      })
    }
  },

  /**
   * 创建单个参数
   */
  async createSingleParam(tenantId, config) {
    const db = wx.cloud.database()
    await db.collection('system_params').add({
      data: {
        tenantId: tenantId,
        key: config.key,
        value: config.defaultValue,
        label: config.label,
        description: config.description,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  },

  /**
   * 创建默认系统参数（租户级别）
   * @param {String} tenantId 租户ID，必须提供以确保参数属于正确的租户
   */
  async createDefaultParams(tenantId) {
    if (!tenantId) {
      throw new Error('tenantId 不能为空')
    }
    
    try {
      // 使用云函数创建集合
      const result = await wx.cloud.callFunction({
        name: 'initDatabase',
        data: {
          collections: ['system_params']
        }
      })

      if (result.result && result.result.success) {
        // 集合创建成功，再添加默认参数（必须包含 tenantId）
        const db = wx.cloud.database()
        await this.createSingleParam(tenantId, {
          key: 'piecesPerDozen',
          defaultValue: '12',
          label: '一打是几件',
          description: '定义一打包含的件数，用于打数和件数的换算',
          type: 'number',
          unit: '件'
        })
        console.log('默认系统参数创建成功')
      } else {
        // 如果云函数不支持，尝试直接添加（可能会失败）
        await this.createSingleParam(tenantId, {
          key: 'piecesPerDozen',
          defaultValue: '12',
          label: '一打是几件',
          description: '定义一打包含的件数，用于打数和件数的换算',
          type: 'number',
          unit: '件'
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

  /**
   * 编辑单个参数
   */
  onEditParam(e) {
    const index = e.currentTarget.dataset.index
    const params = this.data.params
    params[index].editing = true
    params[index].tempValue = params[index].value
    this.setData({
      params: params
    })
  },

  /**
   * 取消编辑单个参数
   */
  onCancelEdit(e) {
    const index = e.currentTarget.dataset.index
    const params = this.data.params
    params[index].editing = false
    params[index].tempValue = params[index].value // 恢复原值
    this.setData({
      params: params
    })
  },

  /**
   * 输入参数值
   */
  onParamInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    const params = this.data.params
    const param = params[index]

    // 如果是数字类型，只允许输入数字
    if (param.type === 'number') {
      if (value && !/^\d+$/.test(value)) {
        return
      }
      params[index].tempValue = value ? parseInt(value) : ''
    } else {
      params[index].tempValue = value
    }

    this.setData({
      params: params
    })
  },

  /**
   * 保存单个参数（租户级别）
   * 注意：所有查询和更新操作必须包含 tenantId 条件
   */
  async onSaveParam(e) {
    const index = e.currentTarget.dataset.index
    const params = this.data.params
    const param = params[index]
    const tempValue = param.tempValue

    // 验证输入值
    if (param.type === 'number') {
      if (!tempValue || tempValue < 1) {
        wx.showToast({
          title: '请输入有效的数值',
          icon: 'none'
        })
        return
      }
    } else {
      if (!tempValue || !tempValue.trim()) {
        wx.showToast({
          title: '请输入有效的值',
          icon: 'none'
        })
        return
      }
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
      const valueToSave = String(tempValue)
      
      try {
        if (param._id && !param._new) {
          // 更新现有参数
          await db.collection('system_params')
            .doc(param._id)
            .update({
              data: {
                value: valueToSave,
                updateTime: db.serverDate()
              }
            })
        } else {
          // 创建新参数（必须包含 tenantId）
          const addResult = await db.collection('system_params').add({
            data: {
              tenantId: tenantId,  // 租户隔离：确保参数属于当前租户
              key: param.key,
              value: valueToSave,
              label: param.label,
              description: param.description,
              createTime: db.serverDate(),
              updateTime: db.serverDate()
            }
          })
          params[index]._id = addResult._id
          params[index]._new = false
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
            // 再添加参数（必须包含 tenantId）
            const addResult = await db.collection('system_params').add({
              data: {
                tenantId: tenantId,  // 租户隔离：确保参数属于当前租户
                key: param.key,
                value: valueToSave,
                label: param.label,
                description: param.description,
                createTime: db.serverDate(),
                updateTime: db.serverDate()
              }
            })
            params[index]._id = addResult._id
            params[index]._new = false
          } catch (createError) {
            wx.hideLoading()
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

      // 更新本地状态
      params[index].value = valueToSave
      params[index].editing = false
      params[index].tempValue = valueToSave

      wx.hideLoading()

      this.setData({
        params: params
      })

      // 如果是 piecesPerDozen 参数，触发全局更新
      if (param.key === 'piecesPerDozen') {
        const numValue = parseInt(valueToSave) || 12
        app.globalData.piecesPerDozen = numValue
        wx.setStorageSync('piecesPerDozen', numValue)
        wx.setStorageSync('systemParam_piecesPerDozen', valueToSave)
        // 清除相关缓存，让其他页面重新加载
        const { clearSystemParamCache } = require('../../utils/systemParams.js')
        clearSystemParamCache('piecesPerDozen')
      }
      
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

