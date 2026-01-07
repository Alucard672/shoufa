// pages/login/index.js
const app = getApp()

Page({
    data: {
        loading: false,
        hasLogo: true,  // 默认尝试显示logo图片
        isDev: false,   // 是否为开发环境
        hasUserInfo: false,  // 是否已有用户信息
        avatarUrl: '',   // 头像URL
        nickName: '',    // 昵称
        phoneNumber: '', // 手机号
        hasPhoneNumber: false // 是否已获取手机号
    },

    // 移除之前的 onLogoTap 逻辑

    onLoad() {
        // 检查是否已登录，如果已登录，直接进入首页
        const tenantId = wx.getStorageSync('tenantId')
        if (tenantId) {
            wx.switchTab({
                url: '/pages/index/index'
            })
            return
        }
        
        // 检查是否有邀请租户ID
        const inviteTenantId = wx.getStorageSync('inviteTenantId')
        if (inviteTenantId) {
            // 如果有邀请ID，设置为邀请模式
            this.setData({
                isInvite: true
            })
        }
        
        // 判断是否为开发环境
        const accountInfo = wx.getAccountInfoSync()
        this.setData({
            isDev: accountInfo.miniProgram.envVersion === 'develop' || accountInfo.miniProgram.envVersion === 'trial'
        })
    },
    
    // 选择头像
    onChooseAvatar(e) {
        const { avatarUrl } = e.detail
        this.setData({
            avatarUrl: avatarUrl
        })
    },
    
    // 输入昵称
    onNickNameInput(e) {
        const nickName = e.detail.value
        this.setData({
            nickName: nickName
        })
    },
    
    // 输入手机号
    onPhoneInput(e) {
        const phoneNumber = e.detail.value
        this.setData({
            phoneNumber: phoneNumber
        })
    },
    
    // 获取微信手机号
    onGetPhoneNumber(e) {
        const { code, errMsg } = e.detail
        if (errMsg !== 'getPhoneNumber:ok') {
            wx.showToast({
                title: '需要手机号授权',
                icon: 'none'
            })
            return
        }
        // 手机号需要通过 code 在云函数中解密获取
        // 这里先标记为已获取，实际手机号会在登录时从云函数返回
        this.setData({
            hasPhoneNumber: true,
            phoneCode: code // 保存 code 用于登录
        })
    },

    onLogoError() {
        // logo图片加载失败时，显示占位符
        this.setData({
            hasLogo: false
        })
    },

    async handleLogin() {
        this.setData({ loading: true })

        try {
            // 开发阶段调用模拟登录
            const res = await wx.cloud.callFunction({
                name: 'auth',
                data: {
                    action: 'mockLogin'
                }
            })

            const { success, user, tenant, msg } = res.result

            if (success) {
                // 保存用户信息和租户信息
                wx.setStorageSync('userInfo', user)
                wx.setStorageSync('tenantInfo', tenant)
                wx.setStorageSync('tenantId', tenant._id)

                app.globalData.userInfo = user
                app.globalData.tenantId = tenant._id

                wx.showToast({
                    title: '登录成功',
                    icon: 'success'
                })

                // 跳转到首页
                setTimeout(() => {
                    wx.switchTab({
                        url: '/pages/index/index'
                    })
                }, 1500)
            } else {
                wx.showModal({
                    title: '登录失败',
                    content: msg || '初始化失败，请检查数据库配置',
                    showCancel: false
                })
            }
        } catch (err) {
            console.error('登录失败:', err)
            wx.showToast({
                title: '系统错误',
                icon: 'none'
            })
        } finally {
            this.setData({ loading: false })
        }
    },

    // 微信登录
    async handleWeChatLogin() {
        // 检查是否填写了昵称
        if (!this.data.nickName || this.data.nickName.trim() === '') {
            wx.showToast({
                title: '请先输入昵称',
                icon: 'none'
            })
            return
        }

        // 检查是否获取了手机号
        if (!this.data.phoneNumber && !this.data.hasPhoneNumber) {
            wx.showToast({
                title: '请先获取或输入手机号',
                icon: 'none'
            })
            return
        }

        this.setData({ loading: true })

        try {
            // 检查是否有邀请租户ID
            const inviteTenantId = wx.getStorageSync('inviteTenantId')
            
            // 如果有邀请ID，调用 employees 云函数的 joinTenant 逻辑
            if (inviteTenantId) {
                const res = await wx.cloud.callFunction({
                    name: 'employees',
                    data: {
                        action: 'joinTenant',
                        payload: {
                            tenantId: inviteTenantId,
                            code: this.data.phoneCode || '', 
                            phoneNumber: this.data.phoneNumber || '', 
                            avatarUrl: this.data.avatarUrl,
                            nickName: this.data.nickName
                        }
                    }
                })

                // employees 云函数返回格式为 { code, msg, data }
                if (res.result.code === 0 && res.result.data.success) {
                    const { user, tenant } = res.result.data
                    
                    wx.removeStorageSync('inviteTenantId')
                    
                    // 保存用户信息和租户信息
                    wx.setStorageSync('userInfo', user)
                    wx.setStorageSync('tenantInfo', tenant)
                    wx.setStorageSync('tenantId', tenant._id)

                    app.globalData.userInfo = user
                    app.globalData.tenantId = tenant._id
                    app.globalData.tenantInfo = tenant

                    wx.showToast({
                        title: '加入成功',
                        icon: 'success'
                    })

                    setTimeout(() => {
                        wx.switchTab({
                            url: '/pages/index/index'
                        })
                    }, 1500)
                } else {
                    wx.showModal({
                        title: '加入失败',
                        content: res.result.msg || '加入企业失败，请稍后重试',
                        showCancel: false
                    })
                }
                return
            }
            
            // 正常登录逻辑，继续使用 auth 云函数
            const res = await wx.cloud.callFunction({
                name: 'auth',
                data: {
                    action: 'login',
                    code: this.data.phoneCode || '', 
                    phoneNumber: this.data.phoneNumber || '', 
                    avatarUrl: this.data.avatarUrl,
                    nickName: this.data.nickName
                }
            })

            const { success, user, tenant, msg } = res.result

            if (success) {
                // 如果是加入企业，清除邀请缓存
                if (inviteTenantId) {
                    wx.removeStorageSync('inviteTenantId')
                }
                
                // 保存用户信息和租户信息
                wx.setStorageSync('userInfo', user)
                wx.setStorageSync('tenantInfo', tenant)
                wx.setStorageSync('tenantId', tenant._id)

                app.globalData.userInfo = user
                app.globalData.tenantId = tenant._id
                app.globalData.tenantInfo = tenant

                wx.showToast({
                    title: inviteTenantId ? '加入成功' : '登录成功',
                    icon: 'success'
                })

                // 跳转到首页
                setTimeout(() => {
                    wx.switchTab({
                        url: '/pages/index/index'
                    })
                }, 1500)
            } else {
                wx.showModal({
                    title: inviteTenantId ? '加入失败' : '登录失败',
                    content: msg || (inviteTenantId ? '加入企业失败，请稍后重试' : '手机号未在系统中登记，请联系管理员'),
                    showCancel: false
                })
            }
        } catch (err) {
            console.error('登录失败:', err)
            wx.showToast({
                title: '系统错误，请稍后重试',
                icon: 'none'
            })
        } finally {
            this.setData({ loading: false })
        }
    },
    
})
