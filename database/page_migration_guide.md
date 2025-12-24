# 页面代码迁移指南

## 迁移状态

✅ **已完成迁移**：
- `pages/index/index.js` - 首页
- `pages/factory/index.js` - 工厂列表

⏳ **待迁移页面**（共18个）：
1. `pages/issue/index.js` - 发料页面
2. `pages/issue/all.js` - 发料全部页面
3. `pages/issue/create.js` - 创建发料单
4. `pages/return/index.js` - 回货页面
5. `pages/return/create.js` - 创建回货单
6. `pages/factory/detail.js` - 工厂详情
7. `pages/factory/create.js` - 创建工厂
8. `pages/factory/settlement.js` - 结算页面
9. `pages/style/index.js` - 款号列表
10. `pages/style/create.js` - 创建款号
11. `pages/statistics/index.js` - 统计页面
12. `pages/yarn/index.js` - 纱线列表
13. `pages/yarn/create.js` - 创建纱线
14. `pages/plan/index.js` - 计划列表
15. `pages/plan/create.js` - 创建计划
16. `pages/settings/color.js` - 颜色设置
17. `pages/settings/size.js` - 尺码设置
18. `pages/index/activities.js` - 活动页面

## 迁移步骤

### 1. 导入工具函数

在每个页面文件顶部添加：

```javascript
import { query, count, insert, update, remove } from '../../utils/db.js'
```

### 2. 替换数据库操作

#### 查询操作

**之前：**
```javascript
const db = wx.cloud.database()
const _ = db.command
const result = await db.collection('styles')
  .where({
    tenantId: app.globalData.tenantId,
    deleted: _.neq(true)
  })
  .get()
```

**之后：**
```javascript
const result = await query('styles', {}, {
  excludeDeleted: true
})
// result.data 包含查询结果
```

#### 计数操作

**之前：**
```javascript
const countResult = await db.collection('factories')
  .where({
    tenantId: app.globalData.tenantId,
    deleted: _.neq(true)
  })
  .count()
const total = countResult.total
```

**之后：**
```javascript
const result = await count('factories', {}, {
  excludeDeleted: true
})
const total = result.total
```

#### 插入操作

**之前：**
```javascript
const db = wx.cloud.database()
const result = await db.collection('styles').add({
  data: {
    styleCode: 'ST001',
    styleName: '测试款号',
    tenantId: app.globalData.tenantId,
    createTime: db.serverDate(),
    updateTime: db.serverDate(),
    deleted: false
  }
})
```

**之后：**
```javascript
const result = await insert('styles', {
  styleCode: 'ST001',
  styleName: '测试款号'
})
// result._id 包含新插入记录的ID
```

#### 更新操作

**之前：**
```javascript
const db = wx.cloud.database()
await db.collection('styles').doc(styleId).update({
  data: {
    styleName: '新名称',
    updateTime: db.serverDate()
  }
})
```

**之后：**
```javascript
await update('styles', {
  styleName: '新名称'
}, {
  id: styleId
})
```

#### 删除操作（软删除）

**之前：**
```javascript
const db = wx.cloud.database()
await db.collection('styles').doc(styleId).update({
  data: {
    deleted: true,
    updateTime: db.serverDate()
  }
})
```

**之后：**
```javascript
await remove('styles', {
  id: styleId
})
```

### 3. 字段名转换

#### ID字段
- 查询时：使用 `id` 字段（数字）
- 结果中：自动添加 `_id` 字段（字符串形式）
- 更新/删除时：使用 `id` 字段

#### 字段命名
- 数据库字段：下划线命名（如 `style_code`, `create_time`）
- JavaScript对象：驼峰命名（如 `styleCode`, `createTime`）
- 自动转换：云函数自动处理

#### 访问字段时的兼容处理
```javascript
// 兼容两种命名方式
const styleCode = item.styleCode || item.style_code
const issueWeight = item.issueWeight || item.issue_weight
```

### 4. 特殊查询处理

#### IN查询
**之前：**
```javascript
settlementStatus: _.in(['未结算', '部分结算'])
```

**之后：**
```javascript
// 方法1：分别查询后合并
const [unsettledRes, partialRes] = await Promise.all([
  query('return_orders', { settlement_status: '未结算' }, { excludeDeleted: true }),
  query('return_orders', { settlement_status: '部分结算' }, { excludeDeleted: true })
])
const result = {
  data: [...unsettledRes.data, ...partialRes.data]
}

// 方法2：使用数组（如果MySQL云函数支持）
const result = await query('return_orders', {
  settlement_status: ['未结算', '部分结算']
}, {
  excludeDeleted: true
})
```

#### 范围查询
**之前：**
```javascript
issueDate: _.gte(startDate).and(_.lte(endDate))
```

**之后：**
```javascript
const result = await query('issue_orders', {
  issue_date: {
    gte: startDate,
    lte: endDate
  }
}, {
  excludeDeleted: true
})
```

#### 正则查询（搜索）
**之前：**
```javascript
name: _.regex({
  regexp: keyword,
  options: 'i'
})
```

**之后：**
```javascript
// 方法1：在客户端过滤（简单场景）
const result = await query('factories', {}, { excludeDeleted: true })
const filtered = result.data.filter(item => 
  (item.name || '').toLowerCase().includes(keyword.toLowerCase())
)

// 方法2：在云函数中添加LIKE查询支持（需要修改云函数）
```

#### 批量查询（根据ID列表）
**之前：**
```javascript
db.collection('factories').where({ _id: _.in(factoryIds), tenantId: app.globalData.tenantId }).get()
```

**之后：**
```javascript
import { queryByIds } from '../../utils/db.js'
const result = await queryByIds('factories', factoryIds, {
  excludeDeleted: true
})
```

### 5. 时间字段处理

**之前：**
```javascript
createTime: db.serverDate()
updateTime: db.serverDate()
```

**之后：**
```javascript
// 时间字段自动管理，无需手动设置
// create_time 和 update_time 会自动设置为当前时间
```

### 6. 租户ID处理

**之前：**
```javascript
tenantId: app.globalData.tenantId
```

**之后：**
```javascript
// 租户ID自动添加，无需手动传递
// 所有操作自动添加 tenant_id 条件
```

## 迁移检查清单

- [ ] 导入工具函数
- [ ] 替换所有 `wx.cloud.database()` 调用
- [ ] 替换所有 `db.collection()` 调用
- [ ] 处理字段名转换（驼峰/下划线）
- [ ] 处理ID字段（_id/id）
- [ ] 处理特殊查询（IN、范围、正则）
- [ ] 移除手动设置的时间戳
- [ ] 移除手动传递的租户ID
- [ ] 测试页面功能是否正常

## 常见问题

### 1. 字段不存在错误
- 检查字段名是否正确（驼峰/下划线）
- 检查表结构是否与SQL文件一致

### 2. ID字段错误
- 查询时使用 `id`（数字）
- 结果中使用 `_id`（字符串）或 `id`（数字）

### 3. 查询结果为空
- 检查租户ID是否正确
- 检查WHERE条件是否正确
- 检查字段名是否匹配

### 4. 性能问题
- 使用索引字段查询
- 避免全表扫描
- 使用分页限制结果数量

## 测试建议

1. **逐步迁移**：一次迁移一个页面，测试通过后再迁移下一个
2. **功能测试**：确保所有功能正常工作
3. **数据验证**：验证数据是否正确显示和操作
4. **错误处理**：确保错误处理逻辑正确

