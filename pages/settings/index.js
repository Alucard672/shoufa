// pages/settings/index.js
import { checkLogin } from '../../utils/auth.js'

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
      }
    ]
  },

  onLoad() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
  },
  
  onShow() {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
  },

  onMenuItemTap(e) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    const path = e.currentTarget.dataset.path
    wx.navigateTo({
      url: path
    })
  }
})

