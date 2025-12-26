/**
 * 绑定员工到租户
 */
module.exports = async function bindEmployee(db, payload, context) {
  const { tenantId, phone, nickName, role = 'staff' } = payload;

  if (!tenantId || !phone) {
    return Promise.reject({ msg: '租户ID和手机号不能为空' });
  }

  // 1. 检查手机号是否已被其他企业绑定
  const userCheck = await db.collection('users').where({
    phone: phone,
    deleted: false
  }).get();

  if (userCheck.data.length > 0) {
    const existingUser = userCheck.data[0];
    if (existingUser.tenantId !== tenantId) {
      return Promise.reject({ msg: '该手机号已绑定到其他企业，请先解除绑定' });
    } else {
      return { 
        success: true, 
        msg: '该员工已在当前企业中',
        userId: existingUser._id 
      };
    }
  }

  // 2. 创建用户绑定记录
  const now = db.serverDate();
  const res = await db.collection('users').add({
    data: {
      tenantId: tenantId,
      phone: phone,
      nickName: nickName || '新员工',
      role: role, // staff 员工, admin 管理员
      avatarUrl: '',
      openid: '', // 等待用户首次登录时补全
      deleted: false,
      createTime: now,
      updateTime: now,
      lastLoginTime: null
    }
  });

  return {
    success: true,
    msg: '绑定成功',
    userId: res._id
  };
};

