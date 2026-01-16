#!/bin/bash
# 重新安装云函数依赖（彻底清理方案）
# 解决云函数代码包超过 2MB 的问题

echo "开始重新安装云函数依赖..."

# 需要处理的云函数列表
FUNCTIONS=("syncDatabaseSchema" "share" "payment" "auth")

for func in "${FUNCTIONS[@]}"; do
    echo ""
    echo "处理云函数: $func"
    
    cd "cloudfunctions/$func" || continue
    
    # 1. 删除 node_modules 和 package-lock.json
    if [ -d "node_modules" ]; then
        echo "  删除 node_modules..."
        rm -rf node_modules
    fi
    
    if [ -f "package-lock.json" ]; then
        echo "  删除 package-lock.json..."
        rm -f package-lock.json
    fi
    
    # 2. 重新安装依赖（只安装生产依赖）
    echo "  重新安装依赖..."
    npm install --production --no-optional
    
    # 3. 删除不必要的文件
    echo "  清理不必要的文件..."
    if [ -d "node_modules" ]; then
        # 删除类型定义文件（运行时不需要）
        find node_modules -name "*.d.ts" -type f -delete 2>/dev/null
        
        # 删除文档和测试文件
        find node_modules -name "*.md" -type f -delete 2>/dev/null
        find node_modules -name "*.map" -type f -delete 2>/dev/null
        find node_modules -name "*.lock" -type f -delete 2>/dev/null
        find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null
        find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null
        find node_modules -name "*.test.js" -type f -delete 2>/dev/null
        find node_modules -name "*.spec.js" -type f -delete 2>/dev/null
        find node_modules -name "CHANGELOG*" -type f -delete 2>/dev/null
        find node_modules -name "LICENSE*" -type f -delete 2>/dev/null
        find node_modules -name "README*" -type f -delete 2>/dev/null
        
        # 删除文档目录
        find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "doc" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null
        find node_modules -type d -name "example" -exec rm -rf {} + 2>/dev/null
        
        # 删除 bson 的浏览器版本
        find node_modules/bson -name "*.browser.*" -type f -delete 2>/dev/null
        find node_modules/bson -name "*.umd.*" -type f -delete 2>/dev/null
        
        # 删除 source-map 的调试文件
        find node_modules/source-map -name "*.debug.js" -type f -delete 2>/dev/null
    fi
    
    # 4. 检查大小
    size=$(du -sh . 2>/dev/null | cut -f1)
    echo "  当前大小: $size"
    
    cd ../..
done

echo ""
echo "重新安装完成！"
echo ""
echo "下一步："
echo "1. 检查云函数大小是否 < 2MB"
echo "2. 如果仍然超过 2MB，可能需要考虑拆分云函数或使用云函数层"
echo "3. 重新部署云函数：tcb fn deploy --force <function-name>"
