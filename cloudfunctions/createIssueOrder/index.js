// cloudfunctions/createIssueOrder/index.js
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

async function getIssueOrderByAnyId(issueId, tenantId) {
  const idStr = toIdStr(issueId)
  const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null

  // 1) 优先按 _id doc
  try {
    const doc = await db.collection('issue_orders').doc(idStr).get()
    if (doc && doc.data && (!tenantId || doc.data.tenantId === tenantId)) return doc.data
  } catch (e) {
    // ignore
  }

  // 2) 回退：按自定义 id（数字）
  if (tenantId && idNum !== null) {
    const res = await db.collection('issue_orders')
      .where({ tenantId: tenantId, deleted: _.eq(false), id: idNum })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) return res.data[0]
  }

  return null
}

async function listReturnOrdersByIssue(issue, tenantId) {
  const idStr = toIdStr(issue._id || issue.id)
  const idNum = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null
  const idList = uniqStrings([issue._id, issue.id, idStr, idNum !== null ? idNum : null])

  const baseWhere = { deleted: _.eq(false) }
  if (tenantId) baseWhere.tenantId = tenantId

  const out = []
  let skip = 0
  const limit = 100
  while (true) {
    const [r1, r2] = await Promise.all([
      db.collection('return_orders').where({ ...baseWhere, issueId: _.in(idList) }).skip(skip).limit(limit).get().catch(() => ({ data: [] })),
      db.collection('return_orders').where({ ...baseWhere, issue_id: _.in(idList) }).skip(skip).limit(limit).get().catch(() => ({ data: [] }))
    ])
    const merged = (r1.data || []).concat(r2.data || [])
    if (merged.length === 0) break
    out.push.apply(out, merged)
    // 简单翻页：因为两路查询会重复/不满，这里以“是否取到满额”为终止条件不可靠
    // 为避免超时，最多翻 5 页（500 条）
    skip += limit
    if (skip >= 500) break
  }

  // 去重
  const seen = new Set()
  return out.filter((ro) => {
    const key = toIdStr(ro._id || ro.id)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function recalcIssueStatus(issue, tenantId) {
  if (!issue || issue.voided === true) return

  const returns = await listReturnOrdersByIssue(issue, tenantId)
  const activeReturns = (returns || []).filter(ro => ro.deleted !== true && ro.voided !== true)

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

  await db.collection('issue_orders').doc(issue._id).update({
    data: { status: status, updateTime: db.serverDate() }
  })
}

exports.main = async (event, context) => {
  const { action } = event

  // 作废/恢复发料单（彻底：作废时联动作废所有关联回货单，并撤销结算占用）
  if (action === 'toggleVoid') {
    const issueOrderId = event.issueOrderId || event.id
    const tenantId = event.tenantId
    const targetVoided = !!event.voided
    if (!issueOrderId) return { success: false, error: 'issueOrderId 不能为空' }

    try {
      const issue = await getIssueOrderByAnyId(issueOrderId, tenantId)
      if (!issue) return { success: false, error: '发料单不存在' }

      await db.collection('issue_orders').doc(issue._id).update({
        data: { voided: targetVoided, updateTime: db.serverDate() }
      })

      let returnOrdersAffected = 0
      if (targetVoided) {
        const returns = await listReturnOrdersByIssue(issue, issue.tenantId)
        for (let i = 0; i < returns.length; i++) {
          const ro = returns[i]
          if (ro.deleted === true) continue
          if (ro.voided === true) continue
          try {
            await cloud.callFunction({
              name: 'createReturnOrder',
              data: {
                action: 'toggleVoid',
                tenantId: issue.tenantId,
                returnOrderId: ro._id || ro.id,
                voided: true
              }
            })
            returnOrdersAffected++
          } catch (e) {
            console.error('联动作废回货单失败:', ro._id, e)
          }
        }
      } else {
        // 恢复发料单：不自动恢复回货单，仅回算一次状态
        const fresh = await getIssueOrderByAnyId(issue._id, issue.tenantId)
        await recalcIssueStatus(fresh || issue, issue.tenantId)
      }

      return { success: true, data: { returnOrdersAffected } }
    } catch (e) {
      console.error('toggleVoid(issue) 失败:', e)
      return { success: false, error: e.message || '操作失败' }
    }
  }

  const { issueOrder } = event
  
  try {
    // 开始事务
    const result = await db.runTransaction(async transaction => {
      // 1. 获取款号信息，检查是否有关联的纱线
      const styleId = issueOrder.styleId || issueOrder.style_id
      const factoryId = issueOrder.factoryId || issueOrder.factory_id

      if (!styleId) {
        throw new Error('缺少款号ID')
      }
      if (!factoryId) {
        throw new Error('缺少加工厂ID')
      }

      const style = await transaction.collection('styles').doc(styleId).get()
      
      if (!style.data) {
        throw new Error('款号不存在')
      }

      // ✅ 停用款号不允许继续发料
      if (style.data.disabled === true) {
        throw new Error('该款号已停用，无法发料')
      }

      // 1.5 获取加工厂信息，校验是否停用
      const factory = await transaction.collection('factories').doc(factoryId).get()
      if (!factory.data) {
        throw new Error('加工厂不存在')
      }
      if (factory.data.disabled === true) {
        throw new Error('该加工厂已停用，无法发料')
      }
      
      const yarnIds = style.data.yarnIds || []
      const issueWeight = issueOrder.issueWeight || 0
      
      // 2. 如果有关联的纱线，扣减库存
      if (yarnIds.length > 0 && issueWeight > 0) {
        // 获取所有关联的纱线库存信息
        // 按用户需求：不因“纱线不存在/库存不足”阻断发料单创建，所以这里对单条查询做容错
        const yarnSettled = await Promise.allSettled(
          yarnIds.map(yarnId => transaction.collection('yarn_inventory').doc(yarnId).get())
        )
        // 保持 yarnId 与查询结果的映射关系
        const yarns = yarnSettled.map((r, idx) => ({
          yarnId: yarnIds[idx],
          doc: r.status === 'fulfilled' ? r.value : null
        }))
        
        // 计算每个纱线的扣减量（按比例分配）
        // 如果只有一个纱线，全部扣减该纱线
        // 如果有多个纱线，按库存比例分配
        let totalStock = 0
        yarns.forEach(item => {
          const yarn = item.doc
          if (yarn && yarn.data && !yarn.data.deleted) {
            totalStock += yarn.data.currentStock || 0
          }
        })
        
        // 按用户需求：去掉“库存不足/不存在”的强校验，不阻止发料单创建。
        // 若库存为 0，则跳过扣减逻辑（保持数据不变）。
        if (totalStock <= 0) {
          // 不扣减库存，继续创建发料单
          totalStock = 0
        }
        
        // 按比例扣减每个纱线的库存
        // totalStock 为 0 时，无法按比例分摊，直接跳过扣减
        if (totalStock <= 0) {
          // do nothing
        } else {
          for (let i = 0; i < yarns.length; i++) {
            const yarn = yarns[i].doc
            if (!yarn || !yarn.data || yarn.data.deleted) {
            continue
            }
          
            const yarnStock = yarn.data.currentStock || 0
            if (yarnStock <= 0) {
              continue
            }
          
            // 计算该纱线应扣减的数量（按库存比例）
            const deductAmount = (yarnStock / totalStock) * issueWeight
          
            // 按用户需求：不做库存充足校验；不足时扣到 0，不阻止发料单创建
            const newStock = yarnStock - deductAmount
            await transaction.collection('yarn_inventory').doc(yarns[i].yarnId).update({
              data: {
                currentStock: Math.max(0, newStock), // 确保不为负数
                updateTime: db.serverDate()
              }
            })
          }
        }
      }
      
      // 3. 创建发料单
      const issueData = { ...issueOrder }
      // 确保日期是 Date 对象
      if (issueData.issueDate && typeof issueData.issueDate === 'string') {
        issueData.issueDate = new Date(issueData.issueDate.replace(/\//g, '-'))
      } else if (issueData.issueDate) {
        issueData.issueDate = new Date(issueData.issueDate)
      }

      const issueResult = await transaction.collection('issue_orders').add({
        data: {
          ...issueData,
          status: '未回货',
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          deleted: false
        }
      })
      
      return {
        issueOrderId: issueResult._id
      }
    })
    
    // 保存或更新款号-工厂的加工单价（在事务外执行）
    if (issueOrder.processingFeePerDozen && issueOrder.styleId && issueOrder.factoryId) {
      try {
        // 先查询是否存在
        const existingRes = await db.collection('style_factory_prices')
          .where({
            tenantId: issueOrder.tenantId,
            styleId: issueOrder.styleId,
            factoryId: issueOrder.factoryId,
            deleted: false
          })
          .get()
        
        const priceData = {
          styleId: issueOrder.styleId,
          factoryId: issueOrder.factoryId,
          processingFeePerDozen: issueOrder.processingFeePerDozen,
          updateTime: db.serverDate()
        }
        
        if (existingRes.data.length > 0) {
          // 更新现有记录
          await db.collection('style_factory_prices')
            .doc(existingRes.data[0]._id)
            .update({
              data: priceData
            })
        } else {
          // 创建新记录
          await db.collection('style_factory_prices')
            .add({
              data: {
                ...priceData,
                tenantId: issueOrder.tenantId,
                deleted: false,
                createTime: db.serverDate()
              }
            })
        }
      } catch (error) {
        console.error('保存款号-工厂加工单价失败:', error)
        // 不阻断主流程，仅记录错误
      }
    }
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('创建发料单失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}




