<template>
  <div v-if="show" @click.stop @mousedown.stop>
    <div class="dialog-overlay" @click.stop="close"></div>
    <div class="dialog">
      <h2>推送到 Aria2</h2>
      <div class="close" @click.stop="close">×</div>

      <!-- 中间可滚动内容区 -->
      <div class="dialog-body">
        <!-- 进度模式（扫描/推送中） -->
        <div v-if="progress.show" class="progress-section">
          <div class="progress-icon">
            <div class="loading-spinner"></div>
          </div>
          <div class="progress-title">{{ progress.mode === 'scan' ? '正在扫描文件...' : '正在推送文件...' }}</div>
          <div v-if="progress.mode === 'push'" class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div v-if="progress.mode === 'push'" class="progress-stats">
            <span class="stat-progress">{{ progress.current }}/{{ progress.total }}</span>
            <span class="stat-pct">{{ progressPercent }}%</span>
            <span class="stat-result">✅ {{ progress.success }}  ❌ {{ progress.fail }}</span>
          </div>
          <div class="progress-detail">{{ progress.text }}</div>
        </div>

        <!-- 正常显示模式 -->
        <template v-else>
          <!-- 加载中 -->
          <div v-if="loading" class="empty-state">
            <div class="loading-spinner"></div>
            <div class="empty-title">正在获取文件信息...</div>
          </div>

          <!-- 有选择内容 -->
          <template v-else-if="hasSelection">
            <!-- 选中摘要 -->
            <div class="summary">
              <div class="summary-stats">
                <span v-if="selectedFolders.length > 0" class="stat-badge folder-badge">
                  {{ selectedFolders.length }} 个文件夹
                </span>
                <span v-if="selectedFiles.length > 0" class="stat-badge file-badge">
                  {{ selectedFiles.length }} 个文件
                </span>
                <span v-if="unmatchedIds.length > 0" class="stat-badge unknown-badge">
                  {{ unmatchedIds.length }} 个未知
                </span>
              </div>
              <div v-if="totalSize > 0" class="summary-size">
                预估大小：{{ formatBytes(totalSize) }}
              </div>
            </div>

            <!-- 文件列表（只读展示） -->
            <ul class="file-list">
              <!-- 文件夹 -->
              <li v-for="item in selectedFolders" :key="item.id" class="file-item folder-item">
                <span class="icon">📁</span>
                <span class="file-name">{{ item.name }}</span>
                <span v-if="item._folderSize" class="file-size folder-size">{{ formatBytes(item._folderSize) }}</span>
                <span v-else class="file-tag">文件夹</span>
              </li>
              <!-- 文件 -->
              <li v-for="item in selectedFiles" :key="item.id" class="file-item">
                <span class="icon">📄</span>
                <span class="file-name">{{ item.name }}</span>
                <span class="file-size">{{ item.size ? formatBytes(parseInt(item.size)) : '' }}</span>
              </li>
              <!-- 未匹配到的 ID -->
              <li v-for="id in unmatchedIds" :key="id" class="file-item unmatched-item">
                <span class="icon">❓</span>
                <span class="file-name unknown-name">{{ id }}</span>
                <span class="file-tag unknown-tag">未匹配详情</span>
              </li>
            </ul>
          </template>

          <!-- 无选择内容 -->
          <div v-else class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-title">未选择文件</div>
            <div class="empty-guide">请先在页面上勾选要下载的文件或文件夹，然后再点击推送按钮</div>
          </div>
        </template>
      </div>

      <!-- aria2连接状态显示 -->
      <div class="connection-status">
        <div class="status-indicator">
          <div class="status-dot" :class="connectionStatus.class"></div>
          <span class="status-text">{{ connectionStatus.text }}</span>
        </div>
        <button class="test-btn" @click="handleTestConnection" :disabled="isTestingConnection">
          {{ isTestingConnection ? '测试中...' : '测试连接' }}
        </button>
      </div>

      <div class="footer">
        <div class="btn el-button el-button--secondary" @click="openConfig">
          <span class="lbl-d">配置aria2</span><span class="lbl-m">配置</span>
        </div>
        <div v-if="hasSelection" class="btn el-button el-button--primary" @click="pushBefore" :disabled="isPushing">
          <span class="lbl-d">{{ isPushing ? '推送中...' : '推送到aria2' }}</span><span class="lbl-m">{{ isPushing ? '推送中...' : '推送' }}</span>
        </div>
        <div v-else class="btn el-button el-button--primary" @click="close">关闭</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { getDownload, pushToAria, getList, getShareCurrentFiles, fetchShareFiles, getShareFolderDetail } from '../api'
import { isSharePage, getShareId, getSharePageData, getSelectedIds } from '../utils/index.js'
import { formatBytes } from '../utils/format.js'
import { getAriaConfig, buildAria2Payload } from '../utils/storage.js'
import { useAria2Connection } from '../composables/useAria2Connection.js'

const props = defineProps({ show: Boolean })
const emits = defineEmits(['close', 'msg', 'openConfig'])

// 选中状态（从 API 获取文件列表后匹配）
const selectedFiles = ref([])
const selectedFolders = ref([])
const unmatchedIds = ref([])
const totalSize = ref(0)
const isPushing = ref(false)
const loading = ref(false)

// 进度状态（扫描/推送阶段）
const progress = reactive({
  show: false,
  mode: '',      // 'scan' | 'push'
  current: 0,
  total: 0,
  success: 0,
  fail: 0,
  text: ''
})

const progressPercent = computed(() => {
  if (progress.total === 0) return 0
  return Math.round((progress.current / progress.total) * 100)
})

// 分享页状态
const shareId = ref('')
const passCodeToken = ref('')

// 分享页文件缓存：递归获取子树后的扁平化索引（类似网盘页 dbIndex）
// 结构：Array<{ id, parent_id, name, kind, size, ... }>
// 累积式缓存：页面不刷新就不清空，已获取的文件夹子树永久复用
let shareFileCache = []
// 已通过 API 递归获取的文件夹 ID 集合，用于增量判断
let shareFetchedFolderIds = new Set()
// 已加入缓存的条目 ID 集合，防止重复插入
let shareCachedEntryIds = new Set()

const hasSelection = computed(() =>
  selectedFiles.value.length > 0 || selectedFolders.value.length > 0 || unmatchedIds.value.length > 0
)

// Aria2 连接状态（composable）
const { connectionStatus, isTestingConnection, testConnection } = useAria2Connection(emits)
const handleTestConnection = () => testConnection()

watch(
  () => props.show,
  (val) => {
    if (!val) return
    loadSelection()
    setTimeout(handleTestConnection, 500)
  }
)

// 从页面 selectedIds 加载选中信息（异步：调 API 获取文件列表后匹配）
const loadSelection = async () => {
  // 重置状态
  selectedFiles.value = []
  selectedFolders.value = []
  unmatchedIds.value = []
  totalSize.value = 0
  // 注意：shareFileCache 为累积式缓存，页面不刷新就不清空

  if (isSharePage()) {
    shareId.value = getShareId()
    const data = getSharePageData()
    passCodeToken.value = data?.data?.pass_code_token || ''
  }

  const ids = getSelectedIds()
  if (ids.length === 0) return

  loading.value = true
  emits('msg', `正在匹配 ${ids.length} 个选中项...`, 'info')

  try {
    let apiFiles = []

    if (isSharePage()) {
      // 分享页：使用 getShareCurrentFiles API
      const res = await getShareCurrentFiles()
      apiFiles = res.files || []
    } else {
      // 普通页：使用 getList API
      let parentId = window.location.href.split('/').pop()
      if (parentId === 'all') parentId = ''
      const res = await getList(parentId)
      apiFiles = res?.files || []
    }

    // 用 API 返回的文件列表匹配 selectedIds
    const result = matchSelectedIds(ids, apiFiles)
    selectedFiles.value = result.files
    selectedFolders.value = result.folders
    unmatchedIds.value = result.unmatched
    totalSize.value = result.totalSize

    // 分享页：如果有文件夹，递归获取子树并重新计算大小
    if (isSharePage() && selectedFolders.value.length > 0) {
      // 筛选出尚未缓存的新文件夹，增量获取
      const newFolders = selectedFolders.value.filter(f => !shareFetchedFolderIds.has(f.id))
      const allCached = newFolders.length === 0

      if (!allCached) {
        emits('msg', `正在扫描 ${newFolders.length} 个新文件夹（已缓存 ${selectedFolders.value.length - newFolders.length} 个）...`, 'info')
        try {
          await buildShareFileCache(newFolders)
        } catch (e) {
          console.error('[pikpakHelpr] buildShareFileCache failed:', e)
        }
      }

      // 用缓存重新计算大小
      const { total, folderSizes } = calcTotalSizeFromIndex(shareFileCache, ids, selectedFiles.value)
      totalSize.value = total
      for (const folder of selectedFolders.value) {
        if (folderSizes[folder.id] !== undefined) {
          folder._folderSize = folderSizes[folder.id]
        }
      }
      emits('msg', `已匹配 ${selectedFiles.value.length} 个文件，${selectedFolders.value.length} 个文件夹${allCached ? '（缓存命中）' : ''}`, 'success')
    } else if (result.files.length + result.folders.length > 0) {
      emits('msg', `已匹配 ${result.files.length} 个文件，${result.folders.length} 个文件夹`, 'success')
    }
  } catch (e) {
    console.error('[pikpakHelpr] loadSelection failed:', e)
    // API 失败时，所有 ID 作为 unmatched
    unmatchedIds.value = [...ids]
    emits('msg', `文件信息获取失败，将尝试直接推送 ${ids.length} 个选中项`, 'warning')
  } finally {
    loading.value = false
  }
}

/**
 * 根据 selectedIds 从 API 返回的文件列表中匹配详情
 */
const matchSelectedIds = (ids, apiFiles) => {
  const idSet = new Set(ids)
  const matchedFiles = []
  const matchedFolders = []
  const matchedIds = new Set()

  for (const file of apiFiles) {
    if (file.id && idSet.has(file.id) && !matchedIds.has(file.id)) {
      matchedIds.add(file.id)
      if (file.kind === 'drive#folder') {
        matchedFolders.push(file)
      } else {
        matchedFiles.push(file)
      }
    }
  }

  // 计算总大小
  let size = 0

  if (isSharePage()) {
    // 分享页：优先使用 Pinia selectedFilesSize
    const shareStore = window.useNuxtApp()?.$pinia?.state?.value?.share
    size = shareStore?.selectedFilesSize || 0
  } else {
    // 网盘页：使用 dbIndex 递归计算文件夹大小
    const dbIndex = getDriveDbIndex()
    if (dbIndex) {
      const { total: dbTotal, folderSizes } = calcTotalSizeFromIndex(dbIndex, ids, matchedFiles)
      size = dbTotal
      // 将文件夹大小信息附加到 folder 对象上
      for (const folder of matchedFolders) {
        if (folderSizes[folder.id] !== undefined) {
          folder._folderSize = folderSizes[folder.id]
        }
      }
    }
  }

  // 兜底：累加文件 size
  if (size <= 0) {
    size = [...matchedFiles, ...matchedFolders].reduce((sum, f) => sum + (parseInt(f.size) || 0), 0)
  }

  const unmatched = ids.filter(id => !matchedIds.has(id))
  return { files: matchedFiles, folders: matchedFolders, totalSize: size, unmatched }
}

/**
 * 获取网盘页 Pinia fileStore.dbIndex
 */
const getDriveDbIndex = () => {
  try {
    const pinia = document.getElementById('app')?.__vue_app__
      ?.config?.globalProperties?.$pinia
    return pinia?.state?.value?.file?.dbIndex || null
  } catch (e) {
    return null
  }
}

/**
 * 分享页：增量递归获取文件夹子树，结果追加到 shareFileCache
 * 已缓存的文件夹跳过，只获取新增的文件夹
 */
const buildShareFileCache = async (folders) => {
  const queue = [...folders]

  while (queue.length > 0) {
    const folder = queue.shift()
    // 同一个文件夹不重复调 API
    if (shareFetchedFolderIds.has(folder.id)) continue
    shareFetchedFolderIds.add(folder.id)

    // 将文件夹自身加入缓存（如果尚未加入）
    if (!shareCachedEntryIds.has(folder.id)) {
      shareFileCache.push({
        id: folder.id,
        parent_id: folder.parent_id || '',
        name: folder.name,
        kind: folder.kind,
        size: folder.size || '0'
      })
      shareCachedEntryIds.add(folder.id)
    }

    // 获取文件夹内容
    try {
      const res = await fetchShareFiles(shareId.value, folder.id, passCodeToken.value)
      const files = res?.files || []
      for (const file of files) {
        if (!shareCachedEntryIds.has(file.id)) {
          shareFileCache.push({
            id: file.id,
            parent_id: file.parent_id || folder.id,
            name: file.name,
            kind: file.kind,
            size: file.size || '0'
          })
          shareCachedEntryIds.add(file.id)
        }
        // 子文件夹加入队列继续递归
        if (file.kind === 'drive#folder' && !shareFetchedFolderIds.has(file.id)) {
          queue.push(file)
        }
      }
    } catch (e) {
      console.error(`[pikpakHelpr] buildShareFileCache: failed for ${folder.name}:`, e)
    }
  }
}

/**
 * 通用：从扁平化文件索引计算选中项的总大小
 * 适用于网盘页 dbIndex 和分享页 shareFileCache
 * - 普通文件直接取 size
 * - 文件夹递归查找 parent_id 子树累加
 * @returns {{ total: number, folderSizes: Record<string, number> }}
 */
const calcTotalSizeFromIndex = (fileIndex, selectedIds, matchedFiles) => {
  // 构建 parent_id 索引
  const byParent = {}
  const byId = {}
  for (const entry of fileIndex) {
    byId[entry.id] = entry
    const pid = entry.parent_id || ''
    if (!byParent[pid]) byParent[pid] = []
    byParent[pid].push(entry)
  }

  // BFS 递归计算文件夹大小
  const calcFolderSize = (folderId) => {
    let total = 0
    const queue = [folderId]
    const visited = new Set()
    while (queue.length > 0) {
      const pid = queue.shift()
      if (visited.has(pid)) continue
      visited.add(pid)
      const children = byParent[pid] || []
      for (const child of children) {
        if (child.kind === 'drive#folder') {
          queue.push(child.id)
        } else {
          total += parseInt(child.size) || 0
        }
      }
    }
    return total
  }

  // 选中项中普通文件的 size 直接累加
  let totalSize = matchedFiles.reduce((sum, f) => sum + (parseInt(f.size) || 0), 0)
  const folderSizes = {}

  // 选中项中的文件夹：递归累加子文件大小
  const selectedIdSet = new Set(selectedIds)
  for (const id of selectedIdSet) {
    const entry = byId[id]
    if (!entry || entry.kind !== 'drive#folder') continue
    const fs = calcFolderSize(id)
    folderSizes[id] = fs
    totalSize += fs
  }

  return { total: totalSize, folderSizes }
}

const close = () => {
  emits('close')
}

const openConfig = () => emits('openConfig')

// 递归获取所有选中文件（展开文件夹）
const getAllList = async () => {
  emits('msg', '开始获取文件内容', 'info')
  const allFiles = []
  const foldersToProcess = []

  // 直接使用选中的文件
  selectedFiles.value.forEach(file => {
    allFiles.push({ ...file, path: '' })
  })

  // 未匹配到详情的 ID 也加入（作为文件尝试下载）
  unmatchedIds.value.forEach(id => {
    allFiles.push({ id, name: id, path: '' })
  })

  // 分享页：如果有缓存，优先使用缓存数据
  if (isSharePage() && shareFileCache.length > 0 && selectedFolders.value.length > 0) {
    progress.mode = 'scan'
    progress.total = selectedFolders.value.length
    progress.current = 0
    progress.text = '正在从缓存读取...'

    // 构建 parent_id 索引
    const byParent = {}
    for (const entry of shareFileCache) {
      const pid = entry.parent_id || ''
      if (!byParent[pid]) byParent[pid] = []
      byParent[pid].push(entry)
    }

    // 从缓存的 byParent 索引中递归获取路径信息
    const collectWithPath = (parentId, path) => {
      const children = byParent[parentId] || []
      for (const child of children) {
        if (child.kind === 'drive#folder') {
          collectWithPath(child.id, `${path}/${child.name}`)
        } else {
          allFiles.push({ ...child, path })
        }
      }
    }

    for (const folder of selectedFolders.value) {
      progress.current++
      progress.text = `缓存读取: ${folder.name}`
      collectWithPath(folder.id, folder.name)
    }

    emits('msg', `文件获取完毕（缓存命中），共 ${allFiles.length} 个文件`, 'success')
    progress.show = false
    return allFiles
  }

  // 无缓存：走原有递归逻辑
  selectedFolders.value.forEach(folder => {
    foldersToProcess.push({ id: folder.id, name: folder.name, path: folder.name })
  })

  // 初始化扫描进度：按初始队列 + 已缓存直接文件数
  progress.total = foldersToProcess.length
  progress.text = `开始扫描 ${foldersToProcess.length} 个文件夹...`

  let processedCount = 0
  while (foldersToProcess.length > 0) {
    const currentFolder = foldersToProcess.shift()
    processedCount++
    progress.current = processedCount
    progress.text = `正在扫描: ${currentFolder.name}`

    try {
      let result = null

      if (isSharePage()) {
        const detail = getShareFolderDetail(currentFolder.id)
        if (detail?.files) {
          result = detail
        } else {
          try {
            result = await fetchShareFiles(shareId.value, currentFolder.id, passCodeToken.value)
            if (!result?.files?.length) {
              emits('msg', `文件夹 "${currentFolder.name}" 内容为空`, 'warning')
              continue
            }
          } catch (e) {
            console.error('[pikpakHelpr] getAllList API failed:', e)
            emits('msg', `获取文件夹 "${currentFolder.name}" 内容失败: ${e.message || '网络错误'}`, 'error')
            continue
          }
        }
      } else {
        result = await getList(currentFolder.id)
      }

      if (result.files) {
        for (const file of result.files) {
          if (file.kind === 'drive#folder') {
            foldersToProcess.push({ id: file.id, name: file.name, path: `${currentFolder.path}/${file.name}` })
          } else {
            allFiles.push({ ...file, path: currentFolder.path })
          }
        }
      }
    } catch (e) {
      emits('msg', `获取文件夹 ${currentFolder.name} 内容失败`, 'error')
      console.error(e)
    }
  }

  emits('msg', `文件获取完毕，共 ${allFiles.length} 个文件`, 'success')
  return allFiles
}

const pushBefore = async () => {
  if (isPushing.value) {
    emits('msg', '已经开始推送了', 'warning')
    return
  }
  isPushing.value = true

  // 启动进度显示
  progress.show = true
  progress.mode = 'scan'
  progress.current = 0
  progress.total = 0
  progress.success = 0
  progress.fail = 0
  progress.text = '准备扫描文件...'

  try {
    const allFiles = await getAllList()
    if (allFiles.length > 0) {
      await push(allFiles)
    } else {
      progress.show = false
      emits('msg', '没有可推送的文件', 'warning')
    }
  } finally {
    progress.show = false
    isPushing.value = false
  }
}

const push = async (items) => {
  const { host: ariaHost, path: ariaPath, token: ariaToken, params: customParams } = getAriaConfig()

  if (!ariaHost) {
    emits('msg', '请先配置aria2', 'error')
    progress.show = false
    return
  }

  // 切换到推送进度模式
  progress.show = true
  progress.mode = 'push'
  progress.current = 0
  progress.total = items.length
  progress.success = 0
  progress.fail = 0
  progress.text = `开始推送 ${items.length} 个文件...`

  console.log(`[pikpakHelpr] 共${items.length}个项目`)

  // 并发 Worker 池处理
  const MAX_CONCURRENT = 15
  const queue = [...items]
  let currentIndex = 0
  let errorMSG = ''

  const processOne = async () => {
    while (currentIndex < queue.length) {
      const i = currentIndex++
      const item = queue[i]
      progress.current = i + 1
      progress.text = `正在处理: ${item.name}`

      try {
        const res = await getDownload(item.id)

        if (res.error_description) {
          progress.fail++
          progress.text = `获取链接失败: ${item.name} - ${res.error_description}`
          continue
        }

        // 构建 aria2 请求参数
        const rpcParams = [
          [res.web_content_link],
          { out: res.name }
        ]

        if (ariaPath) rpcParams[1].dir = ariaPath + (item.path || '')

        // 自定义参数
        if (customParams) {
          customParams.split(';').forEach(param => {
            const [key, value] = param.split('=')
            if (key && value) rpcParams[1][key] = value
          })
        }

        if (ariaToken) rpcParams.unshift(`token:${ariaToken}`)

        const ariaData = buildAria2Payload('aria2.addUri', rpcParams)
        const ariares = await pushToAria(ariaHost, ariaData)

        // 兼容字符串响应
        const resoj = typeof ariares === 'string' ? JSON.parse(ariares) : ariares

        if (resoj.result) {
          progress.success++
        } else {
          errorMSG = resoj.error?.message === 'Unauthorized' ? '密钥不对' : (resoj.error?.message || '推送失败')
          progress.fail++
          progress.text = `推送失败: ${item.name}`
        }
      } catch (e) {
        progress.fail++
        progress.text = `处理失败: ${item.name} - ${e.message || '未知错误'}`
        errorMSG = e.message
      }
    }
  }

  const workers = Array.from({ length: MAX_CONCURRENT }, () => processOne())
  await Promise.all(workers)

  const resultType = progress.fail === 0 ? 'success' : (progress.success === 0 ? 'error' : 'warning')
  emits('msg', `推送完成 - 成功: ${progress.success}, 失败: ${progress.fail}${progress.fail ? ' (' + errorMSG + ')' : ''}`, resultType)
  console.info(`[pikpakHelpr] 推送完成 - 成功: ${progress.success}, 失败: ${progress.fail}`)

  close()
}

onMounted(() => setTimeout(handleTestConnection, 1000))
</script>

<style scoped>
/* 桌面/移动端标签切换 */
.lbl-m { display: none; }
.lbl-d { display: inline; }

/* 选中摘要 */
.summary {
  margin-bottom: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%);
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.summary-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.folder-badge {
  background: rgba(251, 191, 36, 0.15);
  color: #b45309;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.file-badge {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.unknown-badge {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
  border: 1px solid rgba(107, 114, 128, 0.2);
}

.summary-size {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

/* 文件列表 */
.file-list {
  min-height: 120px;
  max-height: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 2px solid #f1f5f9;
  border-radius: 16px;
  padding: 0;
  margin: 0;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
  list-style: none;
}

.file-list::-webkit-scrollbar {
  width: 8px;
}

.file-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 8px;
}

.file-list::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  border-radius: 8px;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
}

/* 文件列表项 */
.file-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  font-size: 14px;
  color: #334155;
  transition: background 0.2s ease;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background: rgba(99, 102, 241, 0.03);
}

.file-item .icon {
  margin-right: 12px;
  font-size: 1.4em;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
  flex-shrink: 0;
}

.file-item .file-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}

.file-item .unknown-name {
  color: #9ca3af;
  font-family: monospace;
  font-size: 12px;
}

.file-item .file-size {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  background: rgba(248, 250, 252, 0.8);
  border-radius: 6px;
  border: 1px solid rgba(226, 232, 240, 0.5);
  white-space: nowrap;
  flex-shrink: 0;
}

.file-item .file-tag {
  margin-left: auto;
  color: #92400e;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(251, 191, 36, 0.25);
  white-space: nowrap;
  flex-shrink: 0;
}

.file-item .unknown-tag {
  color: #6b7280;
  background: rgba(107, 114, 128, 0.08);
  border-color: rgba(107, 114, 128, 0.15);
}

.folder-item {
  background: rgba(251, 191, 36, 0.02);
}

.folder-size {
  color: #b45309 !important;
  background: rgba(251, 191, 36, 0.08) !important;
  border-color: rgba(251, 191, 36, 0.2) !important;
}

.unmatched-item {
  background: rgba(107, 114, 128, 0.02);
}

/* 加载动画 */
.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e5e7eb;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 32px 20px;
  margin-bottom: 16px;
  border: 2px dashed #e2e8f0;
  border-radius: 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
}

.empty-icon {
  font-size: 3em;
  margin-bottom: 12px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  text-align: center;
  margin-bottom: 8px;
}

.empty-guide {
  font-size: 14px;
  color: #6b7280;
  text-align: center;
  max-width: 320px;
  line-height: 1.6;
}

/* 进度条区域 */
.progress-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 32px 20px;
}

.progress-icon {
  margin-bottom: 16px;
}

.progress-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 20px;
}

.progress-bar-track {
  width: 100%;
  max-width: 400px;
  height: 10px;
  background: #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 10px;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
}

.progress-stats {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  color: #475569;
  margin-bottom: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.progress-stats .stat-progress {
  font-weight: 700;
  color: #4f46e5;
}

.progress-stats .stat-pct {
  font-weight: 600;
  color: #6366f1;
}

.progress-stats .stat-result {
  font-size: 13px;
}

.progress-detail {
  font-size: 13px;
  color: #64748b;
  max-width: 360px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 响应式 */
@media (max-width: 768px) {
  .summary-stats {
    flex-direction: column;
    gap: 6px;
  }
}

@media (max-width: 480px) {
  .file-list {
    max-height: none;
  }

  .dialog-body {
    /* 移动端让内容区自由滚动，不受 file-list 的 max-height 约束 */
  }

  .lbl-d { display: none; }
  .lbl-m { display: inline; }

  .summary {
    padding: 12px 14px;
    margin-bottom: 12px;
  }

  .file-item {
    padding: 10px 14px;
    font-size: 13px;
  }

  .file-item .icon {
    font-size: 1.2em;
    margin-right: 8px;
  }

  .file-item .file-size,
  .file-item .file-tag {
    font-size: 11px;
    padding: 2px 6px;
  }
}
</style>
