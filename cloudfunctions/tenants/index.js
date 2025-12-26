const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 业务方法模块
const saveTenant = require('./saveTenant')
const getTenant = require('./getTenant')
const getTenantBySn = require('./getTenantBySn')
const listTenants = require('./listTenants')
const bindEmployee = require('./bindEmployee')
const unbindEmployee = require('./unbindEmployee')
const listEmployees = require('./listEmployees')
const updateEmployee = require('./updateEmployee')

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
  switch (action) {
    case "save":
      return await saveTenant(db, payload, context);
    case "get":
      return await getTenant(db, payload, context);
    case "getBySn":
      return await getTenantBySn(db, payload, context);
    case "list":
      return await listTenants(db, payload, context);
    case "bindEmployee":
      return await bindEmployee(db, payload, context);
    case "unbindEmployee":
      return await unbindEmployee(db, payload, context);
    case "listEmployees":
      return await listEmployees(db, payload, context);
    case "updateEmployee":
      return await updateEmployee(db, payload, context);
    default:
      return Promise.reject({ msg: `Unknown action ${action}` })
  }
}
