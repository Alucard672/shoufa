# 分享奖励与订阅管理功能实施总结

## 已完成功能

### 1. 数据库结构

#### 新增集合
- **referrals** - 推荐记录集合
  - 记录分享者和被分享者的关系
  - 跟踪推荐状态和奖励发放情况
  
- **subscription_history** - 订阅历史集合
  - 记录所有订阅时长变更
  - 包括购买、推荐奖励、手动调整等

#### 租户表扩展字段
- `expireDate` - 过期日期（已有）
- `subscriptionDays` - 订阅总天数（累计值）
- `lastExpireDate` - 上次过期日期
- `referrerTenantId` - 推荐人租户ID
- `subscriptionStatus` - 订阅状态（'active' | 'expired' | 'trial'）

### 2. 分享功能

#### 云函数
- **`cloudfunctions/share/index.js`** - 分享相关功能
  - 生成分享码和分享链接
  - 创建推荐记录
  - 根据分享码查找推荐者

- **`cloudfunctions/share/grantReward.js`** - 奖励发放
  - 给推荐者累加180天使用时长
  - 记录订阅历史
  - 更新推荐记录状态

#### 页面改造
- **`pages/mine/invite.js`** 和 **`pages/mine/invite.wxml`**
  - 添加"客户分享"标签页（区别于"员工邀请"）
  - 生成客户分享二维码和链接
  - 显示分享奖励说明
  - 支持复制分享链接

### 3. 支付集成框架

#### 云函数
- **`cloudfunctions/payment/index.js`** - 支付处理
  - 创建支付订单（框架代码，待集成微信支付API）
  - 处理支付成功回调
  - 更新租户订阅信息
  - 检查推荐关系并发放奖励

- **`cloudfunctions/payment/grantReward.js`** - 订阅时长发放
  - 给租户累加订阅天数
  - 计算新的过期日期
  - 记录订阅历史

### 4. 订阅状态显示

#### 工具函数
- **`utils/subscription.js`** - 订阅管理工具
  - `calculateRemainingDays()` - 计算剩余天数
  - `getSubscriptionStatus()` - 获取订阅状态
  - `formatRemainingDays()` - 格式化剩余天数显示
  - `formatExpireDate()` - 格式化过期日期
  - `shouldShowReminder()` - 判断是否需要提醒
  - `getReminderMessage()` - 获取提醒消息
  - `getTenantSubscriptionStatus()` - 从租户信息获取订阅状态

#### UI显示
- **`pages/mine/index.wxml`** 和 **`pages/mine/index.js`**
  - 在用户信息卡片中显示订阅状态
  - 显示剩余天数和过期日期
  - 根据状态显示不同颜色（正常/警告/过期）

### 5. 到期提醒功能

#### 提醒逻辑
- 到期前30天开始提醒
- 到期前7天加强提醒（带警告图标）
- 使用防抖机制，每5分钟最多提醒一次

#### 提醒位置
- **登录时** - `pages/login/index.js`
  - 登录成功后检查订阅状态
  - 延迟2秒显示提醒（避免与登录成功提示冲突）

- **页面显示时** - `pages/mine/index.js`
  - `onShow()` 时检查订阅状态
  - 显示Toast提醒

### 6. 推荐关系记录

#### 租户注册流程
- **`cloudfunctions/tenants/saveTenant.js`**
  - 检查URL参数中的 `shareCode`
  - 创建推荐记录（状态为 `pending`）
  - 保存被分享者的 `referrerTenantId`

#### 应用启动
- **`app.js`**
  - 检查URL参数中的 `shareCode`
  - 保存到本地存储，供注册流程使用

## 使用流程

### 分享流程
1. 用户在"我的"页面点击"授权管理"
2. 切换到"客户分享"标签
3. 生成分享链接/二维码
4. 分享给潜在客户

### 注册流程
1. 客户点击分享链接进入小程序
2. 注册时系统自动记录推荐关系
3. 创建 `referrals` 记录（状态：`pending`）

### 支付流程
1. 客户完成支付
2. 支付回调触发 `payment` 云函数
3. 更新客户订阅（+180天）
4. 检查推荐关系
5. 给推荐者发放奖励（+180天）
6. 记录订阅历史

### 提醒流程
1. 用户登录或进入"我的"页面
2. 系统检查订阅状态
3. 如果剩余天数 <= 30天，显示Toast提醒
4. 使用防抖避免频繁提醒

## 待完善功能

### 1. 微信支付集成
- 当前 `cloudfunctions/payment/index.js` 仅提供框架代码
- 需要：
  - 配置微信支付商户号
  - 实现统一下单接口调用
  - 实现支付回调验证
  - 配置支付回调URL

### 2. 分享码映射表（可选优化）
- 当前使用简化的分享码生成方式
- 建议创建 `share_codes` 集合存储映射关系
- 提高分享码解析的准确性

### 3. 订阅详情页面（可选）
- 可以创建 `pages/mine/subscription.js` 页面
- 显示详细的订阅历史
- 显示推荐奖励记录

## 数据库初始化

运行以下命令初始化新集合：
```javascript
wx.cloud.callFunction({
  name: 'initDatabase',
  data: {
    collections: ['referrals', 'subscription_history']
  }
})
```

## 注意事项

1. **时区处理**：所有日期计算使用服务器时间（`db.serverDate()`）
2. **并发控制**：支付回调可能存在并发，建议使用事务
3. **防刷机制**：建议添加防刷逻辑（如同一租户不能重复推荐等）
4. **数据一致性**：确保订阅天数的累加逻辑正确
5. **用户体验**：提醒使用防抖机制，避免过于频繁

## 测试建议

1. 测试分享链接生成和解析
2. 测试推荐关系记录
3. 测试支付成功后奖励发放（可手动调用云函数模拟）
4. 测试剩余天数计算准确性
5. 测试到期提醒触发时机
6. 测试边界情况（已过期、刚好30天等）

