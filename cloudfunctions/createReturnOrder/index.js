// cloudfunctions/createReturnOrder/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { returnOrder } = event
  
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
      
      // 2. 查询该发料单的所有回货单
      const allReturns = await transaction.collection('return_orders')
        .where({
          issueId: returnOrder.issueId,
          deleted: _.neq(true)
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




