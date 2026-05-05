const ARIA_STORAGE_KEYS = {
  host: 'ariaHost',
  path: 'ariaPath',
  token: 'ariaToken',
  params: 'ariaParams'
}

/**
 * 从 localStorage 读取 Aria2 配置
 */
export function getAriaConfig() {
  return {
    host: window.localStorage.getItem(ARIA_STORAGE_KEYS.host) || '',
    path: window.localStorage.getItem(ARIA_STORAGE_KEYS.path) || '',
    token: window.localStorage.getItem(ARIA_STORAGE_KEYS.token) || '',
    params: window.localStorage.getItem(ARIA_STORAGE_KEYS.params) || ''
  }
}

/**
 * 将 Aria2 配置保存到 localStorage
 * @param {Object} config - { host, path, token, params }
 */
export function saveAriaConfig(config) {
  // 路径补齐末尾斜杠
  if (config.path && !config.path.endsWith('/') && !config.path.endsWith('\\')) {
    config.path += '/'
  }

  window.localStorage.setItem(ARIA_STORAGE_KEYS.host, config.host)
  window.localStorage.setItem(ARIA_STORAGE_KEYS.path, config.path)
  window.localStorage.setItem(ARIA_STORAGE_KEYS.token, config.token)
  window.localStorage.setItem(ARIA_STORAGE_KEYS.params, config.params)
}

/**
 * 构建 Aria2 RPC 请求载荷
 * @param {string} method - RPC 方法名
 * @param {Array} params - RPC 参数
 */
export function buildAria2Payload(method, params) {
  return {
    jsonrpc: '2.0',
    method,
    id: new Date().getTime(),
    params
  }
}
