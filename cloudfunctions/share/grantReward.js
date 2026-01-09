// cloudfunctions/share/grantReward.js
// 奖励发放逻辑

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 给推荐者发放奖励
 * @param {string} referralId - 推荐记录ID
 * @returns {Object} 发放结果
 */
async function grantReward(referralId) {
  try {
    // 1. 查询推荐记录
    const referralRes = await db.collection('referrals')
      .doc(referralId)
      .get()
    
    if (!referralRes.data) {
      return {
        success: false,
        error: '推荐记录不存在'
      }
    }
    
    const referral = referralRes.data
    
    // 检查是否已发放奖励
    if (referral.rewardGranted) {
      return {
        success: true,
        message: '奖励已发放',
        alreadyGranted: true
      }
    }
    
    // 2. 查询推荐者租户信息
    const referrerTenantRes = await db.collection('tenants')
      .doc(referral.referrerTenantId)
      .get()
    
    if (!referrerTenantRes.data) {
      return {
        success: false,
        error: '推荐者租户不存在'
      }
    }
    
    const referrerTenant = referrerTenantRes.data
    const now = new Date()
    
    // 3. 计算新的过期日期
    let newExpireDate
    const currentExpireDate = referrerTenant.expireDate 
      ? new Date(referrerTenant.expireDate) 
      : null
    
    if (currentExpireDate && currentExpireDate > now) {
      // 如果当前未过期，从当前过期日期累加
      newExpireDate = new Date(currentExpireDate)
      newExpireDate.setDate(newExpireDate.getDate() + referral.rewardDays)
    } else {
      // 如果已过期或未设置，从当前日期开始计算
      newExpireDate = new Date(now)
      newExpireDate.setDate(newExpireDate.getDate() + referral.rewardDays)
    }
    
    // 4. 计算订阅总天数（累计）
    const currentSubscriptionDays = referrerTenant.subscriptionDays || 0
    const newSubscriptionDays = currentSubscriptionDays + referral.rewardDays
    
    // 5. 更新推荐者租户的订阅信息
    await db.collection('tenants')
      .doc(referral.referrerTenantId)
      .update({
        data: {
          expireDate: db.serverDate(newExpireDate),
          subscriptionDays: newSubscriptionDays,
          lastExpireDate: currentExpireDate ? db.serverDate(currentExpireDate) : null,
          subscriptionStatus: 'active',
          updateTime: db.serverDate()
        }
      })
    
    // 6. 记录订阅历史
    const subscriptionHistory = {
      tenantId: referral.referrerTenantId,
      type: 'referral_reward',
      days: referral.rewardDays,
      expireDateBefore: currentExpireDate ? db.serverDate(currentExpireDate) : null,
      expireDateAfter: db.serverDate(newExpireDate),
      source: `推荐奖励-${referral.refereePhone || '未知企业'}`,
      referralId: referralId,
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      deleted: false
    }
    
    await db.collection('subscription_history').add({
      data: subscriptionHistory
    })
    
    // 7. 标记推荐记录为已发放奖励
    await db.collection('referrals')
      .doc(referralId)
      .update({
        data: {
          rewardGranted: true,
          rewardGrantedAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    
    return {
      success: true,
      message: '奖励发放成功',
      data: {
        referralId: referralId,
        rewardDays: referral.rewardDays,
        newExpireDate: newExpireDate,
        newSubscriptionDays: newSubscriptionDays
      }
    }
  } catch (error) {
    console.error('发放奖励失败:', error)
    return {
      success: false,
      error: error.message || '发放奖励失败'
    }
  }
}

module.exports = grantReward

