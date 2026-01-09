<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <h2>管理后台登录</h2>
        </div>
      </template>
      <el-form :model="form" @keyup.enter="handleLogin">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="请输入管理员账号" prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="w-full" @click="handleLogin">立即登录</el-button>
        </el-form-item>
      </el-form>
      <div class="tips">默认账号: admin / admin123</div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import app from '../utils/cloudbase'

const router = useRouter()
const loading = ref(false)
const form = reactive({
  username: '',
  password: ''
})

const handleLogin = async () => {
  if (!form.username || !form.password) {
    return ElMessage.warning('请输入账号和密码')
  }
  
  loading.value = true
  try {
    // 1. 确保有登录态（即使是匿名登录）
    const auth = app.auth();
    if (!auth.hasLoginState()) {
      await auth.anonymousAuthProvider().signIn();
    }

    // 2. 调用登录云函数
    const res = await app.callFunction({
      name: 'admin',
      data: {
        action: 'login',
        payload: { username: form.username, password: form.password }
      }
    })
    
    if (res.result.success) {
      ElMessage.success('登录成功')
      localStorage.setItem('admin_token', res.result.token)
      localStorage.setItem('admin_info', JSON.stringify(res.result.admin))
      router.push('/')
    } else {
      ElMessage.error(res.result.msg)
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('登录异常，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1890ff 0%, #001529 100%);
}
.login-card {
  width: 400px;
}
.w-full {
  width: 100%;
}
.tips {
  font-size: 12px;
  color: #999;
  text-align: center;
  margin-top: 10px;
}
</style>
