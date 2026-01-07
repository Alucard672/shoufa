const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 业务方法模块
const bindEmployee = require('./bindEmployee')
const unbindEmployee = require('./unbindEmployee')
const listEmployees = require('./listEmployees')
const updateEmployee = require('./updateEmployee')
const joinTenant = require('./joinTenant')

exports.main = async (event, context) => {
  let code, msg, data;
  try {
    data = await dispatchAction(event, context);
    code = 0;
    msg = "操作成功";
  } catch (e) {
    data = {};
    code = -1;
    msg = "操作失败, " + (e.msg || e.message || '未知错误')
  }

  return {
    code,
    msg,
    data
  };
}

async function dispatchAction(event, context) {
  const { action, payload } = event;
  
  // 对于某些 action，可能需要先解析手机号（针对移动端授权加入场景）
  if (action === "joinTenant" && payload.code && !payload.phoneNumber) {
    try {
      const res = await cloud.openapi.phonenumber.getPhoneNumber({
        code: payload.code
      });
      payload.phoneNumber = res.phoneInfo.phoneNumber;
    } catch (e) {
      console.error('获取手机号失败:', e);
      return Promise.reject({ msg: '获取手机号授权失败，请重试' });
    }
  }

  // 获取 openid
  const wxContext = cloud.getWXContext();
  if (action === "joinTenant" && !payload.openid) {
    payload.openid = wxContext.OPENID;
  }

  switch (action) {
    case "bindEmployee":
      return await bindEmployee(db, payload, context);
    case "unbindEmployee":
      return await unbindEmployee(db, payload, context);
    case "listEmployees":
      return await listEmployees(db, payload, context);
    case "updateEmployee":
      return await updateEmployee(db, payload, context);
    case "joinTenant":
      return await joinTenant(db, payload, context);
    default:
      return Promise.reject({ msg: `Unknown action ${action}` })
  }
}
