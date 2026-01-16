#!/bin/bash
# 清理云函数中不必要的 node_modules 文件
# 解决云函数代码包超过 2MB 的问题

echo "开始清理云函数 node_modules..."

# 需要清理的云函数列表
FUNCTIONS=("syncDatabaseSchema" "share" "payment" "auth")

for func in "${FUNCTIONS[@]}"; do
    echo ""
    echo "处理云函数: $func"
    
    cd "cloudfunctions/$func" || continue
    
    # 删除 node_modules 中的大型依赖
    if [ -d "node_modules" ]; then
        echo "  删除不必要的依赖..."
        rm -rf node_modules/typescript 2>/dev/null
        rm -rf node_modules/@types 2>/dev/null
        rm -rf node_modules/protobufjs/cli 2>/dev/null
        rm -rf node_modules/lodash 2>/dev/null
        rm -rf node_modules/@babel 2>/dev/null
        rm -rf node_modules/ts-node 2>/dev/null
        
        # 删除 bson 的浏览器版本（云函数不需要）
        find node_modules/bson -name "*.browser.*" -type f -delete 2>/dev/null
        find node_modules/bson -name "*.umd.*" -type f -delete 2>/dev/null
        
        # 删除 source-map 的调试文件
        find node_modules/source-map -name "*.debug.js" -type f -delete 2>/dev/null
        
        # 删除其他不必要的文件
        find node_modules -name "*.md" -type f -delete 2>/dev/null
        find node_modules -name "*.map" -type f -delete 2>/dev/null
        find node_modules -name "*.lock" -type f -delete 2>/dev/null
        find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null
        find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null
        find node_modules -name "*.test.js" -type f -delete 2>/dev/null
        find node_modules -name "*.spec.js" -type f -delete 2>/dev/null
        find node_modules -name "*.d.ts" -type f -delete 2>/dev/null
        find node_modules -name "CHANGELOG*" -type f -delete 2>/dev/null
        find node_modules -name "LICENSE*" -type f -delete 2>/dev/null
        find node_modules -name "README*" -type f -delete 2>/dev/null
        
        # 删除不必要的目录
        find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "doc" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "example" -exec rm -rf {} + 2>/dev/null
        
        echo "  清理完成"
    fi
    
    cd ../..
done

echo ""
echo "清理完成！"
echo ""
echo "建议："
echo "1. 重新部署云函数：tcb fn deploy --force <function-name>"
echo "2. 如果仍然超过 2MB，考虑删除整个 node_modules 并重新安装："
echo "   cd cloudfunctions/<function-name>"
echo "   rm -rf node_modules package-lock.json"
echo "   npm install --production"
