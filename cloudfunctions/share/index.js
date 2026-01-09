// cloudfunctions/share/index.js
// 分享相关云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 生成分享码（基于租户ID）
 * @param {string} tenantId - 租户ID
 * @returns {string} 分享码
 */
function generateShareCode(tenantId) {
  // 简单的分享码生成：使用租户ID的Base64编码（去掉特殊字符）
  // 实际生产环境可以使用更复杂的加密算法
  const buffer = Buffer.from(tenantId)
  return buffer.toString('base64').replace(/[+/=]/g, '').substring(0, 16)
}

/**
 * 解析分享码为租户ID
 * @param {string} shareCode - 分享码
 * @returns {string|null} 租户ID，如果无效则返回null
 */
function parseShareCode(shareCode) {
  try {
    // 尝试从分享码解析租户ID
    // 由于Base64编码可能被截断，需要尝试匹配
    // 这里简化处理，实际应该存储分享码到租户ID的映射关系
    return null // 暂时返回null，需要查询数据库
  } catch (e) {
    return null
  }
}

/**
 * 创建推荐记录
 */
async function createReferral(referrerTenantId, refereeTenantId, refereePhone) {
  const now = db.serverDate()
  
  // 检查是否已存在推荐记录
  const existing = await db.collection('referrals')
    .where({
      referrerTenantId: referrerTenantId,
      refereeTenantId: refereeTenantId,
      deleted: _.neq(true)
    })
    .limit(1)
    .get()
  
  if (existing.data && existing.data.length > 0) {
    // 已存在，返回现有记录
    return {
      success: true,
      referralId: existing.data[0]._id,
      data: existing.data[0]
    }
  }
  
  // 创建新记录
  const referralData = {
    referrerTenantId: referrerTenantId,
    refereeTenantId: refereeTenantId,
    refereePhone: refereePhone || '',
    status: 'pending', // pending | paid | expired
    rewardDays: 180, // 半年 = 180天
    rewardGranted: false,
    rewardGrantedAt: null,
    paymentTime: null,
    createTime: now,
    updateTime: now,
    deleted: false,
    tenantId: referrerTenantId // 租户隔离
  }
  
  const addResult = await db.collection('referrals').add({
    data: referralData
  })
  
  return {
    success: true,
    referralId: addResult._id,
    data: { _id: addResult._id, ...referralData }
  }
}

/**
 * 生成分享链接
 */
async function generateShareLink(tenantId) {
  const shareCode = generateShareCode(tenantId)
  
  // 获取小程序信息
  const accountInfo = cloud.getWXContext()
  
  // 生成分享链接
  const sharePath = `/pages/index/index?shareCode=${shareCode}&shareType=tenant`
  
  return {
    success: true,
    shareCode: shareCode,
    sharePath: sharePath,
    shareUrl: `pages/index/index?shareCode=${shareCode}&shareType=tenant`
  }
}

/**
 * 根据分享码查找分享者租户ID
 */
async function getReferrerByShareCode(shareCode) {
  // 由于分享码是租户ID的编码，我们需要查询所有租户来匹配
  // 更好的方式是存储分享码映射表，这里简化处理
  
  // 尝试从referrals表中查找（如果有记录）
  // 或者直接使用shareCode作为tenantId（如果格式匹配）
  
  // 这里简化：假设shareCode可以直接解码或匹配
  // 实际应该维护一个shareCode到tenantId的映射表
  
  // 临时方案：如果shareCode长度和格式符合，尝试查询
  if (shareCode && shareCode.length >= 8) {
    // 这里需要根据实际业务逻辑实现
    // 可以创建一个share_codes集合存储映射关系
    return null
  }
  
  return null
}

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
  try {
    if (action === 'generateShareLink') {
      // 生成分享链接
      const { tenantId } = event
      if (!tenantId) {
        return {
          success: false,
          error: 'tenantId 不能为空'
        }
      }
      
      return await generateShareLink(tenantId)
    }
    
    if (action === 'createReferral') {
      // 创建推荐记录
      const { referrerTenantId, refereeTenantId, refereePhone } = event
      
      if (!referrerTenantId || !refereeTenantId) {
        return {
          success: false,
          error: 'referrerTenantId 和 refereeTenantId 不能为空'
        }
      }
      
      return await createReferral(referrerTenantId, refereeTenantId, refereePhone)
    }
    
    if (action === 'getReferrerByShareCode') {
      // 根据分享码查找分享者
      const { shareCode } = event
      
      if (!shareCode) {
        return {
          success: false,
          error: 'shareCode 不能为空'
        }
      }
      
      const referrerTenantId = await getReferrerByShareCode(shareCode)
      
      return {
        success: true,
        referrerTenantId: referrerTenantId
      }
    }
    
    return {
      success: false,
      error: '未知的 action'
    }
  } catch (error) {
    console.error('share 云函数执行失败:', error)
    return {
      success: false,
      error: error.message || '执行失败'
    }
  }
}

