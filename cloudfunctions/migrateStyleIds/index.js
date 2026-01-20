// 云函数: migrateStyleIds
// 功能: 修复 issue_orders 和 return_orders 表中的 styleId，使其指向正确的款号记录

const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { dryRun = true } = event // 默认为试运行模式，不实际修改数据

    console.log('=== 开始迁移 styleId ===')
    console.log('模式:', dryRun ? '试运行(不修改数据)' : '正式执行')

    try {
        // 1. 获取当前租户ID
        const wxContext = cloud.getWXContext()
        const openid = wxContext.OPENID

        // 获取用户的租户ID
        const userRes = await db.collection('users').where({
            openid: openid
        }).get()

        if (!userRes.data || userRes.data.length === 0) {
            return { success: false, error: '未找到用户信息' }
        }

        const tenantId = userRes.data[0].tenantId
        console.log('租户ID:', tenantId)

        // 2. 获取该租户的所有款号
        const stylesRes = await db.collection('styles').where({
            tenantId: tenantId,
            deleted: _.neq(true)
        }).get()

        const styles = stylesRes.data || []
        console.log('找到款号数量:', styles.length)

        if (styles.length === 0) {
            return { success: false, error: '没有找到任何款号记录' }
        }

        // 构建款号查找映射 (按 styleCode 和 styleName)
        const styleByCode = {}
        const styleByName = {}
        styles.forEach(style => {
            const id = style._id
            const code = style.styleCode || style.style_code || ''
            const name = style.styleName || style.style_name || ''

            if (code) styleByCode[code] = id
            if (name) styleByName[name] = id

            console.log(`款号: ${code || name}, ID: ${id}`)
        })

        // 3. 获取该租户的所有发料单
        const issueOrdersRes = await db.collection('issue_orders').where({
            tenantId: tenantId,
            deleted: _.neq(true)
        }).get()

        const issueOrders = issueOrdersRes.data || []
        console.log('找到发料单数量:', issueOrders.length)

        // 4. 分析需要修复的发料单
        const validStyleIds = new Set(styles.map(s => s._id))
        const needsFixing = []

        for (const order of issueOrders) {
            const currentStyleId = order.styleId || order.style_id

            // 如果当前 styleId 有效，跳过
            if (currentStyleId && validStyleIds.has(currentStyleId)) {
                continue
            }

            // 尝试根据款号代码或名称找到正确的ID
            // 这里需要知道原来的款号代码/名称，但发料单可能没有存储
            // 所以我们需要一个策略来匹配

            // 策略1: 如果发料单中有款号代码，按代码匹配
            const styleCode = order.styleCode || order.style_code || ''
            const styleName = order.styleName || order.style_name || ''

            let newStyleId = null
            let matchedBy = null

            if (styleCode && styleByCode[styleCode]) {
                newStyleId = styleByCode[styleCode]
                matchedBy = `styleCode: ${styleCode}`
            } else if (styleName && styleByName[styleName]) {
                newStyleId = styleByName[styleName]
                matchedBy = `styleName: ${styleName}`
            }

            needsFixing.push({
                orderId: order._id,
                issueNo: order.issueNo || order.issue_no,
                currentStyleId: currentStyleId,
                styleCode: styleCode,
                styleName: styleName,
                newStyleId: newStyleId,
                matchedBy: matchedBy
            })
        }

        console.log('需要修复的发料单数量:', needsFixing.length)
        console.log('无法匹配的数量:', needsFixing.filter(o => !o.newStyleId).length)

        // 5. 如果不是试运行，执行更新
        const updateResults = []
        if (!dryRun) {
            for (const item of needsFixing) {
                if (item.newStyleId) {
                    try {
                        await db.collection('issue_orders').doc(item.orderId).update({
                            data: {
                                styleId: item.newStyleId,
                                style_id: item.newStyleId,
                                updateTime: db.serverDate()
                            }
                        })
                        updateResults.push({
                            orderId: item.orderId,
                            issueNo: item.issueNo,
                            success: true
                        })
                        console.log(`已更新发料单 ${item.issueNo}: ${item.currentStyleId} -> ${item.newStyleId}`)
                    } catch (e) {
                        updateResults.push({
                            orderId: item.orderId,
                            issueNo: item.issueNo,
                            success: false,
                            error: e.message
                        })
                        console.error(`更新失败 ${item.issueNo}:`, e)
                    }
                }
            }
        }

        // 6. 同样处理回货单
        const returnOrdersRes = await db.collection('return_orders').where({
            tenantId: tenantId,
            deleted: _.neq(true)
        }).get()

        const returnOrders = returnOrdersRes.data || []
        console.log('找到回货单数量:', returnOrders.length)

        const returnNeedsFixing = []
        for (const order of returnOrders) {
            const currentStyleId = order.styleId || order.style_id

            if (currentStyleId && validStyleIds.has(currentStyleId)) {
                continue
            }

            const styleCode = order.styleCode || order.style_code || ''
            const styleName = order.styleName || order.style_name || ''

            let newStyleId = null
            let matchedBy = null

            if (styleCode && styleByCode[styleCode]) {
                newStyleId = styleByCode[styleCode]
                matchedBy = `styleCode: ${styleCode}`
            } else if (styleName && styleByName[styleName]) {
                newStyleId = styleByName[styleName]
                matchedBy = `styleName: ${styleName}`
            }

            returnNeedsFixing.push({
                orderId: order._id,
                returnNo: order.returnNo || order.return_no,
                currentStyleId: currentStyleId,
                styleCode: styleCode,
                styleName: styleName,
                newStyleId: newStyleId,
                matchedBy: matchedBy
            })
        }

        console.log('需要修复的回货单数量:', returnNeedsFixing.length)

        if (!dryRun) {
            for (const item of returnNeedsFixing) {
                if (item.newStyleId) {
                    try {
                        await db.collection('return_orders').doc(item.orderId).update({
                            data: {
                                styleId: item.newStyleId,
                                style_id: item.newStyleId,
                                updateTime: db.serverDate()
                            }
                        })
                        console.log(`已更新回货单 ${item.returnNo}: ${item.currentStyleId} -> ${item.newStyleId}`)
                    } catch (e) {
                        console.error(`更新回货单失败 ${item.returnNo}:`, e)
                    }
                }
            }
        }

        return {
            success: true,
            dryRun: dryRun,
            summary: {
                totalStyles: styles.length,
                totalIssueOrders: issueOrders.length,
                issueOrdersNeedsFix: needsFixing.length,
                issueOrdersCanFix: needsFixing.filter(o => o.newStyleId).length,
                issueOrdersCannotFix: needsFixing.filter(o => !o.newStyleId).length,
                totalReturnOrders: returnOrders.length,
                returnOrdersNeedsFix: returnNeedsFixing.length,
                returnOrdersCanFix: returnNeedsFixing.filter(o => o.newStyleId).length
            },
            issueOrdersToFix: needsFixing,
            returnOrdersToFix: returnNeedsFixing,
            updateResults: updateResults
        }

    } catch (error) {
        console.error('迁移失败:', error)
        return {
            success: false,
            error: error.message
        }
    }
}
