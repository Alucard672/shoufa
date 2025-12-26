// pages/plan/create.js
import { query, insert, update, getFactoryById, getStyleById } from '../../utils/db.js'
import { generatePlanNo, formatDate, calculatePlanYarnUsage } from '../../utils/calc.js'
const app = getApp()

Page({
    data: {
        planId: '',
        isEdit: false,
        planNo: '',
        factories: [],
        styles: [],
        selectedFactoryIndex: -1,
        selectedStyleIndex: -1,
        colorOptions: [],
        sizeOptions: [],
        selectedColorIndex: -1,
        selectedSizeIndex: -1,
        planQuantity: '',
        planYarnUsage: 0,
        planDate: '',
        status: '待发料',
        statusOptions: ['待发料', '已发料', '已完成']
    },

    async onLoad(options) {
        const today = formatDate(new Date())
        this.setData({
            planDate: today,
            planNo: generatePlanNo()
        })

        await Promise.all([
            this.loadFactories(),
            this.loadStyles()
        ])

        if (options.id) {
            this.setData({
                planId: options.id,
                isEdit: true
            })
            this.loadPlan(options.id)
        }
    },

    async loadFactories() {
        const result = await query('factories', null, {
            excludeDeleted: true
        })
        this.setData({ factories: result.data })
    },

    async loadStyles() {
        const result = await query('styles', null, {
            excludeDeleted: true
        })
        this.setData({ styles: result.data })
    },

    async loadPlan(id) {
        try {
            const res = await query('production_plans', {
                id: id
            }, {
                excludeDeleted: true
            })

            if (!res.data || res.data.length === 0) {
                throw new Error('计划不存在')
            }

            const plan = res.data[0]

            if (plan.tenantId && plan.tenantId !== app.globalData.tenantId) {
                throw new Error('无权访问该计划')
            }

            const factoryId = plan.factoryId || plan.factory_id
            const styleId = plan.styleId || plan.style_id

            const factoryIndex = this.data.factories.findIndex(f => (f._id || f.id) === factoryId)
            const styleIndex = this.data.styles.findIndex(s => (s._id || s.id) === styleId)
            const statusIndex = this.data.statusOptions.indexOf(plan.status)

            // 处理款号的 availableColors 和 availableSizes（可能是 JSON 字符串）
            let availableColors = []
            let availableSizes = []
            if (styleIndex > -1) {
                const style = this.data.styles[styleIndex]
                if (style.availableColors) {
                    if (typeof style.availableColors === 'string') {
                        try {
                            availableColors = JSON.parse(style.availableColors)
                        } catch (e) {
                            availableColors = []
                        }
                    } else {
                        availableColors = style.availableColors
                    }
                }
                if (style.availableSizes) {
                    if (typeof style.availableSizes === 'string') {
                        try {
                            availableSizes = JSON.parse(style.availableSizes)
                        } catch (e) {
                            availableSizes = []
                        }
                    } else {
                        availableSizes = style.availableSizes
                    }
                }
            }

            this.setData({
                planNo: plan.planNo || plan.plan_no,
                selectedFactoryIndex: factoryIndex,
                selectedStyleIndex: styleIndex,
                planQuantity: (plan.planQuantity || plan.plan_quantity) ? (plan.planQuantity || plan.plan_quantity).toString() : '',
                planYarnUsage: plan.planYarnUsage || plan.plan_yarn_usage || 0,
                planDate: formatDate(plan.planDate || plan.plan_date),
                status: plan.status,
                colorOptions: availableColors,
                sizeOptions: availableSizes
            })

            if (styleIndex > -1) {
                this.updateOptionsAndValues(styleIndex, plan.color, plan.size)
            }
        } catch (error) {
            console.error('加载计划失败:', error)
        }
    },

    updateOptionsAndValues(styleIndex, selectedColor, selectedSize) {
        const style = this.data.styles[styleIndex]
        
        // 处理 JSON 字符串
        let colorOptions = []
        let sizeOptions = []
        
        if (style.availableColors) {
            if (typeof style.availableColors === 'string') {
                try {
                    colorOptions = JSON.parse(style.availableColors)
                } catch (e) {
                    colorOptions = []
                }
            } else {
                colorOptions = style.availableColors
            }
        }
        
        if (style.availableSizes) {
            if (typeof style.availableSizes === 'string') {
                try {
                    sizeOptions = JSON.parse(style.availableSizes)
                } catch (e) {
                    sizeOptions = []
                }
            } else {
                sizeOptions = style.availableSizes
            }
        }

        const colorIndex = colorOptions.indexOf(selectedColor)
        const sizeIndex = sizeOptions.indexOf(selectedSize)

        this.setData({
            colorOptions,
            sizeOptions,
            selectedColorIndex: colorIndex,
            selectedSizeIndex: sizeIndex
        })
    },

    onFactoryChange(e) {
        this.setData({ selectedFactoryIndex: e.detail.value })
    },

    onStyleChange(e) {
        const styleIndex = e.detail.value
        const style = this.data.styles[styleIndex]
        
        // 处理 JSON 字符串
        let colorOptions = []
        let sizeOptions = []
        
        if (style.availableColors) {
            if (typeof style.availableColors === 'string') {
                try {
                    colorOptions = JSON.parse(style.availableColors)
                } catch (e) {
                    colorOptions = []
                }
            } else {
                colorOptions = style.availableColors
            }
        }
        
        if (style.availableSizes) {
            if (typeof style.availableSizes === 'string') {
                try {
                    sizeOptions = JSON.parse(style.availableSizes)
                } catch (e) {
                    sizeOptions = []
                }
            } else {
                sizeOptions = style.availableSizes
            }
        }
        
        this.setData({
            selectedStyleIndex: styleIndex,
            colorOptions: colorOptions,
            sizeOptions: sizeOptions,
            selectedColorIndex: -1,
            selectedSizeIndex: -1
        })
        this.calculateUsage()
    },

    onColorChange(e) {
        this.setData({ selectedColorIndex: e.detail.value })
    },

    onSizeChange(e) {
        this.setData({ selectedSizeIndex: e.detail.value })
    },

    onStatusChange(e) {
        this.setData({ status: this.data.statusOptions[e.detail.value] })
    },

    onQuantityInput(e) {
        const val = e.detail.value
        this.setData({ planQuantity: val })
        this.calculateUsage()
    },

    onDateChange(e) {
        this.setData({ planDate: e.detail.value })
    },

    calculateUsage() {
        const styleIndex = this.data.selectedStyleIndex
        const quantity = parseFloat(this.data.planQuantity) || 0
        if (styleIndex > -1 && quantity > 0) {
            const style = this.data.styles[styleIndex]
            const yarnUsagePerPiece = style.yarnUsagePerPiece || style.yarn_usage_per_piece || 0
            const usage = calculatePlanYarnUsage(quantity * 12, yarnUsagePerPiece) // 打转件
            this.setData({ planYarnUsage: usage })
        }
    },

    async onSubmit() {
        const {
            selectedFactoryIndex, selectedStyleIndex, selectedColorIndex,
            selectedSizeIndex, planQuantity, planDate, status, planNo,
            factories, styles, colorOptions, sizeOptions, isEdit, planId
        } = this.data

        if (selectedFactoryIndex === -1 || selectedStyleIndex === -1 ||
            selectedColorIndex === -1 || selectedSizeIndex === -1 || !planQuantity) {
            wx.showToast({ title: '请填写完整信息', icon: 'none' })
            return
        }

        try {
            wx.showLoading({ title: '保存中...' })
            
            const factoryId = factories[selectedFactoryIndex]._id || factories[selectedFactoryIndex].id
            const styleId = styles[selectedStyleIndex]._id || styles[selectedStyleIndex].id
            
            const data = {
                planNo: planNo,
                factoryId: factoryId,
                styleId: styleId,
                color: colorOptions[selectedColorIndex],
                size: sizeOptions[selectedSizeIndex],
                planQuantity: parseFloat(planQuantity),
                planYarnUsage: this.data.planYarnUsage,
                planDate: new Date(planDate),
                status
            }

            if (isEdit) {
                await update('production_plans', data, {
                    id: planId
                })
            } else {
                await insert('production_plans', data)
            }

            wx.showToast({ title: '保存成功', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1500)
        } catch (error) {
            console.error('保存计划失败:', error)
            wx.showToast({ title: '保存失败', icon: 'none' })
        } finally {
            wx.hideLoading()
        }
    }
})
