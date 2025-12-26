// pages/plan/index.js
import { query, queryByIds, remove } from '../../utils/db.js'
import { formatDate, calculatePlanYarnUsage } from '../../utils/calc.js'
const app = getApp()

Page({
    data: {
        plans: [],
        searchKeyword: '',
        statusFilter: 'all'
    },

    onLoad() {
        this.loadPlans()
    },

    onShow() {
        this.loadPlans()
    },

    onPullDownRefresh() {
        this.loadPlans().then(() => {
            wx.stopPullDownRefresh()
        })
    },

    async loadPlans() {
        try {
            wx.showLoading({ title: '加载中...' })
            
            const whereClause = {}
            
            if (this.data.statusFilter !== 'all') {
                whereClause.status = this.data.statusFilter
            }

            if (this.data.searchKeyword) {
                whereClause.plan_no = this.data.searchKeyword
            }

            const result = await query('production_plans', whereClause, {
                excludeDeleted: true,
                orderBy: { field: 'createTime', direction: 'DESC' }
            })

            // 批量查询款号和工厂名称
            const styleIds = [...new Set(result.data.map(plan => plan.styleId || plan.style_id).filter(Boolean))]
            const factoryIds = [...new Set(result.data.map(plan => plan.factoryId || plan.factory_id).filter(Boolean))]

            const [stylesRes, factoriesRes] = await Promise.all([
                queryByIds('styles', styleIds),
                queryByIds('factories', factoryIds)
            ])

            const stylesMap = new Map()
            stylesRes.data.forEach(style => {
                stylesMap.set(style.id || style._id, style)
            })

            const factoriesMap = new Map()
            factoriesRes.data.forEach(factory => {
                factoriesMap.set(factory.id || factory._id, factory)
            })

            // 关联查询款号和工厂名称
            const plans = result.data.map(plan => {
                const styleId = plan.styleId || plan.style_id
                const factoryId = plan.factoryId || plan.factory_id
                const style = stylesMap.get(styleId)
                const factory = factoriesMap.get(factoryId)

                return {
                    ...plan,
                    _id: plan._id || plan.id,
                    styleName: style?.styleName || style?.style_name || style?.name || '未知款号',
                    styleCode: style?.styleCode || style?.style_code || '',
                    factoryName: factory?.name || '未知工厂',
                    planDateFormatted: formatDate(plan.planDate || plan.plan_date),
                    planYarnUsageFormatted: (plan.planYarnUsage || plan.plan_yarn_usage || 0).toFixed(2)
                }
            })

            this.setData({ plans })
        } catch (error) {
            console.error('加载生产计划失败:', error)
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            wx.hideLoading()
        }
    },

    onSearch(e) {
        this.setData({ searchKeyword: e.detail.value })
        this.loadPlans()
    },

    onStatusChange(e) {
        const status = e.currentTarget.dataset.status
        this.setData({ statusFilter: status })
        this.loadPlans()
    },

    navigateToCreate() {
        wx.navigateTo({ url: '/pages/plan/create' })
    },

    onEditPlan(e) {
        const id = e.currentTarget.dataset.id
        wx.navigateTo({ url: `/pages/plan/create?id=${id}` })
    },

    async onDeletePlan(e) {
        const id = e.currentTarget.dataset.id
        const res = await wx.showModal({
            title: '提示',
            content: '确定要删除该计划单吗？'
        })

        if (res.confirm) {
            try {
                await remove('production_plans', {
                    id: id
                })
                wx.showToast({ title: '删除成功', icon: 'success' })
                this.loadPlans()
            } catch (error) {
                wx.showToast({ title: '删除失败', icon: 'none' })
            }
        }
    }
})
