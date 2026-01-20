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

                // 检查订阅状态并显示提醒
                // 检查订阅状态
                const { isExpired } = require('../../utils/subscription.js')
                const expireDate = tenant.expireDate || tenant.expire_date
                const expired = isExpired(expireDate)

                if (expired) {
                    // 已过期，跳转到"我的"页面，让用户去付费
                    this.checkSubscriptionReminder(tenant)
                    setTimeout(() => {
                        wx.switchTab({
                            url: '/pages/mine/index'
                        })
                    }, 1500)
                } else {
                    // 未过期，显示提醒（如果有）并跳转到首页
                    this.checkSubscriptionReminder(tenant)
                    setTimeout(() => {
                        wx.switchTab({
                            url: '/pages/index/index'
                        })
                    }, 1500)
                }
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

            if (!res || !res.result) {
                wx.showModal({
                    title: '登录失败',
                    content: '系统繁忙，请稍后重试（未获取到云函数返回）',
                    showCancel: false
                })
                return
            }

            const { success, user, tenant, msg, code: errCode } = res.result

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
                // 业务错误：未加入任何企业 / 企业停用等，给出更友好的提示
                if (errCode === 'NOT_REGISTERED' || errCode === 'TENANT_MISSING') {
                    wx.showModal({
                        title: '未加入企业',
                        content: '该手机号尚未加入任何企业。\n\n如果你是企业老板：请联系系统管理员为你创建企业租户并绑定手机号。\n如果你是员工：请让企业管理员在【员工管理】中邀请你扫码加入。',
                        showCancel: false
                    })
                    return
                }
                if (errCode === 'TENANT_DISABLED') {
                    wx.showModal({
                        title: '企业已停用',
                        content: msg || '该企业已停用，请联系管理员。',
                        showCancel: false
                    })
                    return
                }
                wx.showModal({
                    title: inviteTenantId ? '加入失败' : '登录失败',
                    content: msg || (inviteTenantId ? '加入企业失败，请稍后重试' : '手机号未在系统中登记，请联系管理员'),
                    showCancel: false
                })
            }
        } catch (err) {
            console.error('登录失败:', err)
            wx.showModal({
                title: '登录失败',
                content: (err && (err.message || err.errMsg)) ? (err.message || err.errMsg) : '系统错误，请稍后重试',
                showCancel: false
            })
        } finally {
            this.setData({ loading: false })
        }
    },

    goBack() {
        wx.switchTab({
            url: '/pages/index/index'
        })
    },

    // 检查订阅状态并显示提醒
    checkSubscriptionReminder(tenant) {
        if (!tenant) {
            return
        }

        const expireDate = tenant.expireDate || tenant.expire_date
        if (!expireDate) {
            return
        }

        // 动态导入工具函数（避免循环依赖）
        const { getReminderMessage, isExpired } = require('../../utils/subscription.js')
        const reminder = getReminderMessage(expireDate)
        const expired = isExpired(expireDate)

        if (reminder) {
            // 延迟显示，避免与登录成功提示冲突
            setTimeout(() => {
                // 已过期时使用 Modal 提示，更醒目，并提供付费入口
                if (reminder.isExpired) {
                    wx.showModal({
                        title: reminder.title,
                        content: reminder.message,
                        showCancel: true,
                        confirmText: '立即续费',
                        cancelText: '我知道了',
                        success: (res) => {
                            if (res.confirm) {
                                // 跳转到付费页面
                                wx.navigateTo({
                                    url: '/pages/mine/payment'
                                })
                            }
                        }
                    })
                } else {
                    // 快到期时只显示 Toast 提醒，不阻止操作
                    wx.showToast({
                        title: reminder.message,
                        icon: 'none',
                        duration: 3000
                    })
                }
            }, 2000)
        }
    },

})
