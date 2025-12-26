#!/bin/bash

# 测试环境部署脚本

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
if [ -f ./env-config.dev.js ]; then
    cp ./env-config.dev.js ./env-config.js
    echo "已切换小程序环境配置为测试环境"
else
    echo "警告: env-config.dev.js 不存在，跳过小程序环境配置切换"
fi

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

# 检查是否传入了参数
if [ $# -eq 0 ] || [ "$1" == "--all" ]; then
    # 没有参数或参数是 --all，部署所有函数
    echo "正在部署所有函数到测试环境..."
    tcb fn deploy --force --all
else
    # 有参数，部署指定的函数
    echo "正在部署函数到测试环境: $@"
    tcb fn deploy --force "$@"
fi

# 检查部署结果
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 测试环境部署成功"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "📝 重要提醒："
    echo "   小程序前端代码已切换到测试环境配置"
    echo "   请在微信开发者工具中重新编译代码，使配置生效"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
else
    echo "❌ 测试环境部署失败"
    exit 1
fi

