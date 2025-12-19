# 云数据库设计文档

## 数据库集合说明

### 1. 款号表 (styles)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| styleCode | String | 款号编号（唯一） | 是 |
| styleName | String | 款号名称 | 是 |
| imageUrl | String | 款式图片URL（云存储文件ID） | 否 |
| category | String | 类别（如：针织类、卫衣类等） | 否 |
| yarnUsagePerPiece | Number | 单件纱线用量（克） | 是 |
| lossRate | Number | 损耗率（%） | 否 |
| actualUsage | Number | 实际用量（含损耗，kg） | 否 |
| availableColors | Array | 可选颜色列表（字符串数组） | 否 |
| availableSizes | Array | 可选尺码列表（字符串数组） | 否 |
| yarnIds | Array | 关联的纱线ID列表 | 否 |
| remark | String | 备注 | 否 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |
| deleted | Boolean | 软删除标记 | 否 |

**索引：**
- styleCode: 唯一索引
- **推荐添加复合索引**（提升查询性能）：
  - deleted + createTime（用于列表查询）

### 2. 加工厂表 (factories)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| name | String | 加工厂名称 | 是 |
| contact | String | 联系人 | 否 |
| phone | String | 联系方式 | 否 |
| defaultPrice | Number | 默认加工单价（元/打） | 是 |
| settlementMethod | String | 结算方式（次结/月结） | 是 |
| remark | String | 备注 | 否 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |
| deleted | Boolean | 软删除标记 | 否 |

**索引：**
- name: 普通索引
- **推荐添加索引**（提升查询性能）：
  - deleted（用于过滤已删除记录）

### 3. 纱线库存表 (yarn_inventory)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| yarnName | String | 纱线名称/批次 | 是 |
| color | String | 颜色 | 否 |
| currentStock | Number | 当前库存数量（kg） | 是 |
| remark | String | 备注 | 否 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |

**索引：**
- yarnName: 普通索引
- **推荐添加复合索引**（提升查询性能）：
  - deleted + createTime（用于列表查询）

### 4. 生产计划单表 (production_plans)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| planNo | String | 计划单号 | 是 |
| styleId | String | 款号ID | 是 |
| color | String | 颜色 | 是 |
| size | String | 尺码 | 是 |
| planQuantity | Number | 计划数量（件） | 是 |
| factoryId | String | 计划加工厂ID | 是 |
| planDate | Date | 计划日期 | 是 |
| planYarnUsage | Number | 计划用纱量（kg） | 是 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |

**索引：**
- planNo: 唯一索引
- styleId: 普通索引
- factoryId: 普通索引

### 5. 发料单表 (issue_orders)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| issueNo | String | 发料单号 | 是 |
| factoryId | String | 加工厂ID | 是 |
| styleId | String | 款号ID | 是 |
| color | String | 颜色 | 是 |
| issueWeight | Number | 发料重量（kg） | 是 |
| issueDate | Date | 发料日期 | 是 |
| planId | String | 关联生产计划单ID | 否 |
| status | String | 状态（未回货/部分回货/已回货） | 是 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |
| deleted | Boolean | 软删除标记 | 否 |

**索引：**
- issueNo: 唯一索引
- factoryId: 普通索引
- styleId: 普通索引
- issueDate: 普通索引
- **推荐添加复合索引**（提升查询性能）：
  - deleted + issueDate（用于列表查询）
  - factoryId + deleted + issueDate（用于加工厂详情页）
  - deleted + status（用于状态筛选）

### 6. 回货单表 (return_orders)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| returnNo | String | 回货单号 | 是 |
| factoryId | String | 加工厂ID | 是 |
| issueId | String | 发料单ID | 是 |
| styleId | String | 款号ID | 是 |
| returnQuantity | Number | 回货数量（打） | 是 |
| returnPieces | Number | 回货件数（自动计算） | 是 |
| actualYarnUsage | Number | 实际用纱量（kg，自动计算） | 是 |
| returnDate | Date | 回货日期 | 是 |
| processingFee | Number | 加工费（自动计算） | 是 |
| settlementStatus | String | 结算状态（未结算/部分结算/已结算） | 是 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |
| deleted | Boolean | 软删除标记 | 否 |

**索引：**
- returnNo: 唯一索引
- factoryId: 普通索引
- issueId: 普通索引
- returnDate: 普通索引
- **推荐添加复合索引**（提升查询性能）：
  - deleted + returnDate（用于列表查询）
  - factoryId + deleted + returnDate（用于加工厂详情页）
  - issueId + deleted（用于根据发料单查询回货单）

### 7. 颜色字典表 (color_dict)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| name | String | 颜色名称 | 是 |
| code | String | 颜色编码（可选） | 否 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |

**索引：**
- **推荐添加索引**（提升查询性能）：
  - createTime（用于列表查询，按创建时间倒序）

### 8. 尺码字典表 (size_dict)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| name | String | 尺码名称 | 是 |
| code | String | 尺码编码（可选） | 否 |
| order | Number | 排序序号 | 否 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |

**索引：**
- **推荐添加复合索引**（提升查询性能）：
  - order + createTime（用于列表查询，先按排序字段，再按创建时间）

### 9. 加工费结算表 (settlements)

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| _id | String | 系统自动生成 | 是 |
| settlementNo | String | 结算单号 | 是 |
| factoryId | String | 加工厂ID | 是 |
| settlementDate | Date | 结算日期 | 是 |
| settlementAmount | Number | 结算金额 | 是 |
| status | String | 结算状态 | 是 |
| returnOrderIds | Array | 关联的回货单ID列表 | 是 |
| createTime | Date | 创建时间 | 是 |
| updateTime | Date | 更新时间 | 是 |

**索引：**
- settlementNo: 唯一索引
- factoryId: 普通索引
- settlementDate: 普通索引

## 数据库初始化说明

1. 在微信开发者工具中打开云开发控制台
2. 进入数据库管理
3. 按照上述设计创建各个集合
4. 为每个集合创建相应的索引
5. 设置数据库权限（建议：仅创建者可读写，其他用户只读）

## 索引优化说明

⚠️ **重要提示**: 当前代码中存在全表扫描查询，建议创建相应的索引以提升查询性能。

详细的索引优化指南请参考：[索引优化文档](./index_optimization.md)

### 快速索引创建清单

**高优先级（立即创建）：**

1. **issue_orders** 集合：
   - 复合索引：`deleted` (asc) + `issueDate` (desc)
   - 复合索引：`factoryId` (asc) + `deleted` (asc) + `issueDate` (desc)

2. **return_orders** 集合：
   - 复合索引：`deleted` (asc) + `returnDate` (desc)
   - 复合索引：`factoryId` (asc) + `deleted` (asc) + `returnDate` (desc)

**中优先级（尽快创建）：**

3. **yarn_inventory** 集合：`deleted` (asc) + `createTime` (desc)
4. **styles** 集合：`deleted` (asc) + `createTime` (desc)
5. **factories** 集合：`deleted` (asc)
6. **size_dict** 集合：`order` (asc) + `createTime` (desc)
7. **color_dict** 集合：`createTime` (desc)

### 索引创建步骤

1. 打开云开发控制台 -> 数据库
2. 选择对应的集合
3. 点击"索引管理"标签
4. 点击"添加索引"
5. 输入索引字段和排序方式
6. 点击"确定"创建

**注意**: 创建索引后，查询性能会显著提升，但会占用少量存储空间。

## 数据关联关系

- 发料单 (issue_orders) -> 加工厂 (factories) [factoryId]
- 发料单 (issue_orders) -> 款号 (styles) [styleId]
- 发料单 (issue_orders) -> 生产计划单 (production_plans) [planId] (可选)
- 回货单 (return_orders) -> 发料单 (issue_orders) [issueId]
- 回货单 (return_orders) -> 加工厂 (factories) [factoryId]
- 回货单 (return_orders) -> 款号 (styles) [styleId]
- 结算单 (settlements) -> 加工厂 (factories) [factoryId]
- 结算单 (settlements) -> 回货单 (return_orders) [returnOrderIds]




