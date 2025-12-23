#!/bin/bash

if [ -f ./api_key_config.sh ]; then
    source ./api_key_config.sh
else
    echo "api_key_config.sh not found"
    exit 1
fi

echo "Logging in to Tencent Cloud..."
tcb login --apiKeyId ${TCB_API_KEY_ID} --apiKey ${TCB_API_KEY}

# 检查是否传入了参数
if [ $# -eq 0 ] || [ "$1" == "--all" ]; then
    # 没有参数或参数是 --all，部署所有函数
    echo "Deploying all functions..."
    tcb fn deploy --force --all
else
    # 有参数，部署指定的函数
    echo "Deploying functions: $@"
    tcb fn deploy --force "$@"
fi