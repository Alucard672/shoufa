#!/usr/bin/env node

/**
 * 同步数据库集合和索引结构到生产环境
 * 使用方法: node sync-db-schema.js
 */

const fs = require('fs');
const path = require('path');

// 读取 cloudbaserc.prod.json
const configPath = path.join(__dirname, 'cloudbaserc.prod.json');
if (!fs.existsSync(configPath)) {
  console.error('错误: cloudbaserc.prod.json 不存在');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const envId = config.envId;
const databaseConfig = config.database;

if (!databaseConfig || !databaseConfig.collections) {
  console.error('错误: cloudbaserc.prod.json 中缺少 database 配置');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('数据库集合和索引配置信息');
console.log('═══════════════════════════════════════════════════════════');
console.log(`环境ID: ${envId}`);
console.log(`集合数量: ${databaseConfig.collections.length}`);
console.log('');

// 统计信息
let totalCollections = 0;
let totalIndexes = 0;

databaseConfig.collections.forEach(collection => {
  totalCollections++;
  const indexCount = collection.indexes ? collection.indexes.length : 0;
  totalIndexes += indexCount;
  
  console.log(`集合: ${collection.name}`);
  console.log(`  权限标签: ${collection.aclTag || 'PRIVATE'}`);
  if (collection.indexes && collection.indexes.length > 0) {
    console.log(`  索引数量: ${indexCount}`);
    collection.indexes.forEach(index => {
      const fields = index.fields.map(f => {
        const dir = f.direction === 1 || f.direction === 'asc' ? '升序' : '降序';
        return `${f.field}(${dir})`;
      }).join(', ');
      const unique = index.unique ? ' [唯一]' : '';
      console.log(`    - ${index.indexName}: ${fields}${unique}`);
    });
  } else {
    console.log(`  索引数量: 0`);
  }
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════');
console.log(`总计: ${totalCollections} 个集合, ${totalIndexes} 个索引`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('📝 下一步操作：');
console.log('');
console.log('由于微信云开发的限制，集合和索引需要手动创建：');
console.log('');
console.log('方法一：使用微信开发者工具（推荐）');
console.log('  1. 在微信开发者工具中切换到生产环境');
console.log('  2. 打开云开发控制台 -> 数据库');
console.log('  3. 根据上面的配置信息手动创建集合和索引');
console.log('');
console.log('方法二：使用云开发控制台网页版');
console.log('  1. 访问 https://console.cloud.tencent.com/tcb');
console.log('  2. 选择环境: ' + envId);
console.log('  3. 进入数据库管理页面');
console.log('  4. 根据上面的配置信息手动创建集合和索引');
console.log('');
console.log('提示：');
console.log('  - 集合会在第一次写入数据时自动创建');
console.log('  - 索引需要在集合创建后手动创建');
console.log('  - 可以参考 cloudbaserc.prod.json 中的详细配置');
console.log('');

