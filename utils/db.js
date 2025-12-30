// utils/db.js
// 云数据库操作封装

const db = wx.cloud.database()
const _ = db.command

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
export function getStyles() {
  return query('styles')
}

/**
 * 获取款号详情
 */
export async function getStyleById(styleId) {
  const res = await query('styles', { _id: styleId })
  return { data: res.data.length > 0 ? res.data[0] : null }
}

/**
 * 获取加工厂列表
 */
export function getFactories() {
  return query('factories')
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
export function getReturnOrdersByIssueId(issueId) {
  return query('return_orders', { issueId: issueId })
}

/**
 * 计算发料单的回货进度
 */
export async function calculateIssueProgress(issueId) {
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
  
  // 获取款号信息
  const styleRes = await db.collection('styles')
    .doc(issueOrder.styleId)
    .get()
  
  if (!styleRes.data || styleRes.data.deleted) {
    throw new Error('款号不存在')
  }
  
  const style = styleRes.data
  const yarnUsagePerPiece = style.yarnUsagePerPiece || 0

  let totalReturnPieces = 0
  let totalReturnYarn = 0
  let totalReturnQuantity = 0

  returnOrders.forEach(order => {
    totalReturnPieces += order.returnPieces || 0
    totalReturnYarn += order.actualYarnUsage || 0
    totalReturnQuantity += order.returnQuantity || 0
  })

  const issueWeight = issueOrder.issueWeight || 0
  const remainingYarn = issueWeight - totalReturnYarn
  const remainingPieces = Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
  const remainingQuantity = remainingPieces / 12

  // 判断状态
  let status = '未回货'
  if (totalReturnYarn > 0) {
    if (remainingYarn <= 0.01) {
      // 回货完成，标记为已完成
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

  // 如果where包含_id，使用doc更新
  if (where._id || where.id) {
    const id = where._id || where.id
    return db.collection(table)
      .doc(id)
      .update({
        data: updateData
      })
  }
  
  // 否则使用where条件更新（需要先查询再更新）
  const tenantId = getTenantId()
  const queryRes = await db.collection(table)
    .where({
      tenantId: tenantId,
      deleted: false,
      ...where
    })
    .get()
  
  if (queryRes.data.length === 0) {
    throw new Error('未找到要更新的记录')
  }
  
  // 批量更新
  const updatePromises = queryRes.data.map(item => {
    return db.collection(table)
      .doc(item._id)
      .update({
        data: updateData
      })
  })
  
  return Promise.all(updatePromises)
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
  return db.collection(table)
    .where({
      tenantId: tenantId,
      deleted: false,
      _id: _.in(ids)
    })
    .limit(100)
    .get()
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
    console.error('获取款号-工厂加工单价失败:', error)
    return { data: null }
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
    console.error('保存款号-工厂加工单价失败:', error)
    throw error
  }
}
