// pages/accounting/detail.js
import { queryByIds } from '../../utils/db.js'
import { checkLogin, getTenantId } from '../../utils/auth.js'
import { formatAmount, formatDate, formatQuantity, formatWeight, formatDateTime } from '../../utils/calc.js'
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    factoryId: '',
    factory: null,
    returnOrders: [],
    settlements: [],
    loading: false,
    summary: {
      totalAmount: 0,
      settledAmount: 0,
      unpaidAmount: 0
    },
    summaryFormatted: {
      totalAmount: '0.00',
      settledAmount: '0.00',
      unpaidAmount: '0.00',
      totalIssueWeight: '0.00',
      totalReturnWeight: '0.00',
      totalReturnPieces: '0打0件'
    },
    currentTime: ''
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
        factoryId: options.id
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

  async onShow() {
    if (this.data.factoryId) {
      await this.loadData()
    }
  },

  // 预览图片
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  },

  async loadData() {
    this.setData({ loading: true })

    try {
      await Promise.all([
        this.loadFactory(),
        this.loadReturnOrders(),
        this.loadSettlements()
      ])
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

  async loadFactory() {
    try {
      const result = await queryByIds('factories', [this.data.factoryId], {
        excludeDeleted: true
      })

      if (result.data && result.data.length > 0) {
        this.setData({
          factory: result.data[0]
        })
      }
    } catch (error) {
      console.error('加载加工厂失败:', error)
      throw error
    }
  },

  async loadReturnOrders() {
    const tenantId = getTenantId()
    if (!tenantId) {
      return
    }

    try {
      // 查询该加工厂的所有回货单
      const returnOrdersRes = await db.collection('return_orders')
        .where({
          tenantId: tenantId,
          factoryId: this.data.factoryId,
          deleted: false
        })
        .orderBy('returnDate', 'desc')
        .get()

      const returnOrders = returnOrdersRes.data || []

      // 获取所有款号ID和发料单ID
      const styleIds = [...new Set(returnOrders.map(order => order.styleId).filter(Boolean))]
      const issueIds = [...new Set(returnOrders.map(order => order.issueId).filter(Boolean))]
      
      // 批量查询款号信息
      let stylesMap = {}
      if (styleIds.length > 0) {
        const stylesRes = await queryByIds('styles', styleIds, {
          excludeDeleted: true
        })
        stylesMap = Object.fromEntries(
          (stylesRes.data || []).map(style => [style._id || style.id, style])
        )
      }

      // 批量查询发料单信息
      let issueOrdersMap = {}
      if (issueIds.length > 0) {
        const issueRes = await queryByIds('issue_orders', issueIds, {
          excludeDeleted: true
        })
        issueOrdersMap = Object.fromEntries(
          (issueRes.data || []).map(issue => [issue._id || issue.id, issue])
        )
      }

      // 处理回货单数据
      const ordersWithDetails = returnOrders.map(order => {
        const style = stylesMap[order.styleId]
        const issueOrder = issueOrdersMap[order.issueId]
        const processingFee = order.processingFee || 0
        const settledAmount = order.settledAmount || 0
        const unpaidAmount = processingFee - settledAmount
        
        // 发料重量（发毛数）
        const issueWeight = issueOrder?.issueWeight || 0
        // 回货数量
        const returnQuantity = order.returnQuantity || 0 // 打数
        const returnPieces = order.returnPieces || 0 // 件数
        // 回货重量（实际用纱量）
        const returnWeight = order.actualYarnUsage || order.actual_yarn_usage || 0

        const styleImageUrl = (style?.imageUrl || style?.image_url || style?.image || '').trim()

        return {
          ...order,
          styleName: style?.styleName || '未知款号',
          styleCode: style?.styleCode || '',
          styleImageUrl: styleImageUrl,
          employeeName: order.employeeName || order.operatorName || '系统管理员',
          processingFee: processingFee,
          settledAmount: settledAmount,
          unpaidAmount: unpaidAmount,
          issueWeight: issueWeight,
          returnQuantity: returnQuantity,
          returnPieces: returnPieces,
          returnWeight: returnWeight,
          returnDateFormatted: formatDate(order.returnDate),
          processingFeeFormatted: formatAmount(processingFee),
          settledAmountFormatted: formatAmount(settledAmount),
          unpaidAmountFormatted: formatAmount(unpaidAmount),
          issueWeightFormatted: formatWeight(issueWeight),
          returnQuantityFormatted: returnQuantity > 0 ? `${returnQuantity.toFixed(1)}打` : '0打',
          returnPiecesFormatted: formatQuantity(returnPieces),
          returnWeightFormatted: formatWeight(returnWeight)
        }
      })

      // 计算汇总（包括发毛数和回货数）
      const summary = ordersWithDetails.reduce((acc, order) => {
        acc.totalAmount += order.processingFee
        acc.settledAmount += order.settledAmount
        acc.unpaidAmount += order.unpaidAmount
        acc.totalIssueWeight += order.issueWeight
        acc.totalReturnQuantity += order.returnQuantity
        acc.totalReturnPieces += order.returnPieces
        acc.totalReturnWeight += order.returnWeight
        return acc
      }, { 
        totalAmount: 0, 
        settledAmount: 0, 
        unpaidAmount: 0,
        totalIssueWeight: 0,
        totalReturnQuantity: 0,
        totalReturnPieces: 0,
        totalReturnWeight: 0
      })

      this.setData({
        returnOrders: ordersWithDetails,
        summary: summary,
        summaryFormatted: {
          totalAmount: formatAmount(summary.totalAmount),
          settledAmount: formatAmount(summary.settledAmount),
          unpaidAmount: formatAmount(summary.unpaidAmount),
          totalIssueWeight: formatWeight(summary.totalIssueWeight),
          totalReturnQuantity: summary.totalReturnQuantity > 0 ? `${summary.totalReturnQuantity.toFixed(1)}打` : '0打',
          totalReturnPieces: formatQuantity(summary.totalReturnPieces),
          totalReturnWeight: formatWeight(summary.totalReturnWeight)
        },
        currentTime: formatDateTime(new Date())
      })
    } catch (error) {
      console.error('加载回货单失败:', error)
      throw error
    }
  },

  async loadSettlements() {
    const tenantId = getTenantId()
    if (!tenantId) {
      return
    }

    try {
      const settlementsRes = await db.collection('settlements')
        .where({
          tenantId: tenantId,
          factoryId: this.data.factoryId,
          deleted: false
        })
        .orderBy('settlementDate', 'desc')
        .get()

      const settlements = (settlementsRes.data || []).map(settlement => ({
        ...settlement,
        settlementDateFormatted: formatDate(settlement.settlementDate),
        totalAmountFormatted: formatAmount(settlement.totalAmount || 0)
      }))

      this.setData({
        settlements: settlements
      })
    } catch (error) {
      console.error('加载结算单失败:', error)
      throw error
    }
  },

  async onShare() {
    try {
      wx.showLoading({
        title: '生成图片中...'
      })

      // 生成图片
      const imagePath = await this.generateShareImage()

      wx.hideLoading()

      // 显示操作菜单
      wx.showActionSheet({
        itemList: ['保存到相册', '预览图片'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 保存到相册
            this.saveImageToAlbum(imagePath)
          } else if (res.tapIndex === 1) {
            // 预览图片（可以长按保存或分享）
            wx.previewImage({
              urls: [imagePath],
              current: imagePath,
              success: () => {
                // 预览成功后，提示用户可以长按保存或分享
                wx.showToast({
                  title: '长按图片可保存或分享',
                  icon: 'none',
                  duration: 2000
                })
              }
            })
          }
        },
        fail: () => {
          // 用户取消选择
        }
      })
    } catch (error) {
      wx.hideLoading()
      console.error('生成分享图片失败:', error)
      wx.showToast({
        title: '生成失败',
        icon: 'none'
      })
    }
  },

  saveImageToAlbum(imagePath) {
    // 检查授权状态
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          // 已授权，直接保存
          this.doSaveImage(imagePath)
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          // 已拒绝授权，需要引导用户打开设置
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
          // 未询问过，请求授权
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
      },
      fail: (err) => {
        console.error('保存图片失败:', err)
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示',
            content: '需要授权保存图片到相册，请在设置中开启',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              }
            }
          })
        } else {
          wx.showToast({
            title: '保存失败',
            icon: 'none'
          })
        }
      }
    })
  },

  async generateShareImage() {
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const { factory, returnOrders, summaryFormatted, currentTime } = this.data

      if (!factory) {
        reject(new Error('数据加载中，请稍后再试'))
        return
      }

      // 画布尺寸
      const canvasWidth = 750
      const canvasHeight = 1600
      const padding = 40
      const cardPadding = 24
      
      // 1. 背景
      ctx.setFillStyle('#F8FAFC')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // 2. 蓝色头部
      ctx.setFillStyle('#155DFC')
      ctx.fillRect(0, 0, canvasWidth, 320)

      // 头部标题和图标
      // 模拟图标盒子
      ctx.save()
      ctx.setGlobalAlpha(0.2)
      ctx.setFillStyle('#FFFFFF')
      this.drawRoundedRect(ctx, padding, 60, 96, 96, 20)
      ctx.fill()
      ctx.restore()
      
      // 图标文字占位
      ctx.setFillStyle('#FFFFFF')
      ctx.setFontSize(40)
      ctx.setTextAlign('center')
      ctx.fillText('账', padding + 48, 125)

      ctx.setTextAlign('left')
      ctx.setFontSize(44)
      ctx.fillText(factory.name || '加工厂', padding + 120, 105)
      ctx.setFontSize(24)
      ctx.setGlobalAlpha(0.8)
      ctx.fillText('账款明细', padding + 120, 145)
      ctx.setGlobalAlpha(1)

      // 头部日期
      ctx.setFontSize(24)
      ctx.setGlobalAlpha(0.9)
      ctx.fillText(`📅 ${currentTime || formatDateTime(new Date())}`, padding, 240)
      ctx.setGlobalAlpha(1)

      // 3. 汇总统计网格 (3x2)
      const gridY = 280
      const itemWidth = (canvasWidth - padding * 2 - 20) / 2
      const itemHeight = 160
      const gap = 20

      const summaryItems = [
        { label: '总金额', value: `¥${summaryFormatted.totalAmount}`, color: '#E0E7FF' },
        { label: '已结算', value: `¥${summaryFormatted.settledAmount}`, color: '#DCFCE7' },
        { label: '未结算', value: `¥${summaryFormatted.unpaidAmount}`, color: '#FFEDD5' },
        { label: '发毛数', value: summaryFormatted.totalIssueWeight, color: '#F3E8FF' },
        { label: '回货重量', value: summaryFormatted.totalReturnWeight, color: '#FCE7F3' },
        { label: '回货数量', value: summaryFormatted.totalReturnPieces, color: '#DBEAFE' }
      ]

      summaryItems.forEach((item, index) => {
        const col = index % 2
        const row = Math.floor(index / 2)
        const x = padding + col * (itemWidth + gap)
        const y = gridY + row * (itemHeight + gap)

        // 卡片背景
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, x, y, itemWidth, itemHeight, 24)
        ctx.fill()

        // 标签
        ctx.setFillStyle('#64748B')
        ctx.setFontSize(24)
        ctx.fillText(item.label, x + cardPadding, y + 50)

        // 数值
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(36)
        ctx.fillText(item.value, x + cardPadding, y + 110)
      });

      // 4. 回货单明细标题
      let currentY = gridY + 3 * (itemHeight + gap) + 40
      ctx.setFillStyle('#155DFC')
      ctx.fillRect(padding, currentY, 8, 32)
      ctx.setFillStyle('#1E293B')
      ctx.setFontSize(32)
      ctx.fillText('回货单明细', padding + 24, currentY + 28)
      currentY += 70

      // 5. 明细列表
      const listItems = returnOrders.slice(0, 5)
      listItems.forEach((order) => {
        const cardHeight = 300
        const x = padding
        const y = currentY

        // 卡片背景
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, x, y, canvasWidth - padding * 2, cardHeight, 24)
        ctx.fill()

        // 日期
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(32)
        ctx.fillText(order.returnDateFormatted, x + 100, y + 60)
        
        // 日期图标背景
        ctx.setFillStyle('#EFF6FF')
        this.drawRoundedRect(ctx, x + cardPadding, y + 24, 56, 56, 12)
        ctx.fill()

        // 状态标签
        const isSettled = order.settlementStatus === '已结算'
        ctx.setFillStyle(isSettled ? '#DCFCE7' : '#FFEDD5')
        this.drawRoundedRect(ctx, canvasWidth - padding - 120, y + 24, 90, 40, 10)
        ctx.fill()
        ctx.setFillStyle(isSettled ? '#166534' : '#9A3412')
        ctx.setFontSize(22)
        ctx.setTextAlign('center')
        ctx.fillText(order.settlementStatus || '未结算', canvasWidth - padding - 75, y + 52)
        ctx.setTextAlign('left')

        // 二级信息 (操作人 + 款号)
        ctx.setFillStyle('#64748B')
        ctx.setFontSize(24)
        const subText = `${order.employeeName || '管理员'}  ·  ${order.styleCode || order.styleName}`
        ctx.fillText(subText, x + cardPadding, y + 110)

        // 分隔线
        ctx.setStrokeStyle('#F1F5F9')
        ctx.setLineWidth(1)
        ctx.beginPath()
        ctx.moveTo(x + cardPadding, y + 140)
        ctx.lineTo(canvasWidth - padding - cardPadding, y + 140)
        ctx.stroke()

        // 2x2 指标
        const metricGapX = (canvasWidth - padding * 2 - cardPadding * 2) / 2
        const metricY1 = y + 190
        const metricY2 = y + 250

        // 发毛
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.fillText('发毛', x + cardPadding, metricY1 - 5)
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(28)
        ctx.fillText(order.issueWeightFormatted, x + cardPadding, metricY1 + 35)

        // 回货重量
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.fillText('回货重量', x + cardPadding + metricGapX, metricY1 - 5)
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(28)
        ctx.fillText(order.returnWeightFormatted, x + cardPadding + metricGapX, metricY1 + 35)

        // 回货数量
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.fillText('回货数量', x + cardPadding, metricY2 - 5)
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(28)
        ctx.fillText(order.returnPiecesFormatted, x + cardPadding, metricY2 + 35)

        // 加工费
        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.fillText('加工费', x + cardPadding + metricGapX, metricY2 - 5)
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(28)
        ctx.fillText(`¥${order.processingFeeFormatted}`, x + cardPadding + metricGapX, metricY2 + 35)

        currentY += cardHeight + gap
      })

      // 6. 底部说明
      ctx.setFillStyle('#94A3B8')
      ctx.setFontSize(20)
      ctx.setTextAlign('center')
      ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, canvasHeight - 60)

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

  async onSettle() {
    // 跳转到结算页面
    wx.navigateTo({
      url: `/pages/factory/settlement?factoryId=${this.data.factoryId}`
    })
  },

  onReturnOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    // 可以跳转到回货单详情页
  }
})

