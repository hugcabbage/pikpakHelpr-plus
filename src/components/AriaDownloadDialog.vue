<template>
  <div v-if="show">
    <div class="dialog-overlay" @click="close"></div>
    <div style="width: 60%" class="dialog">
      <h2>请勾选你要下载的</h2>
      <div class="close" @click="close">×</div>
      <div class="toolbar">
        <label for="checkbox">
          <input @change="onCheckAll" type="checkbox" id="checkbox" v-model="checkedAll">
          全选
        </label>
        <div class="sort-options">
          <label for="sort-by">排序方式:</label>
          <select id="sort-by" v-model="sortBy" @change="sortList">
            <option value="name">名称</option>
            <option value="created_time">创建时间</option>
            <option value="modified_time">修改时间</option>
            <option value="size">大小</option>
            <option value="file_category">文件类型</option>
          </select>
          <select id="sort-direction" v-model="sortDirection" @change="sortList">
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
        </div>
      </div>
      <ul class="movies">
        <li v-for="(item, index) in list" :key="item.id">
          <input @change="onCheck" type="checkbox" :id="item.id" :value="index" v-model="selected">
          <span class="icon">{{ item.type === 'drive#folder' ? '📁' : '📄' }}</span>
          <span class="file-name">{{ item.name }}</span>
          <span class="file-info">{{ formatFileInfo(item, sortBy) }}</span>
        </li>
      </ul>

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
        <div class="btn el-button el-button--secondary" @click="openConfig">配置aria2</div>
        <div class="btn el-button el-button--primary" @click="pushBefore">推送到aria2</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { getDownload, pushToAria, getList, getShareCurrentFiles, fetchShareFiles, getShareFolderDetail } from '../api'
import { isSharePage, getShareId, getSharePageData } from '../utils/index.js'
import { formatFileInfo } from '../utils/format.js'
import { getAriaConfig, buildAria2Payload } from '../utils/storage.js'
import { useAria2Connection } from '../composables/useAria2Connection.js'

const props = defineProps({ show: Boolean })
const emits = defineEmits(['close', 'msg', 'openConfig'])

const list = ref([])
const selected = ref([])
const checkedAll = ref(false)
const selectedItems = ref([])
const isForbidden = ref(false)

// 分享页状态
const shareId = ref('')
const passCodeToken = ref('')

const sortBy = ref('name')
const sortDirection = ref('asc')

// Aria2 连接状态（composable）
const { connectionStatus, isTestingConnection, testConnection } = useAria2Connection(emits)

const handleTestConnection = () => testConnection()

// 构建文件列表项
const buildFileItem = (item) => ({
  id: item.id,
  name: item.name,
  type: item.kind,
  created_time: item.created_time,
  modified_time: item.modified_time,
  size: item.size,
  file_category: item.file_category
})

watch(
  () => props.show,
  (val) => {
    if (!val) return
    list.value = []

    if (isSharePage()) {
      shareId.value = getShareId()
      const data = getSharePageData()
      passCodeToken.value = data?.data?.pass_code_token || ''
      emits('msg', '正在加载分享文件列表...', 'info')

      const loadShareFiles = async (retries = 5) => {
        const shareFiles = await getShareCurrentFiles()
        if (shareFiles.files.length > 0 || retries <= 0) {
          list.value = shareFiles.files.map(buildFileItem)
          sortList()
          emits('msg', `文件列表加载完成，共 ${list.value.length} 项`, 'success')
        } else {
          setTimeout(() => loadShareFiles(retries - 1), 500)
        }
      }
      loadShareFiles()
    } else {
      let parentId = window.location.href.split('/').pop()
      if (parentId === 'all') parentId = ''
      emits('msg', '开始加载文件列表，请稍等', 'info')
      getList(parentId).then(res => {
        list.value = res.files.map(buildFileItem)
        sortList()
      }).finally(() => {
        emits('msg', '文件列表加载完成', 'success')
      })
    }

    setTimeout(handleTestConnection, 500)
  }
)

const close = () => {
  selected.value = []
  checkedAll.value = false
  isForbidden.value = false
  emits('close')
}

const openConfig = () => emits('openConfig')

// 选择
const onCheckAll = () => {
  selected.value = checkedAll.value ? list.value.map((_, index) => index) : []
}
const onCheck = () => {
  checkedAll.value = selected.value.length === list.value.length
}

const sortList = () => {
  list.value.sort((a, b) => {
    // 文件夹优先
    if (a.type === 'drive#folder' && b.type !== 'drive#folder') return -1
    if (a.type !== 'drive#folder' && b.type === 'drive#folder') return 1

    let aValue = a[sortBy.value]
    let bValue = b[sortBy.value]

    if (sortBy.value === 'size') {
      aValue = parseInt(aValue)
      bValue = parseInt(bValue)
    } else if (sortBy.value === 'created_time' || sortBy.value === 'modified_time') {
      aValue = new Date(aValue).getTime()
      bValue = new Date(bValue).getTime()
    }

    const comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0
    return sortDirection.value === 'asc' ? comparison : -comparison
  })
  updateSelectedIndices()
}

const updateSelectedIndices = () => {
  const currentlySelectedIds = new Set(selected.value.map(index => list.value[index].id))
  selected.value = []
  list.value.forEach((item, index) => {
    if (currentlySelectedIds.has(item.id)) selected.value.push(index)
  })
}

// 递归获取所有选中文件（展开文件夹）
const getAllList = async () => {
  emits('msg', '开始获取文件内容', 'info')
  const initialSelectedItems = selected.value.map(index => list.value[index])
  const allFiles = []
  const foldersToProcess = []

  initialSelectedItems.forEach(item => {
    if (item.type === 'drive#folder') {
      foldersToProcess.push({ id: item.id, name: item.name, path: item.name })
    } else {
      allFiles.push({ ...item, path: '' })
    }
  })

  let processedCount = 0
  while (foldersToProcess.length > 0) {
    const currentFolder = foldersToProcess.shift()
    processedCount++
    emits('msg', `正在扫描第 ${processedCount} 个文件夹: ${currentFolder.name}`, 'info')

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

  selectedItems.value = allFiles
  emits('msg', `文件获取完毕，共${allFiles.length}个文件。`, 'success')
}

const pushBefore = async () => {
  if (isForbidden.value) {
    emits('msg', '已经开始推送了', 'warning')
    return
  }
  isForbidden.value = true
  await getAllList()
  push()
}

const push = async () => {
  const { host: ariaHost, path: ariaPath, token: ariaToken, params: customParams } = getAriaConfig()

  if (!ariaHost) {
    emits('msg', '请先配置aria2', 'error')
    close()
    return
  }

  let success = 0
  let fail = 0
  let errorMSG = ''

  console.log(`[pikpakHelpr] 共${selectedItems.value.length}个项目`)

  // 并发 Worker 池处理
  const MAX_CONCURRENT = 5
  const items = [...selectedItems.value]
  let currentIndex = 0

  const processOne = async () => {
    while (currentIndex < items.length) {
      const i = currentIndex++
      const item = items[i]
      console.log(`[pikpakHelpr] 处理第${i + 1}/${items.length}个项目: ${item.name}`)
      emits('msg', `正在处理: ${item.name}`, 'info')

      try {
        const res = await getDownload(item.id)

        if (res.error_description) {
          console.error(`[pikpakHelpr] 第${i + 1}个项目下载链接获取失败:`, res.error_description)
          emits('msg', `失败: ${item.name} - ${res.error_description}`, 'error')
          fail++
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
          success++
        } else {
          errorMSG = resoj.error?.message === 'Unauthorized' ? '密钥不对' : (resoj.error?.message || '推送失败')
          fail++
          emits('msg', `推送失败: ${item.name} - ${errorMSG}`, 'error')
        }
      } catch (e) {
        console.error(`[pikpakHelpr] 第${i + 1}个项目处理失败:`, e)
        emits('msg', `处理失败: ${item.name} - ${e.message || '未知错误'}`, 'error')
        fail++
        errorMSG = e.message
      }
    }
  }

  const workers = Array.from({ length: MAX_CONCURRENT }, () => processOne())
  await Promise.all(workers)

  const resultType = fail === 0 ? 'success' : (success === 0 ? 'error' : 'warning')
  emits('msg', `推送完成 - 成功: ${success}, 失败: ${fail}${fail ? ' (' + errorMSG + ')' : ''}`, resultType)
  console.info(`[pikpakHelpr] 推送完成 - 成功: ${success}, 失败: ${fail}`)

  close()
}

onMounted(() => setTimeout(handleTestConnection, 1000))
</script>

<style scoped>
/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%);
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.toolbar input[type="checkbox"] {
  margin-right: 8px;
  transform: scale(1.3);
  accent-color: #6366f1;
}

.toolbar label {
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: color 0.2s ease;
}

.toolbar label:hover {
  color: #6366f1;
}

/* 排序选项 */
.sort-options {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.sort-options label {
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
}

.sort-options select {
  padding: 8px 12px;
  border: 2px solid #e5e7eb;
  background: white;
  color: #374151;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.sort-options select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.sort-options select:hover {
  border-color: #9ca3af;
}

/* 文件列表 */
.movies {
  margin-top: 16px;
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 2px solid #f1f5f9;
  border-radius: 16px;
  padding: 0;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}

.movies::-webkit-scrollbar {
  width: 8px;
}

.movies::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 8px;
}

.movies::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  border-radius: 8px;
  transition: background 0.2s ease;
}

.movies::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
}

/* 文件列表项 */
.movies li {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  font-size: 14px;
  color: #334155;
  transition: all 0.2s ease;
  cursor: pointer;
  margin-right: -4px;
  overflow: hidden;
}

.movies li:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%);
  transform: translateX(4px);
  margin-right: 0;
}

.movies li:last-child {
  border-bottom: none;
}

.movies li input[type="checkbox"] {
  margin-right: 16px;
  transform: scale(1.2);
  accent-color: #6366f1;
}

.movies li .icon {
  margin-right: 12px;
  font-size: 1.5em;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.movies li .file-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}

.movies li .file-info {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  background: rgba(248, 250, 252, 0.8);
  border-radius: 6px;
  border: 1px solid rgba(226, 232, 240, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 30%;
}

/* 响应式 */
@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .sort-options {
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .sort-options select {
    width: 100%;
    box-sizing: border-box;
  }
}

@media (max-width: 480px) {
  .movies {
    min-height: 150px;
  }
}
</style>
