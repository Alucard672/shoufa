// utils/image.js
// 统一处理图片字段兼容：imageUrl / image_url / image
// 优化云存储图片显示：自动转换 cloud:// 为临时链接

// 临时链接缓存（避免重复请求）
const tempUrlCache = new Map()

/**
 * 同步获取图片URL（字段兼容）
 * 注意：如果是 cloud:// 格式，返回原值，需要异步转换为临时链接
 */
export function normalizeImageUrl(input) {
  // 直接传字符串
  if (typeof input === 'string') {
    const url = input.trim()
    // 如果已经是临时链接或http链接，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    // cloud:// 格式暂时返回原值，后续通过 getImageUrl 异步转换
    return url
  }

  // 传入对象（如 style / order）
  if (input && typeof input === 'object') {
    // 按优先级尝试不同字段
    const v = input.styleImageUrl ?? input.imageUrl ?? input.image_url ?? input.image ?? input.style_image_url ?? ''
    const url = typeof v === 'string' ? v.trim() : ''
    // 如果已经是临时链接或http链接，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return url
  }

  return ''
}

/**
 * 异步获取图片URL（如果是 cloud:// 则转换为临时链接）
 * @param {string|object} input - 图片URL字符串或包含图片字段的对象
 * @returns {Promise<string>} 可用的图片URL
 */
export async function getImageUrl(input) {
  const rawUrl = normalizeImageUrl(input)
  
  if (!rawUrl) {
    return ''
  }

  // 如果已经是 http/https 链接，直接返回
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl
  }

  // 如果是 cloud:// 格式，尝试获取临时链接
  if (rawUrl.startsWith('cloud://')) {
    // 检查缓存
    if (tempUrlCache.has(rawUrl)) {
      console.log('getImageUrl: 从缓存获取临时URL')
      return tempUrlCache.get(rawUrl)
    }

    try {
      // 获取临时链接（有效期2小时）
      console.log('getImageUrl: 调用 getTempFileURL...')
      const res = await wx.cloud.getTempFileURL({
        fileList: [rawUrl]
      })
      console.log('getImageUrl: getTempFileURL 返回:', JSON.stringify(res))

      if (res.fileList && res.fileList.length > 0) {
        const fileInfo = res.fileList[0]
        const tempFileURL = fileInfo.tempFileURL || fileInfo.download_url || ''
        console.log('getImageUrl: 提取的 tempFileURL:', tempFileURL, 'status:', fileInfo.status)
        if (tempFileURL && fileInfo.status === 0) {
          // 缓存临时链接（2小时有效期，但缓存1.5小时避免过期）
          tempUrlCache.set(rawUrl, tempFileURL)
          setTimeout(() => {
            tempUrlCache.delete(rawUrl)
          }, 1.5 * 60 * 60 * 1000) // 1.5小时
          return tempFileURL
        } else {
          console.warn('getImageUrl: 获取临时URL失败', {
            fileID: rawUrl,
            status: fileInfo.status,
            errMsg: fileInfo.errMsg
          })
        }
      }
    } catch (error) {
      console.error('获取临时链接失败:', error, 'fileID:', rawUrl)
    }
    // 获取失败时返回空字符串，避免在WXML中直接使用cloud://导致500错误
    return ''
  }

  // 其他格式直接返回（但如果是 cloud:// 格式，返回空字符串避免错误）
  if (rawUrl && rawUrl.startsWith('cloud://')) {
    return ''
  }
  return rawUrl
}

/**
 * 批量获取图片URL（优化性能，减少请求次数）
 * @param {Array<string>} fileIds - cloud:// 文件ID数组
 * @returns {Promise<Map<string, string>>} fileId -> tempUrl 的映射
 */
export async function batchGetImageUrls(fileIds) {
  if (!fileIds || fileIds.length === 0) {
    return new Map()
  }

  // 过滤出需要转换的 cloud:// URL
  const cloudUrls = fileIds.filter(id => id && id.startsWith('cloud://'))
  if (cloudUrls.length === 0) {
    return new Map()
  }

  // 检查缓存，过滤出未缓存的
  const uncachedUrls = cloudUrls.filter(url => !tempUrlCache.has(url))
  
  if (uncachedUrls.length === 0) {
    // 全部已缓存，直接返回
    const result = new Map()
    cloudUrls.forEach(url => {
      result.set(url, tempUrlCache.get(url))
    })
    return result
  }

  try {
    // 批量获取临时链接（分批处理，避免一次性请求过多）
    const batchSize = 20 // 每批最多20个
    const batches = []
    for (let i = 0; i < uncachedUrls.length; i += batchSize) {
      batches.push(uncachedUrls.slice(i, i + batchSize))
    }

    const urlMap = new Map()
    
    // 逐批处理
    for (const batch of batches) {
      try {
        const res = await wx.cloud.getTempFileURL({
          fileList: batch
        })

        if (res.fileList && res.fileList.length > 0) {
          res.fileList.forEach((file, index) => {
            const fileID = batch[index]
            const tempFileURL = file.tempFileURL || file.download_url || ''
            
            if (tempFileURL && file.status === 0) {
              // 缓存成功的临时URL
              tempUrlCache.set(fileID, tempFileURL)
              setTimeout(() => {
                tempUrlCache.delete(fileID)
              }, 1.5 * 60 * 60 * 1000)
              
              urlMap.set(fileID, tempFileURL)
            } else {
              // 获取失败（可能是文件不存在或权限问题），记录错误但不缓存
              console.warn(`获取临时URL失败: ${fileID}, status: ${file.status}, errMsg: ${file.errMsg || ''}`)
              // 不设置到urlMap，让调用方知道获取失败
            }
          })
        }
      } catch (batchError) {
        console.error('批量获取临时链接批次失败:', batchError)
        // 继续处理下一批
      }
    }

    // 添加已缓存的URL
    cloudUrls.forEach(url => {
      if (tempUrlCache.has(url)) {
        urlMap.set(url, tempUrlCache.get(url))
      }
    })

    return urlMap
  } catch (error) {
    console.error('批量获取临时链接失败:', error)
    // 失败时返回已缓存的URL映射，未缓存的留空
    const fallbackMap = new Map()
    cloudUrls.forEach(url => {
      if (tempUrlCache.has(url)) {
        fallbackMap.set(url, tempUrlCache.get(url))
      }
    })
    return fallbackMap
  }
}


