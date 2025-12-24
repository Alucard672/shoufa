// pages/login/index.js
const app = getApp()

Page({
    data: {
        loading: false,
        hasLogo: true  // 默认尝试显示logo图片
    },

    onLoad() {
        // 检查是否已登录，如果已登录，直接进入首页
        const tenantId = wx.getStorageSync('tenantId')
        if (tenantId) {
            wx.switchTab({
                url: '/pages/index/index'
            })
        }
    },

    onLogoError() {
        // logo图片加载失败时，显示占位符
        this.setData({
            hasLogo: false
        })
    },

    goToInit() {
        wx.navigateTo({
            url: '/pages/init/tenant'
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
                    showCancel: false,
                    confirmText: res.result.needInit ? '去创建租户' : '确定',
                    success: (modalRes) => {
                        if (modalRes.confirm && res.result.needInit) {
                            wx.navigateTo({
                                url: '/pages/init/tenant'
                            })
                        }
                    }
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

    async getPhoneNumber(e) {
        const { code, errMsg } = e.detail

        if (errMsg !== 'getPhoneNumber:ok') {
            wx.showToast({
                title: '需要手机号授权才能登录',
                icon: 'none'
            })
            return
        }

        this.setData({ loading: true })

        try {
            // 调用登录云函数
            const res = await wx.cloud.callFunction({
                name: 'auth',
                data: {
                    action: 'login',
                    code: code
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
                    content: msg || '手机号未在系统中登记，请联系管理员',
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
    }
})
