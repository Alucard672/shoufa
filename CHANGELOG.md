# 更新日志

## 2024-01-XX 功能更新

### 1. 回货数大于发料数时显示结束按钮并标记为已完成

**功能说明**：
- 当回货件数大于发料件数时，在发料单列表页面显示"结束"按钮
- 点击"结束"按钮后，将发料单状态标记为"已完成"

**修改文件**：
- `pages/issue/index.js`: 添加了计算发料件数和判断是否显示结束按钮的逻辑
- `pages/issue/index.wxml`: 添加了结束按钮的显示

**实现逻辑**：
- 发料件数 = 发料重量(kg) × 1000 / 单件用量(g)
- 当回货件数 > 发料件数 且 状态不是"已完成"时，显示结束按钮
- 点击结束按钮后，更新发料单状态为"已完成"

### 2. 款号颜色尺码修改为字典的方式

**功能说明**：
- 创建了颜色字典表 (`color_dict`) 和尺码字典表 (`size_dict`)
- 款号创建页面改为从字典表选择颜色和尺码
- 发料单创建页面改为从字典表选择颜色

**修改文件**：
- `pages/style/create.js`: 修改为从字典表加载颜色和尺码选项
- `pages/style/create.wxml`: 使用搜索选择组件选择颜色和尺码
- `pages/style/create.json`: 引入搜索选择组件
- `pages/issue/create.js`: 添加加载颜色字典的逻辑
- `pages/issue/create.wxml`: 使用搜索选择组件选择颜色
- `pages/issue/create.json`: 引入搜索选择组件
- `components/search-select/`: 新建搜索选择组件
- `database/dict_init.md`: 字典表初始化说明文档

**新增组件**：
- `components/search-select/search-select.js`: 搜索选择组件逻辑
- `components/search-select/search-select.wxml`: 搜索选择组件模板
- `components/search-select/search-select.wxss`: 搜索选择组件样式
- `components/search-select/search-select.json`: 搜索选择组件配置
- `components/search-select/search-select.wxs`: 搜索选择辅助函数

**数据库变更**：
- 需要创建 `color_dict` 集合（颜色字典表）
- 需要创建 `size_dict` 集合（尺码字典表）
- 详见 `database/dict_init.md`

### 3. 发料单选择加工厂与款号的方式改为搜索选取

**功能说明**：
- 发料单创建页面中，加工厂和款号的选择从下拉选择器改为搜索选择方式
- 支持通过搜索关键词快速找到目标选项

**修改文件**：
- `pages/issue/create.js`: 修改选择逻辑，使用搜索选择组件
- `pages/issue/create.wxml`: 将 picker 组件替换为 search-select 组件
- `components/search-select/`: 新建搜索选择组件（与功能2共用）

**功能特点**：
- 支持搜索关键词过滤选项
- 单选和多选模式
- 模态框展示，用户体验更好
- 支持键盘搜索

## 使用说明

### 字典表初始化

在使用新功能前，需要在云数据库中创建字典表：

1. 创建 `color_dict` 集合
2. 创建 `size_dict` 集合
3. 为 `name` 字段创建唯一索引
4. 添加常用的颜色和尺码数据

详细说明请参考 `database/dict_init.md`

### 搜索选择组件使用

搜索选择组件支持以下属性：
- `placeholder`: 占位符文本
- `options`: 选项列表
- `display-key`: 显示字段名（默认 'name'）
- `value-key`: 值字段名（默认 '_id'）
- `selected-values`: 已选中的值数组
- `multiple`: 是否多选（默认 false）

事件：
- `bindchange`: 选择变化时触发，返回选中的值

## 注意事项

1. 字典表必须在云数据库中创建后才能正常使用颜色和尺码选择功能
2. 如果字典表不存在，系统会使用空数组，不会报错，但无法选择
3. 结束按钮只在回货件数大于发料件数时显示
4. 发料单状态更新为"已完成"后，不会再显示结束按钮

