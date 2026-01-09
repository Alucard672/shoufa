import cloudbase from '@cloudbase/js-sdk'
import { getCurrentEnvId } from './env'

// 按 envId 缓存 CloudBase app 实例，支持运行时切换环境
const APP_CACHE = new Map()

export function getCloudbaseApp(envId = getCurrentEnvId()) {
  if (APP_CACHE.has(envId)) return APP_CACHE.get(envId)
  const app = cloudbase.init({ env: envId })
  APP_CACHE.set(envId, app)
  return app
}

export function getAuth(envId = getCurrentEnvId()) {
  return getCloudbaseApp(envId).auth({ persistence: 'local' })
}

export function getDb(envId = getCurrentEnvId()) {
  return getCloudbaseApp(envId).database()
}

export function callFunction(params, envId = getCurrentEnvId()) {
  return getCloudbaseApp(envId).callFunction(params)
}

