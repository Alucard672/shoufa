// cloudfunctions/migrateDates/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const results = { issue_orders: 0, return_orders: 0, factories: 0, styles: 0 }
  
  // 1. 修复发料单
  const issueRes = await db.collection('issue_orders').where({
    deleted: false
  }).limit(1000).get()
  
  for (const item of issueRes.data) {
    const rawDate = item.issueDate || item.issue_date
    const factoryId = item.factoryId || item.factory_id
    const styleId = item.styleId || item.style_id
    const issueNo = item.issueNo || item.issue_no
    const issueWeight = item.issueWeight || item.issue_weight

    const updateData = {}
    if (typeof rawDate === 'string') updateData.issueDate = new Date(rawDate.replace(/\//g, '-'))
    else if (rawDate) updateData.issueDate = rawDate

    if (factoryId) updateData.factoryId = factoryId
    if (styleId) updateData.styleId = styleId
    if (issueNo) updateData.issueNo = issueNo
    if (issueWeight) updateData.issueWeight = issueWeight

    // 删除旧字段
    const removeData = {}
    if (item.issue_date) removeData.issue_date = _.remove()
    if (item.factory_id) removeData.factory_id = _.remove()
    if (item.style_id) removeData.style_id = _.remove()
    if (item.issue_no) removeData.issue_no = _.remove()
    if (item.issue_weight) removeData.issue_weight = _.remove()

    if (Object.keys(updateData).length > 0 || Object.keys(removeData).length > 0) {
      await db.collection('issue_orders').doc(item._id).update({
        data: { ...updateData, ...removeData }
      })
      results.issue_orders++
    }
  }

  // 2. 修复回货单
  const returnRes = await db.collection('return_orders').where({
    deleted: false
  }).limit(1000).get()
  
  for (const item of returnRes.data) {
    const rawDate = item.returnDate || item.return_date
    const factoryId = item.factoryId || item.factory_id
    const styleId = item.styleId || item.style_id
    const returnNo = item.returnNo || item.return_no
    const issueId = item.issueId || item.issue_id
    const returnQuantity = item.returnQuantity || item.return_quantity
    const returnPieces = item.returnPieces || item.return_pieces
    const actualYarnUsage = item.actualYarnUsage || item.actual_yarn_usage
    const processingFee = item.processingFee || item.processing_fee
    const settledAmount = item.settledAmount || item.settled_amount
    const settlementStatus = item.settlementStatus || item.settlement_status

    const updateData = {}
    if (typeof rawDate === 'string') updateData.returnDate = new Date(rawDate.replace(/\//g, '-'))
    else if (rawDate) updateData.returnDate = rawDate

    if (factoryId) updateData.factoryId = factoryId
    if (styleId) updateData.styleId = styleId
    if (returnNo) updateData.returnNo = returnNo
    if (issueId) updateData.issueId = issueId
    if (returnQuantity) updateData.returnQuantity = returnQuantity
    if (returnPieces) updateData.returnPieces = returnPieces
    if (actualYarnUsage) updateData.actualYarnUsage = actualYarnUsage
    if (processingFee) updateData.processingFee = processingFee
    if (settledAmount) updateData.settledAmount = settledAmount
    if (settlementStatus) updateData.settlementStatus = settlementStatus

    // 删除旧字段
    const removeData = {}
    if (item.return_date) removeData.return_date = _.remove()
    if (item.factory_id) removeData.factory_id = _.remove()
    if (item.style_id) removeData.style_id = _.remove()
    if (item.return_no) removeData.return_no = _.remove()
    if (item.issue_id) removeData.issue_id = _.remove()
    if (item.return_quantity) removeData.return_quantity = _.remove()
    if (item.return_pieces) removeData.return_pieces = _.remove()
    if (item.actual_yarn_usage) removeData.actual_yarn_usage = _.remove()
    if (item.processing_fee) removeData.processing_fee = _.remove()
    if (item.settled_amount) removeData.settled_amount = _.remove()
    if (item.settlement_status) removeData.settlement_status = _.remove()

    if (Object.keys(updateData).length > 0 || Object.keys(removeData).length > 0) {
      await db.collection('return_orders').doc(item._id).update({
        data: { ...updateData, ...removeData }
      })
      results.return_orders++
    }
  }

  // 3. 修复工厂
  const factoryRes = await db.collection('factories').where({
    deleted: false
  }).limit(1000).get()

  for (const item of factoryRes.data) {
    const updateData = {}
    const removeData = {}
    if (item.default_price !== undefined) {
      updateData.defaultPrice = item.default_price
      removeData.default_price = _.remove()
    }
    if (item.settlement_method !== undefined) {
      updateData.settlementMethod = item.settlement_method
      removeData.settlement_method = _.remove()
    }

    if (Object.keys(updateData).length > 0) {
      await db.collection('factories').doc(item._id).update({
        data: { ...updateData, ...removeData }
      })
      results.factories++
    }
  }

  // 4. 修复款号
  const styleRes = await db.collection('styles').where({
    deleted: false
  }).limit(1000).get()

  for (const item of styleRes.data) {
    const updateData = {}
    const removeData = {}
    if (item.style_code !== undefined) {
      updateData.styleCode = item.style_code
      removeData.style_code = _.remove()
    }
    if (item.style_name !== undefined) {
      updateData.styleName = item.style_name
      removeData.style_name = _.remove()
    }
    if (item.image_url !== undefined) {
      updateData.imageUrl = item.image_url
      removeData.image_url = _.remove()
    }
    if (item.yarn_usage_per_piece !== undefined) {
      updateData.yarnUsagePerPiece = item.yarn_usage_per_piece
      removeData.yarn_usage_per_piece = _.remove()
    }
    if (item.loss_rate !== undefined) {
      updateData.lossRate = item.loss_rate
      removeData.loss_rate = _.remove()
    }
    if (item.actual_usage !== undefined) {
      updateData.actualUsage = item.actual_usage
      removeData.actual_usage = _.remove()
    }
    if (item.processing_fee_per_dozen !== undefined) {
      updateData.processingFeePerDozen = item.processing_fee_per_dozen
      removeData.processing_fee_per_dozen = _.remove()
    }

    if (Object.keys(updateData).length > 0) {
      await db.collection('styles').doc(item._id).update({
        data: { ...updateData, ...removeData }
      })
      results.styles++
    }
  }

  return { success: true, results }
}
