<template>
  <el-container class="layout-container">
    <el-aside width="200px">
      <div class="logo">纱线收发后台</div>
      <el-menu
        :default-active="$route.path"
        router
        background-color="#001529"
        text-color="#fff"
        active-text-color="#ffd04b"
      >
        <el-menu-item index="/">
          <el-icon><DataAnalysis /></el-icon>
          <span>首页概览</span>
        </el-menu-item>
        <el-menu-item index="/tenants">
          <el-icon><OfficeBuilding /></el-icon>
          <span>租户管理</span>
        </el-menu-item>
        <el-menu-item index="/packages">
          <el-icon><Ticket /></el-icon>
          <span>套餐配置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header>
        <div class="header-left">
          <div class="env-switch">
            <span class="env-label">当前环境：</span>
            <el-select v-model="envId" size="small" style="width: 160px" @change="onEnvChange">
              <el-option
                v-for="e in envs"
                :key="e.id"
                :label="`${e.name}`"
                :value="e.id"
              />
            </el-select>
            <el-tag v-if="envMeta.type === 'prod'" type="danger" effect="dark" style="margin-left: 10px">
              生产
            </el-tag>
            <el-tag v-else type="success" effect="plain" style="margin-left: 10px">
              测试
            </el-tag>
            <span class="env-id">({{ envMeta.id }})</span>
          </div>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="el-dropdown-link">
              {{ adminName }}<el-icon class="el-icon--right"><arrow-down /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { CLOUD_ENVS, getCurrentEnvId, setCurrentEnvId, getEnvMeta, getAdminInfo, clearAdminAuth } from '../utils/env'

const router = useRouter()
const adminName = ref('')
const envs = CLOUD_ENVS
const envId = ref(getCurrentEnvId())
const envMeta = computed(() => getEnvMeta(envId.value))

onMounted(() => {
  const info = getAdminInfo(envId.value)
  if (info) adminName.value = info.name || info.username || '管理员'
})

const onEnvChange = async (nextEnvId) => {
  // 切换生产环境需要二次确认，防止误操作
  const nextMeta = getEnvMeta(nextEnvId)
  if (nextMeta.type === 'prod') {
    try {
      await ElMessageBox.confirm(
        `你将切换到【生产环境】并读取线上真实数据。\n\n请确认你清楚风险（误操作会影响线上用户）。`,
        '切换到生产环境确认',
        { type: 'warning', confirmButtonText: '确认切换', cancelButtonText: '取消' }
      )
    } catch (e) {
      // 用户取消：回滚选择
      envId.value = getCurrentEnvId()
      return
    }
  }

  setCurrentEnvId(nextEnvId)
  // 简化实现：整页刷新，让 CloudBase 重新按新 env 初始化，避免残留状态
  window.location.reload()
}

const handleCommand = (command) => {
  if (command === 'logout') {
    clearAdminAuth(envId.value)
    router.push('/login')
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.el-aside {
  background-color: #001529;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid #002140;
}
.el-header {
  background-color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e6e6e6;
}
.env-switch {
  display: flex;
  align-items: center;
}
.env-label {
  color: #606266;
  margin-right: 8px;
}
.env-id {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.header-right {
  cursor: pointer;
}
</style>
