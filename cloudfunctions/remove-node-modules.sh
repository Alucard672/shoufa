#!/bin/bash
# 删除云函数的 node_modules，使用云端安装依赖
# 这是解决云函数代码包超过 2MB 的最佳方案

echo "开始删除云函数 node_modules，使用云端安装依赖..."
echo ""
echo "⚠️  注意：删除后需要使用'云端安装依赖'方式上传云函数"
echo ""

# 需要处理的云函数列表
FUNCTIONS=("syncDatabaseSchema" "share" "payment" "auth")

for func in "${FUNCTIONS[@]}"; do
    echo "处理云函数: $func"
    
    cd "cloudfunctions/$func" || continue
    
    # 检查 package.json 是否存在
    if [ ! -f "package.json" ]; then
        echo "  ⚠️  警告: package.json 不存在，跳过"
        cd ../..
        continue
    fi
    
    # 删除 node_modules
    if [ -d "node_modules" ]; then
        echo "  删除 node_modules..."
        rm -rf node_modules
        echo "  ✅ 已删除"
    else
        echo "  ℹ️  node_modules 不存在，跳过"
    fi
    
    # 可选：删除 package-lock.json（云端会重新生成）
    if [ -f "package-lock.json" ]; then
        echo "  删除 package-lock.json（可选）..."
        rm -f package-lock.json
        echo "  ✅ 已删除"
    fi
    
    cd ../..
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ 删除完成！"
echo ""
echo "📝 下一步操作："
echo ""
echo "1. 在微信开发者工具中："
echo "   - 右键点击云函数目录"
echo "   - 选择 '上传并部署：云端安装依赖'"
echo "   - 或选择 '上传并部署：不上传 node_modules'"
echo ""
echo "2. 云端会自动根据 package.json 安装依赖"
echo ""
echo "3. 如果需要在本地调试，可以运行："
echo "   cd cloudfunctions/<function-name>"
echo "   npm install"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
