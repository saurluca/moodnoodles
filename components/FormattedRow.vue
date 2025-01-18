<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    default: '-'
  },
  isFullWidth: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <div :class="isFullWidth ? 'pt-2 border-t' : 'flex justify-between'">
    <strong class="dark:text-gray-300">{{ label }}:</strong>
    <p v-if="isFullWidth" class="dark:text-gray-300 break-words">{{ value || '-' }}</p>
    <span v-else class="dark:text-gray-300">{{ value || '-' }}</span>
  </div>
</template> 