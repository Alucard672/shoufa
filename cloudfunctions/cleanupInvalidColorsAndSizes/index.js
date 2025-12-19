// cloudfunctions/cleanupInvalidColorsAndSizes/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 1. 获取所有颜色字典
    let colorDict = []
    try {
      const colorsResult = await db.collection('color_dict')
        .where({
          deleted: _.eq(false)
        })
        .get()
      colorDict = colorsResult.data || []
    } catch (error) {
      console.warn('颜色字典表不存在或查询失败:', error)
    }
    
    // 创建颜色名称集合（用于快速查找）
    const validColorNames = new Set(colorDict.map(c => c.name || '').filter(n => n))
    
    // 2. 获取所有尺码字典
    let sizeDict = []
    try {
      const sizesResult = await db.collection('size_dict')
        .where({
          deleted: _.eq(false)
        })
        .get()
      sizeDict = sizesResult.data || []
    } catch (error) {
      console.warn('尺码字典表不存在或查询失败:', error)
    }
    
    // 创建尺码名称集合（用于快速查找）
    const validSizeNames = new Set(sizeDict.map(s => s.name || '').filter(n => n))
    
    // 3. 获取所有款号
    const stylesResult = await db.collection('styles')
      .where({
        deleted: _.eq(false)
      })
      .get()
    
    const styles = stylesResult.data || []
    
    // 4. 处理每个款号
    const updatePromises = []
    const cleanupResults = []
    
    for (const style of styles) {
      let needUpdate = false
      const originalColors = style.availableColors || []
      const originalSizes = style.availableSizes || []
      
      // 处理颜色
      let cleanedColors = []
      if (Array.isArray(originalColors)) {
        // 如果是数组，处理每个颜色
        originalColors.forEach(colorItem => {
          let colorName = colorItem
          if (typeof colorItem === 'object' && colorItem !== null) {
            colorName = colorItem.name || colorItem
          }
          
          // 处理逗号分隔的字符串
          if (typeof colorName === 'string' && colorName.indexOf(',') >= 0) {
            const colorNames = colorName.split(',').map(c => c.trim()).filter(c => c)
            colorNames.forEach(cn => {
              if (validColorNames.has(cn) && cleanedColors.indexOf(cn) < 0) {
                cleanedColors.push(cn)
              }
            })
          } else if (typeof colorName === 'string' && colorName) {
            // 检查颜色是否在字典中
            if (validColorNames.has(colorName) && cleanedColors.indexOf(colorName) < 0) {
              cleanedColors.push(colorName)
            }
          }
        })
      } else if (typeof originalColors === 'string') {
        // 如果是字符串，分割后处理
        const colorNames = originalColors.split(',').map(c => c.trim()).filter(c => c)
        colorNames.forEach(cn => {
          if (validColorNames.has(cn) && cleanedColors.indexOf(cn) < 0) {
            cleanedColors.push(cn)
          }
        })
      }
      
      // 处理尺码
      let cleanedSizes = []
      if (Array.isArray(originalSizes)) {
        // 如果是数组，处理每个尺码
        originalSizes.forEach(sizeItem => {
          let sizeName = sizeItem
          if (typeof sizeItem === 'object' && sizeItem !== null) {
            sizeName = sizeItem.name || sizeItem
          }
          
          // 处理逗号分隔的字符串
          if (typeof sizeName === 'string' && sizeName.indexOf(',') >= 0) {
            const sizeNames = sizeName.split(',').map(s => s.trim()).filter(s => s)
            sizeNames.forEach(sn => {
              if (validSizeNames.has(sn) && cleanedSizes.indexOf(sn) < 0) {
                cleanedSizes.push(sn)
              }
            })
          } else if (typeof sizeName === 'string' && sizeName) {
            // 检查尺码是否在字典中
            if (validSizeNames.has(sizeName) && cleanedSizes.indexOf(sizeName) < 0) {
              cleanedSizes.push(sizeName)
            }
          }
        })
      } else if (typeof originalSizes === 'string') {
        // 如果是字符串，分割后处理
        const sizeNames = originalSizes.split(',').map(s => s.trim()).filter(s => s)
        sizeNames.forEach(sn => {
          if (validSizeNames.has(sn) && cleanedSizes.indexOf(sn) < 0) {
            cleanedSizes.push(sn)
          }
        })
      }
      
      // 检查是否需要更新
      const colorsChanged = JSON.stringify(originalColors) !== JSON.stringify(cleanedColors)
      const sizesChanged = JSON.stringify(originalSizes) !== JSON.stringify(cleanedSizes)
      
      if (colorsChanged || sizesChanged) {
        needUpdate = true
        
        // 记录清理信息
        const removedColors = []
        const removedSizes = []
        
        // 找出被移除的颜色
        if (Array.isArray(originalColors)) {
          originalColors.forEach(c => {
            const cName = typeof c === 'string' ? c : (c.name || c)
            if (cName && cName.indexOf(',') < 0 && !validColorNames.has(cName)) {
              removedColors.push(cName)
            } else if (cName && cName.indexOf(',') >= 0) {
              const parts = cName.split(',').map(p => p.trim())
              parts.forEach(p => {
                if (p && !validColorNames.has(p) && removedColors.indexOf(p) < 0) {
                  removedColors.push(p)
                }
              })
            }
          })
        } else if (typeof originalColors === 'string') {
          const parts = originalColors.split(',').map(p => p.trim())
          parts.forEach(p => {
            if (p && !validColorNames.has(p) && removedColors.indexOf(p) < 0) {
              removedColors.push(p)
            }
          })
        }
        
        // 找出被移除的尺码
        if (Array.isArray(originalSizes)) {
          originalSizes.forEach(s => {
            const sName = typeof s === 'string' ? s : (s.name || s)
            if (sName && sName.indexOf(',') < 0 && !validSizeNames.has(sName)) {
              removedSizes.push(sName)
            } else if (sName && sName.indexOf(',') >= 0) {
              const parts = sName.split(',').map(p => p.trim())
              parts.forEach(p => {
                if (p && !validSizeNames.has(p) && removedSizes.indexOf(p) < 0) {
                  removedSizes.push(p)
                }
              })
            }
          })
        } else if (typeof originalSizes === 'string') {
          const parts = originalSizes.split(',').map(p => p.trim())
          parts.forEach(p => {
            if (p && !validSizeNames.has(p) && removedSizes.indexOf(p) < 0) {
              removedSizes.push(p)
            }
          })
        }
        
        cleanupResults.push({
          styleId: style._id,
          styleCode: style.styleCode || '',
          styleName: style.styleName || '',
          removedColors: removedColors,
          removedSizes: removedSizes,
          cleanedColors: cleanedColors,
          cleanedSizes: cleanedSizes
        })
      }
      
      // 如果需要更新，添加到更新队列
      if (needUpdate) {
        updatePromises.push(
          db.collection('styles').doc(style._id).update({
            data: {
              availableColors: cleanedColors,
              availableSizes: cleanedSizes,
              updateTime: db.serverDate()
            }
          })
        )
      }
    }
    
    // 5. 批量更新所有需要更新的款号
    const updateResults = await Promise.all(updatePromises)
    
    return {
      success: true,
      totalStyles: styles.length,
      updatedStyles: updateResults.length,
      cleanupResults: cleanupResults,
      message: `成功清理 ${updateResults.length} 个款号的无效颜色和尺码`
    }
  } catch (error) {
    console.error('清理失败:', error)
    return {
      success: false,
      error: error.message,
      message: '清理失败：' + error.message
    }
  }
}

