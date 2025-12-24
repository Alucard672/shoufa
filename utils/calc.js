// utils/calc.js
// 计算工具函数

/**
 * 精确加法
 */
function accAdd(arg1, arg2) {
  let r1, r2, m
  try { r1 = arg1.toString().split('.')[1].length } catch (e) { r1 = 0 }
  try { r2 = arg2.toString().split('.')[1].length } catch (e) { r2 = 0 }
  m = Math.pow(10, Math.max(r1, r2))
  return (Math.round(arg1 * m) + Math.round(arg2 * m)) / m
}

/**
 * 精确减法
 */
function accSub(arg1, arg2) {
  let r1, r2, m, n
  try { r1 = arg1.toString().split('.')[1].length } catch (e) { r1 = 0 }
  try { r2 = arg2.toString().split('.')[1].length } catch (e) { r2 = 0 }
  m = Math.pow(10, Math.max(r1, r2))
  n = (r1 >= r2) ? r1 : r2
  return parseFloat(((Math.round(arg1 * m) - Math.round(arg2 * m)) / m).toFixed(n))
}

/**
 * 精确乘法
 */
function accMul(arg1, arg2) {
  let m = 0, s1 = arg1.toString(), s2 = arg2.toString()
  try { m += s1.split('.')[1].length } catch (e) { }
  try { m += s2.split('.')[1].length } catch (e) { }
  return Number(s1.replace('.', '')) * Number(s2.replace('.', '')) / Math.pow(10, m)
}

/**
 * 精确除法
 */
function accDiv(arg1, arg2) {
  let t1 = 0, t2 = 0, r1, r2
  try { t1 = arg1.toString().split('.')[1].length } catch (e) { }
  try { t2 = arg2.toString().split('.')[1].length } catch (e) { }
  r1 = Number(arg1.toString().replace('.', ''))
  r2 = Number(arg2.toString().replace('.', ''))
  return (r1 / r2) * Math.pow(10, t2 - t1)
}

/**
 * 计算计划用纱量
 * @param {Number} planQuantity 计划件数
 * @param {Number} yarnUsagePerPiece 单件用量（克）
 * @returns {Number} 计划用纱量（kg）
 */
export function calculatePlanYarnUsage(planQuantity, yarnUsagePerPiece) {
  return accDiv(accMul(planQuantity, yarnUsagePerPiece), 1000)
}

/**
 * 计算回货件数
 * @param {Number} returnQuantity 回货打数
 * @returns {Number} 回货件数
 */
export function calculateReturnPieces(returnQuantity) {
  return accMul(returnQuantity, 12)
}

/**
 * 计算实际用纱量
 * @param {Number} returnPieces 回货件数
 * @param {Number} yarnUsagePerPiece 单件用量（克）
 * @returns {Number} 实际用纱量（kg）
 */
export function calculateActualYarnUsage(returnPieces, yarnUsagePerPiece) {
  return accDiv(accMul(returnPieces, yarnUsagePerPiece), 1000)
}

/**
 * 计算加工费
 * @param {Number} returnQuantity 回货打数
 * @param {Number} pricePerDozen 加工单价（元/打）
 * @returns {Number} 加工费（元）
 */
export function calculateProcessingFee(returnQuantity, pricePerDozen) {
  return accMul(returnQuantity, pricePerDozen)
}

/**
 * 计算剩余纱线
 * @param {Number} totalIssueWeight 累计发料重量（kg）
 * @param {Number} totalUsedYarn 累计实际用纱量（kg）
 * @returns {Number} 剩余纱线（kg）
 */
export function calculateRemainingYarn(totalIssueWeight, totalUsedYarn) {
  return accSub(totalIssueWeight, totalUsedYarn)
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
 * 生成计划单号
 * @returns {String} 计划单号 JH + YYYYMMDD + 序号
 */
export function generatePlanNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `JH${dateStr}${random}`
}

/**
 * 生成结算单号
 * @returns {String} 结算单号 JS + YYYYMMDD + 序号
 */
export function generateSettlementNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `JS${dateStr}${random}`
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

/**
 * 格式化数量（打/件）
 * @param {Number} pieces 总件数
 * @returns {String} 格式化后的字符串，如 "2打 3件"
 */
export function formatQuantity(pieces) {
  const p = Math.floor(pieces || 0)
  const doz = Math.floor(p / 12)
  const rem = p % 12

  if (doz > 0 && rem > 0) {
    return `${doz}打 ${rem}件`
  } else if (doz > 0) {
    return `${doz}打`
  } else {
    return `${rem}件`
  }
}





