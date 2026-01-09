<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <h2>管理后台登录</h2>
        </div>
      </template>
      <div class="env-row">
        <span class="env-label">环境：</span>
        <el-select v-model="envId" size="small" style="width: 220px" @change="onEnvChange">
          <el-option
            v-for="e in envs"
            :key="e.id"
            :label="`${e.name}（${e.type === 'prod' ? '生产' : '测试'}）`"
            :value="e.id"
          />
        </el-select>
      </div>
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
      <div class="tips">
        <div>默认账号: admin / admin123</div>
        <el-link type="primary" underline="never" style="margin-top: 10px; font-size: 12px" @click="handleInit">
          首次使用？点击初始化系统数据
        </el-link>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction, getAuth } from '../utils/cloudbase'
import { CLOUD_ENVS, getCurrentEnvId, setCurrentEnvId, getEnvMeta, setAdminToken, setAdminInfo } from '../utils/env'

const router = useRouter()
const loading = ref(false)
const envs = CLOUD_ENVS
const envId = ref(getCurrentEnvId())
const form = reactive({
  username: '',
  password: ''
})

const onEnvChange = async (nextEnvId) => {
  const nextMeta = getEnvMeta(nextEnvId)
  if (nextMeta.type === 'prod') {
    try {
      await ElMessageBox.confirm(
        `你将切换到【生产环境】并读取线上真实数据。\n\n请确认你清楚风险（误操作会影响线上用户）。`,
        '切换到生产环境确认',
        { type: 'warning', confirmButtonText: '确认切换', cancelButtonText: '取消' }
      )
    } catch (e) {
      envId.value = getCurrentEnvId()
      return
    }
  }
  setCurrentEnvId(nextEnvId)
  window.location.reload()
}

const handleInit = async () => {
  try {
    loading.value = true
    const res = await callFunction({
      name: 'admin',
      data: { action: 'initData' }
    })
    if (res.result.success) {
      ElMessage.success('系统数据初始化成功！现在可以使用默认账号登录了。')
    } else {
      ElMessage.error(res.result.msg || '初始化失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('初始化异常，请确认 admin 云函数已部署')
  } finally {
    loading.value = false
  }
}

const handleLogin = async () => {
  if (!form.username || !form.password) {
    return ElMessage.warning('请输入账号和密码')
  }
  
  loading.value = true
  try {
    // 1. 确保有登录态（即使是匿名登录）
    const auth = getAuth()
    const loginState = await auth.getLoginState();
    if (!loginState) {
      await auth.signInAnonymously();
    }

    // 2. 调用登录云函数
    const res = await callFunction({
      name: 'admin',
      data: {
        action: 'login',
        payload: { username: form.username, password: form.password }
      }
    })
    
    if (res.result.success) {
      ElMessage.success('登录成功')
      setAdminToken(res.result.token)
      setAdminInfo(res.result.admin)
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
.env-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.env-label {
  width: 52px;
  font-size: 12px;
  color: #606266;
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
