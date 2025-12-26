#!/usr/bin/env node

/**
 * 自动同步数据库集合和索引结构到生产环境
 * 使用方法: node sync-db-auto.js [dev|prod]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取环境参数
const env = process.argv[2] || 'prod';
const configFile = env === 'dev' ? 'cloudbaserc.dev.json' : 'cloudbaserc.prod.json';
const envName = env === 'dev' ? '测试环境' : '生产环境';

console.log('═══════════════════════════════════════════════════════════');
console.log(`自动同步数据库结构到 ${envName}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// 读取配置文件
const configPath = path.join(__dirname, configFile);
if (!fs.existsSync(configPath)) {
  console.error(`错误: ${configFile} 不存在`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const envId = config.envId;
const databaseConfig = config.database;

if (!databaseConfig || !databaseConfig.collections) {
  console.error(`错误: ${configFile} 中缺少 database 配置`);
  process.exit(1);
}

console.log(`环境ID: ${envId}`);
console.log(`集合数量: ${databaseConfig.collections.length}`);
console.log('');

// 检查 API 密钥配置
const apiKeyConfigPath = path.join(__dirname, 'api_key_config.sh');
if (!fs.existsSync(apiKeyConfigPath)) {
  console.error('错误: api_key_config.sh 不存在');
  process.exit(1);
}

// 检查是否已登录（通过尝试执行 tcb env:list）
try {
  execSync('tcb env:list', { stdio: 'ignore', timeout: 5000 });
} catch (error) {
  console.log('正在登录到腾讯云...');
  try {
    // 读取 API 密钥
    const apiKeyConfig = fs.readFileSync(apiKeyConfigPath, 'utf8');
    const apiKeyIdMatch = apiKeyConfig.match(/TCB_API_KEY_ID=['"]([^'"]+)['"]/);
    const apiKeyMatch = apiKeyConfig.match(/TCB_API_KEY=['"]([^'"]+)['"]/);
    
    if (!apiKeyIdMatch || !apiKeyMatch) {
      console.error('错误: 无法从 api_key_config.sh 读取 API 密钥');
      process.exit(1);
    }
    
    const apiKeyId = apiKeyIdMatch[1];
    const apiKey = apiKeyMatch[1];
    
    execSync(`tcb login --apiKeyId ${apiKeyId} --apiKey ${apiKey}`, { stdio: 'inherit' });
  } catch (loginError) {
    console.error('登录失败:', loginError.message);
    process.exit(1);
  }
}

// 备份并切换 cloudbaserc.json
const cloudbasercPath = path.join(__dirname, 'cloudbaserc.json');
const cloudbasercBackup = path.join(__dirname, 'cloudbaserc.json.bak.sync');

if (fs.existsSync(cloudbasercPath)) {
  fs.copyFileSync(cloudbasercPath, cloudbasercBackup);
  console.log('已备份当前 cloudbaserc.json');
}

fs.copyFileSync(configPath, cloudbasercPath);
console.log(`已切换到 ${envName} 配置`);
console.log('');

// 部署 syncDatabaseSchema 云函数
console.log('正在部署 syncDatabaseSchema 云函数...');
try {
  execSync('tcb fn deploy --force syncDatabaseSchema', { stdio: 'inherit' });
  console.log('云函数部署成功');
  console.log('');
} catch (error) {
  console.error('云函数部署失败:', error.message);
  // 恢复备份
  if (fs.existsSync(cloudbasercBackup)) {
    fs.copyFileSync(cloudbasercBackup, cloudbasercPath);
  }
  process.exit(1);
}

// 调用云函数，传递数据库配置
console.log('正在调用云函数创建集合...');
console.log('');

try {
  // 创建临时参数文件
  const paramFile = path.join(__dirname, '.sync-db-params.json');
  const params = { databaseConfig };
  fs.writeFileSync(paramFile, JSON.stringify(params, null, 2));
  
  console.log('正在调用云函数...');
  console.log('');
  
  // 使用参数文件调用云函数
  const invokeCommand = `tcb fn invoke syncDatabaseSchema -f ${paramFile}`;
  execSync(invokeCommand, { stdio: 'inherit' });
  
  // 删除临时文件
  if (fs.existsSync(paramFile)) {
    fs.unlinkSync(paramFile);
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ 集合创建完成');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('⚠️  重要提示：');
  console.log('');
  console.log('索引需要在控制台手动创建，因为微信云开发不支持通过代码创建索引。');
  console.log('');
  console.log('请运行以下命令查看需要创建的索引配置：');
  console.log('  node sync-db-schema.js');
  console.log('');
  console.log('然后在云开发控制台中根据配置信息手动创建索引。');
  console.log('');
  
} catch (error) {
  console.error('调用云函数失败:', error.message);
  console.error('');
  console.error('你可以尝试在云开发控制台中手动调用 syncDatabaseSchema 云函数，');
  console.error('参数为: { "databaseConfig": <database配置> }');
} finally {
  // 恢复备份
  if (fs.existsSync(cloudbasercBackup)) {
    fs.copyFileSync(cloudbasercBackup, cloudbasercPath);
    fs.unlinkSync(cloudbasercBackup);
    console.log('已恢复原 cloudbaserc.json');
  }
}

