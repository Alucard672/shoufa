# 纱线收发加工小程序

## 项目简介

基于微信小程序和云开发技术栈，实现纱线收发加工管理的完整业务流程，包括款号管理、加工厂管理、发料、回货、统计等核心功能。

## 技术栈

- **前端框架**: 微信小程序原生开发
- **后端服务**: 微信云开发（云数据库、云函数）
- **UI设计**: 参考Figma设计稿

## 项目结构

```
shoufa/
├── app.js                 # 小程序入口文件
├── app.json              # 全局配置
├── app.wxss              # 全局样式
├── pages/                # 页面目录
│   ├── index/           # 首页
│   ├── issue/           # 发料页面
│   ├── return/          # 回货页面
│   ├── factory/         # 加工厂页面
│   └── statistics/      # 统计页面
├── components/          # 公共组件
│   ├── card/            # 卡片组件
│   ├── badge/           # 徽章组件
│   ├── search-box/      # 搜索框组件
│   └── filter-tabs/     # 筛选标签组件
├── utils/               # 工具函数
│   ├── db.js           # 数据库操作
│   └── calc.js         # 计算函数
├── cloudfunctions/      # 云函数
│   ├── createIssueOrder/    # 创建发料单
│   └── createReturnOrder/   # 创建回货单
└── database/            # 数据库设计文档
    └── README.md
```

## 功能模块

### 1. 首页
- 数据总览：合作工厂数、款号数量、未结账款总额
- 快速操作：纱线发料、登记回货
- 最近动态：显示最近发料记录

### 2. 发料管理
- 发料单列表：显示所有发料记录
- 筛选功能：时间筛选、状态筛选
- 搜索功能：按发料单号或工厂名称搜索
- 新建发料：创建新的发料单
- 回货进度：显示每个发料单的回货情况

### 3. 回货管理
- 回货单列表：显示所有回货记录
- 搜索功能：按回货单号搜索
- 登记回货：创建新的回货单，自动计算件数、用纱量、加工费
- 结算状态：显示未结算、部分结算、已结算状态

### 4. 加工厂管理
- 工厂列表：显示所有合作工厂
- 工厂详情：查看工厂的详细信息及历史记录
- 统计数据：累计发料、累计用纱、未结账款

### 5. 统计报表
- 交货表统计：发料与回货对照表
- 筛选功能：时间筛选、状态筛选
- 详细数据：显示发料日期/重量、回货日期/重量/数量、剩余待回

## 核心业务规则

1. **单位换算**：
   - 1打 = 12件（固定）
   - 单件用量以"克"为单位
   - 所有重量统一使用"公斤(kg)"

2. **自动计算**：
   - 计划用纱量 = 计划件数 × 单件用量（克） ÷ 1000
   - 回货件数 = 回货打数 × 12
   - 实际用纱量 = 回货件数 × 单件用量（克） ÷ 1000
   - 加工费 = 回货打数 × 加工单价（元/打）
   - 剩余纱线 = 累计发料重量 - 累计实际用纱量

3. **状态管理**：
   - 发料单状态：未回货、部分回货、已回货
   - 结算状态：未结算、部分结算、已结算

## 数据库设计

详见 `database/README.md`

主要数据集合：
- styles（款号表）
- factories（加工厂表）
- yarn_inventory（纱线库存表）
- production_plans（生产计划单表）
- issue_orders（发料单表）
- return_orders（回货单表）
- settlements（加工费结算表）

## 云函数

### createIssueOrder
创建发料单，支持事务操作，可扩展库存扣减逻辑。

### createReturnOrder
创建回货单，自动更新发料单状态，支持事务操作。

## 开发说明

### 环境配置

1. 在微信开发者工具中打开项目
2. 在 `app.js` 中配置云开发环境ID（已配置：`cloud1-3g9cra4h71f647dd`）
3. 在 `project.config.json` 中配置小程序AppID（已配置：`wx2e15114dc347c832`）

### 数据库初始化（重要！）

**如果遇到 `database collection not exists` 错误，需要先初始化数据库：**

#### 方法一：手动创建（推荐首次使用）

1. 打开微信开发者工具
2. 点击顶部菜单栏的"云开发"
3. 进入"数据库"标签页
4. 按照 `database/init.md` 中的说明，逐个创建以下7个集合：
   - `styles` (款号表)
   - `factories` (加工厂表)
   - `yarn_inventory` (纱线库存表)
   - `production_plans` (生产计划单表)
   - `issue_orders` (发料单表)
   - `return_orders` (回货单表)
   - `settlements` (加工费结算表)

详细字段结构请参考 `database/README.md` 和 `database/init.md`

#### 方法二：使用云函数初始化

1. 右键点击 `cloudfunctions/initDatabase` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 在小程序中调用该云函数：
   ```javascript
   wx.cloud.callFunction({
     name: 'initDatabase',
     success: res => {
       console.log('数据库初始化结果:', res.result)
     }
   })
   ```

### 部署云函数

1. 右键点击 `cloudfunctions/createIssueOrder` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 对 `createReturnOrder` 执行相同操作
4. （可选）部署 `initDatabase` 云函数用于数据库初始化

### 图标资源

需要在 `images/tab/` 目录下放置以下图标：
- home.png / home-active.png
- issue.png / issue-active.png
- return.png / return-active.png
- factory.png / factory-active.png
- statistics.png / statistics-active.png

## 注意事项

1. 所有用纱量必须由系统自动计算，不允许人工填写
2. 关键数据使用软删除机制（deleted字段）
3. 发料单和回货单支持多次回货
4. 发料单状态根据回货情况自动更新

## 后续扩展

- 款号管理页面
- 纱线库存管理页面
- 生产计划单管理
- 加工费结算功能
- 数据导出功能
- 多租户支持

