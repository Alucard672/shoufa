// pages/accounting/detail.js
import { queryByIds } from '../../utils/db.js'
import { checkLogin, getTenantId } from '../../utils/auth.js'
import { formatAmount, formatDate, formatQuantity, formatWeight } from '../../utils/calc.js'
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
      unpaidAmount: '0.00'
    }
  },

  async onLoad(options) {
    if (!checkLogin()) {
      return
    }

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

        return {
          ...order,
          styleName: style?.styleName || '未知款号',
          styleCode: style?.styleCode || '',
          processingFee: processingFee,
          settledAmount: settledAmount,
          unpaidAmount: unpaidAmount,
          issueWeight: issueWeight,
          returnQuantity: returnQuantity,
          returnPieces: returnPieces,
          returnDateFormatted: formatDate(order.returnDate),
          processingFeeFormatted: formatAmount(processingFee),
          settledAmountFormatted: formatAmount(settledAmount),
          unpaidAmountFormatted: formatAmount(unpaidAmount),
          issueWeightFormatted: formatWeight(issueWeight),
          returnQuantityFormatted: returnQuantity > 0 ? `${returnQuantity.toFixed(1)}打` : '0打',
          returnPiecesFormatted: formatQuantity(returnPieces)
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
        return acc
      }, { 
        totalAmount: 0, 
        settledAmount: 0, 
        unpaidAmount: 0,
        totalIssueWeight: 0,
        totalReturnQuantity: 0,
        totalReturnPieces: 0
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
          totalReturnPieces: formatQuantity(summary.totalReturnPieces)
        }
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
      const { factory, returnOrders, settlements, summaryFormatted } = this.data

      // 画布尺寸
      const canvasWidth = 750
      const canvasHeight = 1200
      const padding = 40
      const contentWidth = canvasWidth - padding * 2

      // 背景
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      let y = padding

      // 标题
      ctx.setFillStyle('#333333')
      ctx.setFontSize(36)
      ctx.setTextAlign('center')
      ctx.fillText(`${factory?.name || '加工厂'} 账款明细`, canvasWidth / 2, y)
      y += 60

      // 汇总信息
      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.setTextAlign('left')
      y += 20

      ctx.fillText('总金额：', padding, y)
      ctx.setFillStyle('#2b7fff')
      ctx.setFontSize(32)
      ctx.fillText(`¥${summaryFormatted.totalAmount}`, padding + 120, y)
      y += 50

      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('已结算：', padding, y)
      ctx.setFillStyle('#10b981')
      ctx.setFontSize(32)
      ctx.fillText(`¥${summaryFormatted.settledAmount}`, padding + 120, y)
      y += 50

      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('未结算：', padding, y)
      ctx.setFillStyle('#f59e0b')
      ctx.setFontSize(32)
      ctx.fillText(`¥${summaryFormatted.unpaidAmount}`, padding + 120, y)
      y += 50

      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('发毛数：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText(`${summaryFormatted.totalIssueWeight}`, padding + 120, y)
      y += 50

      ctx.setFillStyle('#666666')
      ctx.setFontSize(28)
      ctx.fillText('回货数：', padding, y)
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText(`${summaryFormatted.totalReturnQuantity} ${summaryFormatted.totalReturnPieces}`, padding + 120, y)
      y += 60

      // 分隔线
      ctx.setStrokeStyle('#e5e5e5')
      ctx.setLineWidth(2)
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(canvasWidth - padding, y)
      ctx.stroke()
      y += 40

      // 回货单明细标题
      ctx.setFillStyle('#333333')
      ctx.setFontSize(32)
      ctx.fillText('回货单明细', padding, y)
      y += 50

      // 回货单列表
      ctx.setFontSize(24)
      returnOrders.forEach((order, index) => {
        if (y > canvasHeight - 200) {
          return // 超出画布范围，不继续绘制
        }

        ctx.setFillStyle('#666666')
        ctx.setTextAlign('left')
        
        // 日期和款号
        const dateText = order.returnDateFormatted
        const styleText = `${order.styleName}${order.styleCode ? ' ' + order.styleCode : ''}`
        ctx.fillText(`${dateText} ${styleText}`, padding, y)
        y += 35

        // 发毛数和回货数
        if (order.issueWeight > 0 || order.returnQuantity > 0) {
          ctx.fillText(`发毛：${order.issueWeightFormatted}  回货：${order.returnQuantityFormatted} ${order.returnPiecesFormatted}`, padding + 20, y)
          y += 30
        }

        // 金额信息
        ctx.fillText(`加工费：¥${order.processingFeeFormatted}`, padding + 20, y)
        y += 30

        if (order.settledAmount > 0) {
          ctx.fillText(`已结算：¥${order.settledAmountFormatted}`, padding + 20, y)
          y += 30
        }

        ctx.setFillStyle('#f59e0b')
        ctx.fillText(`未结算：¥${order.unpaidAmountFormatted}`, padding + 20, y)
        y += 40

        // 分隔线
        if (index < returnOrders.length - 1) {
          ctx.setStrokeStyle('#f5f5f5')
          ctx.setLineWidth(1)
          ctx.beginPath()
          ctx.moveTo(padding, y)
          ctx.lineTo(canvasWidth - padding, y)
          ctx.stroke()
          y += 20
        }
      })

      // 结算记录
      if (settlements.length > 0 && y < canvasHeight - 200) {
        y += 20
        ctx.setStrokeStyle('#e5e5e5')
        ctx.setLineWidth(2)
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(canvasWidth - padding, y)
        ctx.stroke()
        y += 40

        ctx.setFillStyle('#333333')
        ctx.setFontSize(32)
        ctx.fillText('结算记录', padding, y)
        y += 50

        ctx.setFontSize(24)
        settlements.forEach((settlement) => {
          if (y > canvasHeight - 100) {
            return
          }

          ctx.setFillStyle('#666666')
          ctx.fillText(`${settlement.settlementDateFormatted} 结算¥${settlement.totalAmountFormatted}`, padding, y)
          y += 40
        })
      }

      // 底部信息
      ctx.setFillStyle('#999999')
      ctx.setFontSize(20)
      ctx.setTextAlign('center')
      ctx.fillText(`生成时间：${new Date().toLocaleString('zh-CN')}`, canvasWidth / 2, canvasHeight - 40)

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

