// utils/db.js
// 数据库操作封装

const db = wx.cloud.database()
const _ = db.command

/**
 * 获取款号列表
 */
export function getStyles() {
  return db.collection('styles').get()
}

/**
 * 获取款号详情
 */
export function getStyleById(styleId) {
  return db.collection('styles').doc(styleId).get()
}

/**
 * 获取加工厂列表
 */
export function getFactories() {
  return db.collection('factories')
    .where({
      deleted: _.eq(false)
    })
    .get()
}

/**
 * 获取加工厂详情
 */
export function getFactoryById(factoryId) {
  return db.collection('factories').doc(factoryId).get()
}

/**
 * 获取发料单列表
 */
export function getIssueOrders(options = {}) {
  let query = db.collection('issue_orders')
    .where({
      deleted: _.eq(false)
    })

  // 时间筛选
  if (options.startDate && options.endDate) {
    query = query.where({
      issueDate: _.gte(options.startDate).and(_.lte(options.endDate))
    })
  }

  // 状态筛选
  if (options.status) {
    query = query.where({
      status: options.status
    })
  }

  // 搜索
  if (options.keyword) {
    query = query.where({
      issueNo: _.regex({
        regexp: options.keyword,
        options: 'i'
      })
    })
  }

  return query.orderBy('issueDate', 'desc').get()
}

/**
 * 获取回货单列表
 */
export function getReturnOrders(options = {}) {
  let query = db.collection('return_orders')
    .where({
      deleted: _.eq(false)
    })

  // 搜索
  if (options.keyword) {
    query = query.where({
      returnNo: _.regex({
        regexp: options.keyword,
        options: 'i'
      })
    })
  }

  return query.orderBy('returnDate', 'desc').get()
}

/**
 * 创建发料单
 */
export function createIssueOrder(data) {
  return db.collection('issue_orders').add({
    data: {
      ...data,
      status: '未回货',
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      deleted: false
    }
  })
}

/**
 * 创建回货单
 */
export function createReturnOrder(data) {
  return db.collection('return_orders').add({
    data: {
      ...data,
      settlementStatus: '未结算',
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      deleted: false
    }
  })
}

/**
 * 更新发料单状态
 */
export function updateIssueOrderStatus(issueId, status) {
  return db.collection('issue_orders').doc(issueId).update({
    data: {
      status,
      updateTime: db.serverDate()
    }
  })
}

/**
 * 获取发料单关联的回货单
 */
export function getReturnOrdersByIssueId(issueId) {
  return db.collection('return_orders')
    .where({
      issueId,
      deleted: _.eq(false)
    })
    .get()
}

/**
 * 计算发料单的回货进度
 */
export async function calculateIssueProgress(issueId) {
  const issueOrder = await db.collection('issue_orders').doc(issueId).get()
  const returnOrders = await getReturnOrdersByIssueId(issueId)
  
  // 获取款号信息以获取单件用量
  const style = await db.collection('styles').doc(issueOrder.data.styleId).get()
  const yarnUsagePerPiece = style.data.yarnUsagePerPiece

  let totalReturnPieces = 0
  let totalReturnYarn = 0
  let totalReturnQuantity = 0

  returnOrders.data.forEach(order => {
    totalReturnPieces += order.returnPieces || 0
    totalReturnYarn += order.actualYarnUsage || 0
    totalReturnQuantity += order.returnQuantity || 0
  })

  const remainingYarn = issueOrder.data.issueWeight - totalReturnYarn
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

