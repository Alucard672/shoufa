// cloudfunctions/auth/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

// 初始化CloudBase - 尝试使用wx-server-sdk的RDB API
function getDB(context) {
    try {
        // 方法1: 尝试使用cloud.rdb
        if (cloud.rdb && typeof cloud.rdb === 'function') {
            return cloud.rdb({
                instance: "default",
                database: "cloud1-3g9cra4h71f647dd"
            })
        }
        
        // 方法2: 尝试使用cloud.database().rdb
        const db = cloud.database()
        if (db.rdb && typeof db.rdb === 'function') {
            return db.rdb({
                instance: "default",
                database: "cloud1-3g9cra4h71f647dd"
            })
        }
        
        // 如果都不支持，抛出错误
        throw new Error('wx-server-sdk不支持RDB API，需要使用@cloudbase/node-sdk')
    } catch (error) {
        console.error('auth云函数 - 初始化RDB连接失败:', error)
        throw error
    }
}

// 调用MySQL查询
async function queryMySQL(db, table, where = {}, options = {}) {
    let query = db.from(table)
    
    // 构建WHERE条件
    Object.keys(where).forEach(key => {
        const value = where[key]
        if (Array.isArray(value)) {
            query = query.whereIn(key, value)
        } else {
            query = query.where(key, '=', value)
        }
    })
    
    // 软删除过滤
    if (options.excludeDeleted !== false) {
        query = query.where('deleted', '=', 0)
    }
    
    // 排序
    if (options.orderBy) {
        query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'ASC')
    }
    
    // 限制数量
    if (options.limit) {
        query = query.limit(options.limit)
    }
    
    const result = await query.select()
    
    // 转换结果格式（添加_id字段）
    return result.map(item => ({
        ...item,
        _id: item.id.toString()
    }))
}

exports.main = async (event, context) => {
    const { action, code } = event
    const wxContext = cloud.getWXContext()
    const db = getDB(context)

    if (action === 'mockLogin') {
        try {
            // 开发环境专用：获取第一个租户和第一个用户进行模拟登录
            const tenants = await queryMySQL(db, 'tenants', {}, { limit: 1 })
            
            if (tenants.length === 0) {
                return { 
                    success: false, 
                    msg: '数据库中尚无租户，请先创建租户',
                    needInit: true
                }
            }
            
            const tenant = tenants[0]

            let user = {
                _id: 'mock_user_id',
                id: 0,
                name: '测试管理员',
                role: 'admin',
                tenantId: tenant._id,
                tenant_id: tenant.id,
                openid: wxContext.OPENID
            }

            // 尝试找一个该租户下的真实用户记录，如果没有就用上面的 mock
            const users = await queryMySQL(db, 'users', { tenant_id: tenant.id }, { limit: 1 })
            if (users.length > 0) {
                user = {
                    ...users[0],
                    _id: users[0].id.toString(),
                    tenantId: tenant._id,
                    tenant_id: tenant.id,
                    openid: wxContext.OPENID
                }
            }

            return {
                success: true,
                user,
                tenant
            }
        } catch (error) {
            console.error('模拟登录失败:', error)
            return {
                success: false,
                msg: '登录失败：' + (error.message || '未知错误')
            }
        }
    }

    if (action === 'login') {
        try {
            // 1. 获取真实手机号
            const res = await cloud.openapi.phonenumber.getPhoneNumber({
                code: code
            })

            const phoneNumber = res.phoneInfo.phoneNumber
            console.log('解析到手机号:', phoneNumber)

            // 2. 在 users 表中查找手机号关联的租户
            const userRecords = await queryMySQL(db, 'users', { phone: phoneNumber })
            
            if (userRecords.length === 0) {
                return {
                    success: false,
                    msg: '该手机号未被任何租户登记，请联系管理员'
                }
            }

            const userRecord = userRecords[0]
            const tenantId = userRecord.tenant_id

            // 3. 获取租户信息
            const tenantRecords = await queryMySQL(db, 'tenants', { id: tenantId })
            
            if (tenantRecords.length === 0) {
                return {
                    success: false,
                    msg: '租户信息不存在，请检查账号配置'
                }
            }

            const tenant = tenantRecords[0]

            // 4. 更新用户的 openid 和最后登录时间
            await db.from('users')
                .where('id', '=', userRecord.id)
                .update({
                    openid: wxContext.OPENID,
                    last_login_time: new Date(),
                    update_time: new Date()
                })

            return {
                success: true,
                user: {
                    ...userRecord,
                    _id: userRecord.id.toString(),
                    tenantId: tenant._id,
                    tenant_id: tenant.id,
                    openid: wxContext.OPENID
                },
                tenant: {
                    ...tenant,
                    _id: tenant.id.toString()
                }
            }
        } catch (err) {
            console.error('登录校验失败:', err)
            return {
                success: false,
                msg: '手机号解析失败，请确保已配置云调用权限：' + (err.message || '未知错误')
            }
        }
    }

    return {
        success: false,
        msg: '未知操作'
    }
}
