# 数据库初始化指南

## 错误说明

如果遇到 `database collection not exists` 错误，说明云数据库中还没有创建必要的集合。

## 创建数据库集合

请在微信开发者工具的云开发控制台中创建以下集合：

### 1. 款号表 (styles)

**集合名称**: `styles`

**字段结构**:
- `styleCode` (String): 款号编号（唯一）
- `styleName` (String): 款号名称
- `yarnUsagePerPiece` (Number): 单件纱线用量（克）
- `availableColors` (Array): 可选颜色列表
- `availableSizes` (Array): 可选尺码列表
- `remark` (String): 备注
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `styleCode`: 唯一索引

### 2. 加工厂表 (factories)

**集合名称**: `factories`

**字段结构**:
- `name` (String): 加工厂名称
- `contact` (String): 联系人
- `phone` (String): 联系方式
- `defaultPrice` (Number): 默认加工单价（元/打）
- `settlementMethod` (String): 结算方式（次结/月结）
- `remark` (String): 备注
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `name`: 普通索引

### 3. 纱线库存表 (yarn_inventory)

**集合名称**: `yarn_inventory`

**字段结构**:
- `yarnName` (String): 纱线名称/批次
- `color` (String): 颜色（可选）
- `currentStock` (Number): 当前库存数量（kg）
- `remark` (String): 备注
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

### 4. 生产计划单表 (production_plans)

**集合名称**: `production_plans`

**字段结构**:
- `planNo` (String): 计划单号
- `styleId` (String): 款号ID
- `color` (String): 颜色
- `size` (String): 尺码
- `planQuantity` (Number): 计划数量（件）
- `planYarnUsage` (Number): 计划用纱量（kg，自动计算）
- `factoryId` (String): 计划加工厂ID
- `planDate` (Date): 计划日期
- `status` (String): 状态（待发料/已发料/已完成）
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `planNo`: 唯一索引

### 5. 发料单表 (issue_orders)

**集合名称**: `issue_orders`

**字段结构**:
- `issueNo` (String): 发料单号
- `factoryId` (String): 加工厂ID
- `styleId` (String): 款号ID
- `color` (String): 颜色
- `issueWeight` (Number): 发料重量（kg）
- `issueDate` (Date): 发料日期
- `planId` (String): 关联生产计划单ID（可选）
- `status` (String): 状态（未回货/部分回货/已回货）
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `issueNo`: 唯一索引
- `factoryId`: 普通索引
- `issueDate`: 普通索引

### 6. 回货单表 (return_orders)

**集合名称**: `return_orders`

**字段结构**:
- `returnNo` (String): 回货单号
- `factoryId` (String): 加工厂ID
- `issueId` (String): 关联发料单ID
- `styleId` (String): 款号ID
- `returnQuantity` (Number): 回货数量（打）
- `returnPieces` (Number): 回货件数（自动计算）
- `actualYarnUsage` (Number): 实际用纱量（kg，自动计算）
- `returnDate` (Date): 回货日期
- `processingFee` (Number): 加工费（元，自动计算）
- `settlementStatus` (String): 结算状态（未结算/部分结算/已结算）
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `returnNo`: 唯一索引
- `factoryId`: 普通索引
- `issueId`: 普通索引
- `returnDate`: 普通索引

### 7. 加工费结算表 (settlements)

**集合名称**: `settlements`

**字段结构**:
- `settlementNo` (String): 结算单号
- `factoryId` (String): 加工厂ID
- `settlementDate` (Date): 结算日期
- `totalAmount` (Number): 结算总金额（元）
- `returnOrderIds` (Array): 关联的回货单ID列表
- `status` (String): 状态（待确认/已确认）
- `remark` (String): 备注
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `settlementNo`: 唯一索引
- `factoryId`: 普通索引

## 创建步骤

### 方法一：通过云开发控制台创建

1. 打开微信开发者工具
2. 点击顶部菜单栏的"云开发"
3. 进入"数据库"标签页
4. 点击"添加集合"按钮
5. 输入集合名称（如 `styles`）
6. 点击"确定"创建
7. 重复步骤4-6，创建所有7个集合

### 方法二：使用云函数初始化（推荐）

可以创建一个初始化云函数，自动创建所有集合和索引。详见 `cloudfunctions/initDatabase/` 目录。

## 权限设置

创建集合后，建议设置以下权限：

- **所有集合的读取权限**: 设置为"仅创建者可读"
- **所有集合的写入权限**: 设置为"仅创建者可写"
- **所有集合的更新权限**: 设置为"仅创建者可更新"
- **所有集合的删除权限**: 设置为"仅创建者可删除"

或者根据实际需求设置为"所有用户可读，仅创建者可写"。

## 测试数据（可选）

创建集合后，可以手动添加一些测试数据：

### 测试款号
```json
{
  "styleCode": "ST001",
  "styleName": "测试款号1",
  "yarnUsagePerPiece": 150,
  "availableColors": ["白色", "黑色"],
  "availableSizes": ["S", "M", "L"],
  "deleted": false
}
```

### 测试加工厂
```json
{
  "name": "测试加工厂",
  "contact": "张三",
  "phone": "13800138000",
  "defaultPrice": 10,
  "settlementMethod": "月结",
  "deleted": false
}
```

## 注意事项

1. 集合名称必须与代码中的名称完全一致（区分大小写）
2. 建议先创建集合，再运行小程序
3. 如果集合已存在但字段不匹配，可以删除重建或手动添加缺失字段
4. 索引创建后可以提高查询性能，但会占用一定存储空间







