// cloudfunctions/initDatabase/index.js
// 数据库初始化云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const collections = [
    'styles',
    'factories',
    'yarn_inventory',
    'production_plans',
    'issue_orders',
    'return_orders',
    'settlements'
  ]

  const results = []

  for (const collectionName of collections) {
    try {
      // 检查集合是否存在
      const checkResult = await db.collection(collectionName).limit(1).get()
      results.push({
        collection: collectionName,
        status: 'exists',
        message: '集合已存在'
      })
    } catch (error) {
      // 如果集合不存在，尝试创建（通过添加一条记录然后删除）
      try {
        const _ = db.command
        // 添加一条临时记录
        const addResult = await db.collection(collectionName).add({
          data: {
            _temp: true,
            createTime: db.serverDate()
          }
        })
        // 立即删除临时记录
        await db.collection(collectionName).doc(addResult._id).remove()
        
        results.push({
          collection: collectionName,
          status: 'created',
          message: '集合创建成功'
        })
      } catch (createError) {
        results.push({
          collection: collectionName,
          status: 'error',
          message: createError.message
        })
      }
    }
  }

  return {
    success: true,
    results
  }
}







