// cloudfunctions/migrateToMultiTenant/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 需要迁移的集合列表
const COLLECTIONS = [
    'styles',
    'factories',
    'issue_orders',
    'return_orders',
    'production_plans',
    'settlements'
]

exports.main = async (event, context) => {
    const { tenantId = 'DEFAULT_TENANT' } = event
    const results = {}

    try {
        for (const collectionName of COLLECTIONS) {
            console.log(`开始迁移集合: ${collectionName}`)

            // 批量更新：给所有没有 tenantId 的记录打上标签
            const updateResult = await db.collection(collectionName).where({
                tenantId: _.exists(false)
            }).update({
                data: {
                    tenantId: tenantId,
                    updateTime: db.serverDate()
                }
            })

            results[collectionName] = {
                updated: updateResult.stats.updated,
                errMsg: updateResult.errMsg
            }
        }

        return {
            success: true,
            data: results,
            msg: `迁移完成，租户ID: ${tenantId}`
        }
    } catch (err) {
        console.error('迁移失败:', err)
        return {
            success: false,
            error: err,
            msg: '导出失败'
        }
    }
}
