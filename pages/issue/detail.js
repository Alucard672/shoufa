// pages/issue/detail.js
import { queryByIds, query, getReturnOrdersByIssueId } from '../../utils/db.js'
import { checkLogin, getTenantId } from '../../utils/auth.js'
import { formatWeight, formatDate, formatQuantity, formatDateTime } from '../../utils/calc.js'
import { normalizeImageUrl } from '../../utils/image.js'
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    issueId: '',
    issueOrder: null,
    loading: false,
    currentTime: '',
    // 分享画布尺寸（用于让 canvas 真实高度跟导出一致，避免底部黑屏）
    canvasWidth: 750,
    canvasHeight: 1600
  },

  // 图片加载失败：降级为占位图
  onStyleImageError() {
    if (this.data.issueOrder) {
      this.setData({ 'issueOrder.styleImageUrl': '' })
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
        issueId: options.id
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
      await this.loadIssueOrder()
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

  async loadIssueOrder() {
    try {
      const rawId = this.data.issueId
      let order = null

      // 1) 优先按云数据库 _id 查询
      try {
        const issueRes = await db.collection('issue_orders').doc(String(rawId)).get()
        order = issueRes.data || null
      } catch (e) {
        // ignore
      }

      // 2) 回退：按自定义 id 查询（兼容数字 id）
      if (!order) {
        const idStr = String(rawId || '')
        const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null
        if (idNum !== null) {
          const issueRes2 = await query('issue_orders', { id: idNum }, { excludeDeleted: true, limit: 1 })
          order = (issueRes2.data && issueRes2.data[0]) ? issueRes2.data[0] : null
        }
      }

      if (!order || order.deleted) {
        throw new Error('发料单不存在')
      }

      const resolvedIssueId = String(order._id || rawId || order.id || '')

      // 获取工厂和款号信息
      const [factoryRes, styleRes] = await Promise.all([
        queryByIds('factories', [order.factoryId || order.factory_id]),
        queryByIds('styles', [order.styleId || order.style_id])
      ])

      const factory = factoryRes.data?.[0]
      const style = styleRes.data?.[0]

      // 回货单：兼容各种 issueId 取值（_id / id / 传入 id）
      const candidates = Array.from(new Set([
        resolvedIssueId,
        String(order.id || ''),
        String(rawId || '')
      ].filter(Boolean)))

      const roResults = await Promise.all(
        candidates.map((id) => getReturnOrdersByIssueId(id).catch(() => ({ data: [] })))
      )
      const merged = []
      const seen = new Set()
      roResults.forEach((r) => {
        ;(r.data || []).forEach((o) => {
          const key = String(o._id || o.id || '')
          if (!key || seen.has(key)) return
          seen.add(key)
          merged.push(o)
        })
      })
      const returnOrdersList = merged

      // 计算回货进度
      const yarnUsagePerPiece = style?.yarnUsagePerPiece || style?.yarn_usage_per_piece || 0
      let totalReturnPieces = 0
      let totalReturnYarn = 0

      returnOrdersList.forEach(ro => {
        totalReturnPieces += parseFloat(ro.returnPieces || ro.return_pieces || 0) || 0
        totalReturnYarn += parseFloat(ro.actualYarnUsage || ro.actual_yarn_usage || 0) || 0
      })

      const issueWeight = order.issueWeight || order.issue_weight || 0
      const remainingYarn = issueWeight - totalReturnYarn
      
      // 预计发料件数
      const issuePieces = yarnUsagePerPiece > 0
        ? Math.floor((issueWeight * 1000) / yarnUsagePerPiece)
        : 0

      // 判断状态
      let status = order.status || '未回货'
      if (order.status !== '已完成') {
        if (totalReturnYarn > 0 || totalReturnPieces > 0) {
          if (remainingYarn <= 0.01 || (issuePieces > 0 && totalReturnPieces >= issuePieces)) {
            status = '已完成'
          } else {
            status = '部分回货'
          }
        } else {
          status = '未回货'
        }
      }

      // 处理回货列表格式
      const totalReturnCount = returnOrdersList.length
      const sortedReturnOrders = returnOrdersList
        .sort((a, b) => {
          const dateA = new Date(a.returnDate || a.return_date || a.createTime || a.create_time || 0)
          const dateB = new Date(b.returnDate || b.return_date || b.createTime || b.create_time || 0)
          return dateB - dateA
        })
        .map((ro, index) => {
          const pieces = Math.floor(parseFloat(ro.returnPieces || ro.return_pieces || 0) || 0)
          const actualYarnUsage = parseFloat(ro.actualYarnUsage || ro.actual_yarn_usage || 0) || 0
          const date = ro.createTime || ro.create_time || ro.returnDate || ro.return_date
          return {
            ...ro,
            returnOrderIndex: totalReturnCount - index,
            returnDateFormatted: formatDateTime(date),
            quantityFormatted: formatQuantity(pieces),
            actualYarnUsageFormatted: actualYarnUsage.toFixed(2),
            returnPieces: pieces
          }
        })

      const styleImageUrl = normalizeImageUrl(style)

      this.setData({
        issueOrder: {
          ...order,
          _id: resolvedIssueId,
          voided: order.voided || false, // 是否已作废
          status: status, // 使用计算出的状态
          factoryName: factory?.name || '未知工厂',
          styleName: style?.styleName || style?.style_name || '未知款号',
          styleCode: style?.styleCode || style?.style_code || '',
          styleImageUrl: styleImageUrl,
          issueDateFormatted: formatDateTime(order.createTime || order.create_time || order.issueDate || order.issue_date),
          issueWeightFormatted: formatWeight(issueWeight),
          issuePiecesFormatted: formatQuantity(issuePieces),
          yarnUsagePerPieceFormatted: yarnUsagePerPiece ? yarnUsagePerPiece.toFixed(0) : '0',
          progress: {
            totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
            totalReturnPieces: Math.floor(totalReturnPieces),
            totalReturnPiecesFormatted: formatQuantity(totalReturnPieces),
            remainingYarnFormatted: remainingYarn.toFixed(2),
            status: status
          },
          returnOrders: sortedReturnOrders
        }
      })
    } catch (error) {
      console.error('加载发料单失败:', error)
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

  // 作废/恢复发料单（保留，可能从列表页调用）
  async onToggleVoid() {
    const { issueOrder } = this.data
    if (!issueOrder) return

    const isVoided = issueOrder.voided || false
    const action = isVoided ? '恢复' : '作废'
    const hasReturnOrders = issueOrder.returnOrders && issueOrder.returnOrders.length > 0

    let content = `确定要${action}发料单 "${issueOrder.issueNo || ''}" 吗？`
    if (!isVoided && hasReturnOrders) {
      content += '\n\n该发料单已有回货记录，作废后仍可查看历史数据。'
    } else if (!isVoided) {
      content += '\n\n作废后该发料单将不会出现在正常列表中。'
    }

    wx.showModal({
      title: `确认${action}`,
      content: content,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: `${action}中...` })
            
            const db = wx.cloud.database()
            const result = await db.collection('issue_orders')
              .doc(issueOrder._id)
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
      const { issueOrder } = this.data

      if (!issueOrder) {
        reject(new Error('数据加载中'))
        return
      }

      try {
        // 1. 预加载图片
        const imageUrl = issueOrder.styleImageUrl
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

        // 2. 动态布局/高度（按“款式在最上，之后发料/回货信息”的顺序）
        const listItems = (issueOrder.returnOrders || []).slice(0, 8)
        const canvasWidth = 750
        const headerHeight = 320
        const padding = 40
        const cardPadding = 32
        const gap = 20

        const styleCardHeight = 180
        const gridItemHeight = 160
        const gridRows = 3
        const summaryHeight = gridRows * gridItemHeight + (gridRows - 1) * gap + 32 // 内容+间距+内边距近似

        const titleHeight = 80
        const cardHeight = 220
        const cardGap = 20
        const footerHeight = 120

        // 关键：画布真实高度要 >= 内容高度，最后再算 footer
        // styleCard 放在 header 下面（略微“浮起”效果）
        const styleCardY = 260
        const gridY = styleCardY + styleCardHeight + 40

        let currentY = gridY + summaryHeight + 40
        if (listItems.length > 0) {
          currentY += titleHeight + (cardHeight + cardGap) * listItems.length + 20
        }
        const canvasHeight = currentY + footerHeight

        // 更新 wxml 中 canvas 的真实尺寸（否则导出会出现底部黑屏）
        this.setData({ canvasWidth, canvasHeight })

        // 3. 先铺满背景（你要求：先填充满屏幕）
        ctx.setFillStyle('#F8FAFC')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 4. 头部 (橙色渐变)
        const grd = ctx.createLinearGradient(0, 0, canvasWidth, headerHeight)
        grd.addColorStop(0, '#F59E0B')
        grd.addColorStop(1, '#D97706')
        ctx.setFillStyle(grd)
        ctx.fillRect(0, 0, canvasWidth, headerHeight)

        ctx.save()
        ctx.setGlobalAlpha(0.15); ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, 60, 96, 96, 24)
        ctx.fill(); ctx.restore()
        
        ctx.setFillStyle('#FFFFFF'); ctx.setFontSize(44); ctx.setTextAlign('center')
        ctx.fillText('发', padding + 48, 125)

        ctx.setTextAlign('left'); ctx.setFontSize(48)
        ctx.fillText(issueOrder.factoryName || '加工厂', padding + 120, 105)
        ctx.setFontSize(26); ctx.setGlobalAlpha(0.8)
        ctx.fillText(`单号: ${issueOrder.issueNo || '-'}`, padding + 120, 148)
        ctx.setGlobalAlpha(1)

        ctx.setFontSize(24)
        ctx.fillText(`📅 发料日期: ${issueOrder.issueDateFormatted}`, padding, 250)

        // 5. 款式信息预览卡片（放最上面：在发料/汇总信息之前）
        ctx.save()
        ctx.setFillStyle('#FFFFFF')
        this.drawRoundedRect(ctx, padding, styleCardY, canvasWidth - padding * 2, styleCardHeight, 24)
        ctx.fill()
        ctx.restore()

        if (localImagePath) {
          ctx.save()
          this.drawRoundedRect(ctx, padding + 24, styleCardY + 40, 100, 100, 16)
          ctx.clip()
          ctx.drawImage(localImagePath, padding + 24, styleCardY + 40, 100, 100)
          ctx.restore()
        } else {
          ctx.setFillStyle('#F1F5F9')
          this.drawRoundedRect(ctx, padding + 24, styleCardY + 40, 100, 100, 16)
          ctx.fill()
        }

        ctx.setFillStyle('#1E293B')
        ctx.setFontSize(32)
        ctx.fillText(issueOrder.styleName || '未知款号', padding + 150, styleCardY + 85)
        ctx.setFillStyle('#64748B')
        ctx.setFontSize(26)
        ctx.fillText(`款号: ${issueOrder.styleCode || '-'}  ·  颜色: ${issueOrder.color || '-'}`, padding + 150, styleCardY + 130)

        // 6. 汇总网格（发料等信息）
        const itemWidth = (canvasWidth - padding * 2 - 20) / 2
        const itemHeight = gridItemHeight

        // 统一处理 kg，避免“kgkg”
        const stripKg = (v) => String(v ?? '').replace(/\s*kg$/i, '').trim()
        const issueWeightValue = `${stripKg(issueOrder.issueWeightFormatted)} kg`
        const totalReturnWeightValue = `${stripKg(issueOrder.progress?.totalReturnYarnFormatted)} kg`
        const remainingWeightValue = `${stripKg(issueOrder.progress?.remainingYarnFormatted)} kg`

        const summaryItems = [
          { label: '发料重量', value: issueWeightValue },
          { label: '预计件数', value: `${issueOrder.issuePiecesFormatted}` },
          { label: '已回重量', value: stripKg(issueOrder.progress?.totalReturnYarnFormatted) ? totalReturnWeightValue : '0.00 kg' },
          { label: '已回件数', value: `${issueOrder.progress?.totalReturnPiecesFormatted || '0件'}` },
          { label: '剩余重量', value: stripKg(issueOrder.progress?.remainingYarnFormatted) ? remainingWeightValue : '0.00 kg' },
          { label: '回货状态', value: `${issueOrder.progress.status}` }
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
          ctx.setFillStyle(item.label === '剩余重量' ? '#F59E0B' : '#1E293B')
          ctx.setFontSize(34); ctx.fillText(item.value, x + cardPadding, y + 115)
        })

        // 7. 回货明细（在汇总之后）
        currentY = gridY + 3 * (itemHeight + gap) + 60
        
        if (listItems.length > 0) {
          ctx.setFillStyle('#F59E0B')
          this.drawRoundedRect(ctx, padding, currentY - 28, 8, 36, 4); ctx.fill()
          ctx.setFillStyle('#1E293B'); ctx.setFontSize(34)
          ctx.fillText('最近回货明细', padding + 28, currentY)
          currentY += 60

          listItems.forEach((ro) => {
            const x = padding
            const y = currentY
            ctx.save(); ctx.setFillStyle('#FFFFFF')
            this.drawRoundedRect(ctx, x, y, canvasWidth - padding * 2, cardHeight, 24)
            ctx.fill(); ctx.restore()

            ctx.setFillStyle('#1E293B'); ctx.setFontSize(30)
            ctx.fillText(`回货 ${ro.returnDateFormatted}`, x + cardPadding, y + 65)
            
            ctx.setFillStyle('#64748B'); ctx.setFontSize(26)
            ctx.fillText(`操作: ${ro.operatorName || '系统管理员'}`, x + cardPadding, y + 115)

            ctx.setFillStyle('#10B981'); ctx.setFontSize(32); ctx.setTextAlign('right')
            ctx.fillText(`+ ${ro.quantityFormatted}`, canvasWidth - padding - cardPadding, y + 65)
            ctx.setFillStyle('#1E293B'); ctx.setFontSize(28)
            ctx.fillText(`${ro.actualYarnUsageFormatted}kg`, canvasWidth - padding - cardPadding, y + 115)
            ctx.setTextAlign('left')

            currentY += cardHeight + cardGap
          })
          
          currentY += 40  // 列表后增加间距
        }

        // 8. 底部系统信息（最后）
        ctx.setFillStyle('#94A3B8'); ctx.setFontSize(22); ctx.setTextAlign('center')
        ctx.fillText('—— 由 首发 纱线管理系统 生成 ——', canvasWidth / 2, canvasHeight - 60)

        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'shareCanvas',
              width: canvasWidth,
              height: canvasHeight,
              destWidth: canvasWidth,
              destHeight: canvasHeight, // 指定导出高度，防止黑色底色
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

