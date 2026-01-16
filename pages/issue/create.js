// pages/issue/create.js
import { createIssueOrder, getFactories, getStyles, query, getStyleFactoryPrice } from '../../utils/db.js'
import { generateIssueNo, formatDate, formatQuantity } from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'

const app = getApp()

Page({
  data: {
    issueId: '', // 编辑模式下的发料单ID
    isEdit: false, // 是否为编辑模式
    factories: [],
    styles: [],
    colorOptions: [],
    selectedFactory: null,
    selectedStyle: null,
    selectedStyleImageUrl: '',
    styleImageError: false,
    selectedColor: null,
    selectedColors: [],
    issueWeight: '',
    issueDate: '',
    planId: '',
    processingFeePerDozen: '',
    processingFeePerPiece: '',
    estimatedPieces: 0,
    estimatedPiecesFormatted: '',
    submitting: false
  },

  normalizeImageUrl(obj) {
    try {
      const raw = (obj?.imageUrl || obj?.image_url || obj?.image || '').toString()
      return raw.trim()
    } catch (e) {
      return ''
    }
  },

  updateEstimatedPieces() {
    const weight = parseFloat(this.data.issueWeight) || 0
    const style = this.data.selectedStyle
    const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
    if (weight <= 0 || yarnUsagePerPiece <= 0) {
      this.setData({
        estimatedPieces: 0,
        estimatedPiecesFormatted: ''
      })
      return
    }
    const pieces = Math.floor((weight * 1000) / yarnUsagePerPiece)
    this.setData({
      estimatedPieces: pieces,
      estimatedPiecesFormatted: formatQuantity(pieces)
    })
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  },

  onStyleImageError() {
    this.setData({
      selectedStyleImageUrl: '',
      styleImageError: true
    })
  },

  async onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    
    // 判断是否为编辑模式
    if (options.id) {
      this.setData({
        issueId: options.id,
        isEdit: true
      })
    }
    
    if (options.planId) {
      this.setData({
        planId: options.planId
      })
    }
    
    await Promise.all([
      this.loadFactories(),
      this.loadStyles(),
      this.loadColorDict()
    ])
    
    // 编辑模式下加载发料单数据
    if (this.data.isEdit) {
      await this.loadIssueOrder()
    } else {
      this.setData({
        issueDate: formatDate(new Date())
      })
    }
  },

  async loadFactories() {
    try {
      console.log('开始加载加工厂, tenantId:', app.globalData.tenantId)
      // 新建发料：默认排除停用加工厂；编辑发料：允许回显历史停用项
      const result = await getFactories({ includeDisabled: !!this.data.isEdit })
      console.log('加载加工厂结果:', result)
      this.setData({
        factories: result.data || []
      })
    } catch (error) {
      console.error('加载加工厂失败:', error)
    }
  },

  async loadStyles() {
    try {
      console.log('开始加载款号, tenantId:', app.globalData.tenantId)
      // 新建发料：默认排除停用款号；编辑发料：允许回显历史停用项
      const result = await getStyles({ includeDisabled: !!this.data.isEdit })
      console.log('加载款号结果:', result)
      this.setData({
        styles: result.data || []
      })
    } catch (error) {
      console.error('加载款号失败:', error)
    }
  },

  async loadColorDict() {
    try {
      const result = await query('color_dict', {}, {
        excludeDeleted: true
      })
      this.setData({
        colorOptions: result.data || []
      })
    } catch (error) {
      console.error('加载颜色字典失败:', error)
      this.setData({
        colorOptions: []
      })
    }
  },

  // 加载发料单数据（编辑模式）
  async loadIssueOrder() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const db = wx.cloud.database()
      const issueId = this.data.issueId
      
      // 尝试按 _id 查询
      let issueOrder = null
      try {
        const res = await db.collection('issue_orders').doc(issueId).get()
        issueOrder = res.data
      } catch (e) {
        // 如果失败，尝试按 id 查询
        const idNum = /^\d+$/.test(issueId) ? parseInt(issueId, 10) : null
        if (idNum !== null) {
          const res = await query('issue_orders', { id: idNum }, { excludeDeleted: true, limit: 1 })
          issueOrder = res.data?.[0] || null
        }
      }
      
      if (!issueOrder || issueOrder.deleted || issueOrder.voided) {
        throw new Error('发料单不存在或已作废')
      }
      
      // 查找对应的工厂和款号
      const factoryId = issueOrder.factoryId || issueOrder.factory_id
      const styleId = issueOrder.styleId || issueOrder.style_id
      
      const factory = this.data.factories.find(f => String(f._id || f.id) === String(factoryId))
      const style = this.data.styles.find(s => String(s._id || s.id) === String(styleId))
      
      // 查找颜色
      const colorName = issueOrder.color || ''
      const selectedColor = this.data.colorOptions.find(c => 
        (c.name || c) === colorName
      ) || null
      
      this.setData({
        selectedFactory: factory || null,
        selectedFactoryId: factoryId,
        selectedStyle: style || null,
        selectedStyleId: styleId,
        selectedStyleImageUrl: this.normalizeImageUrl(style),
        selectedColor: selectedColor,
        selectedColors: selectedColor ? [selectedColor] : [],
        issueWeight: String(issueOrder.issueWeight || issueOrder.issue_weight || ''),
        issueDate: formatDate(issueOrder.issueDate || issueOrder.issue_date || issueOrder.createTime || issueOrder.create_time),
        processingFeePerDozen: String(issueOrder.processingFeePerDozen || issueOrder.processing_fee_per_dozen || ''),
        planId: issueOrder.planId || issueOrder.plan_id || ''
      })
      
      this.updateEstimatedPieces()
      
      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('加载发料单失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none',
        duration: 2000
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 2000)
    }
  },

  async onFactoryChange(e) {
    const factory = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedFactory = Array.isArray(factory) ? factory[0] : factory
    this.setData({
      selectedFactory: selectedFactory,
      selectedFactoryId: selectedFactory?._id || ''
    })
    
    // 当工厂和款号都选择后，加载上次价格
    await this.loadLastProcessingFee()
  },

  async onStyleChange(e) {
    const style = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedStyle = Array.isArray(style) ? style[0] : style
    this.setData({
      selectedStyle: selectedStyle,
      selectedStyleId: selectedStyle?._id || '',
      selectedStyleImageUrl: this.normalizeImageUrl(selectedStyle),
      styleImageError: false,
      selectedColor: null,
      selectedColors: []
    })
    
    // 当工厂和款号都选择后，加载上次价格
    await this.loadLastProcessingFee()
    this.updateEstimatedPieces()
  },

  async loadLastProcessingFee() {
    const styleId = this.data.selectedStyleId
    const factoryId = this.data.selectedFactoryId
    
    if (!styleId || !factoryId) {
      return
    }
    
    try {
      // 先查询款号-工厂的历史价格
      const priceRes = await getStyleFactoryPrice(styleId, factoryId)
      
      let processingFeePerDozen = ''
      
      if (priceRes.data && priceRes.data.processingFeePerDozen) {
        // 使用历史价格
        processingFeePerDozen = priceRes.data.processingFeePerDozen.toString()
      } else if (this.data.selectedStyle) {
        // 使用款号的默认价格（兼容新旧字段名）
        const stylePrice = this.data.selectedStyle.processingFeePerDozen || this.data.selectedStyle.processing_fee_per_dozen
        if (stylePrice) {
          processingFeePerDozen = stylePrice.toString()
        }
      }
      
      const { getPiecesPerDozenSync } = require('../../utils/systemParams.js')
      const piecesPerDozen = getPiecesPerDozenSync()
      const processingFeePerPiece = processingFeePerDozen ? (parseFloat(processingFeePerDozen) / piecesPerDozen).toFixed(2) : ''
      
      this.setData({
        processingFeePerDozen: processingFeePerDozen,
        processingFeePerPiece: processingFeePerPiece
      })
    } catch (error) {
      console.error('加载上次加工价失败:', error)
    }
  },

  onProcessingFeeInput(e) {
    const value = e.detail.value
    const processingFeePerDozen = value ? parseFloat(value) : 0
    const { getPiecesPerDozenSync } = require('../../utils/systemParams.js')
    const piecesPerDozen = getPiecesPerDozenSync()
    const processingFeePerPiece = processingFeePerDozen > 0 ? (processingFeePerDozen / piecesPerDozen).toFixed(2) : ''
    
    this.setData({
      processingFeePerDozen: value,
      processingFeePerPiece: processingFeePerPiece
    })
  },

  onColorChange(e) {
    const color = e.detail.value
    // 单选模式下，value 可能是一个对象或对象数组
    const selectedColor = Array.isArray(color) ? color[0] : color
    this.setData({
      selectedColor: selectedColor,
      selectedColors: selectedColor ? [selectedColor] : []
    })
  },

  onDateChange(e) {
    this.setData({
      issueDate: e.detail.value
    })
  },


  onWeightInput(e) {
    this.setData({
      issueWeight: e.detail.value
    })
    this.updateEstimatedPieces()
  },

  async onSubmit() {
    if (this.data.submitting) return

    // 表单验证
    if (!this.data.selectedFactory || !this.data.selectedFactoryId) {
      wx.showToast({
        title: '请选择加工厂',
        icon: 'none'
      })
      return
    }

    // 款号改为可选，不再强制验证

    if (!this.data.issueWeight || parseFloat(this.data.issueWeight) <= 0) {
      wx.showToast({
        title: '请输入有效的发料重量',
        icon: 'none'
      })
      return
    }

    // 如果选择了款号，才需要加工单价
    if (this.data.selectedStyleId && (!this.data.processingFeePerDozen || parseFloat(this.data.processingFeePerDozen) <= 0)) {
      wx.showToast({
        title: '请输入加工单价',
        icon: 'none'
      })
      return
    }

    try {
      this.setData({ submitting: true })
      wx.showLoading({
        title: this.data.isEdit ? '保存中...' : '创建中...'
      })

      const issueDate = new Date(this.data.issueDate)
      const colorName = this.data.selectedColor ? (this.data.selectedColor.name || this.data.selectedColor) : ''

      if (this.data.isEdit) {
        // 编辑模式：更新发料单
        const db = wx.cloud.database()
        const updateData = {
          factoryId: this.data.selectedFactoryId,
          factory_id: this.data.selectedFactoryId,
          styleId: this.data.selectedStyleId || '',
          style_id: this.data.selectedStyleId || '',
          color: colorName,
          issueWeight: parseFloat(this.data.issueWeight),
          issue_weight: parseFloat(this.data.issueWeight),
          issueDate: issueDate,
          issue_date: issueDate,
          planId: this.data.planId || '',
          plan_id: this.data.planId || '',
          processingFeePerDozen: this.data.selectedStyleId ? parseFloat(this.data.processingFeePerDozen) : 0,
          processing_fee_per_dozen: this.data.selectedStyleId ? parseFloat(this.data.processingFeePerDozen) : 0,
          updateTime: db.serverDate()
        }
        
        const result = await db.collection('issue_orders')
          .doc(this.data.issueId)
          .update({
            data: updateData
          })
        
        if (result.stats.updated === 0) {
          throw new Error('更新失败，请检查数据库权限')
        }
        
        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        // 新增模式：创建发料单
        const issueNo = generateIssueNo()
        
        // 使用云函数创建发料单（支持事务操作）
        const result = await wx.cloud.callFunction({
          name: 'createIssueOrder',
          data: {
            issueOrder: {
              issueNo: issueNo,
              factoryId: this.data.selectedFactoryId,
              styleId: this.data.selectedStyleId || '',
              color: colorName,
              issueWeight: parseFloat(this.data.issueWeight),
              issueDate: issueDate,
              planId: this.data.planId || '',
              processingFeePerDozen: this.data.selectedStyleId ? parseFloat(this.data.processingFeePerDozen) : 0,
              tenantId: app.globalData.tenantId
            }
          }
        })

        if (result.result.success) {
          wx.hideLoading()
          wx.showToast({
            title: '创建成功',
            icon: 'success'
          })

          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          throw new Error(result.result.error || '创建失败')
        }
      }
    } catch (error) {
      this.setData({ submitting: false })
      wx.hideLoading()
      console.error(this.data.isEdit ? '更新发料单失败:' : '创建发料单失败:', error)
      wx.showToast({
        title: error.message || (this.data.isEdit ? '保存失败' : '创建失败'),
        icon: 'none'
      })
    }
  }
})

