/**
 * 更新员工信息
 */
module.exports = async function updateEmployee(db, payload, context) {
  const { tenantId, userId, name, nickName, phone } = payload;

  if (!tenantId) {
    return Promise.reject({ msg: '租户ID(tenantId)不能为空' });
  }

  if (!userId) {
    return Promise.reject({ msg: '用户ID(userId)不能为空' });
  }

  // 1. 检查租户是否存在
  const tenantRes = await db.collection('tenants').doc(tenantId).get();
  if (!tenantRes.data) {
    return Promise.reject({ msg: '租户信息不存在' });
  }

  // 2. 查找用户记录
  const userRes = await db.collection('users').doc(userId).get();
  if (!userRes.data) {
    return Promise.reject({ msg: '用户信息不存在' });
  }

  const user = userRes.data;

  // 3. 验证是否属于当前租户
  if (user.tenantId !== tenantId) {
    return Promise.reject({ msg: '该员工不属于当前租户，无法更新' });
  }

  // 4. 如果更新了手机号，检查新手机号是否已被使用
  if (phone && phone !== user.phone) {
    const phoneCheck = await db.collection('users').where({
      phone: phone,
      deleted: false
    }).get();

    if (phoneCheck.data.length > 0 && phoneCheck.data[0]._id !== userId) {
      return Promise.reject({ msg: '该手机号已被其他员工使用' });
    }
  }

  // 5. 构建更新数据
  const updateData = {
    updateTime: db.serverDate()
  };

  if (name !== undefined) updateData.name = name;
  if (nickName !== undefined) updateData.nickName = nickName;
  if (phone !== undefined) updateData.phone = phone;

  // 6. 更新用户信息
  await db.collection('users').doc(userId).update({
    data: updateData
  });

  // 7. 获取更新后的数据
  const updatedRes = await db.collection('users').doc(userId).get();

  return {
    success: true,
    msg: '更新成功',
    userId: userId,
    data: updatedRes.data
  };
};
