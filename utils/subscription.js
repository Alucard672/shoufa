// utils/subscription.js
// 订阅管理工具函数

const app = getApp()

/**
 * 将各种可能的过期日期格式统一解析为 Date（失败返回 null）
 * 兼容场景：
 * - Date 实例
 * - ISO 字符串（含 T/Z）
 * - 'YYYY-MM-DD'（按“当天 23:59:59”作为到期）
 * - 云函数返回可能出现的对象形式：{ $date: '...' }、{ seconds: 123 }、{ _seconds: 123 }
 * - 毫秒/秒时间戳（number / string）
 */
function parseExpireDateToDate(expireDate) {
  if (!expireDate) return null

  // Date
  if (expireDate instanceof Date) {
    return isNaN(expireDate.getTime()) ? null : expireDate
  }

  // number timestamp
  if (typeof expireDate === 'number') {
    // 10位通常是秒，13位通常是毫秒
    const ms = expireDate < 1e12 ? expireDate * 1000 : expireDate
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  // string timestamp / date string
  if (typeof expireDate === 'string') {
    const s = expireDate.trim()
    // 纯数字：时间戳
    if (/^\d+$/.test(s)) {
      const n = Number(s)
      if (!Number.isFinite(n)) return null
      const ms = n < 1e12 ? n * 1000 : n
      const d = new Date(ms)
      return isNaN(d.getTime()) ? null : d
    }

    // ISO 字符串
    if (s.includes('T') || s.includes('Z')) {
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d
    }

    // 'YYYY-MM-DD'：按当天结束
    const d = new Date(`${s}T23:59:59`)
    return isNaN(d.getTime()) ? null : d
  }

  // object forms
  if (typeof expireDate === 'object') {
    // { $date: '...' }
    if (expireDate.$date) {
      const d = new Date(expireDate.$date)
      return isNaN(d.getTime()) ? null : d
    }
    // { seconds: 123 } / { _seconds: 123 }
    const sec = expireDate.seconds ?? expireDate._seconds
    if (typeof sec === 'number') {
      const d = new Date(sec * 1000)
      return isNaN(d.getTime()) ? null : d
    }
  }

  // fallback
  const d = new Date(expireDate)
  return isNaN(d.getTime()) ? null : d
}

/**
 * 计算剩余使用天数
 * @param {Date|string|number|Object} expireDate - 过期日期
 * @returns {number} 剩余天数（负数表示已过期）
 */
export function calculateRemainingDays(expireDate) {
  const now = new Date()
  const expire = parseExpireDateToDate(expireDate)

  if (!expire) {
    console.error('calculateRemainingDays: 无效的日期:', expireDate)
    return -1 // 无法解析，视为已过期
  }

  const diff = expire.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
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
    expireDate: parseExpireDateToDate(expireDate)
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
  const date = parseExpireDateToDate(expireDate)
  if (!date) return '未设置'
  
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

