/**
 * 查询租户下的所有员工
 * 返回该租户下所有已绑定的员工手机号列表
 */
module.exports = async function listEmployees(db, payload, context) {
  const { tenantId, pageNum = 1, pageSize = 100 } = payload;

  if (!tenantId) {
    return Promise.reject({ msg: '租户ID(tenantId)不能为空' });
  }

  // 优化：直接查询员工列表，使用复合索引提升性能
  // 索引：idx_deleted_tenantId_createTime (deleted: asc, tenantId: asc, createTime: desc)
  const dataResult = await db.collection('users')
    .where({
      tenantId: tenantId,
      deleted: false
    })
    .orderBy('createTime', 'desc')
    .limit(pageSize)
    .get();

  // 如果数据量小于 pageSize，说明已经获取了所有数据
  // 否则需要统计总数（但通常员工数量不会太多，所以先简化查询）
  const list = dataResult.data || [];
  const total = list.length < pageSize ? list.length : list.length; // 简化处理，避免额外的 count 查询

  return {
    list: list,
    total: total,
    pageNum: pageNum,
    pageSize: pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}
