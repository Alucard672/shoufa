# 云函数说明

## 云函数代码包大小限制

微信小程序云函数代码包大小限制为 **2MB**。如果超过此限制，部署时会报错：
```
Error: 系统错误，错误码：80051, source size XXX KB exceed max limit 2MB
```

## ✅ 最佳解决方案：使用云端安装依赖（强烈推荐）

**不要上传 node_modules**，让云端自动安装依赖。这是最可靠、最有效的解决方案。

### 操作步骤

1. **删除本地 node_modules**（已提供脚本）：
   ```bash
   cd cloudfunctions
   ./remove-node-modules.sh
   ```

2. **在微信开发者工具中上传**：
   - 右键点击云函数目录（如 `syncDatabaseSchema`）
   - 选择 **"上传并部署：云端安装依赖"** 或 **"上传并部署：不上传 node_modules"**
   - 这样只会上传代码和 `package.json`，依赖会在云端自动安装

### 为什么这样可以解决问题？

- **不上传 node_modules**：本地 node_modules 可能有 50MB+，但不上传就不会超过 2MB 限制
- **云端自动安装**：腾讯云会在云端根据 `package.json` 自动安装依赖
- **只上传代码**：实际上传的只有代码文件（通常几 KB）和 `package.json`

### 前提条件

✅ 所有云函数的 `package.json` 已正确配置依赖：
- `syncDatabaseSchema` ✅
- `share` ✅
- `payment` ✅
- `auth` ✅

## 其他解决方案（备选）

### 方法二：使用 ignore 配置（已配置，但可能不生效）

已在 `cloudbaserc.dev.json` 和 `cloudbaserc.prod.json` 中为以下云函数配置了 `ignore` 规则：
- `syncDatabaseSchema`
- `share`
- `payment`
- `auth`

**注意**：某些情况下 ignore 配置可能不生效，优先使用"云端安装依赖"方案。

### 方法三：使用清理脚本（可选）

如果必须上传 node_modules，可以运行清理脚本：

```bash
cd cloudfunctions
./cleanup-node-modules.sh
```

对于超过 2MB 的云函数，执行以下步骤：

```bash
# 1. 进入云函数目录
cd cloudfunctions/<function-name>

# 2. 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 3. 重新安装依赖（只安装生产依赖）
npm install --production

# 4. 手动删除大型依赖（如果仍然超过 2MB）
rm -rf node_modules/typescript
rm -rf node_modules/@types
rm -rf node_modules/protobufjs/cli
rm -rf node_modules/lodash
rm -rf node_modules/@babel
rm -rf node_modules/ts-node

# 5. 删除测试文件和文档
find node_modules -name "*.md" -type f -delete
find node_modules -name "*.map" -type f -delete
find node_modules -name "test" -type d -exec rm -rf {} +
find node_modules -name "tests" -type d -exec rm -rf {} +
```

### 方法三：使用 ignore 配置

在 `cloudbaserc.dev.json` 和 `cloudbaserc.prod.json` 中，已经为大型云函数配置了 `ignore` 规则，会自动排除不必要的文件。

## 常见问题

### 为什么 node_modules 这么大？

`wx-server-sdk` 的依赖链中包含了 `typescript`、`lodash` 等大型依赖包。这些依赖在云函数运行时并不需要，但会被默认安装。

### 如何检查云函数大小？

```bash
# 检查单个云函数的大小
du -sh cloudfunctions/<function-name>

# 检查所有云函数的大小
for dir in cloudfunctions/*/; do
  if [ -d "$dir" ]; then
    size=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "$(basename "$dir"): $size"
  fi
done
```

### 上传时仍然报错超过 2MB？

如果上传时仍然报错超过 2MB，可能是 ignore 配置没有生效：

1. **检查 cloudbaserc.json 是否正确**：
   - 确保使用的是正确的环境配置文件（`cloudbaserc.dev.json` 或 `cloudbaserc.prod.json`）
   - 确保配置文件中有对应云函数的 `ignore` 配置

2. **运行重新安装脚本**：
   ```bash
   cd cloudfunctions
   ./reinstall-dependencies.sh
   ```

3. **手动清理并重新安装**：
   ```bash
   cd cloudfunctions/<function-name>
   rm -rf node_modules package-lock.json
   npm install --production --no-optional
   ```

4. **如果仍然超过 2MB，考虑**：
   - 拆分云函数为多个小函数
   - 使用云函数层（Layer）共享公共依赖
   - 优化代码，减少依赖

## 注意事项

- 清理 `node_modules` 后，需要重新部署云函数
- 确保 `.gitignore` 中包含 `cloudfunctions/**/node_modules/`，避免提交到代码库
- 定期检查云函数大小，避免意外超过限制
