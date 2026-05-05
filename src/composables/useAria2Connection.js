import { ref, computed } from 'vue'
import { pushToAria } from '../api/index.js'
import { getAriaConfig, buildAria2Payload } from '../utils/storage.js'

/**
 * Aria2 连接测试 composable
 * @param {Function} emits - 组件的 emits 函数，用于发送消息提示
 */
export function useAria2Connection(emits) {
  const connectionState = ref('unknown') // 'unknown' | 'connected' | 'disconnected' | 'testing'
  const isTestingConnection = ref(false)

  const connectionStatus = computed(() => {
    switch (connectionState.value) {
      case 'connected':
        return { class: 'connected', text: 'Aria2连接正常' }
      case 'disconnected':
        return { class: 'disconnected', text: 'Aria2连接失败' }
      case 'testing':
        return { class: 'testing', text: '正在测试连接...' }
      default:
        return { class: 'unknown', text: 'Aria2连接状态未知' }
    }
  })

  const testConnection = async (host, token) => {
    if (isTestingConnection.value) return

    // 如果没有传入参数，从 localStorage 读取
    if (!host) {
      const config = getAriaConfig()
      host = config.host
      token = token ?? config.token
    }

    if (!host) {
      connectionState.value = 'disconnected'
      emits?.('msg', '请先配置Aria2 RPC地址', 'error')
      return
    }

    isTestingConnection.value = true
    connectionState.value = 'testing'

    try {
      const rpcToken = token ? `token:${token}` : ''
      const payload = buildAria2Payload('aria2.getVersion', rpcToken ? [rpcToken] : [])
      const response = await pushToAria(host, payload)

      if (response && response.result) {
        connectionState.value = 'connected'
      } else {
        connectionState.value = 'disconnected'
        emits?.('msg', 'Aria2连接失败，请检查配置', 'error')
      }
    } catch (error) {
      console.error('[pikpakHelpr] Aria2连接测试失败:', error)
      connectionState.value = 'disconnected'
      emits?.('msg', `连接失败: ${error.message || '请检查RPC地址和密钥'}`, 'error')
    } finally {
      isTestingConnection.value = false
    }
  }

  return { connectionState, isTestingConnection, connectionStatus, testConnection }
}
