# 部署分享和支付云函数说明

## 新增云函数

本次新增了两个云函数：
1. **share** - 分享相关功能（生成分享码、创建推荐记录等）
2. **payment** - 支付相关功能（创建订单、处理支付回调、发放奖励等）

## 部署步骤

### 方法一：使用部署脚本（推荐）

#### 部署到测试环境
```bash
# 部署所有新函数
./deploy-dev.sh share payment

# 或部署所有函数
./deploy-dev.sh --all
```

#### 部署到生产环境
```bash
# 部署所有新函数
./deploy-prod.sh share payment

# 或部署所有函数
./deploy-prod.sh --all
```

### 方法二：使用微信开发者工具

1. 打开微信开发者工具
2. 在左侧文件树中，找到 `cloudfunctions` 目录
3. 右键点击 `share` 文件夹，选择"上传并部署：云端安装依赖"
4. 右键点击 `payment` 文件夹，选择"上传并部署：云端安装依赖"

### 方法三：使用命令行工具

确保已安装并登录 `tcb-cli`：

```bash
# 登录腾讯云（如果未登录）
tcb login

# 部署 share 云函数
cd cloudfunctions/share
npm install
cd ../..
tcb fn deploy share

# 部署 payment 云函数
cd cloudfunctions/payment
npm install
cd ../..
tcb fn deploy payment
```

## 配置说明

### share 云函数
- **功能**：分享链接生成、推荐记录管理、奖励发放
- **权限**：需要数据库读写权限
- **依赖**：wx-server-sdk

### payment 云函数
- **功能**：支付订单管理、支付回调处理、订阅时长发放
- **权限**：需要数据库读写权限、微信支付 API 权限（待配置）
- **依赖**：wx-server-sdk

## 注意事项

1. **数据库集合**：确保以下集合已创建
   - `referrals` - 推荐记录
   - `subscription_history` - 订阅历史
   - `payment_orders` - 支付订单（如果使用支付功能）

2. **初始化数据库**：如果集合不存在，可以运行：
   ```javascript
   wx.cloud.callFunction({
     name: 'initDatabase',
     data: {
       collections: ['referrals', 'subscription_history', 'payment_orders']
     }
   })
   ```

3. **微信支付配置**：
   - `payment` 云函数中的微信支付 API 调用部分需要配置商户号和密钥
   - 需要在微信支付商户平台配置支付回调 URL
   - 具体配置步骤请参考微信支付官方文档

4. **权限设置**：
   - 确保云函数的数据库权限配置正确
   - 新集合的权限规则需要单独配置

## 验证部署

部署完成后，可以在小程序中测试：

1. **分享功能**：
   - 进入"我的" -> "授权管理"
   - 切换到"客户分享"标签
   - 生成分享链接和二维码

2. **订阅功能**：
   - 检查订阅状态显示
   - 测试过期提醒（如果账号已过期）

3. **支付功能**（待微信支付配置完成后）：
   - 测试创建支付订单
   - 测试支付回调处理

## 故障排查

如果部署失败，请检查：
1. API 密钥配置是否正确（`api_key_config.sh`）
2. 云开发环境 ID 是否正确
3. 网络连接是否正常
4. 云函数代码是否有语法错误

