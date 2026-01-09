import cloudbase from '@cloudbase/js-sdk';

// 初始化云开发环境
const app = cloudbase.init({
  env: 'cloud1-1gzk1uq14c3065cb' // 自动同步自 cloudbaserc.json
});

export const auth = app.auth({ persistence: 'local' });
export const db = app.database();

export default app;
