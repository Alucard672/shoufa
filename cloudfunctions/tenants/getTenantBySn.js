/**
 * 获取企业信息
 * 根据sn（企业编号）获取
 */
module.exports = async function getTenantBySn(db, payload, context) {
  const { sn } = payload;

  if (!sn) {
    return Promise.reject({ msg: '企业编号(sn)不能为空' });
  }

  const queryResult = await db.collection('tenants')
    .where({
      sn: sn
    })
    .get();

  if (!queryResult.data || queryResult.data.length === 0) {
    return Promise.reject({ msg: '租户信息不存在' });
  }

  const tenantData = queryResult.data[0];

  return {
    tenantId: tenantData._id,
    sn: sn,
    data: tenantData
  };
}


