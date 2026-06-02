<template>
  <div v-if="show" @click.stop @mousedown.stop>
    <div class="dialog-overlay" @click.stop="close"></div>
    <div class="dialog">
      <h2>请配置你的aria2</h2>
      <div class="close" @click.stop="close">×</div>

      <!-- 连接状态显示 -->
      <div class="connection-status">
        <div class="status-indicator">
          <div class="status-dot" :class="connectionStatus.class"></div>
          <span class="status-text">{{ connectionStatus.text }}</span>
        </div>
        <button class="test-btn" @click="handleTestConnection" :disabled="isTestingConnection">
          {{ isTestingConnection ? '测试中...' : '测试连接' }}
        </button>
      </div>

      <!-- 中间可滚动内容区 -->
      <div class="dialog-body">
        <ul class="config-list">
          <li>
            <div class="label">RPC地址</div>
            <input v-model="form.host" type="text" placeholder="http://127.0.0.1:6800/jsonrpc">
            <p class="guidance">Aria2 RPC服务的地址，通常是 http://127.0.0.1:6800/jsonrpc。如果你在Docker中运行，可能需要使用宿主机的IP地址。</p>
          </li>
          <li>
            <div class="label">RPC密钥</div>
            <input v-model="form.token" type="text" placeholder="没有请留空">
            <p class="guidance">Aria2 RPC的密钥，如果你在Aria2配置中设置了 rpc-secret，请在此填写。如果没有设置，请留空。</p>
          </li>
          <li>
            <div class="label">下载路径</div>
            <input v-model="form.path" type="text" placeholder="C:/Users/admin/Downloads/">
            <p class="guidance">文件在服务器上的保存路径。例如：/downloads/ (Linux) 或 D:\Downloads (Windows)。请确保Aria2有写入该目录的权限。</p>
          </li>
          <li>
            <div class="label">其他参数</div>
            <input v-model="form.params" type="text" placeholder="user-agent=xxx;header=xxx">
            <p class="guidance">Aria2的额外参数，以分号 ; 分隔，例如 user-agent=Mozilla;split=10。这些参数会直接传递给Aria2。</p>
          </li>
        </ul>
      </div>

      <div class="footer">
        <div class="btn el-button el-button--primary" @click="save">保存</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { useAria2Connection } from '../composables/useAria2Connection.js'
import { getAriaConfig, saveAriaConfig } from '../utils/storage.js'

const props = defineProps({ show: Boolean })
const emits = defineEmits(['close', 'msg'])

const close = () => emits('close')

// 从 localStorage 初始化表单
const config = getAriaConfig()
const form = reactive({ ...config })

// Aria2 连接状态（composable）
const { connectionStatus, isTestingConnection, testConnection } = useAria2Connection(emits)

const handleTestConnection = () => testConnection(form.host, form.token)

const save = () => {
  saveAriaConfig({ ...form })
  emits('msg', '配置保存成功！', 'success')
  close()
}

// 不在挂载时自动测试连接，用户可点击“测试连接”按钮进行检测
</script>

<style scoped>
/* 配置对话框特定覆盖：宽度 */
.dialog {
  max-width: 500px;
}

.config-list {
  margin-top: 20px;
}

.config-list li {
  margin-bottom: 15px;
}

.config-list li .label {
  font-weight: bold;
  margin-bottom: 5px;
  display: block;
  color: #555;
}

.config-list li input[type="text"] {
  width: 100%;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 14px;
  transition: border-color 0.3s ease;
}

.config-list li input[type="text"]:focus {
  border-color: #409eff;
  outline: none;
}

.footer {
  justify-content: flex-end;
}

.guidance {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  line-height: 1.5;
}
</style>
