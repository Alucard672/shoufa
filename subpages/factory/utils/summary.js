// utils/summary.js
// 汇总/统计通用工具：字段兼容、hybrid 日期口径、数值安全求和

import { getTimeRange } from './calc.js'

function toDate(value) {
  if (!value) return null
  try {
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const d = new Date(value.replace(/\//g, '-'))
      return isNaN(d.getTime()) ? null : d
    }
    if (typeof value === 'number') {
      const d = new Date(value)
      return isNaN(d.getTime()) ? null : d
    }
    if (typeof value === 'object') {
      if (typeof value.getTime === 'function') {
        const d = new Date(value.getTime())
        return isNaN(d.getTime()) ? null : d
      }
      if (value._seconds) {
        const d = new Date(value._seconds * 1000)
        return isNaN(d.getTime()) ? null : d
      }
      const d = new Date(value)
      return isNaN(d.getTime()) ? null : d
    }
  } catch (e) {
    return null
  }
  return null
}

export function pickFirst(obj, keys) {
  if (!obj || !keys) return undefined
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export function pickNumber(obj, keys, defaultValue = 0) {
  const v = pickFirst(obj, keys)
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : defaultValue
}

export function pickId(obj, keys) {
  const v = pickFirst(obj, keys)
  if (v === undefined || v === null) return ''
  return String(v)
}

// hybrid：优先业务日期（bizKeys），缺失则用创建日期（fallbackKeys）
export function pickDateHybrid(obj, bizKeys, fallbackKeys) {
  const biz = toDate(pickFirst(obj, bizKeys))
  if (biz) return biz
  return toDate(pickFirst(obj, fallbackKeys))
}

export function inTimeRange(date, timeFilter) {
  if (!timeFilter || timeFilter === 'all') return true
  const d = toDate(date)
  if (!d) return false

  const range = getTimeRange(timeFilter)
  if (!range?.startDate || !range?.endDate) return true

  const start = new Date(range.startDate.getFullYear(), range.startDate.getMonth(), range.startDate.getDate(), 0, 0, 0, 0)
  const end = new Date(range.endDate.getFullYear(), range.endDate.getMonth(), range.endDate.getDate(), 23, 59, 59, 999)

  const t = d.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

export function filterByTimeFilter(list, timeFilter, dateGetter) {
  if (!Array.isArray(list) || list.length === 0) return []
  if (!timeFilter || timeFilter === 'all') return list.slice()
  const getter = typeof dateGetter === 'function' ? dateGetter : (x) => x
  return list.filter((item) => inTimeRange(getter(item), timeFilter))
}


