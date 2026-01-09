// utils/subscription.js
// 订阅管理工具函数

const app = getApp()

/**
 * 计算剩余使用天数
 * @param {Date|string} expireDate - 过期日期
 * @returns {number} 剩余天数（负数表示已过期）
 */
export function calculateRemainingDays(expireDate) {
  if (!expireDate) {
    return -1 // 未设置过期日期，视为已过期
  }

  const now = new Date()
  let expire
  
  // 处理不同的日期格式
  if (expireDate instanceof Date) {
    expire = expireDate
  } else if (typeof expireDate === 'string') {
    // 处理云数据库的日期格式
    if (expireDate.includes('T') || expireDate.includes('Z')) {
      expire = new Date(expireDate)
    } else {
      // 可能是 "2026-12-30" 格式，需要加上时间部分
      expire = new Date(expireDate + 'T23:59:59')
    }
  } else {
    expire = new Date(expireDate)
  }
  
  // 检查日期是否有效
  if (isNaN(expire.getTime())) {
    console.error('calculateRemainingDays: 无效的日期:', expireDate)
    return -1
  }
  
  // 计算时间差（毫秒）
  const diff = expire.getTime() - now.getTime()
  
  // 转换为天数（向上取整，确保至少显示1天）
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  
  return days
}

/**
 * 获取订阅状态
 * @param {Date|string} expireDate - 过期日期
 * @returns {Object} 订阅状态信息
 */
export function getSubscriptionStatus(expireDate) {
  const remainingDays = calculateRemainingDays(expireDate)
  
  let status = 'expired'
  let statusText = '已过期'
  let statusColor = '#FF4444'
  
  if (remainingDays > 30) {
    status = 'active'
    statusText = '正常'
    statusColor = '#52C41A'
  } else if (remainingDays > 0) {
    status = 'warning'
    statusText = '即将到期'
    statusColor = '#FA8C16'
  } else if (remainingDays === 0) {
    status = 'expiring'
    statusText = '今日到期'
    statusColor = '#FF4444'
  }
  
  return {
    status,
    statusText,
    statusColor,
    remainingDays,
    expireDate: expireDate ? new Date(expireDate) : null
  }
}

/**
 * 格式化剩余天数显示文本
 * @param {Date|string} expireDate - 过期日期
 * @returns {string} 格式化后的文本
 */
export function formatRemainingDays(expireDate) {
  const remainingDays = calculateRemainingDays(expireDate)
  
  if (remainingDays < 0) {
    return '已过期'
  } else if (remainingDays === 0) {
    return '今日到期'
  } else {
    return `剩余 ${remainingDays} 天`
  }
}

/**
 * 格式化过期日期显示
 * @param {Date|string} expireDate - 过期日期
 * @returns {string} 格式化后的日期文本
 */
export function formatExpireDate(expireDate) {
  if (!expireDate) {
    return '未设置'
  }
  
  let date
  if (expireDate instanceof Date) {
    date = expireDate
  } else if (typeof expireDate === 'string') {
    // 处理云数据库的日期格式
    if (expireDate.includes('T') || expireDate.includes('Z')) {
      date = new Date(expireDate)
    } else {
      // 可能是 "2026-12-30" 格式
      date = new Date(expireDate + 'T00:00:00')
    }
  } else {
    date = new Date(expireDate)
  }
  
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    console.error('无效的日期:', expireDate)
    return '日期格式错误'
  }
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * 检查是否需要提醒（到期前30天）
 * @param {Date|string} expireDate - 过期日期
 * @returns {boolean} 是否需要提醒
 */
export function shouldShowReminder(expireDate) {
  if (!expireDate) {
    return false
  }
  
  const remainingDays = calculateRemainingDays(expireDate)
  
  // 到期前30天开始提醒，且未过期
  return remainingDays > 0 && remainingDays <= 30
}

/**
 * 检查是否已过期（需要阻止操作）
 * @param {Date|string} expireDate - 过期日期
 * @returns {boolean} 是否已过期
 */
export function isExpired(expireDate) {
  if (!expireDate) {
    return true // 未设置过期日期，视为已过期
  }
  
  const remainingDays = calculateRemainingDays(expireDate)
  return remainingDays < 0
}

/**
 * 检查是否快到期（30天内但未过期，可以操作但需要提醒）
 * @param {Date|string} expireDate - 过期日期
 * @returns {boolean} 是否快到期
 */
export function isExpiringSoon(expireDate) {
  if (!expireDate) {
    return false
  }
  
  const remainingDays = calculateRemainingDays(expireDate)
  // 30天内但未过期
  return remainingDays > 0 && remainingDays <= 30
}

/**
 * 获取提醒消息
 * @param {Date|string} expireDate - 过期日期
 * @returns {Object|null} 提醒消息对象，如果不需要提醒则返回null
 */
export function getReminderMessage(expireDate) {
  if (!expireDate) {
    return null
  }
  
  const remainingDays = calculateRemainingDays(expireDate)
  const expireDateText = formatExpireDate(expireDate)
  
  // 如果已过期，显示过期提醒
  if (remainingDays < 0) {
    return {
      title: '订阅已过期',
      message: `⚠️ 您的订阅已过期\n过期日期：${expireDateText}\n请及时续费以继续使用`,
      remainingDays,
      expireDate: expireDateText,
      isExpired: true
    }
  }
  
  // 如果不需要提醒（剩余天数>30），返回null
  if (!shouldShowReminder(expireDate)) {
    return null
  }
  
  let message = `剩余使用天数：${remainingDays} 天\n过期日期：${expireDateText}\n请及时续费以继续使用`
  
  if (remainingDays <= 7) {
    message = `⚠️ 您的订阅即将到期！\n剩余 ${remainingDays} 天\n过期日期：${expireDateText}\n请立即续费`
  }
  
  return {
    title: remainingDays <= 7 ? '订阅即将到期' : '订阅提醒',
    message,
    remainingDays,
    expireDate: expireDateText,
    isExpired: false
  }
}

/**
 * 从租户信息获取订阅状态
 * @param {Object} tenantInfo - 租户信息对象
 * @returns {Object} 订阅状态信息
 */
export function getTenantSubscriptionStatus(tenantInfo) {
  if (!tenantInfo) {
    return {
      status: 'expired',
      statusText: '已过期',
      statusColor: '#FF4444',
      remainingDays: -1,
      expireDate: null
    }
  }
  
  const expireDate = tenantInfo.expireDate || tenantInfo.expire_date
  return getSubscriptionStatus(expireDate)
}

