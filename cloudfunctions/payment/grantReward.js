// cloudfunctions/payment/grantReward.js
// 给租户发放订阅时长的工具函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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

module.exports = grantReward

