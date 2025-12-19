// pages/style/create.js
Page({
  data: {
    styleId: '',
    isEdit: false,
    imageUrl: '',
    styleCode: '',
    styleName: '',
    category: '',
    yarnUsagePerPiece: '',
    lossRate: '',
    actualUsage: '',
    availableColors: [],
    availableSizes: [],
    selectedColors: [],
    selectedSizes: [],
    colorOptions: [],
    sizeOptions: [],
    yarnOptions: [],
    selectedYarns: [],
    yarnIds: [],
    remark: ''
  },

  async onLoad(options) {
    // 先加载字典数据（包括纱线列表）
    await this.loadDictionaries()
    
    if (options.id) {
      this.setData({
        styleId: options.id,
        isEdit: true
      })
      // 等待字典数据加载完成后再加载款号数据
      await this.loadStyle(options.id)
    }
  },

  async loadStyle(styleId) {
    try {
      wx.showLoading({
        title: '加载中...'
      })
      
      const db = wx.cloud.database()
      const style = await db.collection('styles').doc(styleId).get()
      
      if (style.data) {
        const styleData = style.data
        
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
        
        if (styleData.availableColors) {
          // 处理不同的数据格式
          let colorsToProcess = []
          
          // 如果 availableColors 是字符串（可能是逗号分隔的字符串）
          if (typeof styleData.availableColors === 'string') {
            colorsToProcess = styleData.availableColors.split(',').map(c => c.trim()).filter(c => c)
          } 
          // 如果 availableColors 是数组
          else if (Array.isArray(styleData.availableColors)) {
            colorsToProcess = styleData.availableColors
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
        
        if (styleData.availableSizes) {
          // 处理不同的数据格式
          let sizesToProcess = []
          
          // 如果 availableSizes 是字符串（可能是逗号分隔的字符串）
          if (typeof styleData.availableSizes === 'string') {
            sizesToProcess = styleData.availableSizes.split(',').map(s => s.trim()).filter(s => s)
          } 
          // 如果 availableSizes 是数组
          else if (Array.isArray(styleData.availableSizes)) {
            sizesToProcess = styleData.availableSizes
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
        if (styleData.yarnIds && styleData.yarnIds.length > 0) {
          styleData.yarnIds.forEach(yarnId => {
            const yarn = yarnOptions.find(y => y._id === yarnId)
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
        
        this.setData({
          imageUrl: styleData.imageUrl || '',
          styleCode: styleData.styleCode || '',
          styleName: styleData.styleName || '',
          category: styleData.category || '',
          yarnUsagePerPiece: styleData.yarnUsagePerPiece ? styleData.yarnUsagePerPiece.toString() : '',
          lossRate: styleData.lossRate ? styleData.lossRate.toString() : '',
          actualUsage: styleData.actualUsage ? styleData.actualUsage.toString() : '',
          availableColors: styleData.availableColors || [],
          availableSizes: styleData.availableSizes || [],
          selectedColors: selectedColors,
          selectedSizes: selectedSizes,
          selectedYarns: selectedYarns,
          yarnIds: styleData.yarnIds || [],
          remark: styleData.remark || ''
        })
        
        this.calculateActualUsage()
      }
      
      wx.hideLoading()
    } catch (error) {
      wx.hideLoading()
      console.error('加载款号失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  async loadDictionaries() {
    const db = wx.cloud.database()
    const _ = db.command
    
    try {
      const promises = []
      
      // 加载颜色字典（如果集合不存在，返回空数组）
      promises.push(
        db.collection('color_dict')
          .where({
            deleted: _.eq(false)
          })
          .get()
          .catch(err => {
            if (err.errCode === -502005 || (err.message && err.message.indexOf('collection not exists') >= 0)) {
              return { data: [] }
            }
            throw err
          })
      )
      
      // 加载尺码字典（如果集合不存在，返回空数组）
      promises.push(
        db.collection('size_dict')
          .where({
            deleted: _.eq(false)
          })
          .orderBy('order', 'asc')
          .orderBy('createTime', 'desc')
          .get()
          .catch(err => {
            if (err.errCode === -502005 || (err.message && err.message.indexOf('collection not exists') >= 0)) {
              return { data: [] }
            }
            throw err
          })
      )
      
      // 加载纱线列表（如果集合不存在，返回空数组）
      promises.push(
        db.collection('yarn_inventory')
          .where({
            deleted: wx.cloud.database().command.neq(true)
          })
          .get()
          .catch(err => {
            if (err.errCode === -502005 || (err.message && err.message.indexOf('collection not exists') >= 0)) {
              return { data: [] }
            }
            throw err
          })
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

  calculateActualUsage() {
    const yarnUsage = parseFloat(this.data.yarnUsagePerPiece) || 0
    const lossRate = parseFloat(this.data.lossRate) || 0
    const actualUsage = yarnUsage * (1 + lossRate / 100)
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

      const db = wx.cloud.database()
      
      // 检查集合是否存在，如果不存在则提示用户
      try {
        await db.collection('color_dict').limit(1).get()
      } catch (checkError) {
        if (checkError.errCode === -502005 || checkError.message.includes('collection not exists')) {
          wx.hideLoading()
          wx.showModal({
            title: '提示',
            content: '颜色字典表不存在，请先在"基础信息设置"中创建颜色字典表',
            showCancel: false,
            confirmText: '知道了'
          })
          return
        }
      }
      
      const result = await db.collection('color_dict').add({
        data: {
          name: name,
          code: code || '',
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          deleted: false
        }
      })

      // 重新加载颜色列表（过滤已删除的）
      const _ = db.command
      const colorsResult = await db.collection('color_dict')
        .where({
          deleted: _.eq(false)
        })
        .get()
      const newColor = colorsResult.data.find(c => c._id === result._id)
      
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

      const db = wx.cloud.database()
      
      // 检查集合是否存在，如果不存在则提示用户
      try {
        await db.collection('size_dict').limit(1).get()
      } catch (checkError) {
        if (checkError.errCode === -502005 || checkError.message.includes('collection not exists')) {
          wx.hideLoading()
          wx.showModal({
            title: '提示',
            content: '尺码字典表不存在，请先在"基础信息设置"中创建尺码字典表',
            showCancel: false,
            confirmText: '知道了'
          })
          return
        }
      }
      
      const result = await db.collection('size_dict').add({
        data: {
          name: name,
          code: code || '',
          order: code ? parseInt(code) : 0,
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          deleted: false
        }
      })

      // 重新加载尺码列表（过滤已删除的）
      const _ = db.command
      const sizesResult = await db.collection('size_dict')
        .where({
          deleted: _.eq(false)
        })
        .orderBy('order', 'asc')
        .orderBy('createTime', 'desc')
        .get()
      const newSize = sizesResult.data.find(s => s._id === result._id)
      
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
      yarnIds: selectedYarns.map(item => item._id || item)
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  async onSubmit() {
    // 验证必填字段
    if (!this.data.styleCode || !this.data.styleName || !this.data.yarnUsagePerPiece) {
      wx.showToast({
        title: '请填写必填字段',
        icon: 'none'
      })
      return
    }

    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 从 selectedColors 和 selectedSizes 重新计算 availableColors 和 availableSizes
      // 确保保存的是名称字符串数组
      const selectedColors = this.data.selectedColors || []
      const selectedSizes = this.data.selectedSizes || []
      
      const colors = selectedColors.map(item => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object' && item !== null) {
          return item.name || item._id || String(item)
        }
        return String(item)
      }).filter(name => name && name.trim())
      
      const sizes = selectedSizes.map(item => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object' && item !== null) {
          return item.name || item._id || String(item)
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
        actualUsage: parseFloat(this.data.actualUsage) || parseFloat(this.data.yarnUsagePerPiece),
        availableColors: Array.isArray(colors) ? colors : [],
        availableSizes: Array.isArray(sizes) ? sizes : [],
        yarnIds: Array.isArray(yarnIds) ? yarnIds : [],
        remark: this.data.remark || '',
        updateTime: db.serverDate()
      }
      
      // 确保数组字段不为 undefined
      if (styleData.availableColors === undefined) {
        styleData.availableColors = []
      }
      if (styleData.availableSizes === undefined) {
        styleData.availableSizes = []
      }
      if (styleData.yarnIds === undefined) {
        styleData.yarnIds = []
      }

      // 添加图片URL
      styleData.imageUrl = this.data.imageUrl || ''

      let result
      if (this.data.isEdit) {
        // 编辑模式
        console.log('更新款号数据到数据库:', {
          styleId: this.data.styleId,
          styleData: styleData,
          availableColors: styleData.availableColors,
          availableColorsLength: styleData.availableColors ? styleData.availableColors.length : 0,
          availableSizes: styleData.availableSizes,
          availableSizesLength: styleData.availableSizes ? styleData.availableSizes.length : 0
        })
        
        // 确保数组字段被正确传递，创建新的数组副本避免引用问题
        const colorsToSave = Array.isArray(styleData.availableColors) 
          ? [...styleData.availableColors] 
          : []
        const sizesToSave = Array.isArray(styleData.availableSizes) 
          ? [...styleData.availableSizes] 
          : []
        const yarnIdsToSave = Array.isArray(styleData.yarnIds) 
          ? [...styleData.yarnIds] 
          : []
        
        console.log('准备保存的数组数据:', {
          colorsToSave: colorsToSave,
          colorsToSaveLength: colorsToSave.length,
          colorsToSaveJSON: JSON.stringify(colorsToSave),
          sizesToSave: sizesToSave,
          sizesToSaveLength: sizesToSave.length
        })
        
        // 使用明确的字段更新，确保数组字段被正确保存
        const updateData = {
          styleCode: styleData.styleCode,
          styleName: styleData.styleName,
          category: styleData.category || '',
          yarnUsagePerPiece: styleData.yarnUsagePerPiece,
          lossRate: styleData.lossRate || 0,
          actualUsage: styleData.actualUsage,
          imageUrl: styleData.imageUrl || '',
          availableColors: colorsToSave, // 使用新数组副本
          availableSizes: sizesToSave, // 使用新数组副本
          yarnIds: yarnIdsToSave, // 使用新数组副本
          remark: styleData.remark || '',
          updateTime: db.serverDate()
        }
        
        console.log('实际更新的数据:', {
          availableColors: updateData.availableColors,
          availableColorsType: Array.isArray(updateData.availableColors),
          availableColorsLength: updateData.availableColors.length,
          availableColorsValue: JSON.stringify(updateData.availableColors)
        })
        
        // 使用云函数更新，避免客户端更新限制
        console.log('使用云函数更新款号数据')
        const cloudResult = await wx.cloud.callFunction({
          name: 'updateStyle',
          data: {
            styleId: this.data.styleId,
            styleData: updateData
          }
        })
        
        console.log('云函数更新结果:', cloudResult.result)
        
        if (cloudResult.result && cloudResult.result.success) {
          console.log('云函数验证数据:', cloudResult.result.verifyData)
          result = cloudResult.result.result
        } else {
          throw new Error(cloudResult.result?.error || '云函数更新失败')
        }
      } else {
        // 新增模式
        console.log('新增款号数据到数据库:', {
          styleData: styleData
        })
        result = await db.collection('styles').add({
          data: {
            ...styleData,
            createTime: db.serverDate(),
            deleted: false
          }
        })
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
    }
  },

  onCancel() {
    wx.navigateBack()
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

      // 获取文件ID（可以直接使用，也可以获取下载链接）
      const fileID = uploadResult.fileID
      
      this.setData({
        imageUrl: fileID
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
            imageUrl: ''
          })
        }
      }
    })
  }
})




