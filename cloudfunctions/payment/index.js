// cloudfunctions/payment/index.js
// 支付相关云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 生产环境默认关闭在线支付（避免商户号未配置导致线上触发支付流程）
// 如需启用，可在数据库 app_config 集合写入 { key: 'enablePayment', value: true }
const PROD_ENV_ID = 'shoufa-prod-3g0umt9fbba2f52b'

async function getPaymentEnabledSwitch() {
  // 1) 优先读取云端开关（无需重新发版/部署即可调整）
  try {
    const res = await db.collection('app_config')
      .where({ key: 'enablePayment' })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) {
      const v = res.data[0].value
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase()
        if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true
        if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false
      }
    }
  } catch (e) {
    // ignore (集合不存在/权限/网络等都走默认策略)
  }

  // 2) 默认策略：生产环境关闭，其他环境开启
  const currentEnv = process.env && (process.env.TCB_ENV || process.env.SCF_NAMESPACE) ? (process.env.TCB_ENV || process.env.SCF_NAMESPACE) : ''
  if (currentEnv === PROD_ENV_ID) return false
  return true
}

/**
 * 创建支付订单
 */
async function createPaymentOrder(tenantId, amount, description, packageInfo) {
  try {
    // 生成订单号（使用云函数环境ID + 时间戳 + 随机数）
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 10000)
    const outTradeNo = `ORDER_${timestamp}_${random}`
    
    // 创建订单记录
    const orderData = {
      tenantId: tenantId,
      outTradeNo: outTradeNo,
      amount: amount, // 金额（分）
      description: description || '订阅服务',
      packageId: (packageInfo && packageInfo.id) || null,
      packageName: (packageInfo && packageInfo.name) || null,
      packageDays: (packageInfo && packageInfo.days) || null,
      status: 'pending', // pending | paid | failed | refunded | cancelled
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      deleted: false
    }
    
    const addResult = await db.collection('payment_orders').add({
      data: orderData
    })
    
    // 获取用户 openid
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    if (!openid) {
      throw new Error('无法获取用户 openid')
    }
    
    // 调用微信支付统一下单接口
    const unifiedOrderResult = await cloud.openapi.wxpay.unifiedOrder({
      body: description || '订阅服务',
      outTradeNo: outTradeNo,
      spbillCreateIp: '127.0.0.1', // 小程序支付固定为 127.0.0.1
      subMchId: '', // 子商户号，如果没有可以不填
      totalFee: amount, // 金额（分）
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'payment',
      // 支付成功后的回调通知路径，微信会自动调用云函数的 handlePaymentNotify action
      // 注意：需要在微信支付商户平台配置回调 URL，格式：https://api.weixin.qq.com/_/wxpay/unifiedorder
    })
    
    // 更新订单记录，保存 prepay_id
    await db.collection('payment_orders')
      .doc(addResult._id)
      .update({
        data: {
          prepayId: unifiedOrderResult.prepayId,
          updateTime: db.serverDate()
        }
      })
    
    // 返回支付参数给客户端调起支付
    return {
      success: true,
      orderId: addResult._id,
      outTradeNo: outTradeNo,
      paymentParams: {
        timeStamp: Math.floor(Date.now() / 1000).toString(),
        package: `prepay_id=${unifiedOrderResult.prepayId}`,
        paySign: unifiedOrderResult.paySign,
        signType: unifiedOrderResult.signType || 'RSA',
        nonceStr: unifiedOrderResult.nonceStr
      }
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
 * 处理支付成功回调（由微信支付系统调用）
 * 注意：这个函数会被微信支付回调触发，需要处理 POST 请求
 */
async function handlePaymentNotify(event) {
  try {
    // 微信支付回调会传递支付结果信息
    const { transactionId, outTradeNo, resultCode, returnCode, totalFee } = event
    
    if (resultCode !== 'SUCCESS' || returnCode !== 'SUCCESS') {
      console.error('支付回调失败:', event)
      return {
        errcode: -1,
        errmsg: '支付失败'
      }
    }
    
    // 根据商户订单号查询订单
    const orderRes = await db.collection('payment_orders')
      .where({
        outTradeNo: outTradeNo,
        deleted: _.neq(true)
      })
      .limit(1)
      .get()
    
    if (!orderRes.data || orderRes.data.length === 0) {
      console.error('订单不存在:', outTradeNo)
      return {
        errcode: -1,
        errmsg: '订单不存在'
      }
    }
    
    const order = orderRes.data[0]
    const orderId = order._id
    
    // 检查订单状态，避免重复处理
    if (order.status === 'paid') {
      console.log('订单已处理，跳过:', orderId)
      return {
        errcode: 0,
        errmsg: 'OK'
      }
    }
    
    // 更新订单状态
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
    
    // 根据套餐天数发放订阅时长
    const days = order.packageDays || 30 // 默认30天
    const rewardResult = await grantReward(order.tenantId, days, `购买订阅 - ${order.packageName || ''}`)
    
    if (!rewardResult.success) {
      console.error('发放订阅时长失败:', rewardResult.error)
      // 记录错误但不返回失败，避免微信重复回调
    }
    
    // 检查是否有推荐关系，给推荐者发放奖励
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
      const shareRewardResult = await shareGrantReward(referral._id)
      
      if (!shareRewardResult.success) {
        console.error('发放推荐奖励失败:', shareRewardResult.error)
        // 不中断流程，只记录错误
      }
    }
    
    // 返回成功，告知微信已处理
    return {
      errcode: 0,
      errmsg: 'OK'
    }
  } catch (error) {
    console.error('处理支付回调失败:', error)
    return {
      errcode: -1,
      errmsg: error.message || '处理失败'
    }
  }
}

/**
 * 手动处理支付成功（用于支付成功后客户端确认）
 */
async function handlePaymentSuccess(outTradeNo) {
  try {
    // 查询订单
    const orderRes = await db.collection('payment_orders')
      .where({
        outTradeNo: outTradeNo,
        deleted: _.neq(true)
      })
      .limit(1)
      .get()
    
    if (!orderRes.data || orderRes.data.length === 0) {
      return {
        success: false,
        error: '订单不存在'
      }
    }
    
    const order = orderRes.data[0]
    
    // 检查订单状态
    if (order.status === 'paid') {
      return {
        success: true,
        message: '订单已处理',
        alreadyProcessed: true,
        data: {
          orderId: order._id,
          tenantId: order.tenantId
        }
      }
    }
    
    // 如果订单还是 pending 状态，等待回调处理
    // 或者主动查询支付状态
    if (order.status === 'pending') {
      // 可以调用查询订单接口确认支付状态
      try {
        const queryResult = await cloud.openapi.wxpay.orderQuery({
          outTradeNo: outTradeNo
        })
        
        if (queryResult.tradeState === 'SUCCESS') {
          // 支付成功，调用处理函数
          return await handlePaymentNotify({
            transactionId: queryResult.transactionId,
            outTradeNo: outTradeNo,
            resultCode: 'SUCCESS',
            returnCode: 'SUCCESS',
            totalFee: queryResult.totalFee
          })
        }
      } catch (queryError) {
        console.error('查询订单状态失败:', queryError)
      }
    }
    
    return {
      success: true,
      message: '订单处理中，请稍后',
      data: {
        orderId: order._id,
        tenantId: order.tenantId,
        status: order.status
      }
    }
  } catch (error) {
    console.error('处理支付成功失败:', error)
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
          // 这里必须写入计算后的 Date；db.serverDate() 只能生成“服务器当前时间”
          expireDate: newExpireDate,
          subscriptionDays: newSubscriptionDays,
          lastExpireDate: currentExpireDate ? currentExpireDate : null,
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
        expireDateBefore: currentExpireDate ? currentExpireDate : null,
        expireDateAfter: newExpireDate,
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
    // 处理微信支付回调（POST 请求）
    // 微信支付回调时会直接传递支付结果，不包含 action 字段
    if (event.outTradeNo && event.resultCode) {
      return await handlePaymentNotify(event)
    }
    
    if (action === 'createOrder') {
      const enabled = await getPaymentEnabledSwitch()
      if (!enabled) {
        return {
          success: false,
          error: '在线支付未开通'
        }
      }
      const { tenantId, amount, description, packageInfo } = event
      return await createPaymentOrder(tenantId, amount, description, packageInfo)
    }
    
    if (action === 'handlePaymentSuccess') {
      const enabled = await getPaymentEnabledSwitch()
      if (!enabled) {
        return {
          success: false,
          error: '在线支付未开通'
        }
      }
      const { outTradeNo } = event
      if (!outTradeNo) {
        return {
          success: false,
          error: '缺少订单号'
        }
      }
      return await handlePaymentSuccess(outTradeNo)
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

