// pages/return/create.js
import { createReturnOrder, getReturnOrdersByIssueId } from '../../utils/db.js'
import { 
  generateReturnNo, 
  formatDate,
  calculateReturnPieces,
  calculateActualYarnUsage,
  calculateProcessingFee
} from '../../utils/calc.js'

Page({
  data: {
    issueId: '',
    issueOrder: null,
    factory: null,
    style: null,
    returnQuantity: '',
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
    const db = wx.cloud.database()
    
    try {
      const [colorsResult, sizesResult] = await Promise.all([
        db.collection('color_dict').get().catch(err => {
          if (err.errCode === -502005) return { data: [] }
          throw err
        }),
        db.collection('size_dict')
          .orderBy('order', 'asc')
          .orderBy('createTime', 'desc')
          .get()
          .catch(err => {
            if (err.errCode === -502005) return { data: [] }
            throw err
          })
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
    const db = wx.cloud.database()
    const issueOrder = await db.collection('issue_orders').doc(this.data.issueId).get()
    
    if (issueOrder.data) {
      const [factoryData, styleData] = await Promise.all([
        db.collection('factories').doc(issueOrder.data.factoryId).get(),
        db.collection('styles').doc(issueOrder.data.styleId).get()
      ])
      
      this.setData({
        issueOrder: issueOrder.data,
        factory: factoryData.data,
        style: styleData.data
      })
      
      // 如果发料单有颜色，默认选中该颜色
      this.setDefaultColor()
    }
  },


  onQuantityInput(e) {
    const quantity = parseFloat(e.detail.value) || 0
    this.setData({
      returnQuantity: e.detail.value
    })
    this.calculate(quantity)
  },

  calculate(quantity) {
    if (!this.data.style || !this.data.factory || quantity <= 0) {
      this.setData({
        calculatedPieces: 0,
        calculatedYarnUsage: 0,
        calculatedYarnUsageFormatted: '0.00',
        calculatedFee: 0,
        calculatedFeeFormatted: '0.00'
      })
      return
    }
    
    const pieces = calculateReturnPieces(quantity)
    const yarnUsage = calculateActualYarnUsage(pieces, this.data.style.yarnUsagePerPiece)
    // 注意：加工单价是元/打，需要转换为元/件再计算，或者直接用打数计算
    // 根据PRD，加工单价是元/打，所以直接用打数乘以单价
    const pricePerDozen = this.data.factory.defaultPrice || 0
    const fee = calculateProcessingFee(quantity, pricePerDozen)
    
    this.setData({
      calculatedPieces: pieces,
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
    
    if (!this.data.returnQuantity || parseFloat(this.data.returnQuantity) <= 0) {
      wx.showToast({
        title: '请输入有效的回货数量',
        icon: 'none'
      })
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
      const quantity = parseFloat(this.data.returnQuantity)
      const pieces = this.data.calculatedPieces
      const yarnUsage = this.data.calculatedYarnUsage
      const fee = this.data.calculatedFee
      const color = this.data.selectedColor ? (this.data.selectedColor.name || this.data.selectedColor) : ''
      const size = this.data.selectedSize ? (this.data.selectedSize.name || this.data.selectedSize) : ''

      // 使用云函数创建回货单（支持事务操作，自动更新发料单状态）
      const result = await wx.cloud.callFunction({
        name: 'createReturnOrder',
        data: {
          returnOrder: {
            returnNo,
            factoryId: this.data.issueOrder.factoryId,
            issueId: this.data.issueId,
            styleId: this.data.issueOrder.styleId,
            returnQuantity: quantity,
            returnPieces: pieces,
            actualYarnUsage: yarnUsage,
            returnDate,
            processingFee: fee,
            color: color,
            size: size || ''
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

