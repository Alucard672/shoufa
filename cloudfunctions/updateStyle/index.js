// cloudfunctions/updateStyle/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { styleId, styleData } = event
  
  try {
    if (!styleId) {
      return {
        success: false,
        error: '款号ID不能为空'
      }
    }
    
    // 确保数组字段正确
    const updateData = {
      ...styleData,
      updateTime: db.serverDate()
    }
    
    // 确保数组字段是数组类型
    if (updateData.availableColors !== undefined) {
      updateData.availableColors = Array.isArray(updateData.availableColors) 
        ? updateData.availableColors 
        : []
    }
    if (updateData.availableSizes !== undefined) {
      updateData.availableSizes = Array.isArray(updateData.availableSizes) 
        ? updateData.availableSizes 
        : []
    }
    if (updateData.yarnIds !== undefined) {
      updateData.yarnIds = Array.isArray(updateData.yarnIds) 
        ? updateData.yarnIds 
        : []
    }
    
    console.log('云函数更新款号:', {
      styleId: styleId,
      availableColors: updateData.availableColors,
      availableColorsLength: updateData.availableColors ? updateData.availableColors.length : 0
    })
    
    const result = await db.collection('styles').doc(styleId).update({
      data: updateData
    })
    
    // 验证更新结果
    const verifyResult = await db.collection('styles').doc(styleId).get()
    
    return {
      success: true,
      result: result,
      verifyData: {
        availableColors: verifyResult.data.availableColors,
        availableSizes: verifyResult.data.availableSizes
      }
    }
  } catch (error) {
    console.error('云函数更新款号失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

