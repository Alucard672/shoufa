// cloudfunctions/syncDatabaseSchema/index.js
// 同步数据库集合和索引结构
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  // 从事件参数中获取数据库配置
  const { databaseConfig } = event
  
  if (!databaseConfig || !databaseConfig.collections) {
    return {
      success: false,
      error: '缺少 databaseConfig.collections 配置，请传递数据库配置'
    }
  }
  
  const results = {
    collections: [],
    indexes: []
  }
  
  // 创建集合
  for (const collectionConfig of databaseConfig.collections) {
    const collectionName = collectionConfig.name
    
    try {
      // 尝试查询集合，如果不存在会抛出错误
      await db.collection(collectionName).limit(1).get()
      
      results.collections.push({
        name: collectionName,
        status: 'exists',
        message: '集合已存在'
      })
    } catch (error) {
      // 集合不存在，尝试创建
      try {
        // 通过插入一条临时记录来创建集合
        const tempData = {
          _temp: true,
          createTime: db.serverDate()
        }
        
        const addResult = await db.collection(collectionName).add({
          data: tempData
        })
        
        // 立即删除临时记录
        await db.collection(collectionName).doc(addResult._id).remove()
        
        results.collections.push({
          name: collectionName,
          status: 'created',
          message: '集合创建成功'
        })
      } catch (createError) {
        results.collections.push({
          name: collectionName,
          status: 'error',
          message: createError.message
        })
      }
    }
  }
  
  // 注意：微信云开发不支持通过代码直接创建索引
  // 索引需要在控制台手动创建，或者使用腾讯云 API
  // 这里我们返回索引配置信息，方便后续创建
  for (const collectionConfig of databaseConfig.collections) {
    if (collectionConfig.indexes && collectionConfig.indexes.length > 0) {
      results.indexes.push({
        collection: collectionConfig.name,
        indexes: collectionConfig.indexes,
        message: '索引需要在控制台手动创建，或使用腾讯云 API'
      })
    }
  }
  
  return {
    success: true,
    results: results,
    message: '集合创建完成。索引需要在控制台手动创建。'
  }
}

