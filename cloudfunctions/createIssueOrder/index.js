// cloudfunctions/createIssueOrder/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { issueOrder } = event
  
  try {
    // 开始事务
    const result = await db.runTransaction(async transaction => {
      // 1. 获取款号信息，检查是否有关联的纱线
      const style = await transaction.collection('styles').doc(issueOrder.styleId).get()
      
      if (!style.data) {
        throw new Error('款号不存在')
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




