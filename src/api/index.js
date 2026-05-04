import { getPlatform } from "../utils/index.js";
import { GM_xmlhttpRequest } from '$';

// 油猴的post方法
function post(url, data, headers, type) {
  data = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST", url, headers, data,
      responseType: type || 'json',
      onload: (res) => {
        type === 'blob' ? resolve(res) : res.response ? (resolve(res.response || res.responseText)) : reject(res);
      },
      onerror: (err) => {
        reject(err);
      },
    });
  });
}
// 非油猴的请求
function postData(url = '', data = {}, customHeaders = {}, method = 'GET') {
  let options = {
    method: method, // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'same-origin', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json',
      // 'Content-Type': 'application/x-www-form-urlencoded',
      ...customHeaders
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer'
  }
  if (method === 'GET') {
    return fetch(url, {
      method: 'GET', // *GET, POST, PUT, DELETE, etc.
      mode: 'cors', // no-cors, *cors, same-origin
      cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
      credentials: 'same-origin', // include, *same-origin, omit
      headers: {
        'Content-Type': 'application/json',
        // 'Content-Type': 'application/x-www-form-urlencoded',
        ...customHeaders
      },
      redirect: 'follow', // manual, *follow, error
      referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    }).then((response) => response.json());
    // return response.json(); // parses JSON response into native JavaScript objects
  } else {
    return new Promise((resolve, reject) => {
      let xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.response))
          } else {
            reject({})
          }
        }
      }
      xhr.open(method, url) // 带参数
      xhr.setRequestHeader('content-type', 'application/json')// 设置服务端要求的参数类型，后面会专门出一期，针对各种常用content-type讲解
      xhr.send(JSON.stringify(data));// 带上复杂参数
    })
  }
}

function getHeader(){
  // 获取头部信息
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
      // 从 key 中提取 client_id，格式: captcha_{client_id}
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
  
  return {
    Authorization: token,
    'x-device-id': xDeviceId,
    'x-client-id': clientId,
    'x-captcha-token': captcha
  }
}

export async function getList(parent_id){
  let url;
  if (parent_id === "recent") {
      url = `https://api-drive.mypikpak.com/drive/v1/events?thumbnail_size=SIZE_MEDIUM&limit=100`;
  } else {
      url = `https://api-drive.mypikpak.com/drive/v1/files?thumbnail_size=SIZE_MEDIUM&limit=500&parent_id=${parent_id}&with_audit=true&filters=%7B%22phase%22%3A%7B%22eq%22%3A%22PHASE_TYPE_COMPLETE%22%7D%2C%22trashed%22%3A%7B%22eq%22%3Afalse%7D%7D`;
  }
  const result = await postData(url, {}, getHeader());
  if (parent_id === "recent") {
      return {
          files: (result.events || []).map(event => event.reference_resource).filter(Boolean)
      };
  } else {
      return result;
  }
}

// 获取下载地址
export async function getDownload (id) {
  // 分享页特殊处理
  if (isSharePage()) {
    const shareId = getShareId()
    if (!shareId) {
      throw new Error('无法获取下载链接：缺少 shareId')
    }
    
    // 从 Pinia store 获取 pass_code_token（与文件列表加载一致）
    const data = getSharePageData()
    const passCodeToken = data?.data?.pass_code_token || ''
    
    if (!passCodeToken) {
      throw new Error('无法获取下载链接：缺少 pass_code_token')
    }
    
    // 使用分享文件信息 API（pass_code_token 需要 URL 编码）
    const url = `https://api-drive.mypikpak.com/drive/v1/share/file_info?share_id=${shareId}&file_id=${id}&pass_code_token=${encodeURIComponent(passCodeToken)}`
    const headers = getHeader()
    console.log(url);
    
    try {
      const res = await postData(url, {}, headers, 'GET')
      console.log(res);
      
      const fileInfo = res.file_info
      
      if (!fileInfo) {
        throw new Error('无法获取下载链接：file_info 为空')
      }
      
      // 关键：如果 web_content_link 为空，使用 medias[0].link.url
      if (!fileInfo.web_content_link && fileInfo.medias && fileInfo.medias.length > 0) {
        fileInfo.web_content_link = fileInfo.medias[0].link.url
      }
      
      if (!fileInfo.web_content_link) {
        throw new Error('无法获取下载链接：web_content_link 为空')
      }
      
      return fileInfo
    } catch (error) {
      console.error('[pikpakHelpr] 获取分享文件下载链接失败:', error)
      throw error
    }
  }
  
  // 普通页面：原有逻辑
  const header = getHeader()
  return postData('https://api-drive.mypikpak.com/drive/v1/files/' + id + '?', {}, header)
}



// 推送给aria2
export function pushToAria (url, data) {
  if (['Android','IOS'].includes(getPlatform()) && !GM_xmlhttpRequest) {
    return postData(url, data,{}, 'POST')
  } else {
    return post(url, data, {}, '')
  }
}


// ═══════════════════════════════════════
// 分享页相关
// ═══════════════════════════════════════

// ═══ 状态：追踪当前文件夹 parent_id ═══
// 核心思路：
//   1. 拦截 Pikpak 页面自身的 share/detail API 调用，自动记录 parent_id
//   2. 首次加载（尚未拦截到 API）时从 Pinia store 获取初始 parent_id
//   3. parent_id 确定后直接调 API，无需复杂缓存策略

let shareObserverInstalled = false
let currentShareParentId = undefined  // undefined=未初始化, null=根目录, string=文件夹ID

// ═══ fetch 拦截器：监听 Pikpak 自身的 share/detail 调用 ═══
function installShareObserver() {
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
          console.log('[pikpakHelpr] 🔍 intercepted share/detail, parent_id:', parentId)
          currentShareParentId = parentId
        }
      } catch (e) { /* ignore parse errors */ }
    }

    return originalFetch(input, init)
  }
}

// ═══ 初始化：从 Pinia store 获取首次加载的 parent_id ═══
function initShareParentIdFromPinia() {
  const data = getSharePageData()
  if (!data) return

  const pathParts = location.pathname.split('/').filter(Boolean)

  // 根目录
  if (pathParts.length === 3) {
    currentShareParentId = null
    return
  }

  // 子文件夹：按优先级从多个来源获取 parent_id
  const files = Array.isArray(data.curDirFiles) ? data.curDirFiles : data.curDirFiles?.files
  const dirs = data.dirs || []
  const detail = data.detail || {}
  const detailKeys = Object.keys(detail)

  currentShareParentId = files?.[0]?.parent_id
    || (dirs.length && detail[dirs[dirs.length - 1]] ? dirs[dirs.length - 1] : null)
    || detailKeys[detailKeys.length - 1]
    || undefined
}

export function isSharePage() {
  return location.pathname.startsWith('/s/')
}

export function getShareId() {
  return location.pathname.split('/')[2]
}

export function getSharePageData() {
  try {
    const nuxt = window.useNuxtApp()
    if (nuxt && nuxt.$pinia && nuxt.$pinia.state) {
      const state = nuxt.$pinia.state.value
      if (state && state.share) {
        console.log('[pikpakHelpr] got share data from Pinia, curDirFiles:', Array.isArray(state.share.curDirFiles) ? state.share.curDirFiles.length : state.share.curDirFiles?.files?.length, 'dirs:', state.share.dirs?.length, 'detail keys:', Object.keys(state.share.detail || {}).length)
        return state.share
      }
    }
    console.warn('[pikpakHelpr] Pinia store not ready yet')
    return null
  } catch (e) {
    console.warn('[pikpakHelpr] getSharePageData error:', e)
    return null
  }
}

/**
 * 直接调用 Pikpak API 获取分享页指定文件夹的文件列表
 * 接口: GET /drive/v1/share/detail
 * @param {string} shareId - 分享ID
 * @param {string|null} parentId - 文件夹ID，为 null 时返回根目录
 * @param {string} passCodeToken - 分享密码令牌
 */
export async function fetchShareFiles(shareId, parentId, passCodeToken) {
  let url = `https://api-drive.mypikpak.com/drive/v1/share/detail?share_id=${shareId}&limit=100&thumbnail_size=SIZE_LARGE&order=6&folders_first=true`
  if (parentId) {
    url += `&parent_id=${parentId}`
  }
  if (passCodeToken) {
    url += `&pass_code_token=${encodeURIComponent(passCodeToken)}`
  }
  const headers = getHeader()
  console.log('[pikpakHelpr] fetchShareFiles:', url)
  const res = await postData(url, {}, headers, 'GET')
  console.log('[pikpakHelpr] fetchShareFiles response, files:', res?.files?.length)
  return res
}

/**
 * 获取分享页当前目录的文件列表
 *
 * 策略：
 *   1. 首次调用 → 安装拦截器，从 Pinia store 初始化 parent_id
 *   2. parent_id 已确定 → 直接调 share/detail API（页面内跳转后拦截器会自动更新 parent_id）
 *   3. API 失败 → Pinia store 兜底
 */
export async function getShareCurrentFiles() {
  const data = getSharePageData()
  if (!data) {
    console.warn('[pikpakHelpr] getShareCurrentFiles: no share data')
    return { files: [] }
  }

  // 首次调用：安装拦截器
  if (!shareObserverInstalled) {
    installShareObserver()
  }

  const shareId = getShareId()
  const passCodeToken = data?.data?.pass_code_token || ''

  // parent_id 未初始化 → 从 Pinia store 获取
  if (currentShareParentId === undefined) {
    console.log('[pikpakHelpr] getShareCurrentFiles: initializing parent_id from Pinia')
    initShareParentIdFromPinia()
  }

  // parent_id 已确定 → 直接调 API（拦截器会在页内跳转时自动更新它）
  if (currentShareParentId !== undefined) {
    console.log('[pikpakHelpr] getShareCurrentFiles: calling API, parent_id:', currentShareParentId)
    try {
      const res = await fetchShareFiles(shareId, currentShareParentId, passCodeToken)
      if (res && res.files && res.files.length > 0) {
        console.log('[pikpakHelpr] getShareCurrentFiles: API returned', res.files.length, 'files')
        return { files: res.files }
      }
      console.warn('[pikpakHelpr] getShareCurrentFiles: API returned empty')
    } catch (e) {
      console.error('[pikpakHelpr] getShareCurrentFiles: API failed:', e)
    }
  }

  // 兜底：从 Pinia store 获取（首次加载或 API 失败时）
  const curDir = data.curDirFiles
  const fallbackFiles = Array.isArray(curDir) ? curDir : (curDir?.files || data.data?.files || [])
  if (fallbackFiles.length > 0) {
    return { files: fallbackFiles }
  }

  console.warn('[pikpakHelpr] getShareCurrentFiles: no files found')
  return { files: [] }
}

// 从 Pinia store 的 detail 缓存中获取已浏览过的文件夹内容
export function getShareFolderDetail(folderId) {
  const data = getSharePageData()
  if (!data || !data.detail) return null
  return data.detail[folderId] || null
}

// 从分享保存文件到用户网盘
export function restoreToDrive(shareId, fileIds, passCodeToken) {
  const headers = getHeader()
  return postData(
    'https://api-drive.mypikpak.com/drive/v1/share/restore',
    { share_id: shareId, file_ids: fileIds, pass_code_token: passCodeToken },
    headers,
    'POST'
  )
}

