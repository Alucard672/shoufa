const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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
            return await saveTenant(payload, context);
        case "get":
            return await getTenant(payload, context);
        case "getBySn":
            return await getTenantBySn(payload, context);
        case "list":
            return await listTenants(payload, context);
        default:
            return Promise.reject({ msg: `Unknown action ${action}` })
    }
}

/**
 * 保存企业信息
 * 根据sn判断是否存在，不存在则创建，存在则更新
 */
async function saveTenant(payload, context) {
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

/**
 * 获取企业信息
 * 根据tenantId获取
 */
async function getTenant(payload, context) {
    const { tenantId } = payload;
    
    if (!tenantId) {
        return Promise.reject({ msg: '租户ID(tenantId)不能为空' });
    }
    
    const result = await db.collection('tenants').doc(tenantId).get();
    
    if (!result.data) {
        return Promise.reject({ msg: '租户信息不存在' });
    }
    
    return {
        tenantId: tenantId,
        data: result.data
    };
}

/**
 * 获取企业信息
 * 根据sn（企业编号）获取
 */
async function getTenantBySn(payload, context) {
    const { sn } = payload;
    
    if (!sn) {
        return Promise.reject({ msg: '企业编号(sn)不能为空' });
    }
    
    const queryResult = await db.collection('tenants')
        .where({
            sn: sn
        })
        .get();
    
    if (!queryResult.data || queryResult.data.length === 0) {
        return Promise.reject({ msg: '租户信息不存在' });
    }
    
    const tenantData = queryResult.data[0];
    
    return {
        tenantId: tenantData._id,
        sn: sn,
        data: tenantData
    };
}

/**
 * 分页查询租户列表
 * 支持多种查询条件
 */
async function listTenants(payload, context) {
    const { 
        code,           // code精确查询
        codeLike,       // code模糊查询
        nameLike,       // name模糊查询
        snLike,         // sn模糊查询
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
    
    // 查询数据（按创建时间倒序）
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