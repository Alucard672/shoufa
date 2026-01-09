<template>
  <div class="tenants-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>租户列表</span>
          <div class="search-bar">
            <el-input v-model="searchQuery.nameLike" placeholder="企业名称搜索" clearable style="width: 200px; margin-right: 10px" />
            <el-input v-model="searchQuery.phoneLike" placeholder="手机号搜索" clearable style="width: 200px; margin-right: 10px" />
            <el-button type="primary" @click="fetchList">查询</el-button>
          </div>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" style="width: 100%">
        <el-table-column prop="sn" label="编号" width="100" />
        <el-table-column prop="name" label="企业名称" min-width="150" />
        <el-table-column prop="phone" label="联系电话" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.stopFlag ? 'danger' : 'success'">
              {{ row.stopFlag ? '已停用' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="过期时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.expireDate || row.expire_date) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="openRenew(row)">续费/赠送</el-button>
            <el-button size="small" :type="row.stopFlag ? 'primary' : 'danger'" @click="toggleStatus(row)">
              {{ row.stopFlag ? '启用' : '停用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="searchQuery.pageNum"
          :page-size="searchQuery.pageSize"
          layout="total, prev, pager, next"
          :total="total"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 续费对话框 -->
    <el-dialog v-model="renewVisible" title="续费 / 赠送时长" width="400px">
      <el-form :model="renewForm" label-width="100px">
        <el-form-item label="企业名称">{{ currentTenant?.name }}</el-form-item>
        <el-form-item label="赠送天数">
          <el-input-number v-model="renewForm.days" :min="1" :max="3650" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="renewForm.source" placeholder="如：后台手动赠送" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renewVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleRenew">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import app from '../utils/cloudbase'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const searchQuery = reactive({
  nameLike: '',
  phoneLike: '',
  pageNum: 1,
  pageSize: 10
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await app.callFunction({
      name: 'tenants',
      data: {
        action: 'listTenantsAdmin',
        payload: searchQuery
      }
    })
    if (res.result.code === 0) {
      list.value = res.result.data.list
      total.value = res.result.data.total
    }
  } catch (err) {
    ElMessage.error('获取列表失败')
  } finally {
    loading.value = false
  }
}

const toggleStatus = (row) => {
  const actionText = row.stopFlag ? '启用' : '停用'
  ElMessageBox.confirm(`确认要${actionText}租户 "${row.name}" 吗？`, '提示', {
    type: 'warning'
  }).then(async () => {
    try {
      await app.callFunction({
        name: 'tenants',
        data: {
          action: 'save',
          payload: { ...row, stopFlag: !row.stopFlag, tenantId: row._id }
        }
      })
      ElMessage.success(`${actionText}成功`)
      fetchList()
    } catch (err) {
      ElMessage.error('操作失败')
    }
  })
}

// 续费相关
const renewVisible = ref(false)
const submitLoading = ref(false)
const currentTenant = ref(null)
const renewForm = reactive({ days: 30, source: '后台手动赠送' })

const openRenew = (row) => {
  currentTenant.value = row
  renewVisible.value = true
}

const handleRenew = async () => {
  submitLoading.value = true
  try {
    const res = await app.callFunction({
      name: 'payment',
      data: {
        action: 'grantReward',
        tenantId: currentTenant.value._id,
        days: renewForm.days,
        source: renewForm.source
      }
    })
    if (res.result.success) {
      ElMessage.success('续费成功')
      renewVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.result.error || '操作失败')
    }
  } catch (err) {
    ElMessage.error('操作失败')
  } finally {
    submitLoading.value = false
  }
}

const formatDate = (date) => {
  if (!date) return '-'
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(fetchList)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
