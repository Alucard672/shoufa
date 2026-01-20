// utils/db.js
// 云数据库操作封装

// 使用延迟初始化，避免在 wx.cloud.init() 之前调用 database()
let _db = null
let _cmd = null

function getDb() {
  if (!_db) {
    _db = wx.cloud.database()
  }
  return _db
}

function getCmd() {
  if (!_cmd) {
    _cmd = getDb().command
  }
  return _cmd
}

// 兼容旧代码，使用 getter 使得 db 和 _ 自动延迟初始化
const db = new Proxy({}, {
  get(target, prop) {
    return getDb()[prop]
  }
})

const _ = new Proxy({}, {
  get(target, prop) {
    return getCmd()[prop]
  }
})

/**
 * 获取当前租户ID
 */
function getTenantId() {
  const app = getApp()
  return app?.globalData?.tenantId || ''
}

/**
 * 获取款号列表
 */
export async function getStyles(options = {}) {
  const res = await query('styles', {}, { excludeDeleted: true }).catch(() => ({ data: [] }))
  const includeDisabled = !!options.includeDisabled
  const list = (res.data || []).filter((s) => {
    if (includeDisabled) return true
    return s && s.disabled !== true
  })
  return { data: list }
}

/**
 * 获取款号详情（兼容 _id 和 id 字段）
 */
export async function getStyleById(styleId) {
  if (!styleId) return { data: null }

  // 先尝试使用 queryByIds（它已经处理了多种ID格式）
  const result = await queryByIds('styles', [styleId], { excludeDeleted: true })
  if (result.data && result.data.length > 0) {
    return { data: result.data[0] }
  }

  // 如果 queryByIds 失败，尝试直接查询
  try {
    const res = await query('styles', { _id: styleId }, { excludeDeleted: true })
    if (res.data && res.data.length > 0) {
      return { data: res.data[0] }
    }
  } catch (e) {
    console.warn('使用 _id 查询失败，尝试 id 字段:', e)
  }

  // 尝试使用 id 字段查询
  try {
    const res = await query('styles', { id: styleId }, { excludeDeleted: true })
    if (res.data && res.data.length > 0) {
      return { data: res.data[0] }
    }
  } catch (e) {
    console.warn('使用 id 查询失败:', e)
  }

  return { data: null }
}

/**
 * 获取加工厂列表
 */
export async function getFactories(options = {}) {
  const res = await query('factories', {}, { excludeDeleted: true }).catch(() => ({ data: [] }))
  const includeDisabled = !!options.includeDisabled
  const list = (res.data || []).filter((f) => {
    if (includeDisabled) return true
    return f && f.disabled !== true
  })
  return { data: list }
}

/**
 * 获取加工厂详情
 */
export async function getFactoryById(factoryId) {
  const res = await query('factories', { _id: factoryId })
  return { data: res.data.length > 0 ? res.data[0] : null }
}

/**
 * 获取发料单列表
 */
export function getIssueOrders(options = {}) {
  const where = {}

  // 时间筛选
  if (options.startDate && options.endDate) {
    where.issueDate = _.gte(options.startDate).and(_.lte(options.endDate))
  }

  // 状态筛选
  if (options.status) {
    where.status = options.status
  }

  // 搜索
  if (options.keyword) {
    where.issueNo = db.RegExp({
      regexp: options.keyword,
      options: 'i'
    })
  }

  const queryOptions = {
    orderBy: { field: 'issueDate', direction: 'DESC' }
  }

  if (options.limit) queryOptions.limit = options.limit
  if (options.skip) queryOptions.skip = options.skip

  return query('issue_orders', where, queryOptions)
}

/**
 * 获取回货单列表
 */
export function getReturnOrders(options = {}) {
  const where = {}

  // 搜索
  if (options.keyword) {
    where.returnNo = db.RegExp({
      regexp: options.keyword,
      options: 'i'
    })
  }

  const queryOptions = {
    orderBy: { field: 'returnDate', direction: 'DESC' }
  }

  if (options.limit) queryOptions.limit = options.limit
  if (options.skip) queryOptions.skip = options.skip

  return query('return_orders', where, queryOptions)
}

/**
 * 创建发料单
 */
export function createIssueOrder(data) {
  const tenantId = getTenantId()
  return db.collection('issue_orders')
    .add({
      data: {
        ...data,
        tenantId: tenantId,
        status: '未回货',
        deleted: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
}

/**
 * 创建回货单
 */
export function createReturnOrder(data) {
  const tenantId = getTenantId()
  return db.collection('return_orders')
    .add({
      data: {
        ...data,
        tenantId: tenantId,
        settlementStatus: '未结算',
        settledAmount: 0,
        deleted: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
}

/**
 * 更新发料单状态
 */
export function updateIssueOrderStatus(issueId, status) {
  if (!issueId) {
    console.warn('更新发料单状态失败: issueId为空')
    return Promise.reject(new Error('发料单ID不能为空'))
  }

  return db.collection('issue_orders')
    .doc(issueId)
    .update({
      data: {
        status: status,
        updateTime: db.serverDate()
      }
    })
}

/**
 * 获取发料单关联的回货单
 */
export async function getReturnOrdersByIssueId(issueId) {
  if (!issueId) return { data: [] }

  const _ = db.command
  const idStr = String(issueId)
  const idNum = /^\d+$/.test(idStr) ? parseInt(idStr) : null

  // 构建 ID 列表（包含字符串和数字形式）
  const idList = [issueId]
  if (typeof issueId === 'string' && idNum !== null) idList.push(idNum)
  if (typeof issueId === 'number') idList.push(idStr)

  try {
    // 同时查询 issueId 和 issue_id，并支持多种 ID 类型
    const [res1, res2] = await Promise.all([
      query('return_orders', { issueId: _.in(idList) }),
      query('return_orders', { issue_id: _.in(idList) })
    ])

    // 合并并去重，排除已作废的回货单
    const merged = [...res1.data, ...res2.data]
    const seen = new Set()
    return {
      data: merged.filter(item => {
        // 排除已作废的回货单
        if (item.voided) return false

        const key = item._id || item.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
  } catch (error) {
    console.error('getReturnOrdersByIssueId 失败，尝试全量内存过滤:', error)
    const allRes = await query('return_orders', {})
    const ids = idList.map(id => String(id))
    return {
      data: allRes.data.filter(ro => {
        // 排除已作废的回货单
        if (ro.voided) return false

        const roIssueId = ro.issueId || ro.issue_id
        return roIssueId !== undefined && roIssueId !== null && ids.includes(String(roIssueId))
      })
    }
  }
}

/**
 * 计算发料单的回货进度
 */
export async function calculateIssueProgress(issueId) {
  if (!issueId) {
    throw new Error('发料单ID不能为空')
  }

  // 获取发料单
  const issueOrderRes = await db.collection('issue_orders')
    .doc(issueId)
    .get()

  if (!issueOrderRes.data || issueOrderRes.data.deleted) {
    throw new Error('发料单不存在')
  }

  const issueOrder = issueOrderRes.data

  // 获取回货单
  const returnOrdersRes = await getReturnOrdersByIssueId(issueId)
  const returnOrders = returnOrdersRes.data || []

  // 获取款号信息（如果发料单有款号）
  let yarnUsagePerPiece = 0
  const styleId = issueOrder.styleId || issueOrder.style_id
  if (styleId) {
    try {
      const styleRes = await db.collection('styles')
        .doc(styleId)
        .get()

      if (styleRes.data && !styleRes.data.deleted) {
        const style = styleRes.data
        yarnUsagePerPiece = style.yarnUsagePerPiece || style.yarn_usage_per_piece || 0
      }
    } catch (e) {
      // 款号不存在或查询失败，使用默认值0
      console.warn('获取款号信息失败:', e)
    }
  }

  let totalReturnPieces = 0
  let totalReturnYarn = 0
  let totalReturnQuantity = 0

  returnOrders.forEach(order => {
    totalReturnPieces += parseFloat(order.returnPieces || order.return_pieces || 0) || 0
    totalReturnYarn += parseFloat(order.actualYarnUsage || order.actual_yarn_usage || 0) || 0
    totalReturnQuantity += parseFloat(order.returnQuantity || order.return_quantity || 0) || 0
  })

  const issueWeight = issueOrder.issueWeight || issueOrder.issue_weight || 0
  const issuePieces = yarnUsagePerPiece > 0 ? Math.floor((issueWeight * 1000) / yarnUsagePerPiece) : 0
  const remainingYarn = issueWeight - totalReturnYarn
  const remainingPieces = yarnUsagePerPiece > 0
    ? Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
    : 0
  const remainingQuantity = remainingPieces / 12

  // 判断状态
  let status = '未回货'
  if (totalReturnYarn > 0 || totalReturnPieces > 0) {
    if (remainingYarn <= 0.01 || (issuePieces > 0 && totalReturnPieces >= issuePieces)) {
      status = '已完成'
    } else {
      status = '部分回货'
    }
  }

  // 如果发料单已经是已完成状态，保持已完成
  if (issueOrder.status === '已完成') {
    status = '已完成'
  }

  return {
    totalReturnPieces,
    totalReturnYarn,
    totalReturnYarnFormatted: totalReturnYarn.toFixed(2),
    totalReturnQuantity,
    totalReturnQuantityFormatted: totalReturnQuantity.toFixed(1),
    remainingYarn,
    remainingYarnFormatted: remainingYarn.toFixed(2),
    remainingPieces,
    remainingQuantity,
    remainingQuantityFormatted: remainingQuantity.toFixed(1),
    issuePieces,
    status
  }
}

/**
 * 通用查询方法
 */
export async function query(table, where = {}, options = {}) {
  const tenantId = getTenantId()
  const whereClause = {
    deleted: false,
    ...where
  }

  const _ = db.command

  // 处理日期筛选逻辑，优先使用驼峰命名字段
  const dateFieldsMap = {
    'issueDate': ['issueDate', 'issue_date'],
    'returnDate': ['returnDate', 'return_date'],
    'createTime': ['createTime', 'create_time'],
    'updateTime': ['updateTime', 'update_time']
  }

  for (let key in dateFieldsMap) {
    // 检查查询条件中是否包含这些日期字段
    const queryKey = whereClause[key] ? key : (whereClause[dateFieldsMap[key][1]] ? dateFieldsMap[key][1] : null)

    if (queryKey && whereClause[queryKey] && typeof whereClause[queryKey] === 'object' && (whereClause[queryKey].gte || whereClause[queryKey].lte)) {
      const { gte, lte } = whereClause[queryKey]

      // 统一转换为真正的 Date 对象进行查询
      const dateCondition = _.and([
        gte ? _.gte(new Date(gte)) : _.exists(true),
        lte ? _.lte(new Date(lte)) : _.exists(true)
      ])

      // 将原来的模糊查询替换为严格的 Date 查询
      delete whereClause[queryKey]
      // 这里的逻辑：由于我们要迁移数据，暂且同时尝试匹配两个字段名
      const fields = dateFieldsMap[key]
      whereClause._and = whereClause._and || []
      whereClause._and.push(_.or([
        { [fields[0]]: dateCondition },
        { [fields[1]]: dateCondition }
      ]))
    }
  }

  // 转换普通的 gte/lte（非日期字段）
  for (let key in whereClause) {
    if (key === '_and') continue
    const val = whereClause[key]
    if (val && typeof val === 'object' && (val.gte !== undefined || val.lte !== undefined)) {
      let cmd = null
      if (val.gte !== undefined) cmd = _.gte(val.gte)
      if (val.lte !== undefined) {
        cmd = cmd ? cmd.and(_.lte(val.lte)) : _.lte(val.lte)
      }
      whereClause[key] = cmd
    }
  }

  // 如果没有 tenantId，且不是查询 tenants 表，返回空数据
  if (!tenantId && table !== 'tenants') {
    return { data: [] }
  }

  if (tenantId) {
    whereClause.tenantId = tenantId
  }

  return db.collection(table)
    .where(whereClause)
    .orderBy(options.orderBy?.field || 'createTime', options.orderBy?.direction === 'DESC' ? 'desc' : 'asc')
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .get()
}

/**
 * 转换对象中的日期字符串为 Date 对象
 */
function fixDates(data) {
  if (!data) return data
  const dateFields = ['issue_date', 'return_date', 'create_time', 'update_time', 'issueDate', 'returnDate', 'createTime', 'updateTime']
  const newData = { ...data }
  for (let key of dateFields) {
    if (newData[key] && typeof newData[key] === 'string') {
      const d = new Date(newData[key].replace(/\//g, '-'))
      if (!isNaN(d.getTime())) {
        newData[key] = d
      }
    }
  }
  return newData
}

/**
 * 通用插入方法
 */
export async function insert(table, data, options = {}) {
  const tenantId = getTenantId()
  const insertData = fixDates({
    ...data,
    deleted: false,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  })

  // tenants 表不需要 tenantId，其他表需要
  if (table !== 'tenants' && tenantId) {
    insertData.tenantId = tenantId
  }

  return db.collection(table)
    .add({
      data: insertData
    })
}

/**
 * 通用更新方法
 */
export async function update(table, data, where) {
  const updateData = fixDates({
    ...data,
    updateTime: db.serverDate()
  })

  // 如果where包含_id，使用doc更新（优先使用_id）
  if (where._id || where.id) {
    const id = where._id || where.id
    try {
      const result = await db.collection(table)
        .doc(id)
        .update({
          data: updateData
        })
      // 微信小程序 SDK 返回格式可能不同，检查多种情况
      // 有些版本返回 { stats: { updated: 1 } }，有些直接返回 { updated: 1 }
      const updated = (result.stats && result.stats.updated) || result.updated || 0
      if (updated > 0) {
        return result
      }
      // doc 更新未成功，但不抛错，继续 fallback 尝试
      console.warn('使用 doc 更新未找到记录，尝试 fallback:', { table, id })
    } catch (error) {
      console.warn('使用 doc 更新失败，尝试 fallback:', error)
    }

    // Fallback: 使用 tenantId 条件更新（绕过 _openid 权限限制）
    const tenantId = getTenantId()
    console.log('Fallback: 尝试使用 tenantId 条件更新, tenantId:', tenantId)

    if (tenantId) {
      // 尝试用 tenantId + _id 条件更新
      try {
        const forceUpdate = await db.collection(table)
          .where({
            tenantId: tenantId,
            deleted: false
          })
          .doc(id)
          .update({ data: updateData })

        const forceUpdated = (forceUpdate.stats && forceUpdate.stats.updated) || forceUpdate.updated || 0
        if (forceUpdated > 0) {
          console.log('Fallback: tenantId + doc 更新成功')
          return forceUpdate
        }
      } catch (e) {
        console.warn('Fallback: tenantId + doc 更新失败:', e.message)
      }

      // 尝试先查询再更新
      try {
        const queryRes = await db.collection(table)
          .where({
            tenantId: tenantId,
            deleted: false
          })
          .get()

        console.log('Fallback: 查询到记录数:', queryRes.data.length)

        // 找到匹配 _id 的记录
        const targetRecord = queryRes.data.find(r => r._id === id)
        if (targetRecord) {
          console.log('Fallback: 找到目标记录，尝试更新')
          const updateRes = await db.collection(table)
            .doc(targetRecord._id)
            .update({ data: updateData })
          return updateRes
        }
      } catch (e) {
        console.warn('Fallback: 查询后更新失败:', e.message)
      }
    }

    // 都找不到，抛出错误
    throw new Error(`未找到要更新的记录 (table: ${table}, id: ${id})`)
  }

  // 没有 _id 或 id，使用其他 where 条件更新
  const tenantId = getTenantId()
  const whereClause = {
    deleted: false
  }

  if (tenantId) {
    whereClause.tenantId = tenantId
  }

  // 合并 where 条件（排除 _id 和 id）
  const { _id, id, ...otherWhere } = where

  // 安全检查：必须有有效的查询条件，防止批量更新所有记录
  if (Object.keys(otherWhere).length === 0) {
    throw new Error('更新操作必须提供有效的查询条件')
  }

  Object.assign(whereClause, otherWhere)

  const queryRes = await db.collection(table)
    .where(whereClause)
    .get()

  if (queryRes.data.length === 0) {
    throw new Error('未找到要更新的记录')
  }

  // 安全检查：如果查到多条记录，警告并只更新第一条
  if (queryRes.data.length > 1) {
    console.warn(`警告：查询到 ${queryRes.data.length} 条记录，只更新第一条`, { table, where: whereClause })
  }

  // 只更新第一条记录
  return db.collection(table)
    .doc(queryRes.data[0]._id)
    .update({ data: updateData })
}

/**
 * 通用删除方法（软删除）
 */
export async function remove(table, where) {
  return update(table, { deleted: true }, where)
}

/**
 * 通用计数方法
 */
export async function count(table, where = {}, options = {}) {
  const tenantId = getTenantId()
  const whereClause = {
    deleted: false,
    ...where
  }

  // 如果有 tenantId，添加租户过滤；如果没有，返回0（未登录状态）
  if (tenantId) {
    whereClause.tenantId = tenantId
  } else {
    // 未登录时返回0
    return { total: 0 }
  }

  return db.collection(table)
    .where(whereClause)
    .count()
}

/**
 * 批量查询（根据ID列表）
 */
export async function queryByIds(table, ids, options = {}) {
  if (!ids || ids.length === 0) {
    return { data: [] }
  }

  const tenantId = getTenantId()
  // 兼容：id 可能是 string/number；有些表可能使用自定义字段 id（数字）而不是 _id
  const idStrs = []
  const idNums = []
  ids.forEach((raw) => {
    if (raw === undefined || raw === null) return
    const s = String(raw)
    if (s) idStrs.push(s)
    if (/^\d+$/.test(s)) idNums.push(parseInt(s, 10))
    if (typeof raw === 'number') idNums.push(raw)
  })

  const baseWhere = {
    tenantId: tenantId,
    deleted: false
  }

  // 1) 优先按 _id（字符串）查
  let resById = { data: [] }
  try {
    resById = await db.collection(table)
      .where({
        ...baseWhere,
        _id: _.in(idStrs.length ? idStrs : ids)
      })
      .limit(100)
      .get()
  } catch (e) {
    // ignore
  }

  // 2) 如仍不足，尝试按自定义 id（数字）补齐
  let resByCustomId = { data: [] }
  if (idNums.length > 0) {
    try {
      resByCustomId = await db.collection(table)
        .where({
          ...baseWhere,
          id: _.in(Array.from(new Set(idNums)))
        })
        .limit(100)
        .get()
    } catch (e) {
      // ignore
    }
  }

  // 3) 合并去重
  const merged = []
  const seen = new Set()
    ; (resById.data || []).concat(resByCustomId.data || []).forEach((item) => {
      const key = String(item?._id || item?.id || '')
      if (!key || seen.has(key)) return
      seen.add(key)
      merged.push(item)
    })

  return { data: merged }
}

/**
 * 获取发料单详情
 */
export function getIssueOrderById(issueId) {
  const tenantId = getTenantId()
  return db.collection('issue_orders')
    .doc(issueId)
    .get()
    .then(res => {
      // 检查租户和删除状态
      if (res.data && res.data.tenantId === tenantId && !res.data.deleted) {
        return res
      }
      return { data: null }
    })
}

/**
 * 获取回货单详情
 */
export function getReturnOrderById(returnId) {
  const tenantId = getTenantId()
  return db.collection('return_orders')
    .doc(returnId)
    .get()
    .then(res => {
      // 检查租户和删除状态
      if (res.data && res.data.tenantId === tenantId && !res.data.deleted) {
        return res
      }
      return { data: null }
    })
}

/**
 * 获取纱线库存列表
 */
export function getYarnInventory(options = {}) {
  const queryOptions = {
    orderBy: { field: 'createTime', direction: 'DESC' }
  }

  if (options.limit) queryOptions.limit = options.limit
  if (options.skip) queryOptions.skip = options.skip

  return query('yarn_inventory', {}, queryOptions)
}

/**
 * 获取纱线库存详情
 */
export async function getYarnById(yarnId) {
  const res = await query('yarn_inventory', { _id: yarnId })
  return { data: res.data.length > 0 ? res.data[0] : null }
}

/**
 * 获取生产计划列表
 */
export function getProductionPlans(options = {}) {
  const queryOptions = {
    orderBy: { field: 'createTime', direction: 'DESC' }
  }

  if (options.limit) queryOptions.limit = options.limit
  if (options.skip) queryOptions.skip = options.skip

  return query('production_plans', {}, queryOptions)
}

/**
 * 获取生产计划详情
 */
export async function getProductionPlanById(planId) {
  const res = await query('production_plans', { _id: planId })
  return { data: res.data.length > 0 ? res.data[0] : null }
}

/**
 * 获取款号-工厂的加工单价
 */
export async function getStyleFactoryPrice(styleId, factoryId) {
  const tenantId = getTenantId()
  if (!tenantId) {
    return { data: null }
  }

  try {
    const res = await db.collection('style_factory_prices')
      .where({
        tenantId: tenantId,
        styleId: styleId,
        factoryId: factoryId,
        deleted: false
      })
      .get()

    return { data: res.data.length > 0 ? res.data[0] : null }
  } catch (error) {
    // 如果集合不存在，尝试创建集合后重试
    if (error.errCode === -502005 || error.message?.includes('collection not exists')) {
      console.log('style_factory_prices 集合不存在，尝试创建')
      try {
        await wx.cloud.callFunction({
          name: 'initDatabase',
          data: {
            collections: ['style_factory_prices']
          }
        })
        // 创建后再次查询（虽然应该是空的，但为了保持一致性）
        try {
          const res = await db.collection('style_factory_prices')
            .where({
              tenantId: tenantId,
              styleId: styleId,
              factoryId: factoryId,
              deleted: false
            })
            .get()
          return { data: res.data.length > 0 ? res.data[0] : null }
        } catch (retryError) {
          // 再次查询失败，返回 null
          return { data: null }
        }
      } catch (createError) {
        console.error('创建 style_factory_prices 集合失败:', createError)
        // 创建失败，返回 null（不影响主流程）
        return { data: null }
      }
    } else {
      console.error('获取款号-工厂加工单价失败:', error)
      return { data: null }
    }
  }
}

/**
 * 保存或更新款号-工厂的加工单价
 */
export async function saveStyleFactoryPrice(styleId, factoryId, processingFeePerDozen) {
  const tenantId = getTenantId()
  if (!tenantId) {
    throw new Error('未登录')
  }

  try {
    // 先查询是否存在
    const existingRes = await db.collection('style_factory_prices')
      .where({
        tenantId: tenantId,
        styleId: styleId,
        factoryId: factoryId,
        deleted: false
      })
      .get()

    const data = {
      styleId: styleId,
      factoryId: factoryId,
      processingFeePerDozen: processingFeePerDozen,
      updateTime: db.serverDate()
    }

    if (existingRes.data.length > 0) {
      // 更新现有记录
      await db.collection('style_factory_prices')
        .doc(existingRes.data[0]._id)
        .update({
          data: data
        })
      return { data: { ...existingRes.data[0], ...data } }
    } else {
      // 创建新记录
      const result = await db.collection('style_factory_prices')
        .add({
          data: {
            ...data,
            tenantId: tenantId,
            deleted: false,
            createTime: db.serverDate()
          }
        })
      return { data: { _id: result._id, ...data } }
    }
  } catch (error) {
    // 如果集合不存在，尝试创建集合后重试
    if (error.errCode === -502005 || error.message?.includes('collection not exists')) {
      console.log('style_factory_prices 集合不存在，尝试创建')
      try {
        await wx.cloud.callFunction({
          name: 'initDatabase',
          data: {
            collections: ['style_factory_prices']
          }
        })
        // 创建后再次尝试保存
        try {
          const result = await db.collection('style_factory_prices')
            .add({
              data: {
                styleId: styleId,
                factoryId: factoryId,
                processingFeePerDozen: processingFeePerDozen,
                tenantId: tenantId,
                deleted: false,
                createTime: db.serverDate(),
                updateTime: db.serverDate()
              }
            })
          return { data: { _id: result._id, styleId, factoryId, processingFeePerDozen } }
        } catch (retryError) {
          console.error('创建后保存失败:', retryError)
          throw retryError
        }
      } catch (createError) {
        console.error('创建 style_factory_prices 集合失败:', createError)
        throw new Error('数据库集合不存在，请手动创建 style_factory_prices 集合')
      }
    } else {
      console.error('保存款号-工厂加工单价失败:', error)
      throw error
    }
  }
}
