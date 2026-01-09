/**
 * 分页查询租户列表
 * 支持多种查询条件
 */
module.exports = async function listTenants(db, payload, context) {
  const {
    code,           // code精确查询
    codeLike,       // code模糊查询
    nameLike,       // name模糊查询
    snLike,         // sn模糊查询
    phoneLike,      // 手机号模糊查询
    demoFlag,       // 是否演示企业精确查询
    stopFlag,       // 是否停用精确查询
    pageNum = 1,    // 页码，默认第1页
    pageSize = 10   // 每页数量，默认10条
  } = payload;

  // 构建查询条件
  let query = db.collection('tenants');

  // code精确查询
  if (code !== undefined && code !== null && code !== '') {
    query = query.where({
      code: code
    });
  }

  // code模糊查询
  if (codeLike !== undefined && codeLike !== null && codeLike !== '') {
    query = query.where({
      code: db.RegExp({
        regexp: codeLike,
        options: 'i'
      })
    });
  }

  // name模糊查询
  if (nameLike !== undefined && nameLike !== null && nameLike !== '') {
    query = query.where({
      name: db.RegExp({
        regexp: nameLike,
        options: 'i'
      })
    });
  }

  // sn模糊查询
  if (snLike !== undefined && snLike !== null && snLike !== '') {
    query = query.where({
      sn: db.RegExp({
        regexp: snLike,
        options: 'i'
      })
    });
  }

  // phone模糊查询
  if (phoneLike !== undefined && phoneLike !== null && phoneLike !== '') {
    query = query.where({
      phone: db.RegExp({
        regexp: phoneLike,
        options: 'i'
      })
    });
  }

  // demoFlag精确查询
  if (demoFlag !== undefined && demoFlag !== null) {
    query = query.where({
      demoFlag: demoFlag
    });
  }

  // stopFlag精确查询
  if (stopFlag !== undefined && stopFlag !== null) {
    query = query.where({
      stopFlag: stopFlag
    });
  }

  // 先统计总数
  const countResult = await query.count();
  const total = countResult.total;

  // 计算跳过的数量
  const skip = (pageNum - 1) * pageSize;

  // 查询数据
  const dataResult = await query
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  return {
    list: dataResult.data,
    total: total,
    pageNum: pageNum,
    pageSize: pageSize,
    totalPages: totalPages
  };
}


