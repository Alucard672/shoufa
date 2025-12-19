# 云函数说明

## 必须上传的云函数

### 1. createIssueOrder（创建发料单）

**功能**：创建发料单，支持事务操作

**上传步骤**：
1. 右键点击 `cloudfunctions/createIssueOrder` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 等待上传完成

**调用方式**：
```javascript
wx.cloud.callFunction({
  name: 'createIssueOrder',
  data: {
    issueOrder: {
      issueNo: 'FL20240101001',
      factoryId: 'xxx',
      styleId: 'xxx',
      color: '白色',
      issueWeight: 100,
      issueDate: new Date(),
      planId: ''
    }
  }
})
```

### 2. createReturnOrder（创建回货单）

**功能**：创建回货单，自动更新发料单状态，支持事务操作

**上传步骤**：
1. 右键点击 `cloudfunctions/createReturnOrder` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 等待上传完成

**调用方式**：
```javascript
wx.cloud.callFunction({
  name: 'createReturnOrder',
  data: {
    returnOrder: {
      returnNo: 'HH20240101001',
      factoryId: 'xxx',
      issueId: 'xxx',
      styleId: 'xxx',
      returnQuantity: 10,
      returnPieces: 120,
      actualYarnUsage: 18,
      returnDate: new Date(),
      processingFee: 100
    }
  }
})
```

## 可选的云函数

### 3. initDatabase（数据库初始化）

**功能**：自动创建数据库集合（如果集合已存在则跳过）

**上传步骤**：
1. 右键点击 `cloudfunctions/initDatabase` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 等待上传完成

**调用方式**：
```javascript
wx.cloud.callFunction({
  name: 'initDatabase',
  success: res => {
    console.log('初始化结果:', res.result)
  }
})
```

**注意**：如果已经手动创建了数据库集合，则不需要上传此云函数。

### 4. cleanupInvalidColorsAndSizes（清理无效颜色和尺码）

**功能**：清理所有款号中不在字典中的颜色和尺码

**上传步骤**：
1. 右键点击 `cloudfunctions/cleanupInvalidColorsAndSizes` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 等待上传完成

**调用方式**：
```javascript
wx.cloud.callFunction({
  name: 'cleanupInvalidColorsAndSizes',
  success: res => {
    console.log('清理结果:', res.result)
  }
})
```

**功能说明**：
- 自动检查所有款号的 `availableColors` 和 `availableSizes`
- 只保留在 `color_dict` 和 `size_dict` 中存在的颜色和尺码
- 支持处理逗号分隔的字符串格式（旧数据格式）
- 返回清理统计信息，包括清理的款号数量和移除的无效颜色/尺码数量

**使用场景**：
- 在"基础信息设置"页面点击"清理无效颜色和尺码"按钮
- 或者在代码中直接调用云函数

**注意**：此操作会修改数据库，建议先备份数据。

## 上传注意事项

1. **首次上传**：需要安装依赖，可能需要几分钟时间
2. **重新上传**：修改云函数代码后，需要重新上传才能生效
3. **查看状态**：在"云开发控制台" → "云函数"中可以查看上传状态
4. **测试调用**：上传后可以在云开发控制台直接测试调用

## 常见问题

### Q: 上传失败怎么办？
A: 检查网络连接，确保云开发环境已开通，查看控制台错误信息。

### Q: 云函数调用失败？
A: 确保云函数已成功上传，检查函数名称是否正确，查看云函数日志。

### Q: 如何查看云函数日志？
A: 在"云开发控制台" → "云函数" → 选择函数 → "日志"标签页。




