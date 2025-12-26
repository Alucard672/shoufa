#!/bin/bash

# 将数据库集合同步到测试环境

# 检查配置文件是否存在
if [ ! -f ./cloudbaserc.dev.json ]; then
    echo "错误: cloudbaserc.dev.json 配置文件不存在"
    exit 1
fi

# 检查 api_key_config.sh 是否存在
if [ ! -f ./api_key_config.sh ]; then
    echo "错误: api_key_config.sh 配置文件不存在"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "同步数据库集合到测试环境"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 加载 API 密钥配置
source ./api_key_config.sh

# 备份当前的 cloudbaserc.json（如果存在）
if [ -f ./cloudbaserc.json ]; then
    cp ./cloudbaserc.json ./cloudbaserc.json.bak
    echo "已备份当前 cloudbaserc.json"
fi

# 复制测试环境配置到 cloudbaserc.json
cp ./cloudbaserc.dev.json ./cloudbaserc.json
echo "已切换到测试环境配置"

# 切换小程序环境配置
cp ./env-config.dev.js ./env-config.js
echo "已切换小程序环境配置为测试环境"
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
if [ -f "./sync-db-auto.js" ]; then
    echo ""
    echo "正在自动同步数据库集合结构..."
    node ./sync-db-auto.js dev
else
    echo ""
    echo "⚠️  未找到 sync-db-auto.js 脚本"
    echo ""
    echo "请使用以下方法手动创建集合："
    echo "  1. 运行: node sync-db-schema.js 查看配置信息"
    echo "  2. 在云开发控制台中手动创建集合"
    echo ""
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📝 重要提醒："
echo "   请在微信开发者工具中重新编译代码，使环境配置生效"
echo "═══════════════════════════════════════════════════════════"
echo ""

