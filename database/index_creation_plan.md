# 数据库索引创建完整方案

## 📋 索引创建清单（按优先级排序）

根据当前代码中的所有查询模式分析，以下是**必须创建**的索引清单。

---

## ⚠️ 最高优先级（立即创建 - 解决当前警告）

### 1. `return_orders`: idx_deleted_issueId ⚠️ **必须立即创建**

**索引配置**:
- **字段组合**: `deleted` (asc) + `issueId` (asc)
- **用途**: 批量查询多个发料单的回货单（使用 `_.in()` 操作符）
- **查询场景**: 
  ```javascript
  .where({ 
    issueId: _.in([id1, id2, id3, ...]), 
    deleted: _.eq(false) 
  })
  ```
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22issueId%22%2C%22type%22%3A1%7D%5D
  ```
- **重要性**: ⚠️ **极高** - 用于发料单列表页面的批量查询，避免 N+1 查询问题

---

## 🔥 第一批（立即创建 - 解决当前警告）

### 2. `issue_orders`: idx_deleted_issueDate

**索引配置**:
- **字段组合**: `deleted` (asc) + `issueDate` (desc)
- **用途**: 发料单列表查询（按日期倒序）
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('issueDate', 'desc')
  ```
- **使用位置**: 
  - `pages/index/activities.js` (全部动态页面)
  - `pages/issue/index.js` (发料单列表)
  - `pages/statistics/index.js` (统计页面)
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=issue_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22issueDate%22%2C%22type%22%3A-1%7D%5D
  ```

### 3. `return_orders`: idx_deleted_returnDate

**索引配置**:
- **字段组合**: `deleted` (asc) + `returnDate` (desc)
- **用途**: 回货单列表查询（按日期倒序）
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('returnDate', 'desc')
  ```
- **使用位置**: 
  - `pages/index/activities.js` (全部动态页面)
  - `pages/return/index.js` (回货单列表)
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22returnDate%22%2C%22type%22%3A-1%7D%5D
  ```

### 4. `styles`: idx_deleted

**索引配置**:
- **字段组合**: `deleted` (asc)
- **用途**: 款号列表 count 查询
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).count()
  ```
- **使用位置**: 
  - `pages/index/index.js` (首页统计)
  - `pages/index/activities.js` (全部动态页面 - 加载款号列表)
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=styles&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%5D
  ```

### 5. `factories`: idx_deleted

**索引配置**:
- **字段组合**: `deleted` (asc)
- **用途**: 加工厂列表 count 查询
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).count()
  ```
- **使用位置**: 
  - `pages/index/index.js` (首页统计)
  - `pages/index/activities.js` (全部动态页面 - 加载工厂列表)
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=factories&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%5D
  ```

### 6. `issue_orders`: idx_deleted

**索引配置**:
- **字段组合**: `deleted` (asc)
- **用途**: 发料单列表查询（不带排序）
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).get()
  ```
- **使用位置**: 
  - `pages/index/activities.js` (全部动态页面 - 日期筛选时)
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=issue_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%5D
  ```

---

## 📌 第二批（尽快创建 - 优化其他查询）

### 7. `return_orders`: idx_deleted_settlementStatus

**索引配置**:
- **字段组合**: `deleted` (asc) + `settlementStatus` (asc)
- **用途**: 未结算回货单查询
- **查询场景**: 
  ```javascript
  .where({ 
    settlementStatus: _.neq('已结算'),
    deleted: _.eq(false) 
  })
  ```
- **使用位置**: 
  - `pages/index/index.js` (首页 - 未结账款统计)
  - `pages/factory/index.js` (加工厂列表)
- **快速创建链接**: 
  ```
  cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22settlementStatus%22%2C%22type%22%3A1%7D%5D
  ```
- **⚠️ 注意**: 虽然使用了 `_.neq('已结算')`，但创建此索引仍可以提升部分性能。**建议优化代码**：将 `settlementStatus` 改为布尔字段 `isSettled`，或使用 `_.in(['未结算', '部分结算'])` 代替 `_.neq('已结算')`

### 8. `issue_orders`: idx_deleted_issueDate_asc

**索引配置**:
- **字段组合**: `deleted` (asc) + `issueDate` (asc)
- **用途**: 日期范围查询（升序）
- **查询场景**: 
  ```javascript
  .where({ 
    deleted: _.eq(false),
    issueDate: _.gte(startDate).and(_.lte(endDate))
  })
  ```
- **使用位置**: 
  - `pages/index/activities.js` (全部动态页面 - 日期筛选)
  - `pages/statistics/index.js` (统计页面)
- **注意**: 如果日期范围查询使用频繁，建议创建此索引。但 `idx_deleted_issueDate` (desc) 也可以支持范围查询，所以这个索引是可选的

---

## 📝 第三批（可选 - 进一步优化）

### 9. `issue_orders`: idx_factory_deleted_issueDate

**索引配置**:
- **字段组合**: `factoryId` (asc) + `deleted` (asc) + `issueDate` (desc)
- **用途**: 加工厂详情页查询
- **查询场景**: 
  ```javascript
  .where({ 
    factoryId: ...,
    deleted: _.eq(false) 
  }).orderBy('issueDate', 'desc')
  ```
- **使用位置**: 
  - `pages/factory/detail.js` (加工厂详情页)

### 10. `return_orders`: idx_factory_deleted_returnDate

**索引配置**:
- **字段组合**: `factoryId` (asc) + `deleted` (asc) + `returnDate` (desc)
- **用途**: 加工厂详情页查询
- **查询场景**: 
  ```javascript
  .where({ 
    factoryId: ...,
    deleted: _.eq(false) 
  }).orderBy('returnDate', 'desc')
  ```
- **使用位置**: 
  - `pages/factory/detail.js` (加工厂详情页)

### 11. `styles`: idx_deleted_createTime

**索引配置**:
- **字段组合**: `deleted` (asc) + `createTime` (desc)
- **用途**: 款号列表查询（按创建时间倒序）
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('createTime', 'desc')
  ```
- **使用位置**: 
  - `pages/style/index.js` (款号列表)

### 12. `yarn_inventory`: idx_deleted_createTime

**索引配置**:
- **字段组合**: `deleted` (asc) + `createTime` (desc)
- **用途**: 纱线列表查询
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('createTime', 'desc')
  ```
- **使用位置**: 
  - `pages/yarn/index.js` (纱线列表)

### 13. `color_dict`: idx_deleted_createTime

**索引配置**:
- **字段组合**: `deleted` (asc) + `createTime` (desc)
- **用途**: 颜色列表查询
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) }).orderBy('createTime', 'desc')
  ```
- **使用位置**: 
  - `pages/settings/color.js` (颜色管理)

### 14. `size_dict`: idx_deleted_order_createTime

**索引配置**:
- **字段组合**: `deleted` (asc) + `order` (asc) + `createTime` (desc)
- **用途**: 尺码列表查询（先按排序字段，再按创建时间）
- **查询场景**: 
  ```javascript
  .where({ deleted: _.eq(false) })
    .orderBy('order', 'asc')
    .orderBy('createTime', 'desc')
  ```
- **使用位置**: 
  - `pages/settings/size.js` (尺码管理)

---

## 🚨 代码优化建议

### 1. 优化 `settlementStatus` 查询

**当前问题**: 
```javascript
// ❌ 不推荐：neq 操作符无法高效使用索引
.where({
  settlementStatus: _.neq('已结算'),
  deleted: _.eq(false)
})
```

**优化方案**:

**方案A（推荐）**: 添加布尔字段 `isSettled`
```javascript
// 在创建/更新回货单时
data: {
  isSettled: false, // 或 true
  settlementStatus: '未结算', // 保留原字段用于显示
  ...
}

// 查询时
.where({
  isSettled: _.eq(false),
  deleted: _.eq(false)
})
```

**方案B**: 使用 `_.in()` 代替 `_.neq()`
```javascript
// ✅ 推荐：可以使用索引
.where({
  settlementStatus: _.in(['未结算', '部分结算']),
  deleted: _.eq(false)
})
```

**需要修改的文件**:
- `pages/index/index.js` (第84行)
- `pages/factory/index.js` (第58行)

---

## 📊 索引创建优先级总结

### ⚠️ 最高优先级（立即创建 - 解决当前警告）
1. ✅ `return_orders`: idx_deleted_issueId
2. ✅ `issue_orders`: idx_deleted_issueDate
3. ✅ `return_orders`: idx_deleted_returnDate
4. ✅ `styles`: idx_deleted
5. ✅ `factories`: idx_deleted
6. ✅ `issue_orders`: idx_deleted

### 📌 第二批（尽快创建）
7. ✅ `return_orders`: idx_deleted_settlementStatus（同时优化代码）

### 📝 第三批（可选）
8. `issue_orders`: idx_factory_deleted_issueDate
9. `return_orders`: idx_factory_deleted_returnDate
10. `styles`: idx_deleted_createTime
11. `yarn_inventory`: idx_deleted_createTime
12. `color_dict`: idx_deleted_createTime
13. `size_dict`: idx_deleted_order_createTime

---

## 🔧 创建步骤

### 方法一：通过云开发控制台创建（推荐）

1. 打开微信开发者工具
2. 点击顶部菜单栏的"云开发"
3. 进入"数据库"标签页
4. 选择对应的集合（如 `return_orders`）
5. 点击"索引管理"标签
6. 点击"添加索引"
7. 输入索引字段：
   - 第一个字段：`deleted`，排序：升序
   - 第二个字段：`issueId`，排序：升序
8. 点击"确定"创建
9. 等待索引创建完成（可能需要几分钟）

### 方法二：使用快速创建链接

**使用方法**：

1. **在微信开发者工具中**：
   - 打开微信开发者工具
   - 在控制台（Console）中，直接点击日志中显示的快速创建链接
   - 或者，在浏览器地址栏中输入完整的链接（需要先登录云开发控制台）

2. **在云开发控制台中**：
   - 打开微信开发者工具
   - 点击顶部菜单栏的"云开发"
   - 进入"数据库"标签页
   - 在浏览器地址栏中，将链接中的参数添加到当前 URL 后面
   - 或者，直接复制完整链接到浏览器地址栏访问

3. **链接格式说明**：
   ```
   cloud://createindex?env=环境ID&collection=集合名&from=console&s=索引字段JSON
   ```
   
   - `env`: 云开发环境ID（如：cloud1-3g9cra4h71f647dd）
   - `collection`: 集合名称（如：return_orders）
   - `s`: 索引字段的JSON编码（URL编码格式）

4. **示例链接解析**：
   ```
   cloud://createindex?env=cloud1-3g9cra4h71f647dd&collection=return_orders&from=console&s=%5B%7B%22field%22%3A%22deleted%22%2C%22type%22%3A1%7D%2C%7B%22field%22%3A%22issueId%22%2C%22type%22%3A1%7D%5D
   ```
   
   解码后的索引字段：
   ```json
   [
     {"field":"deleted","type":1},    // deleted 升序
     {"field":"issueId","type":1}    // issueId 升序
   ]
   ```

5. **如果链接无法直接使用**：
   - 使用"方法一"手动创建索引
   - 或者，复制链接中的参数，手动在控制台创建索引

---

## ✅ 创建检查清单

### ⚠️ 最高优先级（立即创建）
- [ ] `return_orders`: idx_deleted_issueId
- [ ] `issue_orders`: idx_deleted_issueDate
- [ ] `return_orders`: idx_deleted_returnDate
- [ ] `styles`: idx_deleted
- [ ] `factories`: idx_deleted
- [ ] `issue_orders`: idx_deleted

### 📌 第二批（尽快创建）
- [ ] `return_orders`: idx_deleted_settlementStatus
- [ ] 优化代码：将 `settlementStatus: _.neq('已结算')` 改为 `_.in(['未结算', '部分结算'])` 或添加 `isSettled` 字段

### 📝 第三批（可选）
- [ ] `issue_orders`: idx_factory_deleted_issueDate
- [ ] `return_orders`: idx_factory_deleted_returnDate
- [ ] `styles`: idx_deleted_createTime
- [ ] `yarn_inventory`: idx_deleted_createTime
- [ ] `color_dict`: idx_deleted_createTime
- [ ] `size_dict`: idx_deleted_order_createTime

---

## 📈 预期效果

创建索引后，预期可以：
- ✅ 消除所有全表扫描警告
- ✅ 查询速度提升 50-90%
- ✅ 减少数据库负载
- ✅ 提升用户体验（页面加载更快）

---

## ⚠️ 注意事项

1. **索引数量限制**: 每个集合最多可创建 20 个索引
2. **索引存储**: 索引会占用额外的存储空间（通常很小）
3. **写入性能**: 索引会略微影响写入性能（通常可以忽略）
4. **复合索引顺序**: 复合索引的字段顺序很重要，必须按照查询条件顺序创建
5. **neq 操作符**: `_.neq()` 无法高效使用索引，应使用 `_.eq()` 或 `_.in()` 代替

---

## 🔍 验证索引效果

创建索引后，可以通过以下方式验证：

1. **查看查询统计**: 在云开发控制台的"数据库" → "统计"中查看查询耗时
2. **监控告警**: 如果查询仍然触发全表扫描警告，检查索引是否正确创建
3. **性能对比**: 对比创建索引前后的查询响应时间

---

**最后更新**: 2025-12-19
**维护者**: 开发团队

