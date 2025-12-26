#!/bin/bash

# 生产环境部署脚本

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
echo "║  ⚠️  警告：即将部署到生产环境！                           ║"
echo "║                                                            ║"
echo "║  此操作会影响到生产环境的所有用户。                        ║"
echo "║  请输入 \"yes\" 确认继续，输入其他任何内容将取消部署。    ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -n "请确认 (输入 yes 继续，其他任何内容将取消): "

# 读取用户输入
read -r user_input

# 检查用户输入是否为 "yes"
if [ "$user_input" != "yes" ]; then
    echo ""
    echo "❌ 已取消部署操作"
    exit 0
fi

echo ""
echo "✅ 已确认，开始部署到生产环境..."
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

# 切换小程序环境配置
if [ -f ./env-config.prod.js ]; then
    cp ./env-config.prod.js ./env-config.js
    echo "已切换小程序环境配置为生产环境"
else
    echo "警告: env-config.prod.js 不存在，跳过小程序环境配置切换"
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
    echo "正在部署所有函数到生产环境..."
    tcb fn deploy --force --all
else
    # 有参数，部署指定的函数
    echo "正在部署函数到生产环境: $@"
    tcb fn deploy --force "$@"
fi

# 检查部署结果
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 生产环境部署成功"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "📝 重要提醒："
    echo "   小程序前端代码已切换到生产环境配置"
    echo "   请在微信开发者工具中执行以下操作："
    echo "   1. 重新编译代码"
    echo "   2. 上传代码版本"
    echo "   3. 提交审核（如需要）"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
else
    echo ""
    echo "❌ 生产环境部署失败"
    exit 1
fi

