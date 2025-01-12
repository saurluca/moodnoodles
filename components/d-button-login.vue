<script setup lang="ts">
import {LogIn} from 'lucide-vue-next'

</script>

<template>
  <router-link to="/login">
    <button class="dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full p-1.5">
      <LogIn class="text-black dark:text-slate-200 h-6 w-6"/>
    </button>
  </router-link>

</template>

<style scoped>

</style>