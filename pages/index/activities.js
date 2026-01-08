// pages/index/activities.js
import { query, queryByIds } from '../../utils/db.js'
import { formatDateTime } from '../../utils/calc.js'
import { normalizeImageUrl, batchGetImageUrls } from '../../utils/image.js'
import { pickDateHybrid, filterByTimeFilter, pickNumber } from '../../utils/summary.js'

const app = getApp()

Page({
  data: {
    activities: [],
    loading: false,
    // 汇总
    totalIssueWeightFormatted: '0.0',
    totalReturnPieces: 0,
    totalProcessingFeeFormatted: '0',
    issueCount: 0,
    returnCount: 0,
    // 筛选
    typeFilter: 'all',
    timeFilter: 'all',
    searchKeyword: '',
    hasActiveFilter: false
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 快捷时间点击
  onTimeSegTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const filters = ['all', 'today', 'week', 'month']
    this.setData({ 
      timeFilter: filters[index] || 'all',
      hasActiveFilter: true 
    }, () => this.loadData())
  },

  // 类型点击
  onTypeSegTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const filters = ['all', 'issue', 'return']
    this.setData({ 
      typeFilter: filters[index] || 'all',
      hasActiveFilter: true 
    }, () => this.loadData())
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value, hasActiveFilter: true })
    // 这里可以加防抖，也可以让用户点确认。根据用户要求“支持输入查询”，我们实时加载。
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.loadData()
    }, 500)
  },

  onSearch() {
    this.loadData()
  },

  onClearFilters() {
    this.setData({
      typeFilter: 'all',
      timeFilter: 'all',
      searchKeyword: '',
      hasActiveFilter: false
    }, () => this.loadData())
  },

  async loadData() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      // 1. 获取基础数据
      const [issueRes, returnRes] = await Promise.all([
        query('issue_orders', {}, { excludeDeleted: true, orderBy: { field: 'createTime', direction: 'DESC' }, limit: 100 }),
        query('return_orders', {}, { excludeDeleted: true, orderBy: { field: 'createTime', direction: 'DESC' }, limit: 100 })
      ])

      // 2. 预处理（过滤掉已作废的单据）
      let issues = issueRes.data
        .filter(o => !o.voided) // 排除已作废的发料单
        .map(o => ({
          ...o,
          type: 'issue',
          date: pickDateHybrid(o, ['issueDate', 'issue_date'], ['createTime', 'create_time']),
          label: '发料给 '
        }))

      let returns = returnRes.data
        .filter(o => !o.voided) // 排除已作废的回货单
        .map(o => ({
          ...o,
          type: 'return',
          date: pickDateHybrid(o, ['returnDate', 'return_date'], ['createTime', 'create_time']),
          label: '回货自 '
        }))

      // 3. 合并
      let all = [...issues, ...returns]

      // 4. 补充厂家和款号名称（模糊查询需要这些字段）
      const factoryIds = [...new Set(all.map(o => String(o.factoryId || o.factory_id)).filter(id => id && id !== 'undefined'))]
      const styleIds = [...new Set(all.map(o => String(o.styleId || o.style_id)).filter(id => id && id !== 'undefined'))]

      const [fMapRes, sMapRes] = await Promise.all([
        factoryIds.length ? queryByIds('factories', factoryIds) : { data: [] },
        styleIds.length ? queryByIds('styles', styleIds) : { data: [] }
      ])

      const fMap = Object.fromEntries(fMapRes.data.map(f => [String(f._id || f.id), f]))
      const sMap = Object.fromEntries(sMapRes.data.map(s => [String(s._id || s.id), s]))
      
      // 批量转换图片URL（cloud:// -> 临时链接）
      try {
        const imageUrls = sMapRes.data
          .map(style => normalizeImageUrl(style))
          .filter(url => url && url.startsWith('cloud://'))
        
        if (imageUrls.length > 0) {
          const imageUrlMap = await batchGetImageUrls(imageUrls)
          // 更新 sMap 中的图片URL
          sMapRes.data.forEach(style => {
            const id = String(style._id || style.id)
            const originalUrl = normalizeImageUrl(style)
            if (originalUrl && imageUrlMap.has(originalUrl)) {
              sMap[id].styleImageUrl = imageUrlMap.get(originalUrl)
            }
          })
        }
      } catch (error) {
        console.error('批量转换图片URL失败:', error)
        // 失败不影响主流程，继续使用原 cloud:// URL
      }

      // 5. 应用筛选
      // 时间筛选
      all = filterByTimeFilter(all, this.data.timeFilter, (o) => o.date)

      // 类型筛选
      if (this.data.typeFilter !== 'all') {
        all = all.filter(o => o.type === this.data.typeFilter)
      }

      // 统一格式化并准备搜索匹配文本
      const processed = all.map(o => {
        const factory = fMap[String(o.factoryId || o.factory_id)]
        const style = sMap[String(o.styleId || o.style_id)]
        
        const fName = factory?.name || '未知厂家'
        const sName = style?.styleName || style?.style_name || '未知款号'
        const sCode = style?.styleCode || style?.style_code || ''
        const sDisplay = `${sCode ? '['+sCode+'] ' : ''}${sName}`
        
        return {
          ...o,
          factoryName: fName,
          styleDisplay: sDisplay,
          styleName: sName,
          styleCode: sCode,
          styleImageUrl: normalizeImageUrl(style),
          dateFormatted: formatDateTime(o.date),
          actionInfo: o.type === 'issue' 
            ? `${pickNumber(o, ['issueWeight', 'issue_weight']).toFixed(2)}kg`
            : `${pickNumber(o, ['returnPieces', 'return_pieces'])}件 · ¥${pickNumber(o, ['processingFee', 'processing_fee']).toFixed(0)}`,
          // 用于搜索匹配的合并文本
          searchText: `${fName} ${sName} ${sCode} ${o.issueNo || ''} ${o.returnNo || ''} ${o.remark || ''}`.toLowerCase()
        }
      })

      // 关键字搜索（模糊匹配厂家、款号、单号等）
      let finalActivities = processed
      if (this.data.searchKeyword) {
        const k = this.data.searchKeyword.toLowerCase()
        finalActivities = processed.filter(o => o.searchText.includes(k))
      }

      // 6. 按时间再次排序
      finalActivities.sort((a, b) => b.date.getTime() - a.date.getTime())

      // 7. 计算汇总
      let totalWeight = 0, totalPieces = 0, totalFee = 0, iCount = 0, rCount = 0
      finalActivities.forEach(o => {
        if (o.type === 'issue') {
          totalWeight += pickNumber(o, ['issueWeight', 'issue_weight'])
          iCount++
        } else {
          totalPieces += pickNumber(o, ['returnPieces', 'return_pieces'])
          totalFee += pickNumber(o, ['processingFee', 'processing_fee'])
          rCount++
        }
      })

      this.setData({
        activities: finalActivities,
        totalIssueWeightFormatted: totalWeight.toFixed(1),
        totalReturnPieces: totalPieces,
        totalProcessingFeeFormatted: totalFee.toFixed(0),
        issueCount: iCount,
        returnCount: rCount,
        loading: false
      })

    } catch (e) {
      console.error('加载动态数据失败:', e)
      this.setData({ loading: false })
    }
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  },

  onStyleImageError(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`activities[${idx}].styleImageUrl`]: '' })
  },

  navigateToDetail(e) {
    const { id, type } = e.currentTarget.dataset
    const url = type === 'issue' ? `/pages/issue/detail?id=${id}` : `/pages/return/detail?id=${id}`
    wx.navigateTo({ url })
  }
})
