/**
 * 绑定员工到租户
 */
module.exports = async function bindEmployee(db, payload, context) {
  const { tenantId, phone, phoneNumber, name, nickName, role = 'staff' } = payload;
  
  // 兼容 phoneNumber 参数
  const phoneNum = phone || phoneNumber;

  if (!tenantId || !phoneNum) {
    return Promise.reject({ msg: '租户ID和手机号不能为空' });
  }

  // 1. 检查手机号是否已被其他企业绑定
  const userCheck = await db.collection('users').where({
    phone: phoneNum,
    deleted: false
  }).get();

  if (userCheck.data.length > 0) {
    const existingUser = userCheck.data[0];
    if (existingUser.tenantId !== tenantId) {
      return Promise.reject({ msg: '该手机号已绑定到其他企业，请先解除绑定' });
    } else {
      // 如果员工已存在，更新姓名和昵称（如果提供了）
      const updateData = {
        updateTime: db.serverDate()
      };
      if (name !== undefined) updateData.name = name;
      if (nickName !== undefined) updateData.nickName = nickName;
      
      if (Object.keys(updateData).length > 1) {
        await db.collection('users').doc(existingUser._id).update({ data: updateData });
      }
      
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
      phone: phoneNum,
      name: name || '',
      nickName: nickName || name || '新员工',
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

