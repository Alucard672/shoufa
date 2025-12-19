// utils/calc.js
// 计算工具函数

/**
 * 计算计划用纱量
 * @param {Number} planQuantity 计划件数
 * @param {Number} yarnUsagePerPiece 单件用量（克）
 * @returns {Number} 计划用纱量（kg）
 */
export function calculatePlanYarnUsage(planQuantity, yarnUsagePerPiece) {
  return (planQuantity * yarnUsagePerPiece) / 1000
}

/**
 * 计算回货件数
 * @param {Number} returnQuantity 回货打数
 * @returns {Number} 回货件数
 */
export function calculateReturnPieces(returnQuantity) {
  return returnQuantity * 12
}

/**
 * 计算实际用纱量
 * @param {Number} returnPieces 回货件数
 * @param {Number} yarnUsagePerPiece 单件用量（克）
 * @returns {Number} 实际用纱量（kg）
 */
export function calculateActualYarnUsage(returnPieces, yarnUsagePerPiece) {
  return (returnPieces * yarnUsagePerPiece) / 1000
}

/**
 * 计算加工费
 * @param {Number} returnQuantity 回货打数
 * @param {Number} pricePerDozen 加工单价（元/打）
 * @returns {Number} 加工费（元）
 */
export function calculateProcessingFee(returnQuantity, pricePerDozen) {
  return returnQuantity * pricePerDozen
}

/**
 * 计算剩余纱线
 * @param {Number} totalIssueWeight 累计发料重量（kg）
 * @param {Number} totalUsedYarn 累计实际用纱量（kg）
 * @returns {Number} 剩余纱线（kg）
 */
export function calculateRemainingYarn(totalIssueWeight, totalUsedYarn) {
  return totalIssueWeight - totalUsedYarn
}

/**
 * 格式化金额
 * @param {Number} amount 金额
 * @returns {String} 格式化后的金额字符串
 */
export function formatAmount(amount) {
  return `¥${amount.toFixed(2)}`
}

/**
 * 格式化重量
 * @param {Number} weight 重量（kg）
 * @returns {String} 格式化后的重量字符串
 */
export function formatWeight(weight) {
  return `${weight.toFixed(2)} kg`
}

/**
 * 格式化日期
 * @param {Date|String} date 日期
 * @returns {String} 格式化后的日期字符串 YYYY/MM/DD
 */
export function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

/**
 * 生成发料单号
 * @returns {String} 发料单号 FL + YYYYMMDD + 序号
 */
export function generateIssueNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `FL${dateStr}${random}`
}

/**
 * 生成回货单号
 * @returns {String} 回货单号 HH + YYYYMMDD + 序号
 */
export function generateReturnNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `HH${dateStr}${random}`
}

/**
 * 获取时间范围
 * @param {String} type 类型：today/week/month/all
 * @returns {Object} {startDate, endDate}
 */
export function getTimeRange(type) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (type) {
    case 'today':
      return {
        startDate: today,
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    case 'week':
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      return {
        startDate: weekStart,
        endDate: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      }
    case 'month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        startDate: monthStart,
        endDate: monthEnd
      }
    default:
      return {
        startDate: null,
        endDate: null
      }
  }
}




