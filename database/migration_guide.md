# 数据库迁移指南：从云数据库到MySQL

## 迁移状态

✅ **已完成**：
- MySQL云函数创建完成
- MySQL数据库表结构SQL文件已创建
- `utils/db.js` 已更新为使用MySQL云函数

⏳ **待完成**：
- 所有页面代码需要从直接调用云数据库改为使用 `utils/db.js` 中的函数

## 迁移步骤

### 步骤1：创建MySQL数据库

执行SQL文件创建数据库：

```bash
mysql -u root -p < database/mysql_schema.sql
```

### 步骤2：配置云函数环境变量

在微信开发者工具的云开发控制台中配置 `mysql` 云函数的环境变量：

- `MYSQL_HOST`: MySQL服务器地址
- `MYSQL_PORT`: MySQL端口（默认3306）
- `MYSQL_USER`: 数据库用户名
- `MYSQL_PASSWORD`: 数据库密码
- `MYSQL_DATABASE`: 数据库名称（shoufa_db）

### 步骤3：部署MySQL云函数

1. 右键点击 `cloudfunctions/mysql` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 等待部署完成

### 步骤4：代码迁移

需要将以下页面的数据库调用改为使用 `utils/db.js`：

#### 需要迁移的页面列表：

1. **pages/index/index.js** - 首页
2. **pages/issue/index.js** - 发料页面
3. **pages/issue/all.js** - 发料全部页面
4. **pages/issue/create.js** - 创建发料单
5. **pages/return/index.js** - 回货页面
6. **pages/return/create.js** - 创建回货单
7. **pages/factory/index.js** - 工厂列表
8. **pages/factory/detail.js** - 工厂详情
9. **pages/factory/create.js** - 创建工厂
10. **pages/factory/settlement.js** - 结算页面
11. **pages/style/index.js** - 款号列表
12. **pages/style/create.js** - 创建款号
13. **pages/statistics/index.js** - 统计页面
14. **pages/yarn/index.js** - 纱线列表
15. **pages/yarn/create.js** - 创建纱线
16. **pages/plan/index.js** - 计划列表
17. **pages/plan/create.js** - 创建计划
18. **pages/settings/color.js** - 颜色设置
19. **pages/settings/size.js** - 尺码设置
20. **pages/index/activities.js** - 活动页面

## 代码迁移示例

### 示例1：查询操作

**之前（云数据库）：**
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

**现在（MySQL）：**
```javascript
import { query } from '../../utils/db.js'
const result = await query('styles', {}, {
  excludeDeleted: true
})
// result.data 包含查询结果
```

### 示例2：插入操作

**之前（云数据库）：**
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

**现在（MySQL）：**
```javascript
import { insert } from '../../utils/db.js'
const result = await insert('styles', {
  styleCode: 'ST001',
  styleName: '测试款号'
})
// result._id 包含新插入记录的ID
```

### 示例3：更新操作

**之前（云数据库）：**
```javascript
const db = wx.cloud.database()
await db.collection('styles').doc(styleId).update({
  data: {
    styleName: '新名称',
    updateTime: db.serverDate()
  }
})
```

**现在（MySQL）：**
```javascript
import { update } from '../../utils/db.js'
await update('styles', {
  styleName: '新名称'
}, {
  id: styleId
})
```

### 示例4：计数操作

**之前（云数据库）：**
```javascript
const db = wx.cloud.database()
const countResult = await db.collection('factories')
  .where({
    tenantId: app.globalData.tenantId,
    deleted: _.neq(true)
  })
  .count()
const total = countResult.total
```

**现在（MySQL）：**
```javascript
import { count } from '../../utils/db.js'
const result = await count('factories', {}, {
  excludeDeleted: true
})
const total = result.total
```

## 字段映射说明

### ID字段
- 云数据库：`_id` (String)
- MySQL：`id` (INT UNSIGNED)
- 自动转换：查询结果会自动添加 `_id` 字段（值为 `id` 的字符串形式）

### 字段命名
- 云数据库：驼峰命名（如 `styleCode`, `createTime`）
- MySQL：下划线命名（如 `style_code`, `create_time`）
- 自动转换：`utils/db.js` 和云函数会自动处理命名转换

### 日期字段
- 云数据库：`db.serverDate()` 或 Date对象
- MySQL：DATETIME类型，自动管理 `create_time` 和 `update_time`

### JSON字段
- 云数据库：Array类型（如 `availableColors: ['红色', '蓝色']`）
- MySQL：JSON类型（如 `available_colors: '["红色", "蓝色"]'`）
- 自动转换：云函数会自动处理JSON序列化和反序列化

## 注意事项

1. **租户ID**：所有操作会自动添加 `tenant_id` 条件，无需手动传递
2. **软删除**：默认排除已删除记录（`deleted = 0`），可通过 `excludeDeleted: false` 包含
3. **时间戳**：`create_time` 和 `update_time` 自动管理，无需手动设置
4. **事务**：复杂操作可以使用事务，参考云函数代码

## 测试建议

1. **逐步迁移**：一次迁移一个页面，测试通过后再迁移下一个
2. **数据验证**：迁移后验证数据是否正确显示和操作
3. **性能测试**：测试查询性能是否满足要求
4. **错误处理**：确保错误处理逻辑正确

## 回滚方案

如果迁移出现问题，可以：

1. 恢复 `utils/db.js` 为云数据库版本
2. 恢复页面代码为云数据库版本
3. 继续使用云数据库

## 支持

如有问题，请参考：
- `database/mysql_setup.md` - MySQL配置说明
- `cloudfunctions/mysql/index.js` - MySQL云函数代码
- `utils/db.js` - 数据库操作封装

