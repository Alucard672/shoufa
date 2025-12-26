# 代码提交指南

## 提交前检查清单

### ✅ 应该提交的文件

1. **环境配置文件（模板）**
   - `cloudbaserc.dev.json` - 测试环境配置模板
   - `cloudbaserc.prod.json` - 生产环境配置模板
   - `env-config.dev.js` - 测试环境客户端配置模板
   - `env-config.prod.js` - 生产环境客户端配置模板

2. **部署脚本**
   - `deploy-dev.sh` - 测试环境部署脚本
   - `deploy-prod.sh` - 生产环境部署脚本
   - `deploy-db-to-prod.sh` - 数据库同步脚本
   - `sync-db-to-dev.sh` - 测试环境数据库同步脚本
   - `sync-db-auto.js` - 自动数据库同步脚本
   - `sync-db-schema.js` - 数据库配置查看脚本

3. **项目配置**
   - `package.json` - 项目版本管理
   - `.gitignore` - Git 忽略规则

4. **源代码**
   - 所有修改的页面和组件代码
   - 云函数代码

### ❌ 不应该提交的文件

1. **动态生成的文件（已在 .gitignore 中）**
   - `cloudbaserc.json` - 当前环境配置（由部署脚本动态切换）
   - `env-config.js` - 当前客户端环境配置（由部署脚本动态生成）
   - `cloudbaserc.json.bak` - 配置文件备份
   - `.sync-db-params.json` - 数据库同步临时文件

2. **敏感信息**
   - `api_key_config.sh` - API 密钥配置（已在 .gitignore 中）

## 提交命令示例

```bash
# 1. 添加所有应该提交的文件（排除 .gitignore 中的文件）
git add .

# 2. 检查即将提交的文件
git status

# 3. 提交代码
git commit -m "feat: 添加环境切换和部署脚本，版本号 v1.0.0"

# 4. 推送到远程仓库
git push origin main
```

## 提交信息建议

使用清晰的提交信息，例如：
- `feat: 添加生产环境部署脚本`
- `feat: 添加版本号管理 (v1.0.0)`
- `feat: 添加数据库自动同步功能`
- `fix: 修复统计页面回货数据统计问题`
- `refactor: 重构账款管理页面`

