# 云函数上传指南 - 解决 2MB 限制问题

## 问题

云函数代码包超过 2MB 限制，报错：
```
Error: 系统错误，错误码：80051, source size XXX KB exceed max limit 2MB
```

## ✅ 解决方案：使用云端安装依赖（推荐）

### 步骤一：删除本地 node_modules

运行脚本删除 node_modules：

```bash
cd cloudfunctions
./remove-node-modules.sh
```

或者手动删除：

```bash
cd cloudfunctions/syncDatabaseSchema
rm -rf node_modules package-lock.json
```

### 步骤二：在微信开发者工具中上传

1. **打开微信开发者工具**
2. **找到云函数目录**（如 `cloudfunctions/syncDatabaseSchema`）
3. **右键点击云函数目录**
4. **选择上传方式**：
   - ✅ **"上传并部署：云端安装依赖"**（推荐）
   - ✅ **"上传并部署：不上传 node_modules"**
   - ❌ **不要选择** "上传并部署：全部文件"（会上传 node_modules）

### 步骤三：等待云端安装依赖

- 云端会自动根据 `package.json` 安装依赖
- 首次部署可能需要一些时间（1-2 分钟）
- 部署完成后，云函数就可以正常使用了

## 为什么这样可以解决问题？

### 问题根源

- 本地 `node_modules` 包含大量依赖（50MB+）
- `wx-server-sdk` 的依赖链包含大型包（typescript、lodash 等）
- 即使配置了 ignore，某些情况下可能不生效

### 解决方案优势

- ✅ **不上传 node_modules**：只上传代码和 `package.json`（通常 < 100KB）
- ✅ **云端自动安装**：腾讯云根据 `package.json` 自动安装依赖
- ✅ **100% 可靠**：不依赖 ignore 配置，直接避免问题
- ✅ **不影响功能**：云端安装的依赖与本地完全相同

## 本地调试

如果需要本地调试，可以重新安装依赖：

```bash
cd cloudfunctions/syncDatabaseSchema
npm install
```

**注意**：本地调试后，上传时仍然要使用"云端安装依赖"方式。

## 验证部署

部署成功后，可以在云开发控制台查看：
1. 云函数列表
2. 云函数详情
3. 日志（查看是否有依赖安装错误）

## 常见问题

### Q: 删除 node_modules 后，本地无法调试？

A: 可以临时重新安装：
```bash
cd cloudfunctions/<function-name>
npm install
```
调试完成后，上传时使用"云端安装依赖"即可。

### Q: 云端安装依赖失败？

A: 检查：
1. `package.json` 是否正确
2. 依赖版本是否有效
3. 查看云函数日志中的错误信息

### Q: 是否所有云函数都需要这样做？

A: 只有超过 2MB 的云函数需要。当前需要处理的云函数：
- `syncDatabaseSchema`
- `share`
- `payment`
- `auth`

其他小型云函数可以正常上传。

## 相关文件

- `cloudfunctions/remove-node-modules.sh` - 删除 node_modules 脚本
- `cloudfunctions/使用云端安装依赖.md` - 详细说明
- `cloudfunctions/README.md` - 云函数说明
