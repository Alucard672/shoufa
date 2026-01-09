// pages/return/detail.js
import { queryByIds, getReturnOrderById } from '../../utils/db.js'
import { checkLogin } from '../../utils/auth.js'
import { formatAmount, formatDate, formatQuantity, formatWeight, formatDateTime } from '../../utils/calc.js'
import { normalizeImageUrl, getImageUrl } from '../../utils/image.js'
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    returnId: '',
    returnOrder: null,
    loading: false,
    currentTime: '',
    canvasWidth: 750,
    canvasHeight: 1200
  },

  // 图片加载失败：降级为占位图
  onStyleImageError() {
    if (this.data.returnOrder) {
      this.setData({ 'returnOrder.styleImageUrl': '' })
    }
  },

  async onLoad(options) {
    if (!checkLogin()) {
      return
    }

    this.setData({
      currentTime: formatDateTime(new Date())
    })

    if (options.id) {
      this.setData({
        returnId: options.id
      })
      await this.loadData()
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      await this.loadReturnOrder()
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadReturnOrder() {
    try {
      const orderRes = await getReturnOrderById(this.data.returnId)
      const order = orderRes.data

      if (!order || order.deleted) {
        throw new Error('回货单不存在')
      }

      // 获取工厂、款号、发料单信息
      const [factoryRes, styleRes, issueRes] = await Promise.all([
        queryByIds('factories', [order.factoryId || order.factory_id]),
        queryByIds('styles', [order.styleId || order.style_id]),
        queryByIds('issue_orders', [order.issueId || order.issue_id])
      ])

      const factory = factoryRes.data?.[0]
      const style = styleRes.data?.[0]
      const issueOrder = issueRes.data?.[0]

      const processingFee = order.processingFee || order.processing_fee || 0
      const returnQuantity = order.returnQuantity || order.return_quantity || 0
      const pricePerDozen = returnQuantity > 0 ? (processingFee / returnQuantity) : 0
      // 异步获取图片URL（如果是cloud://格式则转换为临时链接）
      let styleImageUrl = normalizeImageUrl(style)
      if (styleImageUrl && styleImageUrl.startsWith('cloud://')) {
        // 异步转换，先使用空字符串避免500错误
        styleImageUrl = ''
        getImageUrl(style).then(tempUrl => {
          if (tempUrl && !tempUrl.startsWith('cloud://')) {
            this.setData({ returnOrder: { ...this.data.returnOrder, styleImageUrl: tempUrl } })
          }
        }).catch(() => {
          // 转换失败，保持为空字符串
        })
      }
      const settlementStatus = order.settlementStatus || order.settlement_status || '未结算'
      const settledAmount = order.settledAmount || order.settled_amount || 0
      const returnPieces = Math.floor(order.returnPieces || order.return_pieces || 0)

      this.setData({
        returnOrder: {
          ...order,
          _id: order._id || this.data.returnId,
          voided: order.voided || false, // 是否已作废
          factoryName: factory?.name || '未知工厂',
          styleName: style?.styleName || style?.style_name || '未知款号',
          styleCode: style?.styleCode || style?.style_code || '',
          styleImageUrl: styleImageUrl,
          issueNo: issueOrder?.issueNo || issueOrder?.issue_no || '未知',
          returnDateFormatted: formatDate(order.returnDate || order.return_date || order.createTime || order.create_time),
          createTimeFormatted: formatDateTime(order.createTime || order.create_time),
          quantityFormatted: formatQuantity(returnPieces),
          actualYarnUsageFormatted: (order.actualYarnUsage || order.actual_yarn_usage || 0).toFixed(2),
          processingFeeFormatted: formatAmount(processingFee),
          pricePerDozenFormatted: pricePerDozen.toFixed(2),
          settlementStatus: settlementStatus,
          settledAmount: settledAmount,
          settledAmountFormatted: formatAmount(settledAmount),
          operatorName: order.operatorName || order.employeeName || '系统管理员'
        }
      })
    } catch (error) {
      console.error('加载回货单失败:', error)
      throw error
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

  async onShare() {
    try {
      wx.showLoading({ title: '生成图片中...' })
      const imagePath = await this.generateShareImage()
      wx.hideLoading()

      wx.showActionSheet({
        itemList: ['保存到相册', '预览图片'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.saveImageToAlbum(imagePath)
          } else if (res.tapIndex === 1) {
            wx.previewImage({ urls: [imagePath], current: imagePath })
          }
        }
      })
    } catch (error) {
      wx.hideLoading()
      console.error('生成分享图片失败:', error)
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  // 作废/恢复回货单（保留，可能从列表页调用）
  async onToggleVoid() {
    const { returnOrder } = this.data
    if (!returnOrder) return

    const isVoided = returnOrder.voided || false
    const action = isVoided ? '恢复' : '作废'
    const isSettled = returnOrder.settlementStatus === '已结算' || returnOrder.settlement_status === '已结算'

    let content = `确定要${action}回货单 "${returnOrder.returnNo || ''}" 吗？`
    if (!isVoided && isSettled) {
      content += '\n\n该回货单已结算，作废后仍可查看历史数据。'
    } else if (!isVoided) {
      content += '\n\n作废后该回货单将不会出现在正常列表中。'
    }

    wx.showModal({
      title: `确认${action}`,
      content: content,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: `${action}中...` })
            
            const db = wx.cloud.database()
            const result = await db.collection('return_orders')
              .doc(returnOrder._id)
              .update({
                data: {
                  voided: !isVoided,
                  updateTime: db.serverDate()
                }
              })
            
            if (result.stats.updated === 0) {
              throw new Error('权限不足或记录不存在，请检查数据库权限设置')
            }
            
            wx.hideLoading()
            wx.showToast({
              title: `${action}成功`,
              icon: 'success'
            })
            
            // 重新加载数据
            await this.loadData()
          } catch (error) {
            wx.hideLoading()
            console.error(`${action}失败:`, error)
            wx.showToast({
              title: `${action}失败: ${error.message || '未知错误'}`,
              icon: 'none',
              duration: 3000
            })
          }
        }
      }
    })
  },

  async generateShareImage() {
    return new Promise(async (resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const { returnOrder } = this.data

      if (!returnOrder) {
        reject(new Error('数据加载中'))
        return
      }

      try {
        // 1. 预加载图片
        const imageUrl = returnOrder.styleImageUrl
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

        // 2. 静态高度 (回货单详情通常不需要很长)
        const headerHeight = 320
        const summaryHeight = 620
        const cardHeight = 200
        const footerHeight = 120
        const canvasWidth = 750
        const canvasHeight = headerHeight + summaryHeight + cardHeight + footerHeight

        this.setData({ canvasWidth, canvasHeight })

        // 3. 绘制背景
        ctx.setFillStyle('#F8FAFC')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 4. 头部 (青色渐变)
        const grd = ctx.createLinearGradient(0, 0, canvasWidth, 320)
        grd.addColorStop(0, '#10B981')
        grd.addColorStop(1, '#059669')
        ctx.setFillStyle(grd)
        ctx.fillRect(0, 0, canvasWidth, 320)

        const padding = 40
        const cardPadding = 32

        ctx.save()
        ctx.setGlobalAlpha(0.15); ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, 60, 96, 96, 24)
        ctx.fill(); ctx.restore()
        
        ctx.setFillStyle('#FFFFFF'); ctx.setFontSize(44); ctx.setTextAlign('center')
        ctx.fillText('回', padding + 48, 125)

        ctx.setTextAlign('left'); ctx.setFontSize(48)
        ctx.fillText(returnOrder.factoryName || '加工厂', padding + 120, 105)
        ctx.setFontSize(26); ctx.setGlobalAlpha(0.8)
        ctx.fillText(`单号: ${returnOrder.returnNo || '-'}`, padding + 120, 148)
        ctx.setGlobalAlpha(1)

        ctx.setFontSize(24)
        ctx.fillText(`📅 回货日期: ${returnOrder.returnDateFormatted}`, padding, 250)

        // 5. 汇总网格
        const gridY = 290
        const itemWidth = (canvasWidth - padding * 2 - 20) / 2
        const itemHeight = 160
        const gap = 20

        const summaryItems = [
          { label: '回货数量', value: `${returnOrder.quantityFormatted}` },
          { label: '回货重量', value: `${returnOrder.actualYarnUsageFormatted} kg` },
          { label: '对应发料单', value: `${returnOrder.issueNo}` },
          { label: '加工单价', value: `¥${returnOrder.pricePerDozenFormatted}` },
          { label: '加工费总额', value: `¥${returnOrder.processingFeeFormatted}` },
          { label: '结算状态', value: `${returnOrder.settlementStatus}` }
        ]

        summaryItems.forEach((item, index) => {
          const col = index % 2
          const row = Math.floor(index / 2)
          const x = padding + col * (itemWidth + gap)
          const y = gridY + row * (itemHeight + gap)

          ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.05)'; ctx.shadowBlur = 10
          ctx.setFillStyle('#FFFFFF')
          this.drawRoundedRect(ctx, x, y, itemWidth, itemHeight, 24)
          ctx.fill(); ctx.restore()

          ctx.setFillStyle('#64748B'); ctx.setFontSize(24)
          ctx.fillText(item.label, x + cardPadding, y + 54)
          
          const isHighlight = item.label === '加工费总额'
          ctx.setFillStyle(isHighlight ? '#10B981' : '#1E293B')
          ctx.setFontSize(isHighlight ? 40 : 34)
          ctx.fillText(item.value, x + cardPadding, y + 115)
        })

        // 6. 款式信息
        let currentY = gridY + 3 * (itemHeight + gap) + 40
        ctx.save(); ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, currentY, canvasWidth - padding * 2, 160, 24)
        ctx.fill(); ctx.restore()

        if (localImagePath) {
          ctx.save()
          this.drawRoundedRect(ctx, padding + 24, currentY + 30, 100, 100, 16)
          ctx.clip()
          ctx.drawImage(localImagePath, padding + 24, currentY + 30, 100, 100)
          ctx.restore()
        }

        ctx.setFillStyle('#1E293B'); ctx.setFontSize(32)
        ctx.fillText(returnOrder.styleName, padding + 150, currentY + 70)
        ctx.setFillStyle('#64748B'); ctx.setFontSize(26)
        ctx.fillText(`款号: ${returnOrder.styleCode}  ·  操作人: ${returnOrder.operatorName}`, padding + 150, currentY + 115)

        // 8. 底部
        ctx.setFillStyle('#94A3B8'); ctx.setFontSize(22); ctx.setTextAlign('center')
        ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, canvasHeight - 60)

        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'shareCanvas',
              width: canvasWidth,
              height: canvasHeight,
              destWidth: canvasWidth,
              destHeight: canvasHeight, // 指定导出高度
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
    wx.saveImageToPhotosAlbum({
      filePath: imagePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})

