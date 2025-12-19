# TabBar 图标说明

## 图标文件

已创建 SVG 格式的图标文件，位于 `images/icons/` 目录：

### 1. 首页
- `home.svg` - 首页未选中图标（灰色 #6A7282）
- `home-active.svg` - 首页选中图标（蓝色 #155DFC）

### 2. 发料
- `issue.svg` - 发料未选中图标（灰色 #6A7282）
- `issue-active.svg` - 发料选中图标（蓝色 #155DFC）

### 3. 回货
- `return.svg` - 回货未选中图标（灰色 #6A7282）
- `return-active.svg` - 回货选中图标（蓝色 #155DFC）

### 4. 统计
- `statistics.svg` - 统计未选中图标（灰色 #6A7282）
- `statistics-active.svg` - 统计选中图标（蓝色 #155DFC）

### 5. 我的
- `mine.svg` - 我的未选中图标（灰色 #6A7282）
- `mine-active.svg` - 我的选中图标（蓝色 #155DFC）

## 重要提示

**微信小程序的原生 tabBar 不支持 SVG 格式，只支持 PNG 格式。**

需要将 SVG 文件转换为 PNG 格式才能使用。

## 转换步骤

### 方法 1：使用在线工具转换
1. 访问在线 SVG 转 PNG 工具（如：https://svgtopng.com/）
2. 上传 SVG 文件
3. 设置尺寸为 **81px × 81px**（推荐）
4. 下载 PNG 文件
5. 将 PNG 文件保存到 `images/tab/` 目录

### 方法 2：使用设计工具转换
1. 使用 Figma、Sketch 或 Adobe Illustrator 打开 SVG 文件
2. 导出为 PNG 格式
3. 尺寸设置为 **81px × 81px**
4. 保存到 `images/tab/` 目录

### 方法 3：使用命令行工具（需要安装 ImageMagick）
```bash
# 安装 ImageMagick（如果未安装）
# macOS: brew install imagemagick
# Ubuntu: sudo apt-get install imagemagick

# 转换单个文件
convert -background none -resize 81x81 images/icons/home.svg images/tab/home.png
convert -background none -resize 81x81 images/icons/home-active.svg images/tab/home-active.png

# 批量转换所有图标
for file in images/icons/{home,issue,return,statistics,mine}{,-active}.svg; do
  name=$(basename "$file" .svg)
  convert -background none -resize 81x81 "$file" "images/tab/$name.png"
done
```

## 需要的 PNG 文件

转换后，请在 `images/tab/` 目录下放置以下 PNG 文件：

- `home.png` - 首页未选中图标
- `home-active.png` - 首页选中图标
- `issue.png` - 发料未选中图标
- `issue-active.png` - 发料选中图标
- `return.png` - 回货未选中图标
- `return-active.png` - 回货选中图标
- `statistics.png` - 统计未选中图标
- `statistics-active.png` - 统计选中图标
- `mine.png` - 我的未选中图标
- `mine-active.png` - 我的选中图标

## 图标规格要求

- **尺寸**: 81px × 81px（推荐）
- **格式**: PNG（支持透明背景）
- **颜色**: 
  - 未选中：`#6A7282`（灰色）
  - 选中：`#155DFC`（蓝色）

## 配置说明

`app.json` 中的 tabBar 配置已更新，使用以下路径：
- `images/tab/home.png` / `images/tab/home-active.png`
- `images/tab/issue.png` / `images/tab/issue-active.png`
- `images/tab/return.png` / `images/tab/return-active.png`
- `images/tab/statistics.png` / `images/tab/statistics-active.png`
- `images/tab/mine.png` / `images/tab/mine-active.png`

转换 PNG 文件后，tabBar 图标即可正常显示。
