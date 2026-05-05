import { GM_xmlhttpRequest } from '$'
import { isSharePage, getShareId, getSharePageData } from '../utils/index.js'

// ── 统一 HTTP 请求层 ──

/**
 * 统一请求函数
 * 优先使用 GM_xmlhttpRequest（跨域），不可用时回退到 fetch
 */
function request(url, options = {}) {
  const { method = 'GET', data = null, headers = {}, responseType = 'json' } = options

  if (typeof GM_xmlhttpRequest === 'function') {
    return gmRequest(url, { method, data, headers, responseType })
  }
  return fetchRequest(url, { method, data, headers })
}

function gmRequest(url, { method, data, headers, responseType }) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url,
      headers,
      data: data ? JSON.stringify(data) : undefined,
      responseType,
      onload: (res) => {
        if (responseType === 'blob') return resolve(res)
        if (res.response || res.responseText) {
          resolve(res.response || res.responseText)
        } else {
          reject(res)
        }
      },
      onerror: reject
    })
  })
}

async function fetchRequest(url, { method, data, headers }) {
  const fetchHeaders = { 'Content-Type': 'application/json', ...headers }
  const opts = {
    method,
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: fetchHeaders,
    redirect: 'follow',
    referrerPolicy: 'no-referrer'
  }

  if (method !== 'GET' && data) {
    opts.body = JSON.stringify(data)
  }

  const response = await fetch(url, opts)
  return response.json()
}

// ── 请求头构造 ──

function getHeader() {
  let token = ''
  let captcha = ''
  let clientId = ''
  const storage = window.localStorage

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue

    if (key.startsWith('credentials')) {
      const tokenData = JSON.parse(storage.getItem(key) || '{}')
      token = tokenData.token_type + ' ' + tokenData.access_token
      continue
    }

    if (key.startsWith('captcha')) {
      const tokenData = JSON.parse(storage.getItem(key) || '{}')
      captcha = tokenData.captcha_token
      const match = key.match(/captcha_(.+)/)
      clientId = (match && match[1]) || ''
    }
  }

  // 处理 deviceid 格式：prefix.suffix(最多32字符)
  const deviceId = storage.getItem('deviceid') || ''
  const parts = deviceId.split('.')
  const xDeviceId = parts.length >= 2
    ? `${parts[0]}.${parts[parts.length - 1].substring(0, 32)}`
    : deviceId

  const headers = {
    Authorization: token,
    'x-device-id': xDeviceId,
    'x-client-id': clientId,
    'x-captcha-token': captcha
  }

  // 分享页 API 需要带 referer
  if (isSharePage()) {
    headers.Referer = location.href
  }

  return headers
}

// ── 文件列表 API ──

export async function getList(parentId) {
  const url = parentId === 'recent'
    ? 'https://api-drive.mypikpak.com/drive/v1/events?thumbnail_size=SIZE_MEDIUM&limit=100'
    : `https://api-drive.mypikpak.com/drive/v1/files?thumbnail_size=SIZE_MEDIUM&limit=500&parent_id=${parentId}&with_audit=true&filters=%7B%22phase%22%3A%7B%22eq%22%3A%22PHASE_TYPE_COMPLETE%22%7D%2C%22trashed%22%3A%7B%22eq%22%3Afalse%7D%7D`

  const result = await request(url, { headers: getHeader() })

  if (parentId === 'recent') {
    return { files: (result.events || []).map(event => event.reference_resource).filter(Boolean) }
  }
  return result
}

// ── 下载链接 API ──

export async function getDownload(id) {
  // 分享页：使用 share/file_info 接口
  if (isSharePage()) {
    const shareId = getShareId()
    if (!shareId) throw new Error('无法获取下载链接：缺少 shareId')

    const data = getSharePageData()
    const passCodeToken = data?.data?.pass_code_token || ''
    if (!passCodeToken) throw new Error('无法获取下载链接：缺少 pass_code_token')

    const url = `https://api-drive.mypikpak.com/drive/v1/share/file_info?share_id=${shareId}&file_id=${id}&pass_code_token=${encodeURIComponent(passCodeToken)}`
    const headers = getHeader()

    try {
      const res = await request(url, { headers })
      const fileInfo = res.file_info
      if (!fileInfo) throw new Error('无法获取下载链接：file_info 为空')

      // web_content_link 为空时使用 medias[0].link.url 兜底
      if (!fileInfo.web_content_link && fileInfo.medias?.length > 0) {
        fileInfo.web_content_link = fileInfo.medias[0].link.url
      }
      if (!fileInfo.web_content_link) throw new Error('无法获取下载链接：web_content_link 为空')

      return fileInfo
    } catch (error) {
      console.error('[pikpakHelpr] 获取分享文件下载链接失败:', error)
      throw error
    }
  }

  // 普通页面
  return request(`https://api-drive.mypikpak.com/drive/v1/files/${id}?`, { headers: getHeader() })
}

// ── Aria2 RPC 推送 ──

export function pushToAria(url, data) {
  return request(url, { method: 'POST', data })
}

// ── 分享页：fetch 拦截器追踪 parent_id ──

let shareObserverInstalled = false
let currentShareParentId = undefined // undefined=未初始化, null=根目录, string=文件夹ID

export function installShareObserver() {
  if (shareObserverInstalled) return
  shareObserverInstalled = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input
      : (input instanceof Request ? input.url : String(input))

    if (url.includes('/drive/v1/share/detail')) {
      try {
        const urlObj = new URL(url, location.origin)
        const parentId = urlObj.searchParams.get('parent_id') || null
        if (currentShareParentId !== parentId) {
          console.log('[pikpakHelpr] intercepted share/detail, parent_id:', parentId)
          currentShareParentId = parentId
        }
      } catch (e) { /* ignore parse errors */ }
    }

    return originalFetch(input, init)
  }
}

// 从 Pinia store 初始化 parent_id
function initShareParentIdFromPinia() {
  const data = getSharePageData()
  if (!data) return

  const pathParts = location.pathname.split('/').filter(Boolean)

  // 根目录: /s/:shareId → pathParts = ['s', shareId], length = 2
  if (pathParts.length <= 2) {
    currentShareParentId = null
    return
  }

  // 子文件夹: /s/:shareId/:encodedFolderId → pathParts = ['s', shareId, encodedFolderId], length = 3
  // 注意：URL 中的 encodedFolderId 不能直接用作 API 的 parent_id，必须从 Pinia store 获取真实 ID
  const files = Array.isArray(data.curDirFiles) ? data.curDirFiles : data.curDirFiles?.files
  const dirs = data.dirs || []
  const detail = data.detail || {}
  const detailKeys = Object.keys(detail)

  currentShareParentId = files?.[0]?.parent_id
    || (dirs.length && detail[dirs[dirs.length - 1]] ? dirs[dirs.length - 1] : null)
    || detailKeys[detailKeys.length - 1]
    || undefined
}

// ── 分享页 API ──

export async function fetchShareFiles(shareId, parentId, passCodeToken) {
  let url = `https://api-drive.mypikpak.com/drive/v1/share/detail?share_id=${shareId}&limit=100&thumbnail_size=SIZE_LARGE&order=6&folders_first=true`
  if (parentId) url += `&parent_id=${parentId}`
  if (passCodeToken) url += `&pass_code_token=${encodeURIComponent(passCodeToken)}`

  return request(url, { headers: getHeader() })
}

/**
 * 获取分享页当前目录的文件列表
 * 策略：拦截器追踪 parent_id → API 获取 → Pinia store 兜底
 */
export async function getShareCurrentFiles() {
  const data = getSharePageData()
  if (!data) {
    console.warn('[pikpakHelpr] getShareCurrentFiles: no share data')
    return { files: [], error: 'no_share_data', message: '无法读取 Pinia store 数据，页面可能未完全加载' }
  }

  if (!shareObserverInstalled) installShareObserver()

  const shareId = getShareId()
  const passCodeToken = data?.data?.pass_code_token || ''

  if (!passCodeToken) {
    return { files: [], error: 'no_pass_code_token', message: '缺少 pass_code_token，可能需要输入提取码' }
  }

  // parent_id 未初始化 → 从 Pinia store 获取
  if (currentShareParentId === undefined) {
    initShareParentIdFromPinia()
  }

  let apiError = null

  // parent_id 已确定 → 直接调 API
  if (currentShareParentId !== undefined) {
    try {
      const res = await fetchShareFiles(shareId, currentShareParentId, passCodeToken)
      if (res?.files?.length > 0) return { files: res.files }
    } catch (e) {
      console.error('[pikpakHelpr] getShareCurrentFiles API failed:', e)
      apiError = e
    }
  }

  // 兜底：从 Pinia store 获取
  const curDir = data.curDirFiles
  const fallbackFiles = Array.isArray(curDir) ? curDir : (curDir?.files || data.data?.files || [])
  if (fallbackFiles.length > 0) return { files: fallbackFiles }

  // 所有策略都未获取到文件，返回诊断信息
  if (apiError) {
    return { files: [], error: 'api_failed', message: `API 请求失败: ${apiError.message || '网络错误'}` }
  }
  if (currentShareParentId === undefined) {
    return { files: [], error: 'no_parent_id', message: '无法确定当前文件夹 ID，请刷新页面后重试' }
  }
  return { files: [], error: 'empty_result', message: '文件夹为空或数据未同步' }
}

export function getShareFolderDetail(folderId) {
  const data = getSharePageData()
  if (!data?.detail) return null
  return data.detail[folderId] || null
}

export function restoreToDrive(shareId, fileIds, passCodeToken) {
  return request(
    'https://api-drive.mypikpak.com/drive/v1/share/restore',
    {
      method: 'POST',
      data: { share_id: shareId, file_ids: fileIds, pass_code_token: passCodeToken },
      headers: getHeader()
    }
  )
}
