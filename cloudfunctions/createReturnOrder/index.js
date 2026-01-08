// cloudfunctions/createReturnOrder/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 根据发料单ID查询关联的回货单
 */
async function getReturnOrdersByIssueId(issueId, tenantId) {
  if (!issueId) {
    return {
      success: false,
      error: 'issueId 不能为空',
      data: []
    }
  }

  try {
    const idStr = String(issueId)
    const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null

    // 构建 ID 列表（包含字符串和数字形式，以及原始值）
    const idList = [issueId, idStr] // 包含原始值和字符串
    if (idNum !== null) {
      idList.push(idNum)
    }
    // 去重
    const uniqueIdList = [...new Set(idList.map(id => String(id)))]

    // 构建查询条件（使用 eq(false) 代替 neq(true) 以支持索引）
    // 注意：为了兼容可能为 undefined 的 voided 字段，使用 or 查询
    const baseWhere = {
      deleted: _.eq(false),
      voided: _.or([_.eq(false), _.exists(false)]) // 匹配 false 或不存在（未设置）
    }
    
    // 如果传入了 tenantId，添加租户过滤
    if (tenantId) {
      baseWhere.tenantId = tenantId
    }

    // 同时查询 issueId 和 issue_id，并支持多种 ID 类型
    const [res1, res2] = await Promise.all([
      db.collection('return_orders')
        .where({
          ...baseWhere,
          issueId: _.in(uniqueIdList)
        })
        .get()
        .catch((e) => {
          console.warn('查询 issueId 失败:', e)
          return { data: [] }
        }),
      db.collection('return_orders')
        .where({
          ...baseWhere,
          issue_id: _.in(uniqueIdList)
        })
        .get()
        .catch((e) => {
          console.warn('查询 issue_id 失败:', e)
          return { data: [] }
        })
    ])

    // 如果没有找到，尝试不使用 _.in，直接查询（解决 _.in 在某些情况下不工作的问题）
    let merged = [...(res1.data || []), ...(res2.data || [])]
    if (merged.length === 0) {
      const directQueries = await Promise.all([
        // 直接查询字符串类型的 issueId
        db.collection('return_orders')
          .where({
            ...baseWhere,
            issueId: idStr
          })
          .get()
          .catch(() => ({ data: [] })),
        // 直接查询数字类型的 issueId（如果有）
        idNum !== null ? db.collection('return_orders')
          .where({
            ...baseWhere,
            issueId: idNum
          })
          .get()
          .catch(() => ({ data: [] })) : { data: [] },
        // 查询 issue_id 字段（字符串）
        db.collection('return_orders')
          .where({
            ...baseWhere,
            issue_id: idStr
          })
          .get()
          .catch(() => ({ data: [] })),
        // 查询 issue_id 字段（数字）
        idNum !== null ? db.collection('return_orders')
          .where({
            ...baseWhere,
            issue_id: idNum
          })
          .get()
          .catch(() => ({ data: [] })) : { data: [] }
      ])
      
      // 合并直接查询的结果
      directQueries.forEach((res) => {
        if (res.data && res.data.length > 0) {
          merged = merged.concat(res.data)
        }
      })
    }

    // 合并并去重（使用 Map 提升性能）
    const resultMap = new Map()
    const targetIdStr = idStr
    const targetIdNum = idNum
    
    // 快速合并和过滤
    merged.forEach(item => {
      // 排除已作废的回货单（双重检查，虽然查询条件已过滤）
      if (item.voided === true || item.deleted === true) return
      
      // 验证 issueId 是否匹配
      const roIssueId = item.issueId || item.issue_id
      if (!roIssueId) return
      
      // 转换为字符串进行比较
      const roIssueIdStr = String(roIssueId)
      const targetIdStr = String(issueId)
      
      // 匹配条件：支持字符串和数字类型比较
      const isMatch = roIssueIdStr === targetIdStr || 
                     roIssueIdStr === idStr ||
                     roIssueIdStr === String(issueId) ||
                     (targetIdNum !== null && Number(roIssueId) === targetIdNum) ||
                     (targetIdNum !== null && String(roIssueId) === String(targetIdNum)) ||
                     (targetIdNum !== null && roIssueId === targetIdNum) ||
                     // 宽松匹配：去除空格后比较（处理可能的格式差异）
                     (roIssueId && issueId && roIssueId.toString().trim() === issueId.toString().trim())
      
      if (!isMatch) return
      
      // 使用 Map 去重
      const key = item._id || item.id
      if (key && !resultMap.has(key)) {
        resultMap.set(key, item)
      }
    })
    
    // 转换为数组
    const result = Array.from(resultMap.values())

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('getReturnOrdersByIssueId 执行失败:', error)
    return {
      success: false,
      error: error.message || '查询失败',
      data: []
    }
  }
}

exports.main = async (event, context) => {
  const { action, returnOrder, issueId, tenantId } = event
  
  // 如果 action 是 'getReturnOrders'，执行查询逻辑
  if (action === 'getReturnOrders') {
    return await getReturnOrdersByIssueId(issueId, tenantId)
  }
  
  // 默认行为：创建回货单
  if (!returnOrder) {
    return {
      success: false,
      error: 'returnOrder 不能为空'
    }
  }
  
  try {
    // 开始事务
    const result = await db.runTransaction(async transaction => {
      // 1. 创建回货单
      const returnResult = await transaction.collection('return_orders').add({
        data: {
          ...returnOrder,
          color: returnOrder.color || '',
          size: returnOrder.size || '',
          settlementStatus: '未结算',
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          deleted: false
        }
      })
      
      // 2. 查询该发料单的所有回货单（使用 eq(false) 支持索引）
      const allReturns = await transaction.collection('return_orders')
        .where({
          issueId: returnOrder.issueId,
          deleted: _.eq(false)
        })
        .get()
      
      // 3. 计算累计回货量
      let totalReturnYarn = 0
      allReturns.data.forEach(order => {
        totalReturnYarn += order.actualYarnUsage || 0
      })
      
      // 4. 获取发料单信息
      const issueOrder = await transaction.collection('issue_orders')
        .doc(returnOrder.issueId)
        .get()
      
      // 5. 计算剩余纱线
      const remainingYarn = issueOrder.data.issueWeight - totalReturnYarn
      
      // 6. 更新发料单状态
      let status = '未回货'
      if (totalReturnYarn > 0) {
        if (remainingYarn <= 0.01) {
          // 回货完成，标记为已完成
          status = '已完成'
        } else {
          status = '部分回货'
        }
      }
      
      await transaction.collection('issue_orders')
        .doc(returnOrder.issueId)
        .update({
          data: {
            status,
            updateTime: db.serverDate()
          }
        })
      
      return {
        returnOrderId: returnResult._id,
        status
      }
    })
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('创建回货单失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}




