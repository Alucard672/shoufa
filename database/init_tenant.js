// 初始化创建租户的脚本
// 可以通过小程序开发者工具的控制台执行，或者创建一个临时页面调用

// 方法1：通过云函数直接创建（推荐）
async function createTenant() {
  try {
    const result = await wx.cloud.callFunction({
      name: 'mysql',
      data: {
        action: 'insert',
        table: 'tenants',
        data: {
          name: '测试租户',
          contact: '管理员',
          phone: '13800138000',
          address: '测试地址'
        },
        options: {
          tenantId: '' // 创建租户时不需要tenantId
        }
      }
    })
    
    console.log('创建租户成功:', result)
    return result
  } catch (error) {
    console.error('创建租户失败:', error)
    throw error
  }
}

// 方法2：通过SQL直接执行（需要在控制台执行）
const sql = `
INSERT INTO \`tenants\` (\`name\`, \`contact\`, \`phone\`, \`address\`) 
VALUES 
('测试租户', '管理员', '13800138000', '测试地址');
`

// 导出函数供使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createTenant, sql }
}

