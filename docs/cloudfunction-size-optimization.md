# 云函数代码包大小优化指南

## 问题描述

微信小程序云函数代码包大小限制为 **2MB**。如果超过此限制，部署时会报错：
```
Error: 系统错误，错误码：80051, source size XXX KB exceed max limit 2MB
```

## 问题原因

虽然 `package.json` 中只声明了 `wx-server-sdk`，但 `wx-server-sdk` 的依赖链中包含了以下大型依赖：

- `typescript` (~8.7MB) - TypeScript 编译器（运行时不需要）
- `lodash` (~532KB) - 工具库（wx-server-sdk 可能不需要完整版本）
- `@babel/parser` (~468KB) - Babel 解析器（运行时不需要）
- `protobufjs/cli` - Protobuf 命令行工具（运行时不需要）

这些依赖在云函数运行时并不需要，但会被默认安装，导致代码包超过 2MB 限制。

## 解决方案

### ✅ 方案一：使用 ignore 配置（推荐，已配置）

已在 `cloudbaserc.dev.json` 和 `cloudbaserc.prod.json` 中为大型云函数配置了 `ignore` 规则。**微信开发者工具和 tcb 命令行工具在上传云函数时会自动应用这些 ignore 规则**，排除不必要的文件。

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

**重要**：即使本地 `node_modules` 很大，上传时也会根据 `ignore` 配置排除文件，实际上传的代码包会小于 2MB。

### ✅ 方案二：使用清理脚本（可选）

已创建清理脚本 `cloudfunctions/cleanup-node-modules.sh`，可以清理本地不必要的依赖：

```bash
cd cloudfunctions
./cleanup-node-modules.sh
```

**注意**：清理脚本主要用于减少本地存储空间，不影响上传大小（因为 ignore 配置会排除这些文件）。

### 方案三：完全重新安装（如果方案一无效）

如果 ignore 配置没有生效，可以完全删除并重新安装：

```bash
cd cloudfunctions
./reinstall-dependencies.sh
```

或者手动操作：

```bash
cd cloudfunctions/<function-name>

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装（只安装生产依赖）
npm install --production --no-optional

# 检查大小
du -sh .
```

## 已优化的云函数

以下云函数已配置 ignore 规则和清理脚本：

- ✅ `syncDatabaseSchema` - 同步数据库结构
- ✅ `share` - 分享相关功能
- ✅ `payment` - 支付相关功能
- ✅ `auth` - 登录认证

## 检查云函数大小

```bash
# 检查所有云函数大小
for dir in cloudfunctions/*/; do
  if [ -d "$dir" ]; then
    size=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "$(basename "$dir"): $size"
  fi
done
```

## 部署前检查清单

1. ✅ 确认 `cloudbaserc.dev.json` 和 `cloudbaserc.prod.json` 中已配置 ignore 规则（已配置）
2. ✅ 使用微信开发者工具上传云函数（会自动应用 ignore 配置）
   - 或者使用命令行：`tcb fn deploy --force <function-name>`
3. ⚠️ 如果仍然报错超过 2MB：
   - 运行清理脚本：`./cloudfunctions/cleanup-node-modules.sh`
   - 或运行重新安装脚本：`./cloudfunctions/reinstall-dependencies.sh`
   - 然后重新部署

## 重要说明

**本地 node_modules 大小 ≠ 实际上传大小**

- 本地 `node_modules` 可能很大（13MB+），但这是正常的
- 微信小程序云函数上传时会根据 `ignore` 配置排除不必要的文件
- 实际上传的代码包大小会远小于本地大小（通常 < 2MB）
- 如果上传时仍然报错超过 2MB，说明 ignore 配置可能没有生效，需要：
  1. 检查 `cloudbaserc.json` 是否正确（确保使用的是正确的环境配置文件）
  2. 确认 ignore 配置格式正确
  3. 尝试使用清理脚本或重新安装脚本

## 注意事项

- 清理 `node_modules` 后，需要重新部署云函数
- 确保 `.gitignore` 中包含 `cloudfunctions/**/node_modules/`，避免提交到代码库
- 如果某个云函数必须使用大型依赖，考虑：
  1. 拆分云函数为多个小函数
  2. 使用云函数层（Layer）共享公共依赖
  3. 优化代码，减少依赖

## 相关文件

- `cloudfunctions/cleanup-node-modules.sh` - 清理脚本
- `cloudfunctions/README.md` - 云函数说明
- `cloudbaserc.dev.json` - 开发环境配置
- `cloudbaserc.prod.json` - 生产环境配置
