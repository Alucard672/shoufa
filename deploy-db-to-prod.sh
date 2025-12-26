#!/bin/bash

# 将测试环境的数据库集合和索引复制到生产环境
# 注意：微信云开发的 tcb db push 需要 database-schemas 目录，这里改用云函数方式

# 检查配置文件是否存在
if [ ! -f ./cloudbaserc.prod.json ]; then
    echo "错误: cloudbaserc.prod.json 配置文件不存在"
    exit 1
fi

# 检查 api_key_config.sh 是否存在
if [ ! -f ./api_key_config.sh ]; then
    echo "错误: api_key_config.sh 配置文件不存在"
    exit 1
fi

# 显示警告信息
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║  ⚠️  警告：即将在生产环境创建数据库集合和索引！          ║"
echo "║                                                            ║"
echo "║  此操作会在生产环境中创建集合和索引结构（不会复制数据）  ║"
echo "║  请输入 \"yes\" 确认继续，输入其他任何内容将取消操作。    ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -n "请确认 (输入 yes 继续，其他任何内容将取消): "

# 读取用户输入
read -r user_input

# 检查用户输入是否为 "yes"
if [ "$user_input" != "yes" ]; then
    echo ""
    echo "❌ 已取消操作"
    exit 0
fi

echo ""
echo "✅ 已确认，开始部署数据库结构到生产环境..."
echo ""

# 加载 API 密钥配置
source ./api_key_config.sh

# 备份当前的 cloudbaserc.json（如果存在）
if [ -f ./cloudbaserc.json ]; then
    cp ./cloudbaserc.json ./cloudbaserc.json.bak
    echo "已备份当前 cloudbaserc.json"
fi

# 复制生产环境配置到 cloudbaserc.json
cp ./cloudbaserc.prod.json ./cloudbaserc.json
echo "已切换到生产环境配置"
echo ""

# 登录到腾讯云
echo "正在登录到腾讯云..."
tcb login --apiKeyId ${TCB_API_KEY_ID} --apiKey ${TCB_API_KEY}

# 检查登录是否成功
if [ $? -ne 0 ]; then
    echo "登录失败，请检查 API 密钥配置"
    # 恢复备份的配置文件
    if [ -f ./cloudbaserc.json.bak ]; then
        mv ./cloudbaserc.json.bak ./cloudbaserc.json
        echo "已恢复原配置文件"
    fi
    exit 1
fi

# 自动同步数据库结构
echo ""
echo "正在自动同步数据库集合结构..."
echo ""

if [ -f "./sync-db-auto.js" ]; then
    node ./sync-db-auto.js prod
else
    echo "⚠️  未找到 sync-db-auto.js 脚本"
    echo ""
    echo "请使用以下方法手动创建："
    echo "  1. 运行: node sync-db-schema.js 查看配置信息"
    echo "  2. 在云开发控制台中手动创建集合和索引"
    echo ""
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "💡 提示："
echo "   cloudbaserc.prod.json 中的 database 配置包含了所有"
echo "   需要创建的集合和索引的详细配置信息"
echo "═══════════════════════════════════════════════════════════"
echo ""
