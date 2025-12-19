# 数据库索引创建指南

## 快速索引创建清单

根据查询模式分析，以下索引必须创建以提升查询效率。**建议立即创建这些索引**。

## 必须创建的索引（高优先级）

### 1. 发料单表 (issue_orders)

#### idx_deleted_issueDate（必须创建）
- **字段组合**: `deleted` (asc) + `issueDate` (desc)
- **用途**: 发料单列表查询（按日期倒序）
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('issueDate', 'desc')
  ```
- **创建链接**: 在云开发控制台 → 数据库 → issue_orders → 索引管理 → 添加索引

#### idx_factory_deleted_issueDate（必须创建）
- **字段组合**: `factoryId` (asc) + `deleted` (asc) + `issueDate` (desc)
- **用途**: 加工厂详情页查询
- **查询场景**:
  ```javascript
  .where({ factoryId: ..., deleted: _.eq(false) }).orderBy('issueDate', 'desc')
  ```

#### idx_deleted_issueNo（推荐创建）
- **字段组合**: `deleted` (asc) + `issueNo` (asc)
- **用途**: 发料单号搜索
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false), issueNo: _.regex(...) })
  ```
- **注意**: 正则查询无法完全使用索引，但可以提升部分性能

### 2. 回货单表 (return_orders)

#### idx_deleted_returnDate（必须创建）
- **字段组合**: `deleted` (asc) + `returnDate` (desc)
- **用途**: 回货单列表查询（按日期倒序）
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('returnDate', 'desc')
  ```

#### idx_factory_deleted_returnDate（必须创建）
- **字段组合**: `factoryId` (asc) + `deleted` (asc) + `returnDate` (desc)
- **用途**: 加工厂详情页查询

#### idx_deleted_issueId（必须创建 - 批量查询优化）
- **字段组合**: `deleted` (asc) + `issueId` (asc)
- **用途**: 批量查询多个发料单的回货单（使用 `_.in()` 操作符）
- **查询场景**:
  ```javascript
  .where({ 
    issueId: _.in([id1, id2, id3, ...]), 
    deleted: _.eq(false) 
  })
  ```
- **重要性**: ⚠️ **高优先级** - 用于发料单列表页面的批量查询，避免 N+1 查询问题
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22issueId%22%2C%22type%22%3A1%7D%5D
  ```
- **注意**: 字段顺序必须是 `deleted` 在前，`issueId` 在后，因为查询条件中 `deleted` 是等值查询，`issueId` 是 `in` 查询

#### idx_issueId_deleted（可选 - 单个查询）
- **字段组合**: `issueId` (asc) + `deleted` (asc)
- **用途**: 根据单个发料单查询回货单
- **查询场景**:
  ```javascript
  .where({ issueId: ..., deleted: _.eq(false) })
  ```
- **注意**: 如果只查询单个发料单的回货单，可以使用此索引。但 `idx_deleted_issueId` 也可以支持单个查询，所以这个索引是可选的

### 3. 款号表 (styles)

#### idx_deleted_createTime（必须创建）
- **字段组合**: `deleted` (asc) + `createTime` (desc)
- **用途**: 款号列表查询
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('createTime', 'desc')
  ```

### 4. 纱线库存表 (yarn_inventory)

#### idx_deleted_createTime（必须创建）
- **字段组合**: `deleted` (asc) + `createTime` (desc)
- **用途**: 纱线列表查询
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('createTime', 'desc')
  ```

### 5. 加工厂表 (factories)

#### idx_deleted（必须创建）
- **字段组合**: `deleted` (asc)
- **用途**: 加工厂列表查询（过滤已删除）
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false) })
  ```

### 6. 颜色字典表 (color_dict)

#### idx_deleted_createTime（推荐创建）
- **字段组合**: `deleted` (asc) + `createTime` (desc)
- **用途**: 颜色列表查询
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('createTime', 'desc')
  ```

### 7. 尺码字典表 (size_dict)

#### idx_deleted_order_createTime（推荐创建）
- **字段组合**: `deleted` (asc) + `order` (asc) + `createTime` (desc)
- **用途**: 尺码列表查询（先按排序字段，再按创建时间）
- **查询场景**:
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('order', 'asc').orderBy('createTime', 'desc')
  ```

## 创建步骤

### 方法一：通过云开发控制台创建（推荐）

1. 打开微信开发者工具
2. 点击顶部菜单栏的"云开发"
3. 进入"数据库"标签页
4. 选择对应的集合（如 `issue_orders`）
5. 点击"索引管理"标签
6. 点击"添加索引"
7. 输入索引字段：
   - 第一个字段：`deleted`，排序：升序
   - 第二个字段：`issueDate`，排序：降序
8. 点击"确定"创建
9. 等待索引创建完成（可能需要几分钟）

### 方法二：使用快速创建链接

如果云开发控制台支持，可以使用以下格式的链接快速创建：

```
cloud://createindex?env=YOUR_ENV_ID&collection=issue_orders&fields=[{"field":"deleted","type":1},{"field":"issueDate","type":-1}]
```

## 索引创建顺序建议

### ⚠️ 最高优先级（立即创建 - 解决当前警告）

1. **`return_orders`: idx_deleted_issueId** ⚠️ **必须立即创建**
   - **原因**: 发料单列表页面使用批量查询，没有此索引会触发全表扫描警告
   - **查询模式**: `.where({ issueId: _.in([...]), deleted: _.eq(false) })`
   - **字段顺序**: `deleted` (asc) + `issueId` (asc)
   - **快速创建链接**: 
     ```
     cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22issueId%22%2C%22type%22%3A1%7D%5D
     ```

### 第一批（立即创建）

2. `issue_orders`: idx_deleted_issueDate
3. `return_orders`: idx_deleted_returnDate
4. `styles`: idx_deleted_createTime
5. `yarn_inventory`: idx_deleted_createTime

### 第二批（尽快创建）

6. `issue_orders`: idx_factory_deleted_issueDate
7. `return_orders`: idx_factory_deleted_returnDate
8. `factories`: idx_deleted

### 第三批（可选）

9. `color_dict`: idx_deleted_createTime
10. `size_dict`: idx_deleted_order_createTime

## 验证索引效果

创建索引后，可以通过以下方式验证：

1. **查看查询统计**: 在云开发控制台的"数据库" → "统计"中查看查询耗时
2. **监控告警**: 如果查询仍然触发全表扫描警告，检查索引是否正确创建
3. **性能对比**: 对比创建索引前后的查询响应时间

## 注意事项

1. **索引数量限制**: 每个集合最多可创建 20 个索引
2. **索引存储**: 索引会占用额外的存储空间
3. **写入性能**: 索引会略微影响写入性能，但查询性能提升显著
4. **复合索引顺序**: 复合索引的字段顺序很重要，应按照查询条件的使用频率排序
5. **正则查询**: 使用 `_.regex()` 的查询无法完全使用索引，会进行部分全表扫描
6. **neq 操作符**: `_.neq(true)` 无法高效使用索引，应使用 `_.eq(false)` 代替（已优化）

## 性能优化建议

### 1. 使用 limit 限制查询结果

对于列表查询，建议添加 `.limit()` 限制返回数量：

```javascript
.where({ deleted: _.eq(false) })
.orderBy('issueDate', 'desc')
.limit(100)  // 限制返回100条
.get()
```

### 2. 批量查询优化

避免 N+1 查询问题，使用批量查询：

```javascript
// ❌ 不推荐：逐个查询
for (const order of orders) {
  const factory = await db.collection('factories').doc(order.factoryId).get()
}

// ✅ 推荐：批量查询
const factoryIds = [...new Set(orders.map(o => o.factoryId))]
const factories = await Promise.all(
  factoryIds.map(id => db.collection('factories').doc(id).get())
)
```

### 3. 使用 eq(false) 代替 neq(true)

```javascript
// ❌ 不推荐：无法使用索引
.where({ deleted: _.neq(true) })

// ✅ 推荐：可以使用索引
.where({ deleted: _.eq(false) })
```

## 索引创建检查清单

### ⚠️ 最高优先级（立即创建 - 解决当前警告）
- [ ] `return_orders`: **idx_deleted_issueId** ⚠️ **必须立即创建** - 批量查询优化
  - 字段：`deleted` (asc) + `issueId` (asc)
  - 快速创建链接：`cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22issueId%22%2C%22type%22%3A1%7D%5D`

### 第一批（立即创建）
- [ ] `issue_orders`: idx_deleted_issueDate
- [ ] `return_orders`: idx_deleted_returnDate
- [ ] `styles`: idx_deleted_createTime
- [ ] `yarn_inventory`: idx_deleted_createTime

### 第二批（尽快创建）
- [ ] `issue_orders`: idx_factory_deleted_issueDate
- [ ] `return_orders`: idx_factory_deleted_returnDate
- [ ] `factories`: idx_deleted

### 第三批（可选）
- [ ] `color_dict`: idx_deleted_createTime
- [ ] `size_dict`: idx_deleted_order_createTime

创建完成后，请在此清单中打勾确认。

