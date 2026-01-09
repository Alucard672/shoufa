// cloudfunctions/createReturnOrder/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function toIdStr(v) {
  if (v === undefined || v === null) return ''
  return String(v)
}

function uniqStrings(arr) {
  const seen = new Set()
  const out = []
  ;(arr || []).forEach((v) => {
    const s = String(v)
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  })
  return out
}

async function getReturnOrderByAnyId(returnOrderId, tenantId) {
  const idStr = toIdStr(returnOrderId)
  const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null

  // 1) 优先按 _id doc
  try {
    const doc = await db.collection('return_orders').doc(idStr).get()
    if (doc && doc.data && (!tenantId || doc.data.tenantId === tenantId)) return doc.data
  } catch (e) {
    // ignore
  }

  // 2) 回退：按自定义 id（数字）
  if (tenantId && idNum !== null) {
    const res = await db.collection('return_orders')
      .where({ tenantId: tenantId, deleted: _.eq(false), id: idNum })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) return res.data[0]
  }

  return null
}

async function getIssueOrderByAnyId(issueId, tenantId) {
  const idStr = toIdStr(issueId)
  const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null

  try {
    const doc = await db.collection('issue_orders').doc(idStr).get()
    if (doc && doc.data && (!tenantId || doc.data.tenantId === tenantId)) return doc.data
  } catch (e) {
    // ignore
  }

  if (tenantId && idNum !== null) {
    const res = await db.collection('issue_orders')
      .where({ tenantId: tenantId, deleted: _.eq(false), id: idNum })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) return res.data[0]
  }
  return null
}

async function listSettlementsByFactory(tenantId, factoryId) {
  const out = []
  let skip = 0
  const limit = 100
  while (true) {
    const res = await db.collection('settlements')
      .where({ tenantId: tenantId, factoryId: factoryId, deleted: _.eq(false) })
      .skip(skip)
      .limit(limit)
      .get()
    const rows = res.data || []
    out.push.apply(out, rows)
    if (rows.length < limit) break
    skip += rows.length
  }
  return out
}

function calcSettlementContribution(settlement, returnOrderIdStr) {
  const returnOrderIds = settlement.returnOrderIds || settlement.return_order_ids || []
  const settlementItems = settlement.settlementItems || settlement.settlement_items || null
  const voidedReturnOrderIds = settlement.voidedReturnOrderIds || settlement.voided_return_order_ids || []

  if (Array.isArray(settlementItems) && settlementItems.length > 0) {
    let sum = 0
    settlementItems.forEach((it) => {
      const rid = toIdStr(it.returnOrderId || it.return_order_id)
      if (!rid || rid !== returnOrderIdStr) return
      if (it.voided === true) return
      sum += Number(it.amount || it.settlementAmount || 0) || 0
    })
    return sum
  }

  if (!Array.isArray(returnOrderIds) || returnOrderIds.length === 0) return 0

  const activeIds = returnOrderIds
    .map(x => String(x))
    .filter(id => voidedReturnOrderIds.indexOf(id) === -1)
  if (activeIds.indexOf(returnOrderIdStr) === -1) return 0
  if (activeIds.length === 0) return 0

  const totalAmount = Number(settlement.totalAmount || settlement.total_amount || 0) || 0
  return totalAmount / activeIds.length
}

async function adjustSettlementsForReturnOrder(returnOrder, targetVoided) {
  const tenantId = returnOrder.tenantId
  const factoryId = returnOrder.factoryId || returnOrder.factory_id
  const returnOrderIdStr = toIdStr(returnOrder._id || returnOrder.id)
  if (!tenantId || !factoryId || !returnOrderIdStr) return { updated: 0 }

  const settlements = await listSettlementsByFactory(tenantId, factoryId)
  const hit = settlements.filter(s => {
    const ids = s.returnOrderIds || s.return_order_ids || []
    return (ids || []).map(x => String(x)).indexOf(returnOrderIdStr) !== -1
  })

  let updatedCount = 0
  for (let i = 0; i < hit.length; i++) {
    const s = hit[i]
    const sid = s._id
    const returnOrderIds = (s.returnOrderIds || s.return_order_ids || []).map(x => String(x))

    const settlementItems = (s.settlementItems || s.settlement_items || null)
    let newItems = null
    let newVoidedIds = uniqStrings(s.voidedReturnOrderIds || s.voided_return_order_ids || [])

    if (Array.isArray(settlementItems) && settlementItems.length > 0) {
      newItems = settlementItems.map((it) => {
        const rid = toIdStr(it.returnOrderId || it.return_order_id)
        if (rid !== returnOrderIdStr) return it
        if (targetVoided) {
          return {
            ...it,
            voided: true,
            voidedTime: db.serverDate()
          }
        }
        // restore
        return {
          ...it,
          voided: false,
          voidedTime: null
        }
      })
    } else {
      if (targetVoided) {
        if (newVoidedIds.indexOf(returnOrderIdStr) === -1) newVoidedIds.push(returnOrderIdStr)
      } else {
        newVoidedIds = newVoidedIds.filter(id => id !== returnOrderIdStr)
      }
    }

    // 如果一个结算单里所有回货单都被作废，则软删除该结算单，避免继续出现在列表/统计里
    let shouldDelete = false
    if (newItems && newItems.length > 0) {
      shouldDelete = newItems.every(it => it && it.voided === true)
    } else if (returnOrderIds.length > 0) {
      shouldDelete = returnOrderIds.every(id => newVoidedIds.indexOf(id) !== -1)
    }

    const updateData = {
      updateTime: db.serverDate()
    }
    if (newItems) updateData.settlementItems = newItems
    if (!newItems) updateData.voidedReturnOrderIds = newVoidedIds
    if (shouldDelete) {
      updateData.deleted = true
      updateData.deleteReason = 'all_return_orders_voided'
    }

    try {
      await db.collection('settlements').doc(sid).update({ data: updateData })
      updatedCount++
    } catch (e) {
      console.error('更新结算单失败:', sid, e)
    }
  }

  return { updated: updatedCount }
}

async function recalcIssueStatus(issueId, tenantId) {
  const issue = await getIssueOrderByAnyId(issueId, tenantId)
  if (!issue) return
  const issueDocId = issue._id

  const idStr = toIdStr(issue._id || issue.id || issueId)
  const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null
  const idList = uniqStrings([issueId, idStr, idNum !== null ? idNum : null])

  const baseWhere = {
    deleted: _.eq(false),
    voided: _.or([_.eq(false), _.exists(false)])
  }
  if (tenantId) baseWhere.tenantId = tenantId

  const [r1, r2] = await Promise.all([
    db.collection('return_orders').where({ ...baseWhere, issueId: _.in(idList) }).get().catch(() => ({ data: [] })),
    db.collection('return_orders').where({ ...baseWhere, issue_id: _.in(idList) }).get().catch(() => ({ data: [] }))
  ])
  const merged = (r1.data || []).concat(r2.data || [])
  const seen = new Set()
  const activeReturns = merged.filter((ro) => {
    const key = toIdStr(ro._id || ro.id)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return ro.deleted !== true && ro.voided !== true
  })

  let totalReturnYarn = 0
  activeReturns.forEach((ro) => {
    totalReturnYarn += Number(ro.actualYarnUsage || ro.actual_yarn_usage || 0) || 0
  })

  const issueWeight = Number(issue.issueWeight || issue.issue_weight || 0) || 0
  const remainingYarn = issueWeight - totalReturnYarn

  let status = '未回货'
  if (totalReturnYarn > 0) {
    if (remainingYarn <= 0.01) status = '已完成'
    else status = '部分回货'
  }

  await db.collection('issue_orders').doc(issueDocId).update({
    data: { status: status, updateTime: db.serverDate() }
  })
}

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

  // 作废/恢复回货单（带联动：结算撤销 + 发料单状态回算）
  if (action === 'toggleVoid') {
    const returnOrderId = event.returnOrderId || event.id
    const targetVoided = !!event.voided
    if (!returnOrderId) {
      return { success: false, error: 'returnOrderId 不能为空' }
    }

    try {
      const ro = await getReturnOrderByAnyId(returnOrderId, tenantId)
      if (!ro) return { success: false, error: '回货单不存在' }

      const roDocId = ro._id
      await db.collection('return_orders').doc(roDocId).update({
        data: { voided: targetVoided, updateTime: db.serverDate() }
      })

      // 撤销/恢复结算占用
      const settleRes = await adjustSettlementsForReturnOrder(ro, targetVoided)

      // 回算该回货单的结算金额（用于恢复后展示）
      const roIdStr = toIdStr(ro._id || ro.id)
      const settlements = await listSettlementsByFactory(ro.tenantId, ro.factoryId || ro.factory_id)
      const related = settlements.filter(s => {
        const ids = s.returnOrderIds || s.return_order_ids || []
        return (ids || []).map(x => String(x)).indexOf(roIdStr) !== -1
      })
      let settledAmount = 0
      related.forEach(s => { settledAmount += calcSettlementContribution(s, roIdStr) })
      const processingFee = Number(ro.processingFee || ro.processing_fee || 0) || 0

      let settlementStatus = '未结算'
      if (settledAmount >= processingFee - 0.01) settlementStatus = '已结算'
      else if (settledAmount > 0) settlementStatus = '部分结算'

      await db.collection('return_orders').doc(roDocId).update({
        data: {
          settledAmount: settledAmount,
          settlementStatus: settlementStatus,
          updateTime: db.serverDate()
        }
      })

      // 回算发料单状态（作废/恢复回货单会影响发料单完成度）
      const issue = ro.issueId || ro.issue_id
      if (issue) {
        await recalcIssueStatus(issue, ro.tenantId)
      }

      return { success: true, data: { settlementsUpdated: settleRes.updated } }
    } catch (e) {
      console.error('toggleVoid 失败:', e)
      return { success: false, error: e.message || '操作失败' }
    }
  }

  // 修复历史数据：把“已作废回货单”从结算/统计口径中剔除（仅处理指定租户/工厂，避免全库扫描）
  if (action === 'repairVoided') {
    const tId = event.tenantId
    const fId = event.factoryId
    const limit = Math.min(Number(event.limit || 50) || 50, 200)
    const skip = Number(event.skip || 0) || 0
    if (!tId) return { success: false, error: 'tenantId 不能为空' }

    try {
      const where = { tenantId: tId, deleted: _.eq(false), voided: _.eq(true) }
      if (fId) where.factoryId = fId
      const res = await db.collection('return_orders').where(where).skip(skip).limit(limit).get()
      const rows = res.data || []
      let settlementsUpdated = 0
      let issueRecalc = 0

      for (let i = 0; i < rows.length; i++) {
        const ro = rows[i]
        const settleRes = await adjustSettlementsForReturnOrder(ro, true)
        settlementsUpdated += (settleRes.updated || 0)
        const issue = ro.issueId || ro.issue_id
        if (issue) {
          await recalcIssueStatus(issue, tId)
          issueRecalc++
        }
      }

      return {
        success: true,
        data: {
          scanned: rows.length,
          settlementsUpdated,
          issueRecalc,
          nextSkip: skip + rows.length
        }
      }
    } catch (e) {
      console.error('repairVoided 失败:', e)
      return { success: false, error: e.message || '修复失败' }
    }
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
          deleted: _.eq(false),
          voided: _.or([_.eq(false), _.exists(false)]) // 排除作废回货单
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




