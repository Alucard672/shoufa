/**
 * 保存企业信息
 * 根据sn判断是否存在，不存在则创建，存在则更新
 */
module.exports = async function saveTenant(db, payload, context) {
  const { code, crmTenantId, sn, name, phone, expireDate, loginLimitNum, demoFlag, stopFlag, shareCode } = payload;

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
    
    // 如果有分享码，记录推荐关系
    let referrerTenantId = null
    if (shareCode) {
      // 根据分享码查找推荐者租户ID
      // 这里简化处理，实际应该查询share_codes集合或使用云函数
      try {
        const shareRes = await db.collection('share_codes')
          .where({
            shareCode: shareCode,
            deleted: false
          })
          .limit(1)
          .get()
        
        if (shareRes.data && shareRes.data.length > 0) {
          referrerTenantId = shareRes.data[0].tenantId
          tenantData.referrerTenantId = referrerTenantId
        }
      } catch (e) {
        // share_codes集合可能不存在，忽略错误
        console.log('查询分享码失败:', e)
      }
    }
    
    const addResult = await db.collection('tenants').add({
      data: tenantData
    });

    const newTenantId = addResult._id
    
    // 如果有推荐关系，创建推荐记录
    if (referrerTenantId) {
      try {
        const _ = db.command
        await db.collection('referrals').add({
          data: {
            referrerTenantId: referrerTenantId,
            refereeTenantId: newTenantId,
            refereePhone: phone || '',
            status: 'pending',
            rewardDays: 180,
            rewardGranted: false,
            rewardGrantedAt: null,
            paymentTime: null,
            createTime: now,
            updateTime: now,
            deleted: false,
            tenantId: referrerTenantId
          }
        })
      } catch (e) {
        console.error('创建推荐记录失败:', e)
        // 不影响租户创建，只记录错误
      }
    }

    // 返回创建的数据
    const createdResult = await db.collection('tenants').doc(newTenantId).get();
    return {
      tenantId: newTenantId,
      action: 'create',
      data: createdResult.data,
      referrerTenantId: referrerTenantId
    };
  }
}


