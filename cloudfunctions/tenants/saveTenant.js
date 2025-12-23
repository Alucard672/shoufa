/**
 * 保存企业信息
 * 根据sn判断是否存在，不存在则创建，存在则更新
 */
module.exports = async function saveTenant(db, payload, context) {
  const { code, crmTenantId, sn, name, phone, expireDate, loginLimitNum, demoFlag, stopFlag } = payload;

  if (!sn) {
    return Promise.reject({ msg: '企业编号(sn)不能为空' });
  }

  // 查询是否存在相同sn的记录
  const queryResult = await db.collection('tenants')
    .where({
      sn: sn
    })
    .get();

  const now = db.serverDate();
  const tenantData = {
    code: code || '',
    crmTenantId: crmTenantId || '',
    sn: sn,
    name: name || '',
    phone: phone || '',
    expireDate: expireDate || null,
    loginLimitNum: loginLimitNum || 0,
    demoFlag: demoFlag !== undefined ? demoFlag : false,
    stopFlag: stopFlag !== undefined ? stopFlag : false,
    updateTime: now
  };

  if (queryResult.data && queryResult.data.length > 0) {
    // 存在，则更新
    const tenantId = queryResult.data[0]._id;
    await db.collection('tenants').doc(tenantId).update({
      data: tenantData
    });

    // 返回更新后的数据
    const updatedResult = await db.collection('tenants').doc(tenantId).get();
    return {
      tenantId: tenantId,
      action: 'update',
      data: updatedResult.data
    };
  } else {
    // 不存在，则创建
    tenantData.createTime = now;
    const addResult = await db.collection('tenants').add({
      data: tenantData
    });

    // 返回创建的数据
    const createdResult = await db.collection('tenants').doc(addResult._id).get();
    return {
      tenantId: addResult._id,
      action: 'create',
      data: createdResult.data
    };
  }
}


