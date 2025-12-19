# 数据库索引优化指南

## 概述

根据代码中的查询模式分析，以下索引配置可以显著提升查询性能。建议在生产环境使用前创建这些索引。

## 索引创建方法

### 方法一：通过云开发控制台创建（推荐）

1. 打开微信开发者工具
2. 点击顶部菜单栏的"云开发"
3. 进入"数据库"标签页
4. 选择对应的集合
5. 点击"索引管理"标签
6. 点击"添加索引"
7. 输入索引字段和排序方式
8. 点击"确定"创建

### 方法二：使用云函数创建

可以使用云函数批量创建索引，详见 `cloudfunctions/initDatabase/` 目录。

## 索引配置清单

### 1. 发料单表 (issue_orders)

#### 必需索引（高频查询）

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_deleted_issueDate | deleted + issueDate | deleted: asc, issueDate: desc | 用于列表查询（按日期倒序） |
| idx_factory_deleted_issueDate | factoryId + deleted + issueDate | factoryId: asc, deleted: asc, issueDate: desc | 用于加工厂详情页查询 |
| idx_deleted_status | deleted + status | deleted: asc, status: asc | 用于状态筛选 |
| idx_deleted_issueDate_range | deleted + issueDate | deleted: asc, issueDate: asc | 用于日期范围查询 |

**查询场景：**
- `pages/issue/index.js`: `.where({ deleted: _.eq(false) }).orderBy('issueDate', 'desc')`
- `pages/factory/detail.js`: `.where({ factoryId: ..., deleted: _.eq(false) }).orderBy('issueDate', 'desc')`
- `utils/db.js`: `.where({ deleted: _.eq(false), status: ... }).orderBy('issueDate', 'desc')`
- `pages/statistics/index.js`: `.where({ deleted: _.eq(false), issueDate: _.gte(...).and(_.lte(...)) })`

#### 已存在索引（保持）

- `issueNo`: 唯一索引（用于单号查询）
- `factoryId`: 普通索引（用于关联查询）
- `styleId`: 普通索引（用于关联查询）
- `issueDate`: 普通索引（可保留，但复合索引更优）

### 2. 回货单表 (return_orders)

#### 必需索引（高频查询）

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_deleted_returnDate | deleted + returnDate | deleted: asc, returnDate: desc | 用于列表查询（按日期倒序） |
| idx_factory_deleted_returnDate | factoryId + deleted + returnDate | factoryId: asc, deleted: asc, returnDate: desc | 用于加工厂详情页查询 |
| **idx_deleted_issueId** | **deleted + issueId** | **deleted: asc, issueId: asc** | **用于批量查询回货单（使用 in 操作符）** ⚠️ **必须创建** |
| idx_issueId_deleted | issueId + deleted | issueId: asc, deleted: asc | 用于根据单个发料单查询回货单（可选） |

**重要提示**: 
- `idx_deleted_issueId` 是**必须创建**的索引，用于批量查询优化
- 字段顺序必须是 `deleted` 在前，`issueId` 在后
- 查询模式：`.where({ issueId: _.in([...]), deleted: _.eq(false) })`
- 如果没有这个索引，批量查询会触发全表扫描警告

**查询场景：**
- `pages/return/index.js`: `.where({ deleted: _.neq(true) }).orderBy('returnDate', 'desc')`
- `pages/factory/detail.js`: `.where({ factoryId: ..., deleted: _.neq(true) }).orderBy('returnDate', 'desc')`
- `utils/db.js`: `.where({ deleted: _.neq(true) }).orderBy('returnDate', 'desc')`
- `cloudfunctions/createReturnOrder/index.js`: `.where({ issueId: ..., deleted: _.neq(true) })`

#### 已存在索引（保持）

- `returnNo`: 唯一索引（用于单号查询）
- `factoryId`: 普通索引（用于关联查询）
- `issueId`: 普通索引（用于关联查询）
- `returnDate`: 普通索引（可保留，但复合索引更优）

### 3. 纱线库存表 (yarn_inventory)

#### 必需索引

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_deleted_createTime | deleted + createTime | deleted: asc, createTime: desc | 用于列表查询 |

**查询场景：**
- `pages/yarn/index.js`: `.where({ deleted: _.neq(true) }).orderBy('createTime', 'desc')`

#### 已存在索引（保持）

- `yarnName`: 普通索引（用于名称查询）

### 4. 款号表 (styles)

#### 必需索引

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_deleted_createTime | deleted + createTime | deleted: asc, createTime: desc | 用于列表查询 |

**查询场景：**
- `pages/style/index.js`: `.where({ deleted: _.neq(true) }).orderBy('createTime', 'desc')`

#### 已存在索引（保持）

- `styleCode`: 唯一索引（用于款号查询）

### 5. 加工厂表 (factories)

#### 必需索引

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_deleted | deleted | deleted: asc | 用于列表查询（过滤已删除） |

**查询场景：**
- `pages/factory/index.js`: `.where({ deleted: _.neq(true) })`
- `utils/db.js`: `.where({ deleted: _.neq(true) })`

#### 已存在索引（保持）

- `name`: 普通索引（用于名称查询）

### 6. 颜色字典表 (color_dict)

#### 必需索引

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_createTime | createTime | createTime: desc | 用于列表查询（按创建时间倒序） |

**查询场景：**
- `pages/settings/color.js`: `.orderBy('createTime', 'desc')`
- `pages/style/create.js`: `.orderBy('createTime', 'desc')`
- `pages/return/create.js`: `.orderBy('createTime', 'desc')`

### 7. 尺码字典表 (size_dict)

#### 必需索引

| 索引名称 | 字段组合 | 排序方式 | 说明 |
|---------|---------|---------|------|
| idx_order_createTime | order + createTime | order: asc, createTime: desc | 用于列表查询（先按排序字段，再按创建时间） |

**查询场景：**
- `pages/settings/size.js`: `.orderBy('order', 'asc').orderBy('createTime', 'desc')`
- `pages/style/create.js`: `.orderBy('order', 'asc').orderBy('createTime', 'desc')`
- `pages/return/create.js`: `.orderBy('order', 'asc').orderBy('createTime', 'desc')`

## 索引创建优先级

### 高优先级（立即创建）- 必须创建

1. **issue_orders**:
   - `idx_deleted_issueDate` - 发料单列表查询（**必须创建**）
     - 字段：`deleted` (asc) + `issueDate` (desc)
     - 查询：`.where({ deleted: _.eq(false) }).orderBy('issueDate', 'desc')`
   - `idx_factory_deleted_issueDate` - 加工厂详情页（**必须创建**）
     - 字段：`factoryId` (asc) + `deleted` (asc) + `issueDate` (desc)
     - 查询：`.where({ factoryId: ..., deleted: _.eq(false) }).orderBy('issueDate', 'desc')`
   - `idx_deleted_issueNo` - 发料单号搜索（**必须创建**）
     - 字段：`deleted` (asc) + `issueNo` (asc)
     - 查询：`.where({ deleted: _.eq(false), issueNo: _.regex(...) })`

2. **return_orders**:
   - `idx_deleted_returnDate` - 回货单列表查询（**必须创建**）
     - 字段：`deleted` (asc) + `returnDate` (desc)
     - 查询：`.where({ deleted: _.eq(false) }).orderBy('returnDate', 'desc')`
   - `idx_factory_deleted_returnDate` - 加工厂详情页（**必须创建**）
     - 字段：`factoryId` (asc) + `deleted` (asc) + `returnDate` (desc)
     - 查询：`.where({ factoryId: ..., deleted: _.eq(false) }).orderBy('returnDate', 'desc')`
   - `idx_issue_deleted` - 根据发料单查询回货单（**必须创建**）
     - 字段：`issueId` (asc) + `deleted` (asc)
     - 查询：`.where({ issueId: ..., deleted: _.eq(false) })`

### 中优先级（尽快创建）

3. **yarn_inventory**: `idx_deleted_createTime`
4. **styles**: `idx_deleted_createTime`
5. **factories**: `idx_deleted`
6. **size_dict**: `idx_order_createTime`
7. **color_dict**: `idx_createTime`

### 低优先级（可选）

8. **issue_orders**: `idx_deleted_status`（如果状态筛选使用频繁）
9. **return_orders**: `idx_issue_deleted`（如果根据发料单查询回货单频繁）

## 注意事项

1. **索引数量限制**: 每个集合最多可创建 20 个索引
2. **索引存储**: 索引会占用额外的存储空间
3. **写入性能**: 索引会略微影响写入性能，但查询性能提升显著
4. **复合索引顺序**: 复合索引的字段顺序很重要，应按照查询条件的使用频率排序
5. **正则查询**: 使用 `_.regex()` 的查询无法使用索引，会进行全表扫描
6. **neq 操作符**: `_.neq(true)` 无法高效使用索引，应使用 `_.eq(false)` 代替

## 重要优化：neq 操作符优化

### 问题说明

代码中使用了 `deleted: _.neq(true)` 来查询未删除的记录，但 `neq` 操作符无法高效使用索引，会导致全表扫描。

### 优化方案

**已优化**: 将所有 `deleted: _.neq(true)` 改为 `deleted: _.eq(false)`

**优化效果**:
- ✅ 可以使用索引，查询性能提升显著
- ✅ 减少数据库扫描时间
- ✅ 降低数据库负载

**需要确保**:
- 所有新创建的记录都设置 `deleted: false`（而不是 `undefined` 或 `null`）
- 删除记录时设置 `deleted: true`
- 查询时使用 `deleted: _.eq(false)` 或 `deleted: false`

### 索引支持

使用 `deleted: _.eq(false)` 后，以下索引可以高效工作：

- `deleted` 单字段索引
- `deleted + issueDate` 复合索引
- `deleted + returnDate` 复合索引
- `deleted + createTime` 复合索引
- `issueId + deleted` 复合索引（用于回货单查询）

## 性能优化建议

### 1. 避免全表扫描

当前代码中以下查询会触发全表扫描警告：

```javascript
// ❌ 不推荐：空查询条件
db.collection('issue_orders').where({}).orderBy('issueDate', 'desc').get()

// ✅ 推荐：使用 eq(false) 代替 neq(true)，支持索引
db.collection('issue_orders')
  .where({ deleted: _.eq(false) })
  .orderBy('issueDate', 'desc')
  .get()
```

### 2. 优化查询条件顺序

在复合索引中，字段顺序应与查询条件顺序一致：

```javascript
// 索引：deleted + issueDate
// ✅ 正确：先 deleted，后 issueDate（使用 eq(false) 支持索引）
.where({ deleted: _.eq(false) })
.orderBy('issueDate', 'desc')

// ❌ 错误：只使用 issueDate（无法使用复合索引）
.orderBy('issueDate', 'desc')

// ❌ 错误：使用 neq(true) 无法使用索引
.where({ deleted: _.neq(true) })
.orderBy('issueDate', 'desc')
```

### 3. 限制查询结果数量

对于列表查询，建议添加 `.limit()` 限制返回数量：

```javascript
.orderBy('issueDate', 'desc')
.limit(100)  // 限制返回100条
.get()
```

### 4. 批量查询优化（避免 N+1 查询问题）

**问题**: 在发料页面加载时，如果对每个订单都单独查询工厂、款号和回货单，会导致 N+1 查询问题。

**优化方案**: 批量查询所有需要的数据，然后在内存中关联。

```javascript
// ❌ 不推荐：逐个查询（N+1 问题）
const ordersWithDetails = await Promise.all(
  orders.map(async (order) => {
    const factory = await db.collection('factories').doc(order.factoryId).get()
    const style = await db.collection('styles').doc(order.styleId).get()
    const returnOrders = await getReturnOrdersByIssueId(order._id)
    // ...
  })
)

// ✅ 推荐：批量查询
// 1. 收集所有需要的 ID
const factoryIds = [...new Set(orders.map(o => o.factoryId))]
const styleIds = [...new Set(orders.map(o => o.styleId))]
const issueIds = orders.map(o => o._id)

// 2. 批量查询工厂和款号
const factoriesMap = new Map()
const factoriesPromises = factoryIds.map(id => 
  db.collection('factories').doc(id).get()
)
const factoriesResults = await Promise.all(factoriesPromises)
factoriesResults.forEach((result, index) => {
  if (result.data) {
    factoriesMap.set(factoryIds[index], result.data)
  }
})

// 3. 批量查询回货单（使用 in 操作符）
const allReturnOrders = await db.collection('return_orders')
  .where({
    issueId: _.in(issueIds),
    deleted: _.eq(false)
  })
  .get()

// 4. 按 issueId 分组
const returnOrdersMap = new Map()
allReturnOrders.data.forEach(order => {
  if (!returnOrdersMap.has(order.issueId)) {
    returnOrdersMap.set(order.issueId, [])
  }
  returnOrdersMap.get(order.issueId).push(order)
})

// 5. 在内存中关联数据
const ordersWithDetails = orders.map(order => ({
  ...order,
  factory: factoriesMap.get(order.factoryId),
  style: stylesMap.get(order.styleId),
  returnOrders: returnOrdersMap.get(order._id) || []
}))
```

**优化效果**:
- 从 N*3 次查询减少到 3 次查询（N 为订单数量）
- 查询时间从 O(N) 降低到 O(1)
- 显著提升页面加载速度

## 验证索引效果

创建索引后，可以通过以下方式验证：

1. **查看查询统计**: 在云开发控制台的"数据库" -> "统计"中查看查询耗时
2. **监控告警**: 如果查询仍然触发全表扫描警告，检查索引是否正确创建
3. **性能对比**: 对比创建索引前后的查询响应时间

## 更新说明

如果后续代码中添加了新的查询模式，请及时更新此文档并创建相应的索引。

