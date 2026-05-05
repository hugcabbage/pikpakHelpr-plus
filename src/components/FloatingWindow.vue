<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['download'])

const floatingWindow = ref(null)
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const position = ref({ x: 0, y: 150 })
const hasDragged = ref(false)

// 拖拽功能
const startDrag = (e) => {
  isDragging.value = true
  hasDragged.value = false
  const rect = floatingWindow.value.getBoundingClientRect()
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

const onDrag = (e) => {
  if (!isDragging.value) return
  
  hasDragged.value = true
  const newX = e.clientX - dragOffset.value.x
  const newY = e.clientY - dragOffset.value.y
  
  // 限制在窗口范围内
  const maxX = window.innerWidth - floatingWindow.value.offsetWidth
  const maxY = window.innerHeight - floatingWindow.value.offsetHeight
  
  position.value.x = Math.max(0, Math.min(newX, maxX))
  position.value.y = Math.max(0, Math.min(newY, maxY))
}

const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 处理下载按钮点击
const handleDownload = (e) => {
  e.stopPropagation()
  e.preventDefault()
  // 如果没有拖拽，立即触发下载
  if (!hasDragged.value && !isDragging.value) {
    emit('download')
  }
}

// 调整悬浮窗位置，确保在窗口范围内
const adjustPosition = () => {
  const maxX = window.innerWidth - 60 // 悬浮窗宽度约50px + 边距
  const maxY = window.innerHeight - 60 // 悬浮窗高度约50px + 边距
  
  position.value.x = Math.max(0, Math.min(position.value.x, maxX))
  position.value.y = Math.max(0, Math.min(position.value.y, maxY))
}

// 窗口大小变化处理
const handleResize = () => {
  adjustPosition()
}

// 初始化位置
onMounted(() => {
  // 设置默认位置为右中偏上
  position.value.x = window.innerWidth - 80
  position.value.y = 150
  adjustPosition()
  
  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)
})

// 清理事件监听器
onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div 
    v-if="show"
    ref="floatingWindow"
    class="floating-window"
    :class="{ dragging: isDragging }"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
  >
    <!-- 下载按钮 -->
    <div class="download-button" @click="handleDownload" @mousedown.stop="startDrag">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.floating-window {
  position: fixed;
  z-index: 9999;
  user-select: none;
  transition: all 0.2s ease;
}

.floating-window.dragging {
  transition: none;
}

.download-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  padding: 0;
  background: linear-gradient(135deg, #409eff, #66b1ff);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
  color: white;
  transition: all 0.3s ease;
}

.download-button:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(64, 158, 255, 0.4);
}

.download-button:active {
  transform: scale(0.95);
}
</style>