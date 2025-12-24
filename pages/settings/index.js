// pages/settings/index.js
Page({
  data: {
    menuItems: [
      {
        id: 'color',
        title: '颜色字典',
        desc: '管理颜色选项',
        icon: '🎨',
        bgColor: '#FFF5F5',
        path: '/pages/settings/color'
      },
      {
        id: 'size',
        title: '尺码字典',
        desc: '管理尺码选项',
        icon: '📏',
        bgColor: '#F0F9FF',
        path: '/pages/settings/size'
      },
      {
        id: 'tenant',
        title: '租户管理',
        desc: '管理租户信息',
        icon: '🏢',
        bgColor: '#F0FDF4',
        path: '/pages/settings/tenant'
      }
    ]
  },

  onLoad() {
    // 页面加载
  },

  onMenuItemTap(e) {
    const path = e.currentTarget.dataset.path
    wx.navigateTo({
      url: path
    })
  },

  async onCleanupInvalidColorsAndSizes() {
    wx.showModal({
      title: '确认清理',
      content: '此操作将清理所有款号中不在字典中的颜色和尺码，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '清理中...',
            mask: true
          })

          try {
            const result = await wx.cloud.callFunction({
              name: 'cleanupInvalidColorsAndSizes'
            })

            wx.hideLoading()

            if (result.result.success) {
              const { totalStyles, updatedStyles, cleanupResults } = result.result
              
              let message = `清理完成！\n共检查 ${totalStyles} 个款号\n更新了 ${updatedStyles} 个款号`
              
              // 如果有清理结果，显示详细信息
              if (cleanupResults && cleanupResults.length > 0) {
                const removedColorsCount = cleanupResults.reduce((sum, item) => sum + (item.removedColors?.length || 0), 0)
                const removedSizesCount = cleanupResults.reduce((sum, item) => sum + (item.removedSizes?.length || 0), 0)
                
                message += `\n移除了 ${removedColorsCount} 个无效颜色\n移除了 ${removedSizesCount} 个无效尺码`
              }

              wx.showModal({
                title: '清理成功',
                content: message,
                showCancel: false,
                success: () => {
                  // 清理完成后，可以刷新页面或返回
                }
              })
            } else {
              wx.showToast({
                title: result.result.message || '清理失败',
                icon: 'none',
                duration: 3000
              })
            }
          } catch (error) {
            wx.hideLoading()
            console.error('清理失败:', error)
            wx.showToast({
              title: '清理失败：' + (error.message || '未知错误'),
              icon: 'none',
              duration: 3000
            })
          }
        }
      }
    })
  }
})

