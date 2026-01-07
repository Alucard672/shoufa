// utils/systemParams.js
// 系统参数工具函数

const app = getApp()

/**
 * 获取系统参数值（租户级别）
 * 注意：所有查询必须包含 tenantId 条件，避免全量查询和跨租户数据泄露
 * @param {String} key 参数键名
 * @param {*} defaultValue 默认值
 * @returns {Promise<*>} 参数值
 */
export async function getSystemParam(key, defaultValue = null) {
  try {
    // 先从缓存读取
    const cacheKey = `systemParam_${key}`
    const cached = wx.getStorageSync(cacheKey)
    if (cached !== '') {
      return cached
    }

    // 从 globalData 读取
    if (app.globalData && app.globalData[key] !== undefined) {
      return app.globalData[key]
    }

    // 从数据库读取（必须包含 tenantId 条件）
    const tenantId = app.globalData?.tenantId || wx.getStorageSync('tenantId')
    if (!tenantId) {
      return defaultValue
    }

    const db = wx.cloud.database()
    const res = await db.collection('system_params')
      .where({
        tenantId: tenantId,  // 租户隔离：只查询当前租户的参数
        key: key
      })
      .get()

    if (res.data && res.data.length > 0) {
      const value = res.data[0].value
      // 缓存到本地
      wx.setStorageSync(cacheKey, value)
      // 缓存到 globalData
      if (app.globalData) {
        app.globalData[key] = value
      }
      return value
    }

    return defaultValue
  } catch (error) {
    console.error(`获取系统参数失败 (${key}):`, error)
    return defaultValue
  }
}

/**
 * 获取"一打是几件"参数
 * @returns {Promise<Number>} 一打包含的件数，默认12
 */
export async function getPiecesPerDozen() {
  const value = await getSystemParam('piecesPerDozen', '12')
  return parseInt(value) || 12
}

/**
 * 同步获取"一打是几件"参数（从缓存）
 * @returns {Number} 一打包含的件数，默认12
 */
export function getPiecesPerDozenSync() {
  try {
    // 从缓存读取
    const cached = wx.getStorageSync('piecesPerDozen')
    if (cached !== '') {
      return parseInt(cached) || 12
    }

    // 从 globalData 读取
    if (app.globalData && app.globalData.piecesPerDozen !== undefined) {
      return parseInt(app.globalData.piecesPerDozen) || 12
    }

    return 12 // 默认值
  } catch (error) {
    console.error('同步获取一打件数失败:', error)
    return 12
  }
}

/**
 * 清除系统参数缓存
 * @param {String} key 参数键名，不传则清除所有
 */
export function clearSystemParamCache(key) {
  if (key) {
    wx.removeStorageSync(`systemParam_${key}`)
    if (app.globalData) {
      delete app.globalData[key]
    }
  } else {
    // 清除所有系统参数缓存
    const keys = wx.getStorageInfoSync().keys
    keys.forEach(k => {
      if (k.startsWith('systemParam_')) {
        wx.removeStorageSync(k)
      }
    })
    if (app.globalData) {
      delete app.globalData.piecesPerDozen
    }
  }
}

