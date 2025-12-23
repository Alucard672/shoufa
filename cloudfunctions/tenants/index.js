exports.main = async (event, context) => {
    let code, msg, data;
    try {
        data = await dispatchAction(event, context);
    } catch (e) {
        data = {};
        code = -1;
        msg = "操作失败, " + (e.msg || '未知错误')
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
        case "create":
            return await createTenant(payload, context);
        default:
            return Promise.reject({ msg: `Unknown action ${action}` })
    }
}

async function createTenant(payload, context) {
    return {
        "t": "a",
        payload,
        context
    }
}