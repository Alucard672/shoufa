// pages/mine/index.js
const app = getApp()

Page({
  data: {
    hasAvatar: true, // 是否显示头像图片
    companyName: 'XX纺织加工有限公司',
    contactName: '张总',
    contactPhone: '0755-12345678',
    address: '广东省深圳市南山区科技园',
    menuItems: [
      {
        id: 'factory',
        title: '加工厂管理',
        desc: '管理加工厂信息',
        icon: '/images/icons/factory.png',
        bgColor: '#EFF6FF',
        path: '/pages/factory/index'
      },
      {
        id: 'style',
        title: '款号管理',
        desc: '管理款式信息',
        icon: '/images/icons/shirt.png',
        bgColor: '#FAF5FF',
        path: '/pages/style/index'
      },
      {
        id: 'yarn',
        title: '纱线管理',
        desc: '管理纱线库存',
        icon: '/images/icons/yarn.png',
        bgColor: '#F0FDF4',
        path: '/pages/yarn/index'
      },
      {
        id: 'plan',
        title: '生产计划',
        desc: '管理款式生产计划',
        icon: '/images/icons/plan.png',
        bgColor: '#FEF2F2',
        path: '/pages/plan/index'
      },
      {
        id: 'settings',
        title: '基础信息设置',
        desc: '管理颜色、尺码等基础数据',
        icon: '/images/icons/settings.png',
        bgColor: '#FFF7ED',
        path: '/pages/settings/index'
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
  }
})

