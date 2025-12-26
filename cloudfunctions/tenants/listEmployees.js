/**
 * 查询租户下的所有员工
 * 返回该租户下所有已绑定的员工手机号列表
 */
module.exports = async function listEmployees(db, payload, context) {
  const { tenantId, pageNum = 1, pageSize = 100 } = payload;

  if (!tenantId) {
    return Promise.reject({ msg: '租户ID(tenantId)不能为空' });
  }

  // 1. 检查租户是否存在
  const tenantRes = await db.collection('tenants').doc(tenantId).get();
  if (!tenantRes.data) {
    return Promise.reject({ msg: '租户信息不存在' });
  }

  // 2. 查询该租户下的所有员工（未删除的）
  const query = db.collection('users')
    .where({
      tenantId: tenantId,
      deleted: false
    });

  // 先统计总数
  const countResult = await query.count();
  const total = countResult.total;

  // 计算跳过的数量
  const skip = (pageNum - 1) * pageSize;

  // 查询数据（按创建时间倒序）
  const dataResult = await query
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  return {
    list: dataResult.data,
    total: total,
    pageNum: pageNum,
    pageSize: pageSize,
    totalPages: totalPages
  };
}

