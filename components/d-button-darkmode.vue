<script setup lang="ts">
import {useDark} from '@vueuse/core'

const isDarkMode = useDark()
function toggleDarkMode() {
  console.log('toggle')
  isDarkMode.value = !isDarkMode.value
}
</script>

<template>
  <button
      :class="['px-2.5 py-0 rounded-full  bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-gray-500 transition-colors duration-300 text-xl']"
      @click="toggleDarkMode"
  >
    <span v-if="isDarkMode" class="text-yellow-400">☀️</span>
    <span v-else class="text-gray-800">🌙</span>
  </button>

</template>

<style scoped>

</style>