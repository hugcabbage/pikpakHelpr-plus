<script setup>
import { ref } from "vue"
import AriaDownloadDialog from "./components/AriaDownloadDialog.vue"
import AriaConfigDialog from "./components/AriaConfigDialog.vue"
import Aria2Toast from './components/Aria2Toast.vue'
import FloatingWindow from './components/FloatingWindow.vue'
import { isPluginPage } from './utils/index.js'

const downloadShow = ref(false)
const configShow = ref(false)
const tip = ref('')
const toastRef = ref(null)
const showPlugin = ref(isPluginPage())

const showToast = (val, type = 'info') => {
  tip.value = val
  toastRef.value.open(type)
}
</script>

<template>
  <FloatingWindow
      v-if="showPlugin"
      @download="downloadShow = true"
    />
  <AriaDownloadDialog
      :show="downloadShow"
      @close="downloadShow = false"
      @openConfig="configShow = true"
      @msg="showToast"
    />
  <AriaConfigDialog
      :show="configShow"
      @close="configShow = false"
      @msg="showToast"
    />
  <Aria2Toast ref="toastRef">{{ tip }}</Aria2Toast>
</template>
