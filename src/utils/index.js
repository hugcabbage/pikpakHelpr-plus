// ── 页面检测工具函数 ──

export function isSharePage() {
  return location.pathname.startsWith('/s/')
}

export function getShareId() {
  return location.pathname.split('/')[2]
}

export function getSharePageData() {
  try {
    const nuxt = window.useNuxtApp()
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
