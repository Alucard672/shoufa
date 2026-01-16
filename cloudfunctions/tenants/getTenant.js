/**
 * 获取企业信息
 * 根据tenantId获取
 */
module.exports = async function getTenant(db, payload, context) {
  const { tenantId } = payload;

  if (!tenantId) {
    return Promise.reject({ msg: '租户ID(tenantId)不能为空' });
  }

  try {
    const result = await db.collection('tenants').doc(tenantId).get();

    if (!result.data) {
      return Promise.reject({ msg: '租户信息不存在' });
    }

    return {
      tenantId: tenantId,
      data: result.data
    };
  } catch (error) {
    // 处理文档不存在的情况
    if (error.errCode === -1 || error.message && error.message.includes('does not exist')) {
      return Promise.reject({ msg: '租户信息不存在' });
    }
    // 其他错误直接抛出
    throw error;
  }
}


