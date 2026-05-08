import { unsafeWindow } from '$'

// ── 页面检测工具函数 ──

export function isSharePage() {
  return location.pathname.startsWith('/s/')
}

export function getShareId() {
  return location.pathname.split('/')[2]
}

export function getSharePageData() {
  try {
    const nuxt = unsafeWindow.useNuxtApp()
    if (nuxt?.$pinia?.state) {
      const state = nuxt.$pinia.state.value
      if (state?.share) return state.share
    }
    return null
  } catch (e) {
    console.warn('[pikpakHelpr] getSharePageData error:', e)
    return null
  }
}

/**
 * 判断当前页面是否为插件有效页面
 * 分享页 /s/:shareId 或网盘页 /drive/*
 */
export function isPluginPage() {
  return isSharePage() || location.pathname.startsWith('/drive')
}

/**
 * 统一获取页面选中文件的 ID 列表
 * 分享页从 window.useNuxtApp().$pinia.state.value.share 读取
 * 普通页从 __vue_app__ 的 Pinia file store 读取
 */
export function getSelectedIds() {
  if (isSharePage()) {
    const shareStore = unsafeWindow.useNuxtApp()?.$pinia?.state?.value?.share
    return shareStore?.selectedIds || []
  }
  // 普通页面
  const pinia = document.getElementById('app')?.__vue_app__
    ?.config?.globalProperties?.$pinia
  return pinia?.state?.value?.file?.selectedIds || []
}

/**
 * 根据 selectedIds 从 Pinia 缓存匹配文件详情（名称、类型、大小）
 * 分享页: curDirFiles + detail 缓存
 * 普通页: 当前目录文件列表通过 Pinia file store 获取
 *
 * @returns {{ ids: string[], files: Array, folders: Array, totalSize: number, unmatched: string[] }}
 */
export function getSelectedFileDetails() {
  const ids = getSelectedIds()
  if (ids.length === 0) {
    return { ids: [], files: [], folders: [], totalSize: 0, unmatched: [] }
  }

  const idSet = new Set(ids)
  const matchedFiles = []
  const matchedFolders = []
  const matchedIds = new Set()

  if (isSharePage()) {
    const shareStore = unsafeWindow.useNuxtApp()?.$pinia?.state?.value?.share
    if (shareStore) {
      // 从 curDirFiles 匹配
      const curDir = shareStore.curDirFiles
      const curFiles = Array.isArray(curDir) ? curDir : (curDir?.files || [])
      collectFromFiles(curFiles, idSet, matchedFiles, matchedFolders, matchedIds)

      // 从 detail 缓存匹配
      const detail = shareStore.detail || {}
      for (const folderId of Object.keys(detail)) {
        const detailFiles = detail[folderId]?.files || []
        collectFromFiles(detailFiles, idSet, matchedFiles, matchedFolders, matchedIds)
      }

      // 总大小：优先用 selectedFilesSize，否则累加
      const selectedFilesSize = shareStore.selectedFilesSize || 0
      const totalSize = selectedFilesSize > 0
        ? selectedFilesSize
        : [...matchedFiles, ...matchedFolders].reduce((sum, f) => sum + (parseInt(f.size) || 0), 0)

      const unmatched = ids.filter(id => !matchedIds.has(id))
      return { ids, files: matchedFiles, folders: matchedFolders, totalSize, unmatched }
    }
  } else {
    // 普通页面：从 Pinia file store 获取当前目录文件
    const pinia = document.getElementById('app')?.__vue_app__
      ?.config?.globalProperties?.$pinia
    const fileStore = pinia?.state?.value?.file
    if (fileStore) {
      // 尝试从 curDirFiles 或 list 匹配
      const curFiles = fileStore.curDirFiles || fileStore.list || []
      collectFromFiles(curFiles, idSet, matchedFiles, matchedFolders, matchedIds)

      const totalSize = [...matchedFiles, ...matchedFolders].reduce((sum, f) => sum + (parseInt(f.size) || 0), 0)
      const unmatched = ids.filter(id => !matchedIds.has(id))
      return { ids, files: matchedFiles, folders: matchedFolders, totalSize, unmatched }
    }
  }

  // 无法读取 Pinia 缓存，所有 ID 都是 unmatched
  return { ids, files: [], folders: [], totalSize: 0, unmatched: [...ids] }
}

/**
 * 从文件列表中收集匹配 selectedIds 的文件/文件夹
 */
function collectFromFiles(files, idSet, matchedFiles, matchedFolders, matchedIds) {
  if (!Array.isArray(files)) return
  for (const file of files) {
    if (file.id && idSet.has(file.id) && !matchedIds.has(file.id)) {
      matchedIds.add(file.id)
      if (file.kind === 'drive#folder') {
        matchedFolders.push(file)
      } else {
        matchedFiles.push(file)
      }
    }
  }
}
