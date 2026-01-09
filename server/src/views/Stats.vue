<template>
  <div class="stats-container">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">总租户数</div>
          <div class="stat-value">{{ stats.totalTenants || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">活跃租户</div>
          <div class="stat-value text-success">{{ stats.activeTenants || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">即将过期 (30天内)</div>
          <div class="stat-value text-warning">{{ stats.expiringSoon || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">支付订单总数</div>
          <div class="stat-value text-primary">{{ stats.totalOrders || 0 }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="mt-20">
      <template #header>
        <div class="card-header">
          <span>系统状态</span>
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="环境">{{ envMeta.name }}</el-descriptions-item>
        <el-descriptions-item label="环境ID">{{ envMeta.id }}</el-descriptions-item>
        <el-descriptions-item label="核心云函数状态">
          <el-tag type="success">正常运行中</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Web SDK 版本">2.0.0</el-descriptions-item>
        <el-descriptions-item label="上次刷新时间">{{ lastRefresh }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { callFunction } from '../utils/cloudbase'
import { getEnvMeta } from '../utils/env'

const stats = ref({})
const lastRefresh = ref('')
const envMeta = computed(() => getEnvMeta())

const fetchStats = async () => {
  try {
    const res = await callFunction({
      name: 'admin',
      data: { action: 'getStats' }
    })
    if (res.result.success) {
      stats.value = res.result.stats
      lastRefresh.value = new Date().toLocaleString()
    }
  } catch (err) {
    console.error(err)
  }
}

onMounted(fetchStats)
</script>

<style scoped>
.stat-card {
  text-align: center;
}
.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 10px;
}
.stat-value {
  font-size: 28px;
  font-weight: bold;
}
.text-success { color: #67c23a; }
.text-warning { color: #e6a23c; }
.text-primary { color: #409eff; }
.mt-20 { margin-top: 20px; }
</style>
