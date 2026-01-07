/**
 * 员工自愿加入租户（通过邀请码或租户ID）
 * 禁止跨租户自动转移：手机号已绑定其他租户时直接拒绝
 */
module.exports = async function joinTenant(db, payload, context) {
  const { tenantId, inviteCode, avatarUrl, nickName, phoneNumber, openid } = payload;

  let targetTenantId = tenantId;

  // 1. 如果传了邀请码（sn），先查出对应的 tenantId
  if (inviteCode) {
    const tenantRes = await db.collection('tenants').where({
      sn: inviteCode
    }).get();
    if (tenantRes.data.length === 0) {
      return Promise.reject({ msg: '邀请码无效，请检查后重试' });
    }
    targetTenantId = tenantRes.data[0]._id;
  }

  if (!targetTenantId) {
    return Promise.reject({ msg: '企业ID或邀请码不能为空' });
  }

  if (!phoneNumber) {
    return Promise.reject({ msg: '手机号不能为空' });
  }

  // 2. 检查用户是否已存在
  const userCheck = await db.collection('users').where({
    phone: phoneNumber,
    deleted: false
  }).get();

  let userRecord = null;
  if (userCheck.data.length > 0) {
    const existingUser = userCheck.data[0];
    
    // 如果已存在且属于不同租户，禁止自动转移
    if (existingUser.tenantId !== targetTenantId) {
      console.log('拒绝跨租户转移:', {
        phoneNumber,
        existingTenantId: existingUser.tenantId,
        targetTenantId
      });
      return Promise.reject({ 
        msg: '该手机号已绑定其他企业，请联系管理员处理' 
      });
    }
    
    // 已在本租户中，仅更新 openid/头像/昵称（不改变 tenantId）
    console.log('同租户用户重复加入，更新 openid/头像/昵称:', {
      phoneNumber,
      tenantId: targetTenantId
    });
    const updateData = {
      openid: openid,
      updateTime: db.serverDate()
    };
    if (avatarUrl) updateData.avatarUrl = avatarUrl;
    if (nickName) updateData.nickName = nickName;
    await db.collection('users').doc(existingUser._id).update({ data: updateData });
    userRecord = { ...existingUser, ...updateData };
  } else {
    // 3. 新增用户记录（扫码加入的新员工）
    console.log('新用户加入租户:', {
      phoneNumber,
      tenantId: targetTenantId
    });
    const now = db.serverDate();
    const addRes = await db.collection('users').add({
      data: {
        tenantId: targetTenantId,
        phone: phoneNumber,
        name: '', // 扫码加入时姓名为空，后续可编辑
        role: 'staff',
        avatarUrl: avatarUrl || '',
        nickName: nickName || '微信用户',
        openid: openid,
        deleted: false,
        createTime: now,
        updateTime: now,
        lastLoginTime: null
      }
    });
    // 获取刚创建的用户记录
    const newUserRes = await db.collection('users').doc(addRes._id).get();
    userRecord = newUserRes.data;
  }

  // 4. 获取租户详情返回
  const finalTenantRes = await db.collection('tenants').doc(targetTenantId).get();
  
  if (!finalTenantRes.data) {
    return Promise.reject({ msg: '企业信息不存在' });
  }

  return {
    success: true,
    tenant: finalTenantRes.data,
    user: userRecord
  };
};
