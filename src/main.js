import { createApp } from 'vue'
import App from './App.vue'
import './styles/common.css'
import { installShareObserver } from './api/index.js'
import { isSharePage } from './utils/index.js'

// 分享页：立即安装 fetch 拦截器，确保能捕获 Pikpak 初始 share/detail 请求
if (isSharePage()) {
  installShareObserver()
}

document.cookie = 'pp_access_to_visit=true'

function mountApp() {
  const pikpakContainer = document.getElementById('app')
  const app = document.createElement('div')
  document.body.insertBefore(app, pikpakContainer)
  createApp(App).mount(app)
}

// 等待 Nuxt app 渲染后再挂载，避免抢夺 #app 容器
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(mountApp, 500))
} else {
  setTimeout(mountApp, 500)
}
