// cloudfunctions/auth/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { action, code } = event
    const wxContext = cloud.getWXContext()

    if (action === 'mockLogin') {
        try {
            // 开发环境专用：获取第一个租户和第一个用户进行模拟登录
            const tenantsRes = await db.collection('tenants')
                .limit(1)
                .get()
            
            if (tenantsRes.data.length === 0) {
                return { 
                    success: false, 
                    msg: '数据库中尚无租户，请联系管理员创建租户'
                }
            }
            
            const tenant = tenantsRes.data[0]

            let user = {
                _id: 'mock_user_id',
                name: '测试管理员',
                role: 'admin',
                tenantId: tenant._id,
                openid: wxContext.OPENID
            }

            // 尝试找一个该租户下的真实用户记录，如果没有就用上面的 mock
            const usersRes = await db.collection('users')
                .where({
                    tenantId: tenant._id
                })
                .limit(1)
                .get()
            
            if (usersRes.data.length > 0) {
                user = {
                    ...usersRes.data[0],
                    tenantId: tenant._id,
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

    if (action === 'getPhoneNumber') {
        try {
            const { code } = event
            const res = await cloud.openapi.phonenumber.getPhoneNumber({
                code: code
            })
            return {
                success: true,
                phoneNumber: res.phoneInfo.phoneNumber
            }
        } catch (err) {
            return {
                success: false,
                msg: err.message
            }
        }
    }

    if (action === 'getInviteQRCode') {
        try {
            const { scene, envVersion } = event
            // 生成小程序码
            const result = await cloud.openapi.wxacode.getUnlimited({
                scene: scene,
                page: 'pages/index/index', // 员工扫码后进入的页面
                checkPath: false,
                envVersion: envVersion || 'release' // 支持动态环境版本，默认 release
            })

            if (result.errCode === 0) {
                // 将图片 Buffer 上传到云存储
                const uploadRes = await cloud.uploadFile({
                    cloudPath: `qrcode/invite_${scene}_${Date.now()}.png`,
                    fileContent: result.buffer
                })
                return {
                    success: true,
                    qrCodeUrl: uploadRes.fileID
                }
            } else {
                throw new Error(result.errMsg)
            }
        } catch (err) {
            console.error('生成小程序码失败:', err)
            return {
                success: false,
                msg: err.message
            }
        }
    }

    if (action === 'login') {
        try {
            const { code, avatarUrl, nickName, phoneNumber: manualPhoneNumber } = event
            let phoneNumber = manualPhoneNumber

            // 1. 获取手机号 (如果已通过前端解析传入则优先使用，否则尝试从 code 获取)
            if (!phoneNumber && code) {
                try {
                    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
                    phoneNumber = res.phoneInfo.phoneNumber
                } catch (e) {
                    console.error('从 code 获取手机号失败:', e)
                }
            }

            if (!phoneNumber) {
                return { success: false, code: 'PHONE_REQUIRED', msg: '手机号不能为空' }
            }

            // 预处理：只保留数字，并严格要求 11 位手机号
            const purePhone = String(phoneNumber || '').replace(/\D/g, '')
            if (!/^1\d{10}$/.test(purePhone)) {
                return { success: false, code: 'PHONE_INVALID', msg: '手机号格式不正确' }
            }

            console.log('登录识别 - 手机号:', purePhone)

            // 2. 首先在 users 表中查找绑定关系（精确匹配 11 位手机号）
            let userRecordsRes = await db.collection('users')
                .where({
                    phone: purePhone,
                    deleted: false
                })
                .get()
            
            let userRecord = (userRecordsRes.data && userRecordsRes.data[0]) ? userRecordsRes.data[0] : null

            // 3. 如果未找到绑定，尝试从 tenants 表自动匹配（老板账号自动关联）
            if (!userRecord) {
                console.log('未找到 user 记录，尝试匹配 tenants 表...')
                
                const tenantMatchRes = await db.collection('tenants')
                    .where({
                        phone: purePhone
                    })
                    .get()
                
                if (tenantMatchRes.data.length > 0) {
                    const matchedTenant = tenantMatchRes.data[0]
                    console.log('成功匹配到企业租户:', matchedTenant.name)
                    
                    // 已注释：限制登录功能 - 企业停用检查
                    // if (matchedTenant.stopFlag === 1 || matchedTenant.stopFlag === true) {
                    //     return { success: false, code: 'TENANT_DISABLED', msg: '该企业已停用' }
                    // }

                    // 自动创建绑定记录
                    const newUser = {
                        tenantId: matchedTenant._id,
                        phone: purePhone,
                        role: 'admin',
                        nickName: nickName || matchedTenant.name,
                        avatarUrl: avatarUrl || '',
                        openid: wxContext.OPENID,
                        deleted: false,
                        createTime: db.serverDate(),
                        updateTime: db.serverDate(),
                        lastLoginTime: db.serverDate()
                    }
                    
                    const addRes = await db.collection('users').add({ data: newUser })
                    userRecord = { _id: addRes._id, ...newUser }
                }
            }
            
            if (!userRecord) {
                return {
                    success: false,
                    code: 'NOT_REGISTERED',
                    msg: `该手机号尚未加入任何企业，请联系企业管理员邀请加入。`
                }
            }

            // 3.5 如果找到了 userRecord，校验其 tenantId 是否真实存在（避免历史脏数据导致 document.get 直接抛错）
            let tenantRes = null
            let tenantData = null
            const tenantId = userRecord.tenantId
            if (tenantId) {
                try {
                    tenantRes = await db.collection('tenants').doc(tenantId).get()
                    tenantData = tenantRes && tenantRes.data ? tenantRes.data : null
                } catch (e) {
                    tenantData = null
                }
            }

            // tenant 不存在：尝试用手机号重新匹配（老板账号自动关联 / 修复旧绑定）
            if (!tenantData) {
                console.log('用户绑定的 tenantId 不存在，尝试用手机号重新匹配 tenants 表...')
                const tenantMatchRes2 = await db.collection('tenants')
                    .where({ phone: purePhone })
                    .limit(1)
                    .get()

                if (tenantMatchRes2.data && tenantMatchRes2.data.length > 0) {
                    const matchedTenant = tenantMatchRes2.data[0]
                    // 已注释：限制登录功能 - 企业停用检查
                    // if (matchedTenant.stopFlag === 1 || matchedTenant.stopFlag === true) {
                    //     return { success: false, code: 'TENANT_DISABLED', msg: '该企业已停用' }
                    // }
                    // 修复 user 绑定关系
                    try {
                        await db.collection('users').doc(userRecord._id).update({
                            data: {
                                tenantId: matchedTenant._id,
                                updateTime: db.serverDate()
                            }
                        })
                        userRecord.tenantId = matchedTenant._id
                    } catch (e) {
                        console.error('修复 user.tenantId 失败:', e)
                    }
                    tenantData = matchedTenant
                } else {
                    // 没有任何租户可匹配：按“未加入企业”提示（常见原因：租户建在另一个环境）
                    return {
                        success: false,
                        code: 'NOT_REGISTERED',
                        msg: '该手机号尚未加入任何企业，请联系企业管理员邀请加入（或确认租户是否创建在当前环境）。'
                    }
                }
            }

            // 已注释：限制登录功能 - 再次校验企业停用状态（兼容历史数据）
            // if (tenantData && (tenantData.stopFlag === 1 || tenantData.stopFlag === true)) {
            //     return { success: false, code: 'TENANT_DISABLED', msg: '该企业已停用' }
            // }

            // 4. 更新登录状态
            const updateData = {
                openid: wxContext.OPENID,
                lastLoginTime: db.serverDate(),
                updateTime: db.serverDate()
            }
            if (avatarUrl) updateData.avatarUrl = avatarUrl
            if (nickName) updateData.nickName = nickName
            
            // 确保用户记录有 role 字段（兼容旧数据）
            // 如果用户没有 role，且是租户创建者（手机号匹配），则设置为 'boss'
            let userRole = userRecord.role
            if (!userRole && tenantData.phone === purePhone) {
                userRole = 'boss' // 租户创建者默认为 boss
                // 更新数据库中的 role
                updateData.role = userRole
            } else if (!userRole) {
                userRole = 'staff' // 其他用户默认为 staff
                // 更新数据库中的 role
                updateData.role = userRole
            }

            await db.collection('users').doc(userRecord._id).update({ data: updateData })

            return {
                success: true,
                user: {
                    ...userRecord,
                    tenantId: tenantData._id,
                    openid: wxContext.OPENID,
                    avatarUrl: avatarUrl || userRecord.avatarUrl,
                    nickName: nickName || userRecord.nickName,
                    role: userRole // 确保返回 role 字段
                },
                tenant: tenantData
            }
        } catch (err) {
            console.error('登录异常:', err)
            return { success: false, code: 'LOGIN_ERROR', msg: '登录失败：' + (err.message || '系统错误') }
        }
    }

    // 获取用户信息（用于刷新用户信息，包括 role 字段）
    if (action === 'getUserInfo') {
        try {
            const { phoneNumber } = event
            if (!phoneNumber) {
                return { success: false, msg: '手机号不能为空' }
            }

            // 查询用户信息
            const userRes = await db.collection('users').where({
                phone: phoneNumber,
                deleted: false
            }).limit(1).get()

            if (!userRes.data || userRes.data.length === 0) {
                return { success: false, msg: '用户不存在' }
            }

            const userRecord = userRes.data[0]
            
            // 查询租户信息
            let tenantData = null
            if (userRecord.tenantId) {
                try {
                    const tenantRes = await db.collection('tenants').doc(userRecord.tenantId).get()
                    tenantData = tenantRes.data
                } catch (e) {
                    console.warn('查询租户失败:', e)
                }
            }

            // 如果用户没有 role，根据是否是租户创建者来设置
            let userRole = userRecord.role
            if (!userRole) {
                if (tenantData && tenantData.phone === phoneNumber) {
                    userRole = 'boss' // 租户创建者
                    // 更新数据库
                    await db.collection('users').doc(userRecord._id).update({
                        data: { role: 'boss', updateTime: db.serverDate() }
                    })
                } else {
                    userRole = 'staff' // 普通员工
                    // 更新数据库
                    await db.collection('users').doc(userRecord._id).update({
                        data: { role: 'staff', updateTime: db.serverDate() }
                    })
                }
            }

            return {
                success: true,
                user: {
                    ...userRecord,
                    role: userRole
                },
                tenant: tenantData
            }
        } catch (err) {
            console.error('获取用户信息失败:', err)
            return { success: false, msg: '获取用户信息失败：' + (err.message || '未知错误') }
        }
    }

    return {
        success: false,
        msg: '未知操作'
    }
}
