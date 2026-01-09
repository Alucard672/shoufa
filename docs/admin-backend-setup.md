# 管理后台 Web 端接入指南

管理后台采用 Vue 3 + Element Plus 开发，通过微信云开发 Web SDK 直接连接云环境。

## 1. 核心依赖安装

在你的 Vue 项目中安装云开发 SDK：

```bash
npm install @cloudbase/js-sdk
```

## 2. 初始化连接

在 `src/utils/cloudbase.js` 中初始化：

```javascript
import cloudbase from '@cloudbase/js-sdk';

const app = cloudbase.init({
  env: 'cloud1-1gzk1uq14c3065cb' // 你的环境ID
});

export const auth = app.auth({ persistence: 'local' });
export const db = app.database();

export default app;
```

## 3. 登录逻辑示例

```javascript
import app from './cloudbase';

async function handleLogin(username, password) {
  try {
    const res = await app.callFunction({
      name: 'admin',
      data: {
        action: 'login',
        payload: { username, password }
      }
    });
    
    if (res.result.success) {
      // 保存登录态，跳转首页
      localStorage.setItem('admin_token', res.result.token);
      return true;
    } else {
      alert(res.result.msg);
      return false;
    }
  } catch (err) {
    console.error('登录异常', err);
  }
}
```

## 4. 常用管理操作调用

### 获取租户列表
```javascript
const res = await app.callFunction({
  name: 'tenants',
  data: {
    action: 'listTenantsAdmin',
    payload: {
      nameLike: '某企业',
      pageNum: 1,
      pageSize: 10
    }
  }
});
```

### 为租户续费/赠送时长
```javascript
const res = await app.callFunction({
  name: 'payment',
  data: {
    action: 'grantReward',
    tenantId: 'TARGET_TENANT_ID',
    days: 30,
    source: '后台手动赠送'
  }
});
```

## 5. 静态网站托管部署

1. 在云开发控制台开启“静态网站托管”。
2. 将 Vue 项目打包后的 `dist` 目录上传至托管环境。
3. 绑定你的自定义域名即可通过浏览器访问。
