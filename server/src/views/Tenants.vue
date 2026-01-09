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
            <el-button type="success" @click="openCreate">新增租户</el-button>
          </div>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" style="width: 100%">
        <el-table-column prop="sn" label="编号" width="100" />
        <el-table-column prop="name" label="企业名称" min-width="150" />
        <el-table-column prop="phone" label="联系电话" width="120" />
        <el-table-column prop="salesperson" label="业务员" width="120" />
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
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
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

    <!-- 新增租户对话框 -->
    <el-dialog v-model="createVisible" title="手动创建租户" width="520px">
      <el-form :model="createForm" label-width="110px">
        <el-form-item label="企业编号(sn)" required>
          <el-input v-model="createForm.sn" placeholder="例如：10001 / A001" />
        </el-form-item>
        <el-form-item label="企业名称" required>
          <el-input v-model="createForm.name" placeholder="例如：XX纺织" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="createForm.phone" placeholder="手机号（可选）" />
        </el-form-item>
        <el-form-item label="业务员">
          <el-input v-model="createForm.salesperson" placeholder="例如：张三（可选）" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker
            v-model="createForm.expireDate"
            type="date"
            placeholder="不填则未设置"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            clearable
          />
        </el-form-item>
        <el-form-item label="登录人数限制">
          <el-input-number v-model="createForm.loginLimitNum" :min="0" :max="9999" />
          <span style="margin-left: 8px; color: #909399; font-size: 12px">0 表示不限制</span>
        </el-form-item>
        <el-form-item label="演示租户">
          <el-switch v-model="createForm.demoFlag" />
        </el-form-item>
        <el-form-item label="停用">
          <el-switch v-model="createForm.stopFlag" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑租户对话框 -->
    <el-dialog v-model="editVisible" title="编辑租户信息" width="520px">
      <el-form :model="editForm" label-width="110px">
        <el-form-item label="企业编号(sn)">
          <el-input v-model="editForm.sn" disabled />
        </el-form-item>
        <el-form-item label="企业名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="editForm.phone" />
        </el-form-item>
        <el-form-item label="业务员">
          <el-input v-model="editForm.salesperson" placeholder="例如：张三（可选）" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker
            v-model="editForm.expireDate"
            type="date"
            placeholder="不填则未设置"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            clearable
          />
        </el-form-item>
        <el-form-item label="登录人数限制">
          <el-input-number v-model="editForm.loginLimitNum" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="演示租户">
          <el-switch v-model="editForm.demoFlag" />
        </el-form-item>
        <el-form-item label="停用">
          <el-switch v-model="editForm.stopFlag" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '../utils/cloudbase'

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
    const res = await callFunction({
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
      await callFunction({
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
    const res = await callFunction({
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
  // 兼容：云端可能返回 Date / string / {$date: ...} / {_seconds: ...}
  let raw = date
  if (raw && typeof raw === 'object') {
    if (raw.$date) raw = raw.$date
    else if (raw._seconds) raw = raw._seconds * 1000
  }
  const d = new Date(raw)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 新增租户
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  sn: '',
  name: '',
  phone: '',
  salesperson: '',
  expireDate: '',
  loginLimitNum: 0,
  demoFlag: false,
  stopFlag: false
})

const openCreate = () => {
  Object.assign(createForm, {
    sn: '',
    name: '',
    phone: '',
    salesperson: '',
    expireDate: '',
    loginLimitNum: 0,
    demoFlag: false,
    stopFlag: false
  })
  createVisible.value = true
}

const handleCreate = async () => {
  if (!createForm.sn || !String(createForm.sn).trim()) {
    return ElMessage.warning('请输入企业编号(sn)')
  }
  if (!createForm.name || !String(createForm.name).trim()) {
    return ElMessage.warning('请输入企业名称')
  }
  createLoading.value = true
  try {
    const payload = {
      sn: String(createForm.sn).trim(),
      name: String(createForm.name).trim(),
      phone: String(createForm.phone || '').trim(),
      salesperson: String(createForm.salesperson || '').trim(),
      expireDate: createForm.expireDate || null,
      loginLimitNum: createForm.loginLimitNum || 0,
      demoFlag: !!createForm.demoFlag,
      stopFlag: !!createForm.stopFlag
    }
    const res = await callFunction({
      name: 'tenants',
      data: { action: 'save', payload }
    })
    if (res.result && res.result.code === 0) {
      const action = res.result.data && res.result.data.action
      if (action === 'update') {
        ElMessage.success('该编号已存在，已更新租户信息')
      } else {
        ElMessage.success('创建成功')
      }
      createVisible.value = false
      fetchList()
    } else {
      ElMessage.error((res.result && res.result.msg) || '创建失败')
    }
  } catch (e) {
    console.error(e)
    ElMessage.error('创建失败')
  } finally {
    createLoading.value = false
  }
}

// 编辑租户
const editVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive({
  sn: '',
  name: '',
  phone: '',
  salesperson: '',
  expireDate: '',
  loginLimitNum: 0,
  demoFlag: false,
  stopFlag: false
})

const openEdit = (row) => {
  if (!row) return
  Object.assign(editForm, {
    sn: row.sn || '',
    name: row.name || '',
    phone: row.phone || '',
    salesperson: row.salesperson || '',
    expireDate: row.expireDate ? formatDate(row.expireDate) : (row.expire_date ? formatDate(row.expire_date) : ''),
    loginLimitNum: row.loginLimitNum || 0,
    demoFlag: !!row.demoFlag,
    stopFlag: !!row.stopFlag
  })
  editVisible.value = true
}

const handleEdit = async () => {
  if (!editForm.sn) return ElMessage.error('缺少 sn')
  if (!editForm.name || !String(editForm.name).trim()) return ElMessage.warning('请输入企业名称')
  editLoading.value = true
  try {
    const payload = {
      sn: String(editForm.sn).trim(),
      name: String(editForm.name).trim(),
      phone: String(editForm.phone || '').trim(),
      salesperson: String(editForm.salesperson || '').trim(),
      expireDate: editForm.expireDate || null,
      loginLimitNum: editForm.loginLimitNum || 0,
      demoFlag: !!editForm.demoFlag,
      stopFlag: !!editForm.stopFlag
    }
    const res = await callFunction({
      name: 'tenants',
      data: { action: 'save', payload }
    })
    if (res.result && res.result.code === 0) {
      ElMessage.success('保存成功')
      editVisible.value = false
      fetchList()
    } else {
      ElMessage.error((res.result && res.result.msg) || '保存失败')
    }
  } catch (e) {
    console.error(e)
    ElMessage.error('保存失败')
  } finally {
    editLoading.value = false
  }
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
