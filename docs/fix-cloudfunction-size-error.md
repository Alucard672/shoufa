# 修复云函数代码包超过 2MB 错误

## 错误信息

```
Error: 系统错误，错误码：80051, source size XXX KB exceed max limit 2MB
```

## 问题原因

1. **当前 `cloudbaserc.json` 缺少 ignore 配置**：虽然 `cloudbaserc.dev.json` 和 `cloudbaserc.prod.json` 有配置，但实际使用的 `cloudbaserc.json` 可能没有同步更新
2. **本地 node_modules 包含大型依赖**：`wx-server-sdk` 的依赖链包含 typescript、lodash 等大型包

## ✅ 已完成的修复

1. **更新了 `cloudbaserc.json`**：为以下云函数添加了 `ignore` 配置
   - `syncDatabaseSchema`
   - `share`
   - `payment`
   - `auth`

2. **创建了修复脚本**：`cloudfunctions/fix-size-issue.sh`

## 解决方案

### 方案一：使用修复脚本（推荐）

```bash
cd /Users/alucard/Documents/codes/shoufa
./cloudfunctions/fix-size-issue.sh
```

### 方案二：使用部署脚本（推荐）

部署脚本会自动从模板文件复制正确的配置：

```bash
# 测试环境
./deploy-dev.sh

# 生产环境
./deploy-prod.sh
```

### 方案三：手动更新 cloudbaserc.json

如果直接使用微信开发者工具上传，确保 `cloudbaserc.json` 包含 ignore 配置：

```json
{
  "name": "syncDatabaseSchema",
  "installDependency": true,
  "ignore": [
    "node_modules/typescript/**",
    "node_modules/@types/**",
    "node_modules/protobufjs/cli/**",
    "node_modules/lodash/**",
    "node_modules/@babel/**",
    "node_modules/ts-node/**",
    "**/*.md",
    "**/*.map",
    "**/test/**",
    "**/tests/**",
    "**/*.test.js",
    "**/*.spec.js"
  ]
}
```

## 重要说明

### ⚠️ 本地大小 ≠ 上传大小

- **本地 `node_modules` 可能很大（50MB+）**，但这是正常的
- **上传时会根据 `ignore` 配置排除文件**
- **实际上传的代码包大小会远小于本地大小（通常 < 2MB）**

### ✅ 验证配置

检查 `cloudbaserc.json` 是否包含 ignore 配置：

```bash
grep -A 10 '"name": "syncDatabaseSchema"' cloudbaserc.json
```

如果看到 `"ignore": [...]`，说明配置正确。

### 🔧 如果仍然报错

1. **确认使用了正确的配置文件**：
   - 使用部署脚本会自动切换配置
   - 手动上传时确保 `cloudbaserc.json` 有 ignore 配置

2. **检查微信开发者工具设置**：
   - 确保使用的是最新的 `cloudbaserc.json`
   - 尝试重新编译项目

3. **运行修复脚本**：
   ```bash
   ./cloudfunctions/fix-size-issue.sh
   ```

## 相关文件

- `cloudbaserc.json` - 当前使用的配置文件（已更新）
- `cloudbaserc.dev.json` - 测试环境配置模板（已包含 ignore）
- `cloudbaserc.prod.json` - 生产环境配置模板（已包含 ignore）
- `cloudfunctions/fix-size-issue.sh` - 修复脚本
- `cloudfunctions/cleanup-node-modules.sh` - 清理脚本

## 预防措施

1. **始终使用部署脚本**：`deploy-dev.sh` 或 `deploy-prod.sh` 会自动同步配置
2. **不要直接修改 `cloudbaserc.json`**：应该修改模板文件（`.dev.json` 或 `.prod.json`）
3. **定期检查配置**：确保 ignore 配置在所有配置文件中保持一致
