/**
 * 解绑员工手机号
 * 根据手机号查找用户记录，验证是否属于当前租户，然后软删除
 */
module.exports = async function unbindEmployee(db, payload, context) {
  const { tenantId, phoneNumber } = payload;

  if (!tenantId) {
    return Promise.reject({ msg: '租户ID(tenantId)不能为空' });
  }

  if (!phoneNumber) {
    return Promise.reject({ msg: '手机号(phoneNumber)不能为空' });
  }

  // 1. 检查租户是否存在
  const tenantRes = await db.collection('tenants').doc(tenantId).get();
  if (!tenantRes.data) {
    return Promise.reject({ msg: '租户信息不存在' });
  }

  // 2. 查找用户记录
  const userRes = await db.collection('users')
    .where({
      phone: phoneNumber,
      deleted: false
    })
    .get();

  if (userRes.data.length === 0) {
    return Promise.reject({ msg: '该手机号未绑定到任何租户' });
  }

  const user = userRes.data[0];

  // 3. 验证是否属于当前租户
  if (user.tenantId !== tenantId) {
    return Promise.reject({ msg: '该手机号不属于当前租户，无法解绑' });
  }

  // 4. 软删除（标记为已删除）
  await db.collection('users').doc(user._id).update({
    data: {
      deleted: true,
      updateTime: db.serverDate()
    }
  });

  return {
    action: 'unbind',
    message: '解绑成功',
    data: {
      phoneNumber: phoneNumber,
      tenantId: tenantId
    }
  };
}
