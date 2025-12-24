// cloudfunctions/mysql/index.js
// MySQL数据库操作云函数（使用腾讯云开发RDB）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 获取数据库连接 - 尝试使用wx-server-sdk的RDB API
function getDB(context) {
  try {
    // 方法1: 尝试使用cloud.rdb
    if (cloud.rdb && typeof cloud.rdb === 'function') {
      return cloud.rdb({
        instance: "default",
        database: "cloud1-3g9cra4h71f647dd",
      });
    }
    
    // 方法2: 尝试使用cloud.database().rdb
    const db = cloud.database();
    if (db.rdb && typeof db.rdb === 'function') {
      return db.rdb({
        instance: "default",
        database: "cloud1-3g9cra4h71f647dd",
      });
    }
    
    // 如果都不支持，抛出错误
    throw new Error('wx-server-sdk不支持RDB API，需要使用@cloudbase/node-sdk');
  } catch (error) {
    console.error('获取RDB连接失败:', error);
    throw error;
  }
}

/**
 * 将数据库行（下划线命名）转换为驼峰命名
 */
function convertRowToCamelCase(row) {
  const result = {};
  for (const key in row) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = row[key];
    
    // 特殊处理id字段，添加_id字段
    if (key === 'id') {
      result._id = row[key].toString();
    }
  }
  return result;
}

/**
 * 将驼峰命名转换为下划线命名
 */
function convertToSnakeCase(obj) {
  const result = {};
  for (const key in obj) {
    if (key === '_id') {
      // _id转换为id
      result.id = obj[key];
    } else {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      result[snakeKey] = obj[key];
    }
  }
  return result;
}

/**
 * 构建WHERE条件
 */
function buildWhereClause(query, where, tenantId, excludeDeleted = true) {
  // 添加租户ID条件
  if (tenantId) {
    query = query.where('tenant_id', tenantId);
  }
  
  // 添加软删除条件
  if (excludeDeleted) {
    query = query.where('deleted', 0);
  }
  
  // 添加自定义WHERE条件
  if (where) {
    Object.keys(where).forEach(key => {
      const value = where[key];
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          // IN查询
          query = query.whereIn(key, value);
        } else if (typeof value === 'object') {
          // 范围查询 {gte: value, lte: value}
          if (value.gte !== undefined) {
            query = query.where(key, '>=', value.gte);
          }
          if (value.lte !== undefined) {
            query = query.where(key, '<=', value.lte);
          }
        } else {
          query = query.where(key, value);
        }
      }
    });
  }
  
  return query;
}

exports.main = async (event, context) => {
  const { action, table, data, where, options = {} } = event;
  const { tenantId } = options;

  try {
    const db = getDB(context);

    switch (action) {
      case 'query':
        return await handleQuery(db, table, where, options);
      
      case 'insert':
        return await handleInsert(db, table, data, tenantId);
      
      case 'update':
        return await handleUpdate(db, table, data, where, tenantId);
      
      case 'delete':
        return await handleDelete(db, table, where, tenantId);
      
      case 'count':
        return await handleCount(db, table, where, options);
      
      case 'transaction':
        return await handleTransaction(db, data, tenantId);
      
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (error) {
    console.error('MySQL操作失败:', error);
    return {
      success: false,
      error: error.message || error.toString()
    };
  }
};

/**
 * 处理查询操作
 */
async function handleQuery(db, table, where, options) {
  let query = db.from(table);
  
  // 构建WHERE条件
  query = buildWhereClause(query, where, options.tenantId, options.excludeDeleted !== false);
  
  // 添加排序
  if (options.orderBy) {
    query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'asc');
  }
  
  // 添加分页
  if (options.limit) {
    query = query.limit(options.limit);
    if (options.offset) {
      query = query.offset(options.offset);
    }
  }
  
  const result = await query.select();
  
  // 转换数据格式
  return {
    success: true,
    data: result.data.map(row => convertRowToCamelCase(row))
  };
}

/**
 * 处理插入操作
 */
async function handleInsert(db, table, data, tenantId) {
  // 转换数据格式
  const row = convertToSnakeCase(data);
  
  // 添加租户ID
  if (tenantId && table !== 'tenants') {
    row.tenant_id = tenantId;
  }
  
  // 添加时间戳
  const now = new Date();
  row.create_time = now;
  row.update_time = now;
  
  // 执行插入
  const result = await db.from(table).insert(row).select('id');
  
  // 获取插入的ID
  const insertId = result.data && result.data.length > 0 ? result.data[0].id : null;
  
  return {
    success: true,
    _id: insertId ? insertId.toString() : null,
    id: insertId
  };
}

/**
 * 处理更新操作
 */
async function handleUpdate(db, table, data, where, tenantId) {
  // 转换数据格式
  const updateData = convertToSnakeCase(data);
  
  // 添加更新时间
  updateData.update_time = new Date();
  
  // 构建WHERE条件
  let updateQuery = db.from(table);
  
  // 添加租户ID条件
  if (tenantId && table !== 'tenants') {
    updateQuery = updateQuery.where('tenant_id', tenantId);
  }
  
  // 添加自定义WHERE条件
  if (where) {
    Object.keys(where).forEach(key => {
      const value = where[key];
      if (value !== undefined && value !== null) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        if (Array.isArray(value)) {
          updateQuery = updateQuery.whereIn(snakeKey, value);
        } else {
          updateQuery = updateQuery.where(snakeKey, value);
        }
      }
    });
  }
  
  const result = await updateQuery.update(updateData);
  
  return {
    success: true,
    affectedRows: result.affectedRows || 0
  };
}

/**
 * 处理删除操作（软删除）
 */
async function handleDelete(db, table, where, tenantId) {
  // 软删除：更新deleted字段
  return await handleUpdate(db, table, { deleted: 1 }, where, tenantId);
}

/**
 * 处理计数操作
 */
async function handleCount(db, table, where, options) {
  let query = db.from(table);
  
  // 构建WHERE条件
  query = buildWhereClause(query, where, options.tenantId, options.excludeDeleted !== false);
  
  const result = await query.count();
  
  return {
    success: true,
    count: result.total || 0
  };
}

/**
 * 处理事务操作
 */
async function handleTransaction(db, operations, tenantId) {
  return await db.transaction(async (trx) => {
    const results = [];
    
    for (const op of operations) {
      switch (op.action) {
        case 'insert':
          const insertData = convertToSnakeCase(op.data);
          if (tenantId && op.table !== 'tenants') {
            insertData.tenant_id = tenantId;
          }
          const now = new Date();
          insertData.create_time = now;
          insertData.update_time = now;
          const insertResult = await trx.from(op.table).insert(insertData).select('id');
          results.push({ 
            action: 'insert', 
            _id: insertResult.data && insertResult.data.length > 0 ? insertResult.data[0].id.toString() : null 
          });
          break;
          
        case 'update':
          const updateData = convertToSnakeCase(op.data);
          updateData.update_time = new Date();
          let updateQuery = trx.from(op.table);
          if (op.where) {
            Object.keys(op.where).forEach(key => {
              const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
              updateQuery = updateQuery.where(snakeKey, op.where[key]);
            });
          }
          const updateResult = await updateQuery.update(updateData);
          results.push({ affectedRows: updateResult.affectedRows || 0 });
          break;
      }
    }
    
    return results;
  });
}
