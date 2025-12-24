// utils/db.js
// MySQL数据库操作封装（通过云函数）

/**
 * 获取当前租户ID
 */
function getTenantId() {
  const app = getApp()
  return app?.globalData?.tenantId || ''
}

/**
 * 调用MySQL云函数
 */
async function callMySQL(action, table, data = null, where = null, options = {}) {
  const tenantId = getTenantId()
  
  try {
    const res = await wx.cloud.callFunction({
      name: 'mysql',
      data: {
        action,
        table,
        data,
        where,
        options: {
          ...options,
          tenantId
        }
      }
    })
    
    if (res.result.success === false) {
      throw new Error(res.result.error || '数据库操作失败')
    }
    
    return res.result
  } catch (error) {
    console.error('MySQL云函数调用失败:', error)
    throw error
  }
}

/**
 * 获取款号列表
 */
export function getStyles() {
  return callMySQL('query', 'styles', null, null, {
    excludeDeleted: true
  }).then(res => ({
    data: res.data || []
  }))
}

/**
 * 获取款号详情
 */
export function getStyleById(styleId) {
  return callMySQL('query', 'styles', null, { id: styleId }, {
    excludeDeleted: true
  }).then(res => ({
    data: res.data && res.data[0] ? res.data[0] : null
  }))
}

/**
 * 获取加工厂列表
 */
export function getFactories() {
  return callMySQL('query', 'factories', null, null, {
    excludeDeleted: true
  }).then(res => ({
    data: res.data || []
  }))
}

/**
 * 获取加工厂详情
 */
export function getFactoryById(factoryId) {
  return callMySQL('query', 'factories', null, { id: factoryId }, {
    excludeDeleted: true
  }).then(res => ({
    data: res.data && res.data[0] ? res.data[0] : null
  }))
}

/**
 * 获取发料单列表
 */
export function getIssueOrders(options = {}) {
  const where = {}
  
  // 时间筛选
  if (options.startDate && options.endDate) {
    where.issue_date = {
      gte: options.startDate,
      lte: options.endDate
    }
  }
  
  // 状态筛选
  if (options.status) {
    where.status = options.status
  }
  
  // 搜索
  if (options.keyword) {
    where.issue_no = options.keyword
  }
  
  const queryOptions = {
    excludeDeleted: true,
    orderBy: {
      field: 'issue_date',
      direction: 'DESC'
    }
  }
  
  return callMySQL('query', 'issue_orders', null, where, queryOptions).then(res => ({
    data: res.data || []
  }))
}

/**
 * 获取回货单列表
 */
export function getReturnOrders(options = {}) {
  const where = {}
  
  // 搜索
  if (options.keyword) {
    where.return_no = options.keyword
  }
  
  const queryOptions = {
    excludeDeleted: true,
    orderBy: {
      field: 'return_date',
      direction: 'DESC'
    }
  }
  
  return callMySQL('query', 'return_orders', null, where, queryOptions).then(res => ({
    data: res.data || []
  }))
}

/**
 * 创建发料单
 */
export function createIssueOrder(data) {
  return callMySQL('insert', 'issue_orders', {
    ...data,
    status: '未回货'
  }).then(res => ({
    _id: res._id
  }))
}

/**
 * 创建回货单
 */
export function createReturnOrder(data) {
  return callMySQL('insert', 'return_orders', {
    ...data,
    settlement_status: '未结算',
    settled_amount: 0
  }).then(res => ({
    _id: res._id
  }))
}

/**
 * 更新发料单状态
 */
export function updateIssueOrderStatus(issueId, status) {
  return callMySQL('update', 'issue_orders', {
    status
  }, {
    id: issueId
  })
}

/**
 * 获取发料单关联的回货单
 */
export function getReturnOrdersByIssueId(issueId) {
  return callMySQL('query', 'return_orders', null, {
    issue_id: issueId
  }, {
    excludeDeleted: true
  }).then(res => ({
    data: res.data || []
  }))
}

/**
 * 计算发料单的回货进度
 */
export async function calculateIssueProgress(issueId) {
  // 获取发料单
  const issueOrderRes = await callMySQL('query', 'issue_orders', null, {
    id: issueId
  }, {
    excludeDeleted: true
  })
  
  if (!issueOrderRes.data || issueOrderRes.data.length === 0) {
    throw new Error('发料单不存在')
  }
  
  const issueOrder = issueOrderRes.data[0]
  
  // 获取回货单
  const returnOrdersRes = await getReturnOrdersByIssueId(issueId)
  const returnOrders = returnOrdersRes.data || []
  
  // 获取款号信息
  const styleRes = await callMySQL('query', 'styles', null, {
    id: issueOrder.style_id
  }, {
    excludeDeleted: true
  })
  
  if (!styleRes.data || styleRes.data.length === 0) {
    throw new Error('款号不存在')
  }
  
  const style = styleRes.data[0]
  const yarnUsagePerPiece = style.yarn_usage_per_piece || style.yarnUsagePerPiece

  let totalReturnPieces = 0
  let totalReturnYarn = 0
  let totalReturnQuantity = 0

  returnOrders.forEach(order => {
    totalReturnPieces += order.return_pieces || order.returnPieces || 0
    totalReturnYarn += order.actual_yarn_usage || order.actualYarnUsage || 0
    totalReturnQuantity += order.return_quantity || order.returnQuantity || 0
  })

  const issueWeight = issueOrder.issue_weight || issueOrder.issueWeight
  const remainingYarn = issueWeight - totalReturnYarn
  const remainingPieces = Math.floor(remainingYarn / (yarnUsagePerPiece / 1000))
  const remainingQuantity = remainingPieces / 12

  // 判断状态
  let status = '未回货'
  if (totalReturnYarn > 0) {
    if (remainingYarn <= 0.01) {
      status = '已回货'
    } else {
      status = '部分回货'
    }
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
  return callMySQL('query', table, null, where, options).then(res => ({
    data: res.data || []
  }))
}

/**
 * 通用插入方法
 */
export async function insert(table, data) {
  return callMySQL('insert', table, data).then(res => ({
    _id: res._id
  }))
}

/**
 * 通用更新方法
 */
export async function update(table, data, where) {
  return callMySQL('update', table, data, where)
}

/**
 * 通用删除方法（软删除）
 */
export async function remove(table, where) {
  return callMySQL('delete', table, null, where)
}

/**
 * 通用计数方法
 */
export async function count(table, where = {}, options = {}) {
  return callMySQL('count', table, null, where, options).then(res => ({
    total: res.total || 0
  }))
}

/**
 * 批量查询（根据ID列表）
 */
export async function queryByIds(table, ids, options = {}) {
  if (!ids || ids.length === 0) {
    return { data: [] }
  }
  
  // 将_id转换为id
  const numericIds = ids.map(id => {
    // 如果是字符串，尝试转换为数字
    if (typeof id === 'string' && /^\d+$/.test(id)) {
      return parseInt(id)
    }
    return id
  })
  
  return callMySQL('query', table, null, { id: numericIds }, {
    ...options,
    excludeDeleted: options.excludeDeleted !== false
  }).then(res => ({
    data: res.data || []
  }))
}
