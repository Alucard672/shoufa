// pages/return/create.js
import { query, getFactoryById, getStyleById, insert, calculateIssueProgress, updateIssueOrderStatus, update, getReturnOrderById } from '../../utils/db.js'
import {
  generateReturnNo,
  formatDate,
  formatAmount,
  formatQuantity,
  formatWeight,
  calculateReturnPieces,
  calculateActualYarnUsage,
  calculateProcessingFee
} from '../../utils/calc.js'
import { getPiecesPerDozenSync } from '../../utils/systemParams.js'
import { checkLogin } from '../../utils/auth.js'
const app = getApp()

Page({
  data: {
    returnId: '', // 编辑模式下的回货单ID
    isEdit: false, // 是否为编辑模式
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
    styleImageUrl: '',
    styleImageError: false,
    shareAfterSave: false,
    status: '进行中',
    returnOrderId: null,
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
      styleImageUrl: '',
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
        returnId: options.id,
        isEdit: true
      })
    }
    
    await this.loadDictionaries()

    if (options.issueId) {
      this.setData({
        issueId: options.issueId
      })
      await this.loadIssueOrder()
    }
    
    // 编辑模式下加载回货单数据
    if (this.data.isEdit) {
      await this.loadReturnOrder()
    } else {
      this.setData({
        returnDate: formatDate(new Date())
      })
    }
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
      const rawId = this.data.issueId
      let issueOrder = null

      // 1) 优先按 _id 查询
      const byDoc = await query('issue_orders', { _id: rawId }, { excludeDeleted: true }).catch(() => ({ data: [] }))
      if (byDoc.data && byDoc.data[0]) {
        issueOrder = byDoc.data[0]
      }

      // 2) 回退按自定义 id 查询（数字 id）
      if (!issueOrder) {
        const idStr = String(rawId || '')
        const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null
        if (idNum !== null) {
          const byId = await query('issue_orders', { id: idNum }, { excludeDeleted: true }).catch(() => ({ data: [] }))
          if (byId.data && byId.data[0]) issueOrder = byId.data[0]
        }
      }

      if (issueOrder) {
        // 统一使用真实 _id 作为后续操作的 issueId，避免 doc/update 失败
        const resolvedIssueId = String(issueOrder._id || rawId || issueOrder.id || '')
        this.setData({ issueId: resolvedIssueId })

        // 已完成的发料单不允许继续回货
        if (issueOrder.status === '已完成') {
          wx.showModal({
            title: '提示',
            content: '该发料单已完成，无法继续登记回货。',
            showCancel: false,
            success: () => wx.navigateBack()
          })
          return
        }

        const factoryId = issueOrder.factoryId || issueOrder.factory_id
        const styleId = issueOrder.styleId || issueOrder.style_id

        console.log('加载关联信息:', { factoryId, styleId })

        const [factoryRes, styleRes] = await Promise.all([
          getFactoryById(factoryId),
          getStyleById(styleId)
        ])

        const styleImageUrl = this.normalizeImageUrl(styleRes.data)

        this.setData({
          issueOrder: issueOrder,
          factory: factoryRes.data,
          style: styleRes.data,
          styleImageUrl: styleImageUrl,
          styleImageError: false
        })

        // 重新计算一次，确保初始状态正确
        this.calculate()
        // 如果发料单有颜色，默认选中该颜色
        this.setDefaultColor()
      } else {
        wx.showToast({
          title: '发料单不存在',
          icon: 'none'
        })
        setTimeout(() => wx.navigateBack(), 1500)
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
    const piecesPerDozen = getPiecesPerDozenSync()
    const doz = parseFloat(this.data.returnDozens) || 0
    const extraPcs = parseInt(this.data.returnPieces) || 0
    const totalPieces = doz * piecesPerDozen + extraPcs

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

    // 换算为打数进行计算：总件数 / piecesPerDozen
    const totalQuantity = pieces / piecesPerDozen
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

  // 加载回货单数据（编辑模式）
  async loadReturnOrder() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const returnOrderRes = await getReturnOrderById(this.data.returnId)
      const returnOrder = returnOrderRes.data
      
      if (!returnOrder || returnOrder.deleted || returnOrder.voided) {
        throw new Error('回货单不存在或已作废')
      }
      
      // 加载关联的发料单
      const issueId = returnOrder.issueId || returnOrder.issue_id
      if (issueId) {
        this.setData({ issueId: issueId })
        await this.loadIssueOrder()
      }
      
      // 计算打数和件数
      const piecesPerDozen = getPiecesPerDozenSync()
      const returnQuantity = returnOrder.returnQuantity || returnOrder.return_quantity || 0
      const returnPieces = returnOrder.returnPieces || returnOrder.return_pieces || 0
      const doz = Math.floor(returnPieces / piecesPerDozen)
      const extraPcs = returnPieces % piecesPerDozen
      
      // 查找颜色和尺码
      const colorName = returnOrder.color || ''
      const sizeName = returnOrder.size || ''
      const selectedColor = this.data.colorOptions.find(c => 
        (c.name || c) === colorName
      ) || null
      const selectedSize = this.data.sizeOptions.find(s => 
        (s.name || s) === sizeName
      ) || null
      
      this.setData({
        returnDozens: String(doz),
        returnPieces: String(extraPcs),
        returnDate: formatDate(returnOrder.returnDate || returnOrder.return_date || returnOrder.createTime || returnOrder.create_time),
        selectedColor: selectedColor,
        selectedColors: selectedColor ? [selectedColor] : [],
        selectedSize: selectedSize,
        selectedSizes: selectedSize ? [selectedSize] : [],
        status: returnOrder.status || '进行中'
      })
      
      // 重新计算
      this.calculate()
      
      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('加载回货单失败:', error)
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

  async onSubmit() {
    if (this.data.submitting) return

    if (!this.data.issueId) {
      wx.showToast({
        title: '请选择发料单',
        icon: 'none'
      })
      return
    }

    // 再次校验：已完成单据禁止回货（防止绕过）
    if (this.data.issueOrder && this.data.issueOrder.status === '已完成') {
      wx.showToast({
        title: '该发料单已完成，无法继续回货',
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
      this.setData({ submitting: true })
      wx.showLoading({
        title: this.data.isEdit ? '保存中...' : '创建中...'
      })

      const piecesPerDozen = getPiecesPerDozenSync()
      const returnDate = new Date(this.data.returnDate)
      const quantity = pieces / piecesPerDozen // 存储为标准打数
      const yarnUsage = this.data.calculatedYarnUsage
      const fee = this.data.calculatedFee
      const color = this.data.selectedColor ? (this.data.selectedColor.name || this.data.selectedColor) : ''
      const size = this.data.selectedSize ? (this.data.selectedSize.name || this.data.selectedSize) : ''

      if (this.data.isEdit) {
        // 编辑模式：更新回货单
        const db = wx.cloud.database()
        const updateData = {
          returnQuantity: quantity,
          return_quantity: quantity,
          returnPieces: pieces,
          return_pieces: pieces,
          actualYarnUsage: yarnUsage,
          actual_yarn_usage: yarnUsage,
          returnDate: returnDate,
          return_date: returnDate,
          processingFee: fee,
          processing_fee: fee,
          color: color,
          size: size || '',
          status: this.data.status || '进行中',
          updateTime: db.serverDate()
        }
        
        const result = await db.collection('return_orders')
          .doc(this.data.returnId)
          .update({
            data: updateData
          })
        
        if (result.stats.updated === 0) {
          throw new Error('更新失败，请检查数据库权限')
        }
        
        // 更新发料单状态
        const issueId = this.data.issueOrder._id || this.data.issueOrder.id || this.data.issueId
        try {
          const progress = await calculateIssueProgress(issueId)
          await updateIssueOrderStatus(issueId, progress.status)
        } catch (error) {
          console.error('更新发料单状态失败:', error)
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
        // 新增模式：创建回货单
        const returnNo = generateReturnNo()
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
      }
    } catch (error) {
      this.setData({ submitting: false })
      wx.hideLoading()
      console.error(this.data.isEdit ? '更新回货单失败:' : '创建回货单失败:', error)
      wx.showToast({
        title: error.message || (this.data.isEdit ? '保存失败' : '创建失败'),
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
        returnPiecesFormatted: formatQuantity(returnPieces),
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
    return new Promise(async (resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas', this)
      
      try {
        // 1. 预加载图片
        const imageUrl = returnOrder.styleImageUrl || (this.data.style?.imageUrl || this.data.style?.image_url || '').trim()
        let localImagePath = null
        if (imageUrl && (imageUrl.startsWith('cloud://') || imageUrl.startsWith('http'))) {
          localImagePath = await new Promise(res => {
            wx.getImageInfo({
              src: imageUrl,
              success: (info) => res(info.path),
              fail: () => res(null)
            })
          })
        }

        // 2. 动态计算画布高度
        const headerHeight = 320
        const summaryHeight = 620 
        const footerHeight = 120
        const canvasWidth = 750
        const canvasHeight = headerHeight + summaryHeight + footerHeight

        // 3. 绘制背景
        ctx.setFillStyle('#F8FAFC')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 4. 绘制青色浸入式头部
        const grd = ctx.createLinearGradient(0, 0, canvasWidth, 320)
        grd.addColorStop(0, '#10B981')
        grd.addColorStop(1, '#059669')
        ctx.setFillStyle(grd)
        ctx.fillRect(0, 0, canvasWidth, 320)

        const padding = 40
        const cardPadding = 32

        // 头部标题和图标盒
        ctx.save()
        ctx.setGlobalAlpha(0.15)
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, 60, 96, 96, 24)
        ctx.fill()
        ctx.restore()
        
        ctx.setFillStyle('#FFFFFF')
        ctx.setFontSize(44)
        ctx.setTextAlign('center')
        ctx.fillText('回', padding + 48, 125)

        ctx.setTextAlign('left')
        ctx.setFontSize(48)
        ctx.fillText(returnOrder.factoryName || '加工厂', padding + 120, 105)
        ctx.setFontSize(26)
        ctx.setGlobalAlpha(0.8)
        ctx.fillText(`单号: ${returnOrder.returnNo || '-'}`, padding + 120, 148)
        ctx.setGlobalAlpha(1)

        // 时间日期
        ctx.setFontSize(24)
        ctx.fillText(`📅 回货日期: ${returnOrder.returnDateFormatted || '-'}`, padding, 250)

        // 5. 汇总统计网格 (3x2)
        const gridY = 290
        const itemWidth = (canvasWidth - padding * 2 - 20) / 2
        const itemHeight = 160
        const gap = 20

        const summaryItems = [
          { label: '回货数量', value: returnOrder.quantityFormatted || returnOrder.returnPiecesFormatted || '0打0件' },
          { label: '实际用纱', value: `${returnOrder.actualYarnUsageFormatted}kg` },
          { label: '发料单号', value: returnOrder.issueNo || '-' },
          { label: '加工单价', value: `¥${returnOrder.pricePerDozenFormatted}/打` },
          { label: '加工费总额', value: `¥${returnOrder.processingFeeFormatted}` },
          { label: '结算状态', value: returnOrder.settlementStatus || '未结算' }
        ]

        summaryItems.forEach((item, index) => {
          const col = index % 2
          const row = Math.floor(index / 2)
          const x = padding + col * (itemWidth + gap)
          const y = gridY + row * (itemHeight + gap)

          ctx.save()
          ctx.shadowColor = 'rgba(0, 0, 0, 0.05)'
          ctx.shadowBlur = 10
          ctx.shadowOffsetY = 4
          ctx.setFillStyle('#FFFFFF')
          this.drawRoundedRect(ctx, x, y, itemWidth, itemHeight, 24)
          ctx.fill()
          ctx.restore()

          ctx.setFillStyle('#64748B')
          ctx.setFontSize(24)
          ctx.fillText(item.label, x + cardPadding, y + 54)

          const isHighlight = item.label === '加工费总额'
          const isWarning = item.label === '结算状态' && item.value !== '已结算'
          ctx.setFillStyle(isHighlight ? '#10B981' : (isWarning ? '#F59E0B' : '#1E293B'))
          ctx.setFontSize(isHighlight ? 40 : 34)
          ctx.fillText(item.value, x + cardPadding, y + 115)
        });

        // 6. 款式信息预览卡片
        let currentY = gridY + 3 * (itemHeight + gap) + 40
        ctx.save()
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, currentY, canvasWidth - padding * 2, 160, 24)
        ctx.fill()
        ctx.restore()

        if (localImagePath) {
          ctx.save()
          this.drawRoundedRect(ctx, padding + 24, currentY + 30, 100, 100, 16)
          ctx.clip()
          ctx.drawImage(localImagePath, padding + 24, currentY + 30, 100, 100)
          ctx.restore()
        } else {
          ctx.setFillStyle('#F1F5F9')
          this.drawRoundedRect(ctx, padding + 24, currentY + 30, 100, 100, 16)
          ctx.fill()
        }

        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(32)
        ctx.fillText(returnOrder.styleName || '未知款号', padding + 150, currentY + 70)
        ctx.setFillStyle('#64748B')
        ctx.setFontSize(26)
        ctx.fillText(`款号: ${returnOrder.styleCode || '-'}  ·  颜色: ${returnOrder.color || '-'}`, padding + 150, currentY + 115)

        // 8. 底部信息
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.setTextAlign('center')
        ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, canvasHeight - 60)

        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'shareCanvas',
              success: (res) => resolve(res.tempFilePath),
              fail: (err) => reject(err)
            }, this)
          }, 1000)
        })
      } catch (err) {
        console.error('generateShareImage error:', err)
        reject(err)
      }
    })
  },

  // 辅助函数：绘制圆角矩形
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.arcTo(x + width, y, x + width, y + radius, radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
    ctx.lineTo(x + radius, y + height)
    ctx.arcTo(x, y + height, x, y + height - radius, radius)
    ctx.lineTo(x, y + radius)
    ctx.arcTo(x, y, x + radius, y, radius)
    ctx.closePath()
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

