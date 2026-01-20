// pages/accounting/detail.js
const { queryByIds } = require('../utils/db.js')
const { checkLogin, getTenantId } = require('../utils/auth.js')
const { formatAmount, formatDate, formatQuantity, formatWeight, formatDateTime } = require('../utils/calc.js')
const { normalizeImageUrl, batchGetImageUrls } = require('../utils/image.js')
const { pickNumber, pickId } = require('../utils/summary.js')
const app = getApp()
// 延迟初始化
let _db = null, _cmd = null
function getDb() { if (!_db) _db = wx.cloud.database(); return _db }
function getCmd() { if (!_cmd) _cmd = getDb().command; return _cmd }
const db = new Proxy({}, { get(t, p) { return getDb()[p] } })
const _ = new Proxy({}, { get(t, p) { return getCmd()[p] } })

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

  // 图片加载失败：降级为占位图
  onStyleImageError(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    if (typeof index === 'number' || (typeof index === 'string' && index !== '')) {
      const i = typeof index === 'number' ? index : parseInt(index, 10)
      if (!Number.isNaN(i) && this.data.returnOrders && this.data.returnOrders[i]) {
        this.setData({ [`returnOrders[${i}].styleImageUrl`]: '' })
      }
    }

    if (!id) return
    const list = this.data.returnOrders || []
    const idx = list.findIndex(o => String(o?._id || o?.id || '') === String(id))
    if (idx >= 0) {
      this.setData({ [`returnOrders[${idx}].styleImageUrl`]: '' })
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
      // 查询该加工厂的所有回货单（兼容 factoryId / factory_id）
      const [byFactoryId, byFactory_id] = await Promise.all([
        db.collection('return_orders')
          .where({ tenantId: tenantId, factoryId: this.data.factoryId, deleted: false })
          .orderBy('returnDate', 'desc')
          .get()
          .catch(() => ({ data: [] })),
        db.collection('return_orders')
          .where({ tenantId: tenantId, factory_id: this.data.factoryId, deleted: false })
          .orderBy('returnDate', 'desc')
          .get()
          .catch(() => ({ data: [] }))
      ])

      const merged = []
      const seen = new Set()
        // 排除已作废的回货单
        ; (byFactoryId.data || []).concat(byFactory_id.data || []).forEach((o) => {
          if (o.voided) return // 排除已作废的单据
          const key = String(o._id || o.id || '')
          if (!key || seen.has(key)) return
          seen.add(key)
          merged.push(o)
        })

      // 再次确保排除已作废的回货单
      const returnOrders = merged.filter(order => !order.voided)

      // 获取所有款号ID和发料单ID
      const styleIds = [...new Set(returnOrders.map(order => order.styleId || order.style_id).filter(Boolean))]
      const issueIds = [...new Set(returnOrders.map(order => order.issueId || order.issue_id).filter(Boolean))]

      // 批量查询款号信息
      let stylesMap = {}
      if (styleIds.length > 0) {
        const stylesRes = await queryByIds('styles', styleIds, {
          excludeDeleted: true
        })
        stylesMap = Object.fromEntries(
          (stylesRes.data || []).map(style => [String(style._id || style.id), style])
        )

        // 批量转换图片URL（cloud:// -> 临时链接）
        try {
          const imageUrls = Object.values(stylesMap)
            .map(style => normalizeImageUrl(style))
            .filter(url => url && url.startsWith('cloud://'))

          if (imageUrls.length > 0) {
            const imageUrlMap = await batchGetImageUrls(imageUrls)
            // 更新 stylesMap 中的图片URL
            Object.values(stylesMap).forEach(style => {
              const originalUrl = normalizeImageUrl(style)
              if (originalUrl && originalUrl.startsWith('cloud://')) {
                // 保存原始URL
                style.originalImageUrl = originalUrl

                // 只有成功转换的URL才使用（不是cloud://格式）
                if (imageUrlMap.has(originalUrl)) {
                  const tempUrl = imageUrlMap.get(originalUrl)
                  if (tempUrl && !tempUrl.startsWith('cloud://')) {
                    style.styleImageUrl = tempUrl
                  } else {
                    // 转换失败，使用空字符串避免500错误
                    style.styleImageUrl = ''
                  }
                } else {
                  // 转换失败，使用空字符串避免500错误
                  style.styleImageUrl = ''
                }
              }
            })
          }
        } catch (error) {
          console.error('批量转换图片URL失败:', error)
          // 失败不影响主流程，继续使用原 cloud:// URL
        }
      }

      // 批量查询发料单信息
      let issueOrdersMap = {}
      if (issueIds.length > 0) {
        const issueRes = await queryByIds('issue_orders', issueIds, {
          excludeDeleted: true
        })
        issueOrdersMap = Object.fromEntries(
          (issueRes.data || []).map(issue => [String(issue._id || issue.id), issue])
        )
      }

      // 处理回货单数据
      const ordersWithDetails = returnOrders.map(order => {
        const style = stylesMap[String(order.styleId || order.style_id)]
        const issueOrder = issueOrdersMap[String(order.issueId || order.issue_id)]
        const processingFee = pickNumber(order, ['processingFee', 'processing_fee'], 0)
        const settledAmount = pickNumber(order, ['settledAmount', 'settled_amount'], 0)
        const unpaidAmount = processingFee - settledAmount
        const settlementStatus = order.settlementStatus || order.settlement_status || '未结算'

        // 发料重量（发毛数）
        const issueWeight = pickNumber(issueOrder || {}, ['issueWeight', 'issue_weight'], 0)
        // 回货数量
        const returnQuantity = pickNumber(order, ['returnQuantity', 'return_quantity'], 0) // 打数
        const returnPieces = pickNumber(order, ['returnPieces', 'return_pieces'], 0) // 件数
        // 回货重量（实际用纱量）
        const returnWeight = pickNumber(order, ['actualYarnUsage', 'actual_yarn_usage'], 0)

        // 优先使用已转换的临时URL（batchGetImageUrls 已处理）
        // 如果 style.styleImageUrl 存在且不是 cloud:// 格式，说明已转换成功
        // 否则尝试 normalizeImageUrl，如果还是 cloud:// 格式则使用空字符串
        let styleImageUrl = style?.styleImageUrl || ''
        if (!styleImageUrl) {
          const originalUrl = normalizeImageUrl(style)
          if (originalUrl && !originalUrl.startsWith('cloud://')) {
            styleImageUrl = originalUrl
          } else {
            styleImageUrl = '' // cloud:// 格式或没有图片
          }
        }

        return {
          ...order,
          settlementStatus: settlementStatus,
          styleName: style?.styleName || style?.style_name || '',
          styleCode: style?.styleCode || style?.style_code || '',
          styleImageUrl: styleImageUrl,
          employeeName: order.employeeName || order.operatorName || '系统管理员',
          processingFee: processingFee,
          settledAmount: settledAmount,
          unpaidAmount: unpaidAmount,
          issueWeight: issueWeight,
          returnQuantity: returnQuantity,
          returnPieces: returnPieces,
          returnWeight: returnWeight,
          returnDateFormatted: formatDate(order.returnDate || order.return_date || order.createTime || order.create_time),
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
    return new Promise(async (resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const { factory, returnOrders, summaryFormatted, currentTime } = this.data

      if (!factory) {
        reject(new Error('数据加载中，请稍后再试'))
        return
      }

      try {
        // 1. 使用所有回货单数据（支持长截图）
        const listItems = returnOrders || []
        const imageTasks = listItems.map(item => {
          const url = item.styleImageUrl
          if (url && (url.startsWith('cloud://') || url.startsWith('http'))) {
            return new Promise(res => {
              wx.getImageInfo({
                src: url,
                success: (info) => res(info.path),
                fail: () => res(null)
              })
            })
          }
          return Promise.resolve(null)
        })
        const localImages = await Promise.all(imageTasks)

        // 2. 动态计算画布高度（根据实际数据量）
        const headerHeight = 320
        const summaryHeight = 400
        const titleHeight = 100
        const cardHeight = 340 // 每张卡片高度
        const cardGap = 24 // 卡片间距
        const footerSpacing = 100 // 页脚与最后一张卡片的间距
        const footerHeight = 80 // 页脚文字高度
        const canvasWidth = 750
        // 动态计算总高度：如果有数据，计算所有卡片的高度；如果没有数据，使用最小高度
        const itemsHeight = listItems.length > 0
          ? (cardHeight + cardGap) * listItems.length - cardGap // 最后一个卡片不需要间距
          : 0
        // 确保页脚有足够空间：footerSpacing + footerHeight
        const canvasHeight = headerHeight + summaryHeight + titleHeight + itemsHeight + footerSpacing + footerHeight

        console.log(`生成长截图: ${listItems.length} 条数据, 画布高度: ${canvasHeight}px`)

        // 3. 绘制背景
        ctx.setFillStyle('#F8FAFC')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 4. 绘制蓝色浸入式头部
        const grd = ctx.createLinearGradient(0, 0, canvasWidth, 320)
        grd.addColorStop(0, '#155DFC')
        grd.addColorStop(1, '#2B7FFF')
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
        ctx.fillText('账', padding + 48, 125)

        ctx.setTextAlign('left')
        ctx.setFontSize(48)
        ctx.fillText(factory.name || '加工厂', padding + 120, 105)
        ctx.setFontSize(26)
        ctx.setGlobalAlpha(0.8)
        ctx.fillText('对账单明细汇总', padding + 120, 148)
        ctx.setGlobalAlpha(1)

        // 时间日期
        ctx.setFontSize(24)
        ctx.fillText(`📅 ${currentTime || formatDateTime(new Date())}`, padding, 250)

        // 5. 汇总统计网格 (3x2)
        const gridY = 290
        const itemWidth = (canvasWidth - padding * 2 - 20) / 2
        const itemHeight = 160
        const gap = 20

        const summaryItems = [
          { label: '总金额', value: `¥${summaryFormatted.totalAmount}` },
          { label: '已结算', value: `¥${summaryFormatted.settledAmount}` },
          { label: '未结算', value: `¥${summaryFormatted.unpaidAmount}` },
          { label: '发毛数', value: summaryFormatted.totalIssueWeight },
          { label: '回货重量', value: summaryFormatted.totalReturnWeight },
          { label: '回货数量', value: summaryFormatted.totalReturnPieces }
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

          ctx.setFillStyle(item.label === '未结算' ? '#F59E0B' : '#1E293B')
          ctx.setFontSize(36)
          ctx.fillText(item.value, x + cardPadding, y + 115)
        });

        // 6. 回货明细标题
        let currentY = gridY + 3 * (itemHeight + gap) + 60
        ctx.setFillStyle('#155DFC')
        this.drawRoundedRect(ctx, padding, currentY - 28, 8, 36, 4)
        ctx.fill()
        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(34)
        ctx.fillText('回货单明细', padding + 28, currentY)
        currentY += 60

        // 7. 循环绘制明细卡片（支持所有数据的长截图）
        if (listItems.length === 0) {
          // 如果没有数据，显示空状态提示
          ctx.setFillStyle('#94A3B8')
          ctx.setFontSize(32)
          ctx.setTextAlign('center')
          ctx.fillText('暂无回货单数据', canvasWidth / 2, currentY + 100)
          ctx.setTextAlign('left')
        } else {
          listItems.forEach((order, index) => {
            const x = padding
            const y = currentY

            // 卡片背景
            ctx.save()
            ctx.shadowColor = 'rgba(0, 0, 0, 0.03)'
            ctx.shadowBlur = 8
            ctx.shadowOffsetY = 2
            ctx.setFillStyle('#FFFFFF')
            this.drawRoundedRect(ctx, x, y, canvasWidth - padding * 2, cardHeight, 28)
            ctx.fill()
            ctx.restore()

            // 绘制款式图
            if (localImages[index]) {
              ctx.save()
              this.drawRoundedRect(ctx, x + cardPadding, y + 24, 100, 100, 16)
              ctx.clip()
              ctx.drawImage(localImages[index], x + cardPadding, y + 24, 100, 100)
              ctx.restore()
            } else {
              ctx.setFillStyle('#F1F5F9')
              this.drawRoundedRect(ctx, x + cardPadding, y + 24, 100, 100, 16)
              ctx.fill()
              ctx.setFillStyle('#94A3B8')
              ctx.setFontSize(40)
              ctx.setTextAlign('center')
              ctx.fillText('款', x + cardPadding + 50, y + 85)
              ctx.setTextAlign('left')
            }

            ctx.setFillStyle('#1E293B')
            ctx.setFontSize(32)
            ctx.fillText(order.returnDateFormatted || '未设置', x + cardPadding + 120, y + 68)

            const isSettled = (order.settlementStatus || order.settlement_status || '未结算') === '已结算'
            ctx.setFillStyle(isSettled ? '#DCFCE7' : '#FFEDD5')
            this.drawRoundedRect(ctx, canvasWidth - padding - 140, y + 35, 110, 44, 12)
            ctx.fill()
            ctx.setFillStyle(isSettled ? '#166534' : '#9A3412')
            ctx.setFontSize(22)
            ctx.setTextAlign('center')
            ctx.fillText((order.settlementStatus || order.settlement_status || '未结算'), canvasWidth - padding - 85, y + 65)
            ctx.setTextAlign('left')

            // 操作人 · 款号
            ctx.setFillStyle('#64748B')
            ctx.setFontSize(26)
            const metaText = `${order.employeeName || '系统管理员'}  ·  ${order.styleCode || order.styleName || ''}`
            // 文本过长时截断（避免超出画布）
            const maxTextWidth = canvasWidth - padding * 2 - cardPadding * 2 - 20
            ctx.fillText(metaText.length > 35 ? metaText.substring(0, 35) + '...' : metaText, x + cardPadding, y + 160)

            // 数据网格 (2x2)
            const gridBoxY = y + 190
            const gridBoxW = canvasWidth - padding * 2 - cardPadding * 2
            ctx.setFillStyle('#F8FAFC')
            this.drawRoundedRect(ctx, x + cardPadding, gridBoxY, gridBoxW, 130, 16)
            ctx.fill()

            const colWidth = gridBoxW / 2
            ctx.setFontSize(22); ctx.setFillStyle('#94A3B8')
            ctx.fillText('发毛', x + cardPadding + 24, gridBoxY + 45)
            ctx.fillText('回货重量', x + cardPadding + 24 + colWidth, gridBoxY + 45)
            ctx.setFillStyle('#1E293B'); ctx.setFontSize(28)
            ctx.fillText(order.issueWeightFormatted || '0.00', x + cardPadding + 24, gridBoxY + 95)
            ctx.fillText(order.returnWeightFormatted || '0.00', x + cardPadding + 24 + colWidth, gridBoxY + 95)

            currentY += cardHeight + cardGap
          })
        }

        // 8. 底部信息（确保与正文有足够间距）
        // 页脚位置 = 最后一张卡片底部 + footerSpacing
        // 如果没有数据，使用默认位置
        const footerY = listItems.length > 0
          ? (currentY - cardGap) + footerSpacing // 最后一张卡片底部 + 间距
          : canvasHeight - 80 // 没有数据时，距离底部80px

        ctx.setFillStyle('#94A3B8')
        ctx.setFontSize(22)
        ctx.setTextAlign('center')
        ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, footerY)

        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'shareCanvas',
              width: canvasWidth,
              height: canvasHeight, // 使用实际计算的画布高度
              destWidth: canvasWidth * 2, // 提高图片清晰度（2倍像素）
              destHeight: canvasHeight * 2,
              success: (res) => {
                console.log('截图生成成功，文件路径:', res.tempFilePath)
                resolve(res.tempFilePath)
              },
              fail: (err) => {
                console.error('截图生成失败:', err)
                reject(err)
              }
            }, this)
          }, 1500) // 增加等待时间，确保绘制完成
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

  async onSettle() {
    // 跳转到结算页面
    wx.navigateTo({
      url: `/subpages/factory/settlement?factoryId=${this.data.factoryId}`
    })
  },

  onReturnOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    // 可以跳转到回货单详情页
  }
})

