import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('../views/Layout.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/Stats.vue')
      },
      {
        path: 'tenants',
        name: 'Tenants',
        component: () => import('../views/Tenants.vue')
      },
      {
        path: 'packages',
        name: 'Packages',
        component: () => import('../views/Packages.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 简单的登录校验钩子
router.beforeEach((to, from, next) => {
  const isLogin = localStorage.getItem('admin_token')
  if (!to.meta.public && !isLogin) {
    next('/login')
  } else {
    next()
  }
})

export default router
