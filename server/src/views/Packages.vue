<template>
  <div class="packages-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>套餐配置</span>
          <el-button type="primary" @click="openEdit(null)">新增套餐</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="order" label="排序" width="80" />
        <el-table-column prop="name" label="套餐名称" width="120" />
        <el-table-column prop="days" label="天数" width="100" />
        <el-table-column prop="price" label="售价 (元)" width="100" />
        <el-table-column prop="originalPrice" label="原价 (元)" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '销售中' : '已下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form._id ? '编辑套餐' : '新增套餐'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="排序">
          <el-input-number v-model="form.order" :min="1" />
        </el-form-item>
        <el-form-item label="套餐名称">
          <el-input v-model="form.name" placeholder="如：12个月" />
        </el-form-item>
        <el-form-item label="有效天数">
          <el-input-number v-model="form.days" :min="1" />
        </el-form-item>
        <el-form-item label="当前售价">
          <el-input-number v-model="form.price" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="原始价格">
          <el-input-number v-model="form.originalPrice" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" active-value="active" inactive-value="disabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '../utils/cloudbase'

const loading = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const submitLoading = ref(false)

const form = reactive({
  _id: '',
  id: '', // 业务ID
  name: '',
  days: 30,
  price: 99,
  originalPrice: 120,
  order: 1,
  status: 'active'
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await callFunction({
      name: 'admin',
      data: { action: 'managePackages', payload: { subAction: 'list' } }
    })
    if (res.result.success) {
      list.value = res.result.data
    }
  } catch (err) {
    ElMessage.error('获取列表失败')
  } finally {
    loading.value = false
  }
}

const openEdit = (row) => {
  if (row) {
    Object.assign(form, row)
  } else {
    Object.assign(form, { _id: '', id: Date.now().toString(), name: '', days: 30, price: 0, originalPrice: 0, order: 1, status: 'active' })
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  submitLoading.value = true
  try {
    const subAction = form._id ? 'update' : 'add'
    const payload = { ...form }
    
    if (subAction === 'update') {
      // 更新时，传递 id 和 _id（云函数会优先使用 id）
      payload.id = form._id
      payload._id = form._id
    } else {
      // 新增时，移除 _id
      delete payload._id
    }

    const res = await callFunction({
      name: 'admin',
      data: { action: 'managePackages', payload: { subAction, data: payload } }
    })
    if (res.result.success) {
      ElMessage.success('保存成功')
      dialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.result.msg || '保存失败')
    }
  } catch (err) {
    console.error('保存套餐失败:', err)
    ElMessage.error('保存失败：' + (err.message || '未知错误'))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除套餐 "${row.name}" 吗？`, '警告', { type: 'error' }).then(async () => {
    try {
      await callFunction({
        name: 'admin',
        data: { action: 'managePackages', payload: { subAction: 'delete', data: { id: row._id } } }
      })
      ElMessage.success('删除成功')
      fetchList()
    } catch (err) {
      ElMessage.error('删除失败')
    }
  })
}

onMounted(fetchList)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
