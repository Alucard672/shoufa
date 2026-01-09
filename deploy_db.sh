#!/bin/bash

if [ -f ./api_key_config.sh ]; then
    source ./api_key_config.sh
else
    echo "api_key_config.sh not found"
    exit 1
fi

echo "Logging in to Tencent Cloud..."
tcb login --apiKeyId ${TCB_API_KEY_ID} --apiKey ${TCB_API_KEY}

# 优先使用 framework deploy 同步 database（支持 cloudbaserc.json 中的 database 配置：集合/索引/权限标签）
echo "Deploying database schema via CloudBase Framework..."
if tcb framework deploy --mode local --only database; then
    echo "✅ Database schema deployed."
    exit 0
fi

echo "⚠️  framework deploy 失败，尝试旧方式 tcb db push（需要 database-schemas 目录）。"
echo "如果你没有 database-schemas，请改用: node sync-db-auto.js [dev|prod]"

if [ $# -eq 0 ] || [ "$1" == "--all" ]; then
    tcb db push
else
    tcb db push "$@"
fi

