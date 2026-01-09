// server/src/utils/env.js
// 管理端环境与本地缓存 key 统一管理

export const CLOUD_ENVS = [
  { id: 'cloud1-1gzk1uq14c3065cb', name: '测试环境', type: 'dev' },
  { id: 'shoufa-prod-3g0umt9fbba2f52b', name: '生产环境', type: 'prod' }
]

const KEY_ENV_ID = 'cb_envId'

export function getCurrentEnvId() {
  const saved = localStorage.getItem(KEY_ENV_ID)
  if (saved) return saved
  // 默认进入测试环境，避免误操作生产
  return CLOUD_ENVS[0].id
}

export function setCurrentEnvId(envId) {
  localStorage.setItem(KEY_ENV_ID, envId)
}

export function getEnvMeta(envId = getCurrentEnvId()) {
  return CLOUD_ENVS.find(e => e.id === envId) || { id: envId, name: envId, type: 'unknown' }
}

export function tokenKey(envId = getCurrentEnvId()) {
  return `admin_token__${envId}`
}

export function infoKey(envId = getCurrentEnvId()) {
  return `admin_info__${envId}`
}

export function getAdminToken(envId = getCurrentEnvId()) {
  return localStorage.getItem(tokenKey(envId))
}

export function setAdminToken(token, envId = getCurrentEnvId()) {
  localStorage.setItem(tokenKey(envId), token)
}

export function clearAdminAuth(envId = getCurrentEnvId()) {
  localStorage.removeItem(tokenKey(envId))
  localStorage.removeItem(infoKey(envId))
}

export function getAdminInfo(envId = getCurrentEnvId()) {
  const raw = localStorage.getItem(infoKey(envId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export function setAdminInfo(info, envId = getCurrentEnvId()) {
  localStorage.setItem(infoKey(envId), JSON.stringify(info || {}))
}

