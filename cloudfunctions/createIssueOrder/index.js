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
        const yarnPromises = yarnIds.map(yarnId => 
          transaction.collection('yarn_inventory').doc(yarnId).get()
        )
        const yarns = await Promise.all(yarnPromises)
        
        // 计算每个纱线的扣减量（按比例分配）
        // 如果只有一个纱线，全部扣减该纱线
        // 如果有多个纱线，按库存比例分配
        let totalStock = 0
        yarns.forEach(yarn => {
          if (yarn.data && !yarn.data.deleted) {
            totalStock += yarn.data.currentStock || 0
          }
        })
        
        if (totalStock <= 0) {
          throw new Error('关联的纱线库存不足或不存在')
        }
        
        // 按比例扣减每个纱线的库存
        for (let i = 0; i < yarns.length; i++) {
          const yarn = yarns[i]
          if (!yarn.data || yarn.data.deleted) {
            continue
          }
          
          const yarnStock = yarn.data.currentStock || 0
          if (yarnStock <= 0) {
            continue
          }
          
          // 计算该纱线应扣减的数量（按库存比例）
          const deductAmount = (yarnStock / totalStock) * issueWeight
          
          // 检查库存是否充足
          if (yarnStock < deductAmount) {
            throw new Error(`纱线"${yarn.data.yarnName}"库存不足，当前库存：${yarnStock}kg，需要扣减：${deductAmount.toFixed(2)}kg`)
          }
          
          // 扣减库存
          const newStock = yarnStock - deductAmount
          await transaction.collection('yarn_inventory').doc(yarnIds[i]).update({
            data: {
              currentStock: Math.max(0, newStock), // 确保不为负数
              updateTime: db.serverDate()
            }
          })
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




