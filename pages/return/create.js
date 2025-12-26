// pages/return/create.js
import { query, getFactoryById, getStyleById, insert, calculateIssueProgress, updateIssueOrderStatus, update, getReturnOrderById } from '../../utils/db.js'
import { formatAmount, formatQuantity, formatDate, formatWeight } from '../../utils/calc.js'
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
    selectedSizes: [],
    shareAfterSave: false,
    status: '进行中',
    returnOrderId: null
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
    
    // 从款号中获取加工单价（元/打），如果款号中没有则使用0
    const pricePerDozen = this.data.style.processingFeePerDozen || this.data.style.processing_fee_per_dozen || 0

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
      
      // 确保 issueId 使用发料单的实际 _id（可能是对象或字符串）
      const issueId = this.data.issueOrder._id || this.data.issueOrder.id || this.data.issueId
      console.log('创建回货单 - issueId:', issueId, '类型:', typeof issueId, '发料单:', this.data.issueOrder)

      // 使用insert插入回货单
      const insertResult = await insert('return_orders', {
        returnNo: returnNo,
        factoryId: factoryId,
        issueId: issueId, // 使用发料单的实际_id
        styleId: styleId,
        returnQuantity: quantity,
        returnPieces: pieces,
        actualYarnUsage: yarnUsage,
        returnDate: returnDate,
        processingFee: fee,
        color: color,
        size: size || '',
        settlementStatus: '未结算',
        settledAmount: 0,
        status: this.data.status || '进行中'
      })
      
      const returnOrderId = insertResult._id || insertResult.id
      
      // 创建回货单后，更新发料单状态
      try {
        const progress = await calculateIssueProgress(issueId)
        await updateIssueOrderStatus(issueId, progress.status)
        console.log('更新发料单状态成功:', progress.status)
      } catch (error) {
        console.error('更新发料单状态失败:', error)
        // 不阻止回货单创建，只记录错误
      }

      wx.hideLoading()
      wx.showToast({
        title: '创建成功',
        icon: 'success'
      })

      // 保存 returnOrderId 以便后续使用（完成按钮需要）
      this.setData({
        returnOrderId: returnOrderId
      })

      // 如果选择了分享，则在保存后弹出分享选项
      if (this.data.shareAfterSave) {
        setTimeout(() => {
          this.shareReturnOrder(returnOrderId)
        }, 500)
      } else {
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
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

  onShareSwitchChange(e) {
    this.setData({
      shareAfterSave: e.detail.value
    })
  },

  async onMarkComplete() {
    if (!this.data.returnOrderId) {
      wx.showToast({
        title: '请先保存回货单',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '更新中...'
      })

      await update('return_orders', {
        status: '已完成'
      }, {
        _id: this.data.returnOrderId
      })

      this.setData({
        status: '已完成'
      })

      wx.hideLoading()
      wx.showToast({
        title: '已标记为完成',
        icon: 'success'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('更新状态失败:', error)
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      })
    }
  },

  async shareReturnOrder(returnOrderId) {
    try {
      // 获取回货单详情
      const returnOrderRes = await getReturnOrderById(returnOrderId)
      if (!returnOrderRes.data) {
        wx.showToast({
          title: '回货单不存在',
          icon: 'none'
        })
        return
      }

      const returnOrder = returnOrderRes.data

      // 获取关联信息
      const [factoryRes, styleRes, issueOrderRes] = await Promise.all([
        getFactoryById(returnOrder.factoryId || returnOrder.factory_id),
        getStyleById(returnOrder.styleId || returnOrder.style_id),
        query('issue_orders', {
          _id: returnOrder.issueId || returnOrder.issue_id
        }, { excludeDeleted: true })
      ])

      const factory = factoryRes.data
      const style = styleRes.data
      const issueOrder = issueOrderRes.data && issueOrderRes.data[0] ? issueOrderRes.data[0] : null

      // 准备分享数据
      const returnQuantity = returnOrder.returnQuantity || returnOrder.return_quantity || 0
      const returnPieces = returnOrder.returnPieces || returnOrder.return_pieces || 0
      const processingFee = returnOrder.processingFee || returnOrder.processing_fee || 0
      const pricePerDozen = returnQuantity > 0 ? (processingFee / returnQuantity) : 0

      const shareData = {
        ...returnOrder,
        factoryName: factory?.name || '未知工厂',
        styleName: style?.styleName || style?.style_name || '未知款号',
        styleCode: style?.styleCode || style?.style_code || '',
        issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
        issueDateFormatted: formatDate(issueOrder?.issueDate || issueOrder?.issue_date),
        issueWeight: issueOrder?.issueWeight || issueOrder?.issue_weight || 0,
        issueWeightFormatted: formatWeight(issueOrder?.issueWeight || issueOrder?.issue_weight || 0),
        returnDateFormatted: formatDate(returnOrder.returnDate || returnOrder.return_date),
        returnQuantityFormatted: `${returnQuantity.toFixed(1)}打`,
        returnPiecesFormatted: `${Math.floor(returnPieces / 12)}打${returnPieces % 12}件`,
        quantityFormatted: formatQuantity(returnPieces),
        processingFeeFormatted: formatAmount(processingFee),
        pricePerDozenFormatted: pricePerDozen.toFixed(2),
        actualYarnUsageFormatted: (returnOrder.actualYarnUsage || returnOrder.actual_yarn_usage || 0).toFixed(2),
        settledAmountFormatted: formatAmount(returnOrder.settledAmount || returnOrder.settled_amount || 0),
        settlementStatus: returnOrder.settlementStatus || returnOrder.settlement_status || '未结算'
      }

      // 生成分享图片
      const imagePath = await this.generateShareImage(shareData)

      // 显示分享选项
      wx.showActionSheet({
        itemList: ['保存到相册', '预览图片'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.saveImageToAlbum(imagePath)
          } else if (res.tapIndex === 1) {
            wx.previewImage({
              urls: [imagePath],
              current: imagePath
            })
          }
        }
      })
    } catch (error) {
      console.error('分享回货单失败:', error)
      wx.showToast({
        title: '分享失败',
        icon: 'none'
      })
    }
  },

  async generateShareImage(returnOrder) {
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas', this)
      const canvasWidth = 750
      const canvasHeight = 1200
      const padding = 40
      let y = padding

      // 背景
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // 标题
      ctx.setFillStyle('#333333')
      ctx.setFontSize(36)
      ctx.setTextAlign('center')
      ctx.fillText('回货单', canvasWidth / 2, y)
      y += 60

      // 回货单号
      ctx.setFillStyle('#666666')
      ctx.setFontSize(24)
      ctx.setTextAlign('center')
      ctx.fillText(`单号：${returnOrder.returnNo || ''}`, canvasWidth / 2, y)
      y += 50

      // 分隔线
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 加工厂信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(28)
      ctx.setTextAlign('left')
      ctx.fillText('加工厂：', padding, y)
      ctx.setFillStyle('#2b7fff')
      ctx.setFontSize(32)
      ctx.fillText(returnOrder.factoryName || '未知工厂', padding + 120, y)
      y += 50

      // 款号信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(28)
      ctx.fillText('款号：', padding, y)
      const styleText = returnOrder.styleCode ? `[${returnOrder.styleCode}] ${returnOrder.styleName}` : returnOrder.styleName
      ctx.setFillStyle('#101828')
      ctx.setFontSize(32)
      ctx.fillText(styleText || '未知款号', padding + 120, y)
      y += 50

      // 关联发料单信息
      if (returnOrder.issueNo && returnOrder.issueNo !== '未知') {
        ctx.setFillStyle('#333333')
        ctx.setFontSize(28)
        ctx.fillText('发料单号：', padding, y)
        ctx.setFillStyle('#101828')
        ctx.setFontSize(28)
        ctx.fillText(returnOrder.issueNo, padding + 140, y)
        y += 50

        if (returnOrder.issueDateFormatted) {
          ctx.setFillStyle('#333333')
          ctx.setFontSize(28)
          ctx.fillText('发料日期：', padding, y)
          ctx.setFillStyle('#666666')
          ctx.setFontSize(28)
          ctx.fillText(returnOrder.issueDateFormatted, padding + 140, y)
          y += 50
        }

        if (returnOrder.issueWeight > 0) {
          ctx.setFillStyle('#333333')
          ctx.setFontSize(28)
          ctx.fillText('发毛数：', padding, y)
          ctx.setFillStyle('#666666')
          ctx.setFontSize(28)
          ctx.fillText(`${returnOrder.issueWeightFormatted} kg`, padding + 140, y)
          y += 50
        }
      }

      // 分隔线
      y += 20
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 回货信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText('回货信息', padding, y)
      y += 50

      ctx.setFontSize(28)
      ctx.setFillStyle('#666666')
      ctx.fillText('回货日期：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.fillText(returnOrder.returnDateFormatted || '', padding + 140, y)
      y += 45

      ctx.setFillStyle('#666666')
      ctx.fillText('回货数量：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText(`${returnOrder.returnQuantityFormatted} (${returnOrder.returnPiecesFormatted})`, padding + 140, y)
      y += 45

      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('实际用纱：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.fillText(`${returnOrder.actualYarnUsageFormatted} kg`, padding + 140, y)
      y += 45

      // 分隔线
      y += 20
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 加工费信息
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText('加工费信息', padding, y)
      y += 50

      ctx.setFontSize(28)
      if (returnOrder.pricePerDozenFormatted) {
        ctx.setFillStyle('#666666')
        ctx.fillText('加工单价：', padding, y)
        ctx.setFillStyle('#333333')
        ctx.fillText(`¥${returnOrder.pricePerDozenFormatted} /打`, padding + 140, y)
        y += 45
      }

      ctx.setFillStyle('#666666')
      ctx.fillText('加工费总额：', padding, y)
      ctx.setFillStyle('#2b7fff')
      ctx.setFontSize(36)
      ctx.fillText(`¥${returnOrder.processingFeeFormatted}`, padding + 180, y)
      y += 55

      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('结算状态：', padding, y)
      const statusColor = returnOrder.settlementStatus === '已结算' ? '#10b981' : 
                          returnOrder.settlementStatus === '部分结算' ? '#f59e0b' : '#f56565'
      ctx.setFillStyle(statusColor)
      ctx.fillText(returnOrder.settlementStatus || '未结算', padding + 140, y)
      y += 45

      if (returnOrder.settledAmount > 0) {
        ctx.setFillStyle('#666666')
        ctx.fillText('已结算：', padding, y)
        ctx.setFillStyle('#10b981')
        ctx.fillText(`¥${returnOrder.settledAmountFormatted}`, padding + 140, y)
        y += 45
      }

      // 底部信息
      y = canvasHeight - 60
      ctx.setFillStyle('#999999')
      ctx.setFontSize(20)
      ctx.setTextAlign('center')
      ctx.fillText(`生成时间：${new Date().toLocaleString('zh-CN')}`, canvasWidth / 2, y)

      ctx.draw(false, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'shareCanvas',
            width: canvasWidth,
            height: canvasHeight,
            destWidth: canvasWidth,
            destHeight: canvasHeight,
            success: (res) => {
              resolve(res.tempFilePath)
            },
            fail: (err) => {
              console.error('canvasToTempFilePath 失败:', err)
              reject(err)
            }
          }, this)
        }, 800)
      })
    })
  },

  saveImageToAlbum(imagePath) {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.doSaveImage(imagePath)
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '提示',
            content: '需要授权保存图片到相册，请在设置中开启',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.writePhotosAlbum']) {
                      this.doSaveImage(imagePath)
                    }
                  }
                })
              }
            }
          })
        } else {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => {
              this.doSaveImage(imagePath)
            },
            fail: () => {
              wx.showToast({
                title: '需要授权才能保存图片',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  },

  doSaveImage(imagePath) {
    wx.saveImageToPhotosAlbum({
      filePath: imagePath,
      success: () => {
        wx.showToast({
          title: '图片已保存到相册',
          icon: 'success'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      },
      fail: (err) => {
        console.error('保存图片失败:', err)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    })
  }

})

