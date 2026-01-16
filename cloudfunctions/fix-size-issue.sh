#!/bin/bash
# 彻底解决云函数代码包超过 2MB 的问题
# 此脚本会：
# 1. 更新 cloudbaserc.json 确保包含 ignore 配置
# 2. 清理所有不必要的依赖
# 3. 检查云函数大小

echo "开始修复云函数代码包大小问题..."
echo ""

# 需要处理的云函数列表
FUNCTIONS=("syncDatabaseSchema" "share" "payment" "auth")

# 1. 确保 cloudbaserc.json 有 ignore 配置
echo "检查 cloudbaserc.json 配置..."
if ! grep -q '"ignore"' cloudbaserc.json 2>/dev/null; then
    echo "⚠️  cloudbaserc.json 缺少 ignore 配置，请手动更新或使用部署脚本"
    echo "   部署脚本会自动从 cloudbaserc.dev.json 或 cloudbaserc.prod.json 复制配置"
fi

# 2. 清理所有云函数
echo ""
echo "清理云函数 node_modules..."
for func in "${FUNCTIONS[@]}"; do
    echo "  处理: $func"
    cd "cloudfunctions/$func" || continue
    
    if [ -d "node_modules" ]; then
        # 删除大型不必要的依赖
        rm -rf node_modules/typescript 2>/dev/null
        rm -rf node_modules/@types 2>/dev/null
        rm -rf node_modules/protobufjs/cli 2>/dev/null
        rm -rf node_modules/lodash 2>/dev/null
        rm -rf node_modules/@babel 2>/dev/null
        rm -rf node_modules/ts-node 2>/dev/null
        
        # 删除 bson 的浏览器版本
        find node_modules/bson -name "*.browser.*" -type f -delete 2>/dev/null
        find node_modules/bson -name "*.umd.*" -type f -delete 2>/dev/null
        
        # 删除 source-map 的调试文件
        find node_modules/source-map -name "*.debug.js" -type f -delete 2>/dev/null
        
        # 删除其他不必要的文件
        find node_modules -name "*.md" -type f -delete 2>/dev/null
        find node_modules -name "*.map" -type f -delete 2>/dev/null
        find node_modules -name "*.lock" -type f -delete 2>/dev/null
        find node_modules -name "*.d.ts" -type f -delete 2>/dev/null
        find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null
        find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null
        find node_modules -name "*.test.js" -type f -delete 2>/dev/null
        find node_modules -name "*.spec.js" -type f -delete 2>/dev/null
        find node_modules -name "CHANGELOG*" -type f -delete 2>/dev/null
        find node_modules -name "LICENSE*" -type f -delete 2>/dev/null
        find node_modules -name "README*" -type f -delete 2>/dev/null
        find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "doc" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "example" -exec rm -rf {} + 2>/dev/null
    fi
    
    cd ../..
done

echo ""
echo "清理完成！"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📝 重要提示："
echo ""
echo "1. 本地 node_modules 大小可能仍然很大（这是正常的）"
echo "2. 上传时会根据 cloudbaserc.json 中的 ignore 配置排除文件"
echo "3. 实际上传的代码包大小会远小于本地大小"
echo ""
echo "下一步操作："
echo "1. 确保 cloudbaserc.json 包含 ignore 配置（已更新）"
echo "2. 使用微信开发者工具上传云函数"
echo "   - 或者使用部署脚本：./deploy-dev.sh 或 ./deploy-prod.sh"
echo "3. 如果仍然报错超过 2MB，请检查："
echo "   - cloudbaserc.json 是否正确（确保有 ignore 配置）"
echo "   - 是否使用了正确的部署脚本"
echo "═══════════════════════════════════════════════════════════"
echo ""
