# 字典表初始化说明

## 概述

系统使用字典表来管理颜色和尺码数据，实现统一的数据管理。

## 需要创建的集合

### 1. 颜色字典表 (color_dict)

**集合名称**: `color_dict`

**字段结构**:
- `name` (String): 颜色名称（唯一）
- `code` (String): 颜色编码（可选）
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `name`: 唯一索引

**示例数据**:
```json
{
  "name": "白色",
  "code": "WHITE",
  "createTime": "2024-01-01T00:00:00.000Z",
  "updateTime": "2024-01-01T00:00:00.000Z",
  "deleted": false
}
```

### 2. 尺码字典表 (size_dict)

**集合名称**: `size_dict`

**字段结构**:
- `name` (String): 尺码名称（唯一）
- `code` (String): 尺码编码（可选）
- `order` (Number): 排序顺序（可选）
- `createTime` (Date): 创建时间
- `updateTime` (Date): 更新时间
- `deleted` (Boolean): 是否删除（默认 false）

**索引**:
- `name`: 唯一索引

**示例数据**:
```json
{
  "name": "S",
  "code": "S",
  "order": 1,
  "createTime": "2024-01-01T00:00:00.000Z",
  "updateTime": "2024-01-01T00:00:00.000Z",
  "deleted": false
}
```

## 初始化步骤

1. 在微信开发者工具的云开发控制台中创建 `color_dict` 和 `size_dict` 集合
2. 为 `name` 字段创建唯一索引
3. 可以手动添加一些常用的颜色和尺码数据

## 常用颜色示例

- 白色
- 黑色
- 灰色
- 红色
- 蓝色
- 绿色
- 黄色
- 粉色
- 紫色
- 棕色

## 常用尺码示例

- S
- M
- L
- XL
- XXL
- XXXL

## 注意事项

- 字典表数据一旦创建，建议不要轻易删除，使用 `deleted` 字段进行软删除
- 颜色和尺码名称应该保持唯一性
- 建议在创建款号时从字典表中选择，而不是手动输入

