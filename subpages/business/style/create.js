// pages/style/create.js
const { query, getStyleById, insert, update } = require('../utils/db.js')
const { checkLogin } = require('../utils/auth.js')
const { getImageUrl } = require('../utils/image.js')
const app = getApp()

Page({
  data: {
    styleId: '',
    isEdit: false,
    disabled: false,     // 是否已停用
    imageUrl: '',        // 原始 cloud:// URL，用于保存到数据库
    imageDisplayUrl: '', // 临时URL，用于页面显示
    styleCode: '',
    styleName: '',
    category: '',
    yarnUsagePerPiece: '',
    lossRate: '',
    actualUsage: '',
    processingFeePerDozen: '',
    processingFeePerPiece: '',
    availableColors: [],
    availableSizes: [],
    selectedColors: [],
    selectedSizes: [],
    colorOptions: [],
    sizeOptions: [],
    yarnOptions: [],
    selectedYarns: [],
    yarnIds: [],
    remark: '',
    imageError: false,
    submitting: false
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      })
    }
  },

  onImageError() {
    this.setData({
      imageError: true
    })
  },

  async onLoad(options) {
    // 检查登录状态
    if (!checkLogin()) {
      return
    }
    console.log('款号编辑页面 onLoad，options:', options)
    // 先加载字典数据（包括纱线列表）
    await this.loadDictionaries()

    if (options.id) {
      console.log('检测到编辑模式，ID:', options.id)
      this.setData({
        styleId: options.id,
        isEdit: true
      })
      // 等待字典数据加载完成后再加载款号数据
      await this.loadStyle(options.id)
    } else {
      console.log('新增模式')
      // 新增模式，重置表单
      this.setData({
        styleId: '',
        isEdit: false,
        imageUrl: '',
        imageDisplayUrl: '',
        styleCode: '',
        styleName: '',
        category: '',
        yarnUsagePerPiece: '',
        lossRate: '',
        actualUsage: '',
        processingFeePerDozen: '',
        processingFeePerPiece: '',
        availableColors: [],
        availableSizes: [],
        selectedColors: [],
        selectedSizes: [],
        selectedYarns: [],
        yarnIds: [],
        remark: ''
      })
    }
  },

  async loadStyle(styleId) {
    try {
      wx.showLoading({
        title: '加载中...'
      })

      console.log('开始加载款号数据，ID:', styleId)

      const styleRes = await getStyleById(styleId)
      console.log('查询结果:', styleRes)
      const styleData = styleRes.data

      if (styleData) {
        console.log('款号原始数据:', styleData)
        // 验证租户，防止水平越权
        if (styleData.tenantId && styleData.tenantId !== app.globalData.tenantId) {
          throw new Error('无权访问该款号')
        }

        // 使用数据库中的实际 _id 作为 styleId（确保ID类型一致）
        const actualId = styleData._id || styleData.id || styleId

        // 确保字典数据已加载（如果还没有，重新加载）
        if (!this.data.colorOptions || this.data.colorOptions.length === 0) {
          await this.loadDictionaries()
        }

        // 使用最新的字典数据
        const colorOptions = this.data.colorOptions || []
        const sizeOptions = this.data.sizeOptions || []
        const yarnOptions = this.data.yarnOptions || []

        console.log('加载款号数据:', {
          styleCode: styleData.styleCode,
          availableColors: styleData.availableColors,
          availableSizes: styleData.availableSizes,
          colorOptionsCount: colorOptions.length,
          sizeOptionsCount: sizeOptions.length
        })

        // 匹配选中的颜色和尺码
        const selectedColors = []
        const selectedSizes = []
        const selectedYarns = []

        // 处理 availableColors（可能是 JSON 字符串或数组）
        let availableColors = styleData.availableColors
        if (typeof availableColors === 'string') {
          try {
            availableColors = JSON.parse(availableColors)
          } catch (e) {
            // 如果不是 JSON，当作逗号分隔的字符串处理
            availableColors = availableColors.split(',').map(c => c.trim()).filter(c => c)
          }
        }

        if (availableColors) {
          // 处理不同的数据格式
          let colorsToProcess = []

          // 如果 availableColors 是字符串（可能是逗号分隔的字符串）
          if (typeof availableColors === 'string') {
            colorsToProcess = availableColors.split(',').map(c => c.trim()).filter(c => c)
          }
          // 如果 availableColors 是数组
          else if (Array.isArray(availableColors)) {
            colorsToProcess = availableColors
          }

          colorsToProcess.forEach(colorItem => {
            // 处理不同的数据格式：可能是字符串，也可能是对象
            let colorName = colorItem
            if (typeof colorItem === 'object' && colorItem !== null) {
              colorName = colorItem.name || colorItem
            }

            // 处理可能是逗号分隔的字符串（旧数据格式）
            if (typeof colorName === 'string' && colorName.indexOf(',') >= 0) {
              // 如果是逗号分隔的字符串，分割后处理每个颜色
              const colorNames = colorName.split(',').map(c => c.trim()).filter(c => c)
              colorNames.forEach(cn => {
                const color = colorOptions.find(c => {
                  const cName = c.name || c
                  return cName === cn
                })
                if (color) {
                  // 避免重复添加
                  if (!selectedColors.find(c => (c._id || c.name) === (color._id || color.name))) {
                    selectedColors.push(color)
                  }
                } else if (cn) {
                  // 如果字典中找不到，创建一个临时对象用于显示（可以删除）
                  console.warn('颜色未在字典中找到:', cn)
                  if (!selectedColors.find(c => (c._id || c.name) === cn)) {
                    selectedColors.push({
                      _id: cn,
                      name: cn
                    })
                  }
                }
              })
              return // 跳过当前项，因为已经处理了
            }

            // 从字典中查找匹配的颜色
            const color = colorOptions.find(c => {
              const cName = c.name || c
              return cName === colorName
            })

            if (color) {
              // 避免重复添加
              if (!selectedColors.find(c => (c._id || c.name) === (color._id || color.name))) {
                selectedColors.push(color)
              }
            } else if (colorName) {
              // 如果字典中找不到，但数据库中保存了名称，创建一个临时对象用于显示（可以删除）
              console.warn('颜色未在字典中找到:', colorName)
              if (!selectedColors.find(c => (c._id || c.name) === colorName)) {
                selectedColors.push({
                  _id: colorName,
                  name: colorName
                })
              }
            }
          })
        }

        // 处理 availableSizes（可能是 JSON 字符串或数组）
        let availableSizes = styleData.availableSizes
        if (typeof availableSizes === 'string') {
          try {
            availableSizes = JSON.parse(availableSizes)
          } catch (e) {
            // 如果不是 JSON，当作逗号分隔的字符串处理
            availableSizes = availableSizes.split(',').map(s => s.trim()).filter(s => s)
          }
        }

        if (availableSizes) {
          // 处理不同的数据格式
          let sizesToProcess = []

          // 如果 availableSizes 是字符串（可能是逗号分隔的字符串）
          if (typeof availableSizes === 'string') {
            sizesToProcess = availableSizes.split(',').map(s => s.trim()).filter(s => s)
          }
          // 如果 availableSizes 是数组
          else if (Array.isArray(availableSizes)) {
            sizesToProcess = availableSizes
          }

          sizesToProcess.forEach(sizeItem => {
            // 处理不同的数据格式：可能是字符串，也可能是对象
            let sizeName = sizeItem
            if (typeof sizeItem === 'object' && sizeItem !== null) {
              sizeName = sizeItem.name || sizeItem
            }

            // 处理可能是逗号分隔的字符串（旧数据格式）
            if (typeof sizeName === 'string' && sizeName.indexOf(',') >= 0) {
              // 如果是逗号分隔的字符串，分割后处理每个尺码
              const sizeNames = sizeName.split(',').map(s => s.trim()).filter(s => s)
              sizeNames.forEach(sn => {
                const size = sizeOptions.find(s => {
                  const sName = s.name || s
                  return sName === sn
                })
                if (size) {
                  // 避免重复添加
                  if (!selectedSizes.find(s => (s._id || s.name) === (size._id || size.name))) {
                    selectedSizes.push(size)
                  }
                } else if (sn) {
                  // 如果字典中找不到，创建一个临时对象用于显示（可以删除）
                  console.warn('尺码未在字典中找到:', sn)
                  if (!selectedSizes.find(s => (s._id || s.name) === sn)) {
                    selectedSizes.push({
                      _id: sn,
                      name: sn
                    })
                  }
                }
              })
              return // 跳过当前项，因为已经处理了
            }

            // 从字典中查找匹配的尺码
            const size = sizeOptions.find(s => {
              const sName = s.name || s
              return sName === sizeName
            })

            if (size) {
              // 避免重复添加
              if (!selectedSizes.find(s => (s._id || s.name) === (size._id || size.name))) {
                selectedSizes.push(size)
              }
            } else if (sizeName) {
              // 如果字典中找不到，但数据库中保存了名称，创建一个临时对象用于显示（可以删除）
              console.warn('尺码未在字典中找到:', sizeName)
              if (!selectedSizes.find(s => (s._id || s.name) === sizeName)) {
                selectedSizes.push({
                  _id: sizeName,
                  name: sizeName
                })
              }
            }
          })
        }

        // 匹配选中的纱线
        let yarnIds = styleData.yarnIds || styleData.yarn_ids || []
        // 处理 JSON 字符串
        if (typeof yarnIds === 'string') {
          try {
            yarnIds = JSON.parse(yarnIds)
          } catch (e) {
            yarnIds = []
          }
        }
        if (yarnIds && yarnIds.length > 0) {
          yarnIds.forEach(yarnId => {
            const yarn = yarnOptions.find(y => (y._id || y.id) === yarnId)
            if (yarn) {
              selectedYarns.push(yarn)
            }
          })
        }

        console.log('匹配结果:', {
          selectedColorsCount: selectedColors.length,
          selectedSizesCount: selectedSizes.length,
          selectedColors: selectedColors.map(c => c.name || c),
          selectedSizes: selectedSizes.map(s => s.name || s)
        })

        // 处理图片URL
        const rawImageUrl = (styleData.imageUrl || styleData.image_url || '').toString().trim()
        let displayImageUrl = rawImageUrl
        if (rawImageUrl && rawImageUrl.startsWith('cloud://')) {
          try {
            console.log('尝试获取图片临时URL, 原始URL:', rawImageUrl)
            displayImageUrl = await getImageUrl(rawImageUrl)
            console.log('获取到的临时URL:', displayImageUrl)
          } catch (e) {
            console.warn('获取图片临时URL失败:', e)
          }
        }

        const formData = {
          styleId: actualId, // 保存实际的数据库ID
          disabled: styleData.disabled || false,  // 是否已停用
          imageUrl: rawImageUrl,  // 原始URL用于保存
          imageDisplayUrl: displayImageUrl,  // 临时URL用于显示
          imageError: false,
          styleCode: styleData.styleCode || styleData.style_code || '',
          styleName: styleData.styleName || styleData.style_name || '',
          category: styleData.category || '',
          yarnUsagePerPiece: (styleData.yarnUsagePerPiece || styleData.yarn_usage_per_piece) ? (styleData.yarnUsagePerPiece || styleData.yarn_usage_per_piece).toString() : '',
          lossRate: (styleData.lossRate || styleData.loss_rate) ? (styleData.lossRate || styleData.loss_rate).toString() : '',
          actualUsage: (styleData.actualUsage || styleData.actual_usage) ? (styleData.actualUsage || styleData.actual_usage).toString() : '',
          processingFeePerDozen: (styleData.processingFeePerDozen || styleData.processing_fee_per_dozen) ? (styleData.processingFeePerDozen || styleData.processing_fee_per_dozen).toString() : '',
          processingFeePerPiece: (() => {
            const { getPiecesPerDozenSync } = require('../utils/systemParams.js')
            const piecesPerDozen = getPiecesPerDozenSync()
            return (styleData.processingFeePerDozen || styleData.processing_fee_per_dozen) ? ((parseFloat(styleData.processingFeePerDozen || styleData.processing_fee_per_dozen) / piecesPerDozen).toFixed(2)) : '0.00'
          })(),
          availableColors: availableColors || [],
          availableSizes: availableSizes || [],
          selectedColors: selectedColors,
          selectedSizes: selectedSizes,
          selectedYarns: selectedYarns,
          yarnIds: yarnIds || [],
          remark: styleData.remark || ''
        }

        console.log('设置表单数据:', {
          ...formData,
          selectedColorsCount: selectedColors.length,
          selectedSizesCount: selectedSizes.length,
          selectedYarnsCount: selectedYarns.length
        })
        this.setData(formData)

        this.calculateActualUsage()

        wx.hideLoading()
        wx.showToast({
          title: '加载成功',
          icon: 'success',
          duration: 1000
        })
      } else {
        wx.hideLoading()
        console.error('未找到款号数据')
        wx.showToast({
          title: '未找到款号数据',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('加载款号失败:', error)
      wx.showToast({
        title: '加载失败: ' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      })
    }
  },

  async loadDictionaries() {
    try {
      const promises = []

      // 加载颜色字典（如果集合不存在，返回空数组）
      promises.push(
        query('color_dict', null, {
          excludeDeleted: true
        }).catch(() => ({ data: [] }))
      )

      // 加载尺码字典（如果集合不存在，返回空数组）
      promises.push(
        query('size_dict', null, {
          excludeDeleted: true,
          orderBy: { field: 'order', direction: 'ASC' }
        }).catch(() => ({ data: [] }))
      )

      // 加载纱线列表（如果集合不存在，返回空数组）
      promises.push(
        query('yarn_inventory', null, {
          excludeDeleted: true
        }).catch(() => ({ data: [] }))
      )

      const [colorsResult, sizesResult, yarnsResult] = await Promise.all(promises)

      this.setData({
        colorOptions: colorsResult.data || [],
        sizeOptions: sizesResult.data || [],
        yarnOptions: yarnsResult.data || []
      })
    } catch (error) {
      console.error('加载字典失败:', error)
      // 如果字典表不存在，使用空数组
      this.setData({
        colorOptions: [],
        sizeOptions: [],
        yarnOptions: []
      })
    }
  },

  onStyleCodeInput(e) {
    this.setData({
      styleCode: e.detail.value
    })
  },

  onStyleNameInput(e) {
    this.setData({
      styleName: e.detail.value
    })
  },

  onCategoryInput(e) {
    this.setData({
      category: e.detail.value
    })
  },

  onYarnUsageInput(e) {
    const value = e.detail.value
    this.setData({
      yarnUsagePerPiece: value
    })
    this.calculateActualUsage()
  },

  onLossRateInput(e) {
    const value = e.detail.value
    this.setData({
      lossRate: value
    })
    this.calculateActualUsage()
  },

  onProcessingFeeInput(e) {
    const { getPiecesPerDozenSync } = require('../utils/systemParams.js')
    const piecesPerDozen = getPiecesPerDozenSync()
    const value = e.detail.value
    const feePerDozen = parseFloat(value) || 0
    const feePerPiece = (feePerDozen / piecesPerDozen).toFixed(2)
    this.setData({
      processingFeePerDozen: value,
      processingFeePerPiece: feePerPiece
    })
  },

  calculateActualUsage() {
    const yarnUsage = parseFloat(this.data.yarnUsagePerPiece) || 0
    const lossRate = parseFloat(this.data.lossRate) || 0
    // 实际用量 = (单件克数 / 1000) * (1 + 损耗率%)
    const actualUsage = (yarnUsage / 1000) * (1 + lossRate / 100)
    this.setData({
      actualUsage: actualUsage.toFixed(3)
    })
  },

  onColorsChange(e) {
    const selectedColors = e.detail.value || []
    // 确保 availableColors 保存的是名称字符串数组
    const colorNames = selectedColors.map(item => {
      if (typeof item === 'string') {
        return item
      }
      if (typeof item === 'object' && item !== null) {
        return item.name || item._id || String(item)
      }
      return String(item)
    }).filter(name => name && name.trim())

    this.setData({
      selectedColors: selectedColors,
      availableColors: colorNames
    })
  },

  onSizesChange(e) {
    const selectedSizes = e.detail.value || []
    // 确保 availableSizes 保存的是名称字符串数组
    const sizeNames = selectedSizes.map(item => {
      if (typeof item === 'string') {
        return item
      }
      if (typeof item === 'object' && item !== null) {
        return item.name || item._id || String(item)
      }
      return String(item)
    }).filter(name => name && name.trim())

    this.setData({
      selectedSizes: selectedSizes,
      availableSizes: sizeNames
    })
  },

  async onAddColor(e) {
    let { name, code } = e.detail

    // 如果名称为空，检查白色是否存在，如果不存在则自动填充"白色"
    if (!name || name.trim() === '') {
      const hasWhite = this.data.colorOptions.some(c => c.name === '白色')
      if (!hasWhite) {
        name = '白色'
      }
    }

    // 确保名称不为空
    name = name ? name.trim() : ''
    if (!name) {
      wx.showToast({
        title: '请输入颜色名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '添加中...'
      })

      // 检查集合是否存在，如果不存在则提示用户
      try {
        await query('color_dict', null, { limit: 1 })
      } catch (checkError) {
        wx.hideLoading()
        wx.showModal({
          title: '提示',
          content: '颜色字典表不存在，请先在"基础信息设置"中创建颜色字典表',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      const result = await insert('color_dict', {
        name: name,
        code: code || ''
      })

      // 重新加载颜色列表（过滤已删除的）
      const colorsResult = await query('color_dict', null, {
        excludeDeleted: true
      })
      const newColor = colorsResult.data.find(c => (c._id || c.id) === (result._id || result.id))

      if (newColor) {
        // 自动选中新添加的颜色
        const selectedColors = [...this.data.selectedColors, newColor]
        // 确保 availableColors 保存的是名称字符串数组
        const colorNames = selectedColors.map(item => {
          if (typeof item === 'string') {
            return item
          }
          if (typeof item === 'object' && item !== null) {
            return item.name || item._id || String(item)
          }
          return String(item)
        }).filter(name => name && name.trim())

        this.setData({
          colorOptions: colorsResult.data || [],
          selectedColors: selectedColors,
          availableColors: colorNames
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '添加成功',
        icon: 'success'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('添加颜色失败:', error)

      let errorMsg = '添加失败'
      if (error.errCode === -502005 || error.message.includes('collection not exists')) {
        errorMsg = '颜色字典表不存在，请先在"基础信息设置"中创建'
      } else if (error.errCode === -502002) {
        errorMsg = '颜色名称已存在'
      }

      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      })
    }
  },

  async onAddSize(e) {
    const { name, code } = e.detail
    try {
      wx.showLoading({
        title: '添加中...'
      })

      // 检查集合是否存在，如果不存在则提示用户
      try {
        await query('size_dict', null, { limit: 1 })
      } catch (checkError) {
        wx.hideLoading()
        wx.showModal({
          title: '提示',
          content: '尺码字典表不存在，请先在"基础信息设置"中创建尺码字典表',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      const result = await insert('size_dict', {
        name: name,
        code: code || '',
        order: code ? parseInt(code) : 0
      })

      // 重新加载尺码列表（过滤已删除的）
      const sizesResult = await query('size_dict', null, {
        excludeDeleted: true,
        orderBy: { field: 'order', direction: 'ASC' }
      })
      const newSize = sizesResult.data.find(s => (s._id || s.id) === (result._id || result.id))

      if (newSize) {
        // 自动选中新添加的尺码
        const selectedSizes = [...this.data.selectedSizes, newSize]
        // 确保 availableSizes 保存的是名称字符串数组
        const sizeNames = selectedSizes.map(item => {
          if (typeof item === 'string') {
            return item
          }
          if (typeof item === 'object' && item !== null) {
            return item.name || item._id || String(item)
          }
          return String(item)
        }).filter(name => name && name.trim())

        this.setData({
          sizeOptions: sizesResult.data || [],
          selectedSizes: selectedSizes,
          availableSizes: sizeNames
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '添加成功',
        icon: 'success'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('添加尺码失败:', error)

      let errorMsg = '添加失败'
      if (error.errCode === -502005 || error.message.includes('collection not exists')) {
        errorMsg = '尺码字典表不存在，请先在"基础信息设置"中创建'
      } else if (error.errCode === -502002) {
        errorMsg = '尺码名称已存在'
      }

      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      })
    }
  },

  onYarnsChange(e) {
    const selectedYarns = e.detail.value || []
    this.setData({
      selectedYarns: selectedYarns,
      yarnIds: selectedYarns.map(item => item._id || item.id || item)
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  async onSubmit() {
    // 防止重复提交
    if (this.data.submitting) {
      return
    }

    // 验证必填字段
    if (!this.data.styleCode || !this.data.styleName || !this.data.yarnUsagePerPiece || !this.data.processingFeePerDozen) {
      wx.showToast({
        title: '请填写必填字段（款号、名称、用纱量、加工单价）',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      // 检查款号是否重复
      const existingStyles = await query('styles', {
        styleCode: this.data.styleCode.trim()
      }, { excludeDeleted: true })

      // 新增模式：不能有同名款号
      // 编辑模式：不能有同名款号（排除自己）
      const duplicates = existingStyles.data.filter(s => {
        if (this.data.isEdit) {
          return s._id !== this.data.styleId
        }
        return true
      })

      if (duplicates.length > 0) {
        wx.showToast({
          title: '款号已存在，请使用其他款号',
          icon: 'none',
          duration: 2000
        })
        this.setData({ submitting: false })
        return
      }
    } catch (e) {
      console.warn('检查款号重复失败:', e)
      // 检查失败不阻止保存，继续执行
    }

    try {
      // 从 selectedColors 和 selectedSizes 重新计算 availableColors 和 availableSizes
      // 确保保存的是名称字符串数组
      const selectedColors = this.data.selectedColors || []
      const selectedSizes = this.data.selectedSizes || []

      const colors = selectedColors.map(item => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object' && item !== null) {
          return item.name || item._id || item.id || String(item)
        }
        return String(item)
      }).filter(name => name && name.trim())

      const sizes = selectedSizes.map(item => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object' && item !== null) {
          return item.name || item._id || item.id || String(item)
        }
        return String(item)
      }).filter(name => name && name.trim())

      const yarnIds = this.data.yarnIds || []

      console.log('保存款号数据:', {
        styleCode: this.data.styleCode,
        selectedColorsCount: selectedColors.length,
        selectedSizesCount: selectedSizes.length,
        colorsToSave: colors,
        sizesToSave: sizes
      })

      // 确保 colors 和 sizes 是数组，即使为空也要保存
      const styleData = {
        styleCode: this.data.styleCode,
        styleName: this.data.styleName,
        category: this.data.category || '',
        yarnUsagePerPiece: parseFloat(this.data.yarnUsagePerPiece),
        lossRate: parseFloat(this.data.lossRate) || 0,
        actualUsage: parseFloat(this.data.actualUsage) || 0,
        processingFeePerDozen: parseFloat(this.data.processingFeePerDozen) || 0,
        processingFeePerPiece: parseFloat(this.data.processingFeePerPiece) || 0,
        availableColors: colors,
        availableSizes: sizes,
        yarnIds: yarnIds,
        remark: this.data.remark || '',
        imageUrl: this.data.imageUrl || ''
      }

      let result
      if (this.data.isEdit) {
        // 编辑模式：优先使用 _id，确保类型匹配
        console.log('更新款号数据到数据库:', {
          styleId: this.data.styleId,
          styleData: styleData
        })

        await update('styles', styleData, {
          _id: this.data.styleId // 使用 _id 确保类型匹配
        })

        result = { _id: this.data.styleId }
      } else {
        // 新增模式
        console.log('新增款号数据到数据库:', {
          styleData: styleData
        })
        result = await insert('styles', styleData)
        console.log('新增结果:', result)
      }

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      console.error('保存失败:', error)
      wx.showToast({
        title: '保存失败：' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      })
      this.setData({ submitting: false })
    }
  },

  onCancel() {
    wx.navigateBack()
  },

  // 停用/启用款号
  async onToggleDisabled() {
    const newStatus = !this.data.disabled
    const action = newStatus ? '停用' : '启用'

    // 如果要停用，先检查是否有未完成的发料单
    if (newStatus) {
      try {
        wx.showLoading({ title: '检查中...' })

        const db = wx.cloud.database()
        const _ = db.command

        // 查询该款号下所有未完成的发料单（未删除、未作废、状态不是"已完成"）
        const issueOrdersRes = await db.collection('issue_orders')
          .where({
            styleId: this.data.styleId,
            deleted: _.neq(true),
            voided: _.neq(true),
            status: _.neq('已完成')
          })
          .get()

        const incompleteOrders = (issueOrdersRes.data || []).filter(order => {
          // 双重检查：确保不是已完成、未删除、未作废
          return order.status !== '已完成' &&
            order.deleted !== true &&
            order.voided !== true
        })

        wx.hideLoading()

        if (incompleteOrders.length > 0) {
          wx.showModal({
            title: '无法停用',
            content: `该款号还有 ${incompleteOrders.length} 个未完成的发料单，请先完成相关单据后再停用。\n\n发料单编号：${incompleteOrders.slice(0, 3).map(o => o.issueNo || o.issue_no || '未知').join('、')}${incompleteOrders.length > 3 ? '...' : ''}`,
            showCancel: false,
            confirmText: '我知道了',
            success: () => {
              // 可选：跳转到发料单列表，并筛选该款号
              wx.navigateTo({
                url: '/pages/issue/index'
              })
            }
          })
          return
        }
      } catch (error) {
        wx.hideLoading()
        console.error('检查未完成发料单失败:', error)
        // 如果检查失败，为了安全起见，不允许停用
        wx.showModal({
          title: '检查失败',
          content: '无法检查该款号的发料单状态，为安全起见，暂不允许停用。请稍后重试。',
          showCancel: false
        })
        return
      }
    }

    wx.showModal({
      title: '确认' + action,
      content: `确定要${action}款号 "${this.data.styleCode}" 吗？${newStatus ? '停用后该款号将不会出现在选择列表中。' : ''}`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })

            console.log('开始' + action + '款号:', this.data.styleId)

            // 直接使用云数据库操作，强制设置属性
            const db = wx.cloud.database()
            const result = await db.collection('styles')
              .doc(this.data.styleId)
              .update({
                data: {
                  disabled: newStatus,
                  updateTime: db.serverDate()
                }
              })

            console.log('停用操作数据库返回:', result)

            // 确认更新成功
            if (result.stats.updated === 0) {
              throw new Error('权限不足或记录不存在，请检查数据库权限设置')
            }

            wx.hideLoading()
            wx.showToast({
              title: action + '成功',
              icon: 'success'
            })

            // 延迟返回列表
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
          } catch (error) {
            wx.hideLoading()
            console.error(action + '失败:', error)
            wx.showToast({
              title: action + '失败: ' + (error.message || '未知错误'),
              icon: 'none',
              duration: 3000
            })
          }
        }
      }
    })
  },

  // 选择图片
  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        this.uploadImage(res.tempFilePaths[0])
      },
      fail: (err) => {
        console.error('选择图片失败:', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 拍照
  onTakePhoto() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => {
        this.uploadImage(res.tempFilePaths[0])
      },
      fail: (err) => {
        console.error('拍照失败:', err)
        wx.showToast({
          title: '拍照失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传图片到云存储
  async uploadImage(filePath) {
    try {
      wx.showLoading({
        title: '上传中...'
      })

      // 生成唯一文件名
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const fileExtension = filePath.substring(filePath.lastIndexOf('.'))
      const cloudPath = `styles/${timestamp}_${randomStr}${fileExtension}`

      // 上传到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      // 获取文件ID
      const fileID = uploadResult.fileID

      // 保存原始 fileID 用于数据库存储，同时获取临时URL用于显示
      let displayUrl = fileID
      try {
        displayUrl = await getImageUrl(fileID)
      } catch (e) {
        console.warn('获取临时URL失败，使用原始fileID:', e)
      }

      this.setData({
        imageUrl: fileID,  // 保存原始 cloud:// URL 到数据库
        imageDisplayUrl: displayUrl,  // 用于页面显示
        imageError: false
      })

      wx.hideLoading()
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('上传图片失败:', error)
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    }
  },

  // 删除图片
  onDeleteImage() {
    wx.showModal({
      title: '提示',
      content: '确定要删除这张图片吗？',
      success: (res) => {
        if (res.confirm) {
          // 如果图片已上传到云存储，可以删除云存储文件
          if (this.data.imageUrl && this.data.imageUrl.startsWith('cloud://')) {
            wx.cloud.deleteFile({
              fileList: [this.data.imageUrl],
              success: () => {
                console.log('删除云存储文件成功')
              },
              fail: (err) => {
                console.error('删除云存储文件失败:', err)
              }
            })
          }

          this.setData({
            imageUrl: '',
            imageDisplayUrl: '',
            imageError: false
          })
        }
      }
    })
  }
})




