# SVG 图标说明

## 概述

项目中所有 emoji 图标已替换为 SVG 图标，提供更好的跨平台兼容性和视觉效果。

## 图标列表

所有图标文件位于 `/images/icons/` 目录下：

| 图标文件 | 用途 | 使用位置 |
|---------|------|---------|
| `close.svg` | 关闭按钮 | 所有模态框的关闭按钮 |
| `remove.svg` | 删除/移除 | 图片删除、选中项移除 |
| `check.svg` | 选中标记 | 搜索选择组件的选中状态 |
| `search.svg` | 搜索 | 搜索框图标 |
| `edit.svg` | 编辑 | 款号列表的编辑按钮 |
| `camera.svg` | 相机 | 图片上传的拍照功能、占位符 |
| `folder.svg` | 文件夹 | 图片上传的选择图片功能 |
| `package.svg` | 包装盒 | 动态列表中的款号图标 |
| `calendar.svg` | 日历 | 动态列表中的日期图标 |
| `user.svg` | 用户 | 我的页面中的联系人图标 |
| `phone.svg` | 电话 | 我的页面中的电话图标 |
| `location.svg` | 位置 | 我的页面中的地址图标 |
| `factory.svg` | 工厂 | 我的页面中的加工厂管理图标 |
| `shirt.svg` | 衣服 | 我的页面中的款号管理图标 |
| `yarn.svg` | 纱线 | 我的页面中的纱线管理图标 |
| `settings.svg` | 设置 | 我的页面中的基础信息设置图标 |
| `home.svg` / `home-active.svg` | 首页 | TabBar 导航（需转换为 PNG） |
| `issue.svg` / `issue-active.svg` | 发料 | TabBar 导航（需转换为 PNG） |
| `return.svg` / `return-active.svg` | 回货 | TabBar 导航（需转换为 PNG） |
| `statistics.svg` / `statistics-active.svg` | 统计 | TabBar 导航（需转换为 PNG） |
| `mine.svg` / `mine-active.svg` | 我的 | TabBar 导航（需转换为 PNG） |

## 使用方法

### 在 WXML 中使用

```xml
<!-- 使用 image 标签 -->
<image class="icon" src="/images/icons/close.svg" mode="aspectFit"></image>
```

### 样式设置

SVG 图标使用 `color` 属性来控制颜色（通过 CSS 的 `currentColor`）：

```css
.icon {
  width: 16px;
  height: 16px;
  color: #6A7282; /* 图标颜色 */
}
```

## 图标规格

- **尺寸**: 16x16px（标准尺寸）
- **格式**: SVG
- **颜色**: 使用 `currentColor`，可通过 CSS 的 `color` 属性控制
- **描边宽度**: 1.5px（标准）

## 已替换的文件

### 页面文件
- `pages/style/create.wxml` - 关闭、删除、文件夹、相机图标
- `pages/style/index.wxml` - 编辑、相机占位符图标
- `pages/index/activities.wxml` - 搜索、包装盒、日历图标
- `pages/mine/index.wxml` - 用户、电话、位置图标
- `pages/mine/index.js` - 工厂、衣服、纱线、设置图标
- `pages/yarn/create.wxml` - 关闭图标
- `pages/factory/create.wxml` - 关闭图标
- `pages/settings/color.wxml` - 关闭图标
- `pages/settings/size.wxml` - 关闭图标

### 组件文件
- `components/search-box/search-box.wxml` - 搜索图标
- `components/search-select/search-select.wxml` - 关闭、删除、选中图标

## 样式更新

所有相关样式文件已更新，确保 SVG 图标正确显示：
- 移除了 `font-size` 属性
- 添加了 `width` 和 `height` 属性
- 使用 `color` 属性控制图标颜色

## TabBar 导航图标

底部导航栏图标已创建 SVG 格式，但**微信小程序原生 tabBar 不支持 SVG，需要转换为 PNG 格式**。

转换方法详见：`images/tab/README.md`

## 注意事项

1. SVG 图标使用 `currentColor`，可以通过 CSS 的 `color` 属性改变颜色
2. 所有图标都使用 `mode="aspectFit"` 保持比例
3. 图标尺寸根据使用场景调整（16px、20px、24px、32px 等）
4. **TabBar 图标需要转换为 81x81px 的 PNG 格式才能使用**

