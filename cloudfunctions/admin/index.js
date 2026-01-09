// cloudfunctions/admin/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 管理员登录
 */
async function login(username, password) {
  try {
    const res = await db.collection('admins')
      .where({
        username: username,
        password: password, // 注意：实际应使用加密存储和校验
        status: 'active'
      })
      .limit(1)
      .get()

    if (res.data && res.data.length > 0) {
      const admin = res.data[0]
      // 不返回密码
      delete admin.password
      return {
        success: true,
        admin: admin,
        token: 'mock-token-' + Date.now() // 实际可结合 JWT
      }
    } else {
      return {
        success: false,
        msg: '账号或密码错误'
      }
    }
  } catch (err) {
    console.error('管理员登录失败:', err)
    return { success: false, msg: '登录失败' }
  }
}

/**
 * 获取统计数据
 */
async function getStats() {
  try {
    const totalTenants = await db.collection('tenants').count()
    const activeTenants = await db.collection('tenants').where({ stopFlag: _.neq(true) }).count()
    
    // 查询即将过期的租户 (30天内)
    const now = new Date()
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expiringSoon = await db.collection('tenants').where({
      expireDate: _.and(_.gt(now), _.lt(thirtyDaysLater))
    }).count()

    const totalOrders = await db.collection('payment_orders').where({ status: 'paid' }).count()
    
    return {
      success: true,
      stats: {
        totalTenants: totalTenants.total,
        activeTenants: activeTenants.total,
        expiringSoon: expiringSoon.total,
        totalOrders: totalOrders.total
      }
    }
  } catch (err) {
    console.error('获取统计数据失败:', err)
    return { success: false, msg: '获取统计失败' }
  }
}

/**
 * 管理套餐
 */
async function managePackages(action, payload) {
  const collection = db.collection('packages')
  try {
    switch (action) {
      case 'list':
        const listRes = await collection.orderBy('order', 'asc').get()
        return { success: true, data: listRes.data }
      case 'add':
        await collection.add({ data: { ...payload, createTime: db.serverDate(), updateTime: db.serverDate() } })
        return { success: true }
      case 'update':
        const { id, ...updateData } = payload
        await collection.doc(id).update({ data: { ...updateData, updateTime: db.serverDate() } })
        return { success: true }
      case 'delete':
        await collection.doc(payload.id).remove()
        return { success: true }
      default:
        return { success: false, msg: '无效操作' }
    }
  } catch (err) {
    console.error('套餐管理失败:', err)
    return { success: false, msg: '操作失败' }
  }
}

exports.main = async (event, context) => {
  const { action, payload } = event

  switch (action) {
    case 'login':
      return await login(payload.username, payload.password)
    case 'getStats':
      return await getStats()
    case 'managePackages':
      return await managePackages(payload.subAction, payload.data)
    case 'initData':
      return await initData()
    default:
      return { success: false, msg: '未定义的操作' }
  }
}

/**
 * 初始化基础数据
 */
async function initData() {
  try {
    // 1. 初始化管理员 (注意：上线后请修改密码)
    const adminCount = await db.collection('admins').count()
    if (adminCount.total === 0) {
      await db.collection('admins').add({
        data: {
          username: 'admin',
          password: 'admin123', // 建议通过控制台或更安全方式设置
          name: '系统管理员',
          status: 'active',
          createTime: db.serverDate()
        }
      })
    }

    // 2. 初始化套餐 (对应 pages/mine/payment.js 中的配置)
    const packageCount = await db.collection('packages').count()
    if (packageCount.total === 0) {
      const defaultPackages = [
        { id: 'month', name: '1个月', days: 30, price: 99, originalPrice: 120, order: 1, status: 'active' },
        { id: 'quarter', name: '3个月', days: 90, price: 249, originalPrice: 300, order: 2, status: 'active' },
        { id: 'halfyear', name: '6个月', days: 180, price: 449, originalPrice: 600, order: 3, status: 'active' },
        { id: 'year', name: '12个月', days: 360, price: 799, originalPrice: 1200, order: 4, status: 'active' }
      ]
      for (const pkg of defaultPackages) {
        await db.collection('packages').add({
          data: { ...pkg, createTime: db.serverDate(), updateTime: db.serverDate() }
        })
      }
    }

    return { success: true, msg: '数据初始化成功' }
  } catch (err) {
    console.error('初始化数据失败:', err)
    return { success: false, msg: '初始化失败' }
  }
}
