// cloudfunctions/payment/index.js
// 支付相关云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 创建支付订单
 */
async function createPaymentOrder(tenantId, amount, description) {
  try {
    // 这里需要集成微信支付
    // 1. 调用微信支付统一下单接口
    // 2. 创建订单记录
    // 3. 返回支付参数
    
    // 注意：实际实现需要配置微信支付商户号和密钥
    // 这里提供框架代码，需要根据实际情况完善
    
    const orderData = {
      tenantId: tenantId,
      amount: amount, // 金额（分）
      description: description || '订阅服务',
      status: 'pending', // pending | paid | failed | refunded
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      deleted: false
    }
    
    const addResult = await db.collection('payment_orders').add({
      data: orderData
    })
    
    // TODO: 调用微信支付统一下单接口
    // const paymentParams = await callWeChatPayUnifiedOrder({
    //   out_trade_no: addResult._id,
    //   total_fee: amount,
    //   body: description,
    //   // ... 其他参数
    // })
    
    return {
      success: true,
      orderId: addResult._id,
      // paymentParams: paymentParams // 返回给客户端调起支付
      message: '支付功能待集成微信支付API'
    }
  } catch (error) {
    console.error('创建支付订单失败:', error)
    return {
      success: false,
      error: error.message || '创建支付订单失败'
    }
  }
}

/**
 * 处理支付成功回调
 */
async function handlePaymentSuccess(orderId, transactionId) {
  try {
    // 1. 验证支付结果（验证签名等）
    // 2. 查询订单
    const orderRes = await db.collection('payment_orders')
      .doc(orderId)
      .get()
    
    if (!orderRes.data) {
      return {
        success: false,
        error: '订单不存在'
      }
    }
    
    const order = orderRes.data
    
    // 检查订单状态
    if (order.status === 'paid') {
      return {
        success: true,
        message: '订单已处理',
        alreadyProcessed: true
      }
    }
    
    // 2. 更新订单状态
    await db.collection('payment_orders')
      .doc(orderId)
      .update({
        data: {
          status: 'paid',
          transactionId: transactionId,
          paidTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    
    // 3. 更新租户订阅信息（累加180天）
    const rewardResult = await grantReward(order.tenantId, 180, '购买订阅')
    
    // 4. 检查是否有推荐关系，给推荐者发放奖励
    const referralsRes = await db.collection('referrals')
      .where({
        refereeTenantId: order.tenantId,
        status: 'pending',
        deleted: _.neq(true)
      })
      .limit(1)
      .get()
    
    if (referralsRes.data && referralsRes.data.length > 0) {
      const referral = referralsRes.data[0]
      
      // 更新推荐记录状态
      await db.collection('referrals')
        .doc(referral._id)
        .update({
          data: {
            status: 'paid',
            paymentTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      
      // 给推荐者发放奖励
      const shareGrantReward = require('../share/grantReward')
      const rewardResult = await shareGrantReward(referral._id)
      
      if (!rewardResult.success) {
        console.error('发放推荐奖励失败:', rewardResult.error)
        // 不中断流程，只记录错误
      }
    }
    
    return {
      success: true,
      message: '支付处理成功',
      data: {
        orderId: orderId,
        tenantId: order.tenantId
      }
    }
  } catch (error) {
    console.error('处理支付成功回调失败:', error)
    return {
      success: false,
      error: error.message || '处理支付失败'
    }
  }
}

/**
 * 给租户发放订阅时长
 */
async function grantReward(tenantId, days, source) {
  try {
    // 查询租户信息
    const tenantRes = await db.collection('tenants')
      .doc(tenantId)
      .get()
    
    if (!tenantRes.data) {
      return {
        success: false,
        error: '租户不存在'
      }
    }
    
    const tenant = tenantRes.data
    const now = new Date()
    
    // 计算新的过期日期
    let newExpireDate
    const currentExpireDate = tenant.expireDate 
      ? new Date(tenant.expireDate) 
      : null
    
    if (currentExpireDate && currentExpireDate > now) {
      // 如果当前未过期，从当前过期日期累加
      newExpireDate = new Date(currentExpireDate)
      newExpireDate.setDate(newExpireDate.getDate() + days)
    } else {
      // 如果已过期或未设置，从当前日期开始计算
      newExpireDate = new Date(now)
      newExpireDate.setDate(newExpireDate.getDate() + days)
    }
    
    // 计算订阅总天数（累计）
    const currentSubscriptionDays = tenant.subscriptionDays || 0
    const newSubscriptionDays = currentSubscriptionDays + days
    
    // 更新租户订阅信息
    await db.collection('tenants')
      .doc(tenantId)
      .update({
        data: {
          expireDate: db.serverDate(newExpireDate),
          subscriptionDays: newSubscriptionDays,
          lastExpireDate: currentExpireDate ? db.serverDate(currentExpireDate) : null,
          subscriptionStatus: 'active',
          updateTime: db.serverDate()
        }
      })
    
    // 记录订阅历史
    await db.collection('subscription_history').add({
      data: {
        tenantId: tenantId,
        type: 'purchase',
        days: days,
        expireDateBefore: currentExpireDate ? db.serverDate(currentExpireDate) : null,
        expireDateAfter: db.serverDate(newExpireDate),
        source: source || '购买订阅',
        referralId: null,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        deleted: false
      }
    })
    
    return {
      success: true,
      data: {
        newExpireDate: newExpireDate,
        newSubscriptionDays: newSubscriptionDays
      }
    }
  } catch (error) {
    console.error('发放订阅奖励失败:', error)
    return {
      success: false,
      error: error.message || '发放奖励失败'
    }
  }
}

exports.main = async (event, context) => {
  const { action } = event
  
  try {
    if (action === 'createOrder') {
      const { tenantId, amount, description } = event
      return await createPaymentOrder(tenantId, amount, description)
    }
    
    if (action === 'handlePaymentSuccess') {
      const { orderId, transactionId } = event
      return await handlePaymentSuccess(orderId, transactionId)
    }
    
    if (action === 'grantReward') {
      const { tenantId, days, source } = event
      return await grantReward(tenantId, days, source)
    }
    
    return {
      success: false,
      error: '未知的 action'
    }
  } catch (error) {
    console.error('payment 云函数执行失败:', error)
    return {
      success: false,
      error: error.message || '执行失败'
    }
  }
}

// 导出 grantReward 供其他模块使用
module.exports.grantReward = grantReward

