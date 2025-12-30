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

    if (action === 'joinTenant') {
        try {
            const { tenantId, inviteCode, avatarUrl, nickName, phoneNumber: manualPhoneNumber, code } = event
            const wxContext = cloud.getWXContext()
            const openid = wxContext.OPENID

            let targetTenantId = tenantId

            // 如果传了邀请码（sn），先查出对应的 tenantId
            if (inviteCode) {
                const tenantRes = await db.collection('tenants').where({
                    sn: inviteCode
                }).get()
                if (tenantRes.data.length === 0) {
                    return { success: false, msg: '邀请码无效，请检查后重试' }
                }
                targetTenantId = tenantRes.data[0]._id
            }

            if (!targetTenantId) {
                return { success: false, msg: '企业ID或邀请码不能为空' }
            }

            // 获取手机号 (如果已通过前端传入则优先使用，否则尝试从 code 获取)
            let phoneNumber = manualPhoneNumber
            if (!phoneNumber && code) {
                try {
                    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
                    phoneNumber = res.phoneInfo.phoneNumber
                } catch (e) {
                    console.error('从 code 获取手机号失败:', e)
                    return { success: false, msg: '获取手机号失败，请重试' }
                }
            }

            if (!phoneNumber) {
                return { success: false, msg: '手机号不能为空' }
            }

            // 1. 检查用户是否已在其他租户中
            const userCheck = await db.collection('users').where({
                phone: phoneNumber,
                deleted: false
            }).get()

            let userRecord = null
            if (userCheck.data.length > 0) {
                // 如果已存在且属于不同租户，更新其所属租户
                const existingUser = userCheck.data[0]
                if (existingUser.tenantId !== targetTenantId) {
                    await db.collection('users').doc(existingUser._id).update({
                        data: {
                            tenantId: targetTenantId,
                            role: 'staff',
                            avatarUrl: avatarUrl || existingUser.avatarUrl,
                            nickName: nickName || existingUser.nickName,
                            openid: openid,
                            updateTime: db.serverDate()
                        }
                    })
                    // 获取更新后的用户记录
                    const updatedRes = await db.collection('users').doc(existingUser._id).get()
                    userRecord = updatedRes.data
                } else {
                    // 已在本租户中，更新头像和昵称（如果提供了）
                    const updateData = {
                        openid: openid,
                        updateTime: db.serverDate()
                    }
                    if (avatarUrl) updateData.avatarUrl = avatarUrl
                    if (nickName) updateData.nickName = nickName
                    await db.collection('users').doc(existingUser._id).update({ data: updateData })
                    userRecord = { ...existingUser, ...updateData }
                }
            } else {
                // 2. 新增用户记录（扫码加入的员工）
                const now = db.serverDate()
                const addRes = await db.collection('users').add({
                    data: {
                        tenantId: targetTenantId,
                        phone: phoneNumber,
                        name: '', // 扫码加入时姓名为空，后续可编辑
                        role: 'staff',
                        avatarUrl: avatarUrl || '',
                        nickName: nickName || '微信用户',
                        openid: openid,
                        deleted: false,
                        createTime: now,
                        updateTime: now,
                        lastLoginTime: null
                    }
                })
                // 获取刚创建的用户记录
                const newUserRes = await db.collection('users').doc(addRes._id).get()
                userRecord = newUserRes.data
            }

            // 3. 获取租户详情返回
            const finalTenantRes = await db.collection('tenants').doc(targetTenantId).get()

            return {
                success: true,
                tenant: finalTenantRes.data,
                user: userRecord || {
                    phone: phoneNumber,
                    nickName: nickName,
                    role: 'staff',
                    tenantId: targetTenantId,
                    avatarUrl: avatarUrl || ''
                }
            }
        } catch (err) {
            console.error('加入企业失败:', err)
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
                return { success: false, msg: '手机号不能为空' }
            }

            // 预处理：只保留数字
            const purePhone = phoneNumber.replace(/\D/g, '')
            // 提取最后11位作为匹配核心
            const phoneSuffix = purePhone.length >= 11 ? purePhone.slice(-11) : purePhone

            console.log('登录识别 - 原始号码:', phoneNumber, '匹配核心:', phoneSuffix)

            // 2. 首先在 users 表中查找绑定关系 (支持模糊匹配末尾11位)
            let userRecordsRes = await db.collection('users')
                .where({
                    phone: db.RegExp({
                        regexp: phoneSuffix + '$',
                        options: 'i'
                    }),
                    deleted: false
                })
                .get()
            
            let userRecord = userRecordsRes.data[0]

            // 3. 如果未找到绑定，尝试从 tenants 表自动匹配（老板账号自动关联）
            if (!userRecord) {
                console.log('未找到 user 记录，尝试匹配 tenants 表...')
                
                const tenantMatchRes = await db.collection('tenants')
                    .where({
                        phone: db.RegExp({
                            regexp: phoneSuffix + '$',
                            options: 'i'
                        })
                    })
                    .get()
                
                if (tenantMatchRes.data.length > 0) {
                    const matchedTenant = tenantMatchRes.data[0]
                    console.log('成功匹配到企业租户:', matchedTenant.name)
                    
                    if (matchedTenant.stopFlag === 1 || matchedTenant.stopFlag === true) {
                        return { success: false, msg: '该企业已停用' }
                    }

                    // 自动创建绑定记录
                    const newUser = {
                        tenantId: matchedTenant._id,
                        phone: phoneNumber,
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
                    msg: `手机号 ${phoneNumber} 尚未在系统中登记，请联系管理员。`
                }
            }

            const tenantId = userRecord.tenantId
            const tenantRes = await db.collection('tenants').doc(tenantId).get()
            
            if (!tenantRes.data) {
                return { success: false, msg: '所属企业信息已丢失' }
            }

            // 4. 更新登录状态
            const updateData = {
                openid: wxContext.OPENID,
                lastLoginTime: db.serverDate(),
                updateTime: db.serverDate()
            }
            if (avatarUrl) updateData.avatarUrl = avatarUrl
            if (nickName) updateData.nickName = nickName
            
            await db.collection('users').doc(userRecord._id).update({ data: updateData })

            return {
                success: true,
                user: {
                    ...userRecord,
                    tenantId: tenantRes.data._id,
                    openid: wxContext.OPENID,
                    avatarUrl: avatarUrl || userRecord.avatarUrl,
                    nickName: nickName || userRecord.nickName
                },
                tenant: tenantRes.data
            }
        } catch (err) {
            console.error('登录异常:', err)
            return { success: false, msg: '登录失败：' + (err.message || '系统错误') }
        }
    }

    return {
        success: false,
        msg: '未知操作'
    }
}
