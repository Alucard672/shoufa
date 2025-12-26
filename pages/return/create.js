// pages/return/create.js
import { query, getFactoryById, getStyleById, insert } from '../../utils/db.js'
import {
  generateReturnNo,
  formatDate,
  calculateReturnPieces,
  calculateActualYarnUsage,
  calculateProcessingFee,
  formatQuantity
} from '../../utils/calc.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    issueId: '',
    issueOrder: null,
    factory: null,
    style: null,
    returnDozens: '',
    returnPieces: '',
    returnDate: '',
    calculatedPieces: 0,
    calculatedYarnUsage: 0,
    calculatedFee: 0,
    colorOptions: [],
    sizeOptions: [],
    selectedColor: null,
    selectedSize: null,
    selectedColors: [],
    selectedSizes: []
  },

  async onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    await this.loadDictionaries()

    if (options.issueId) {
      this.setData({
        issueId: options.issueId
      })
      await this.loadIssueOrder()
    }
    this.setData({
      returnDate: formatDate(new Date())
    })
  },

  async loadDictionaries() {
    try {
      const [colorsResult, sizesResult] = await Promise.all([
        query('color_dict', null, {
          excludeDeleted: true
        }).catch(() => ({ data: [] })),
        query('size_dict', null, {
          excludeDeleted: true,
          orderBy: { field: 'order', direction: 'ASC' }
        }).catch(() => ({ data: [] }))
      ])

      this.setData({
        colorOptions: colorsResult.data || [],
        sizeOptions: sizesResult.data || []
      })

      // 如果发料单有颜色，默认选中该颜色
      this.setDefaultColor()
    } catch (error) {
      console.error('加载字典失败:', error)
      this.setData({
        colorOptions: [],
        sizeOptions: []
      })
    }
  },

  setDefaultColor() {
    if (this.data.issueOrder && this.data.issueOrder.color && this.data.colorOptions.length > 0) {
      const defaultColor = this.data.colorOptions.find(c => c.name === this.data.issueOrder.color)
      if (defaultColor) {
        this.setData({
          selectedColor: defaultColor,
          selectedColors: [defaultColor]
        })
      }
    }
  },

  async loadIssueOrder() {
    try {
      const issueOrderRes = await query('issue_orders', {
        _id: this.data.issueId
      }, {
        excludeDeleted: true
      })

      if (issueOrderRes.data && issueOrderRes.data[0]) {
        const issueOrder = issueOrderRes.data[0]
        const factoryId = issueOrder.factoryId || issueOrder.factory_id
        const styleId = issueOrder.styleId || issueOrder.style_id

        console.log('加载关联信息:', { factoryId, styleId })

        const [factoryRes, styleRes] = await Promise.all([
          getFactoryById(factoryId),
          getStyleById(styleId)
        ])

        this.setData({
          issueOrder: issueOrder,
          factory: factoryRes.data,
          style: styleRes.data
        })

        // 重新计算一次，确保初始状态正确
        this.calculate()
        // 如果发料单有颜色，默认选中该颜色
        this.setDefaultColor()
      }
    } catch (error) {
      console.error('加载发料单信息失败:', error)
    }
  },


  onDozensInput(e) {
    this.setData({
      returnDozens: e.detail.value
    })
    this.calculate()
  },

  onPiecesInput(e) {
    this.setData({
      returnPieces: e.detail.value
    })
    this.calculate()
  },

  calculate() {
    const doz = parseFloat(this.data.returnDozens) || 0
    const extraPcs = parseInt(this.data.returnPieces) || 0
    const totalPieces = doz * 12 + extraPcs

    if (!this.data.style || !this.data.factory || totalPieces <= 0) {
      this.setData({
        calculatedPieces: 0,
        calculatedYarnUsage: 0,
        calculatedYarnUsageFormatted: '0.00',
        calculatedFee: 0,
        calculatedFeeFormatted: '0.00'
      })
      return
    }

    const pieces = totalPieces
    const yarnUsagePerPiece = this.data.style.yarnUsagePerPiece || this.data.style.yarn_usage_per_piece || 0
    const yarnUsage = calculateActualYarnUsage(pieces, yarnUsagePerPiece)
    const pricePerDozen = this.data.factory.defaultPrice || this.data.factory.default_price || 0

    // 换算为打数进行计算：总件数 / 12
    const totalQuantity = pieces / 12
    const fee = calculateProcessingFee(totalQuantity, pricePerDozen)

    this.setData({
      calculatedPieces: pieces,
      calculatedQuantityFormatted: formatQuantity(pieces),
      calculatedYarnUsage: yarnUsage,
      calculatedYarnUsageFormatted: yarnUsage.toFixed(2),
      calculatedFee: fee,
      calculatedFeeFormatted: fee.toFixed(2)
    })
  },

  onDateChange(e) {
    this.setData({
      returnDate: e.detail.value
    })
  },

  onColorChange(e) {
    const color = e.detail.value
    const selectedColor = Array.isArray(color) ? color[0] : color
    this.setData({
      selectedColor: selectedColor,
      selectedColors: selectedColor ? [selectedColor] : []
    })
  },

  onSizeChange(e) {
    const size = e.detail.value
    const selectedSize = Array.isArray(size) ? size[0] : size
    this.setData({
      selectedSize: selectedSize,
      selectedSizes: selectedSize ? [selectedSize] : []
    })
  },

  async onSubmit() {
    if (!this.data.issueId) {
      wx.showToast({
        title: '请选择发料单',
        icon: 'none'
      })
      return
    }

    if (!this.data.returnDozens && !this.data.returnPieces) {
      wx.showToast({
        title: '请输入回货数量',
        icon: 'none'
      })
      return
    }

    const pieces = this.data.calculatedPieces
    if (pieces <= 0) {
      if (!this.data.style || !this.data.factory) {
        wx.showToast({
          title: '基础信息加载中，请稍后',
          icon: 'none'
        })
      } else {
        wx.showToast({
          title: '回货数量必须大于0',
          icon: 'none'
        })
      }
      return
    }

    if (!this.data.selectedColor) {
      wx.showToast({
        title: '请选择颜色',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '创建中...'
      })

      const returnNo = generateReturnNo()
      const returnDate = new Date(this.data.returnDate)
      const quantity = pieces / 12 // 存储为标准打数
      const yarnUsage = this.data.calculatedYarnUsage
      const fee = this.data.calculatedFee
      const color = this.data.selectedColor ? (this.data.selectedColor.name || this.data.selectedColor) : ''
      const size = this.data.selectedSize ? (this.data.selectedSize.name || this.data.selectedSize) : ''

      const factoryId = this.data.issueOrder.factoryId || this.data.issueOrder.factory_id
      const styleId = this.data.issueOrder.styleId || this.data.issueOrder.style_id

      // 使用MySQL插入回货单
      await insert('return_orders', {
        returnNo: returnNo,
        factoryId: factoryId,
        issueId: this.data.issueId,
        styleId: styleId,
        returnQuantity: quantity,
        returnPieces: pieces,
        actualYarnUsage: yarnUsage,
        returnDate: returnDate,
        processingFee: fee,
        color: color,
        size: size || '',
        settlementStatus: '未结算',
        settledAmount: 0
      })

      wx.hideLoading()
      wx.showToast({
        title: '创建成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      wx.hideLoading()
      console.error('创建回货单失败:', error)
      wx.showToast({
        title: error.message || '创建失败',
        icon: 'none'
      })
    }
  },

})

