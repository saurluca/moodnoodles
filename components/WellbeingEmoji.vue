<script setup>
import { computed } from 'vue'

const props = defineProps({
  formValue: { type: Number, default: 0 }
})

const emit = defineEmits(['pointSelected', 'update:formValue'])

const currentValue = computed({
  get: () => props.formValue,
  set: (val) => emit('update:formValue', val)
})

const options = [
  { value: 2, emoji: '😫', label: 'Bad', color: 'text-red-500' },
  { value: 4, emoji: '😕', label: 'Meh', color: 'text-orange-500' },
  { value: 6, emoji: '🙂', label: 'Okay', color: 'text-blue-500' },
  { value: 8, emoji: '😊', label: 'Good', color: 'text-lime-500' },
  { value: 10, emoji: '😄', label: 'Awesome', color: 'text-green-500' }
]

function selectWellbeing(e, value) {
  e.preventDefault()
  currentValue.value = value
  emit('pointSelected', value)
}
</script>

<template>
  <div class="flex flex-col items-center gap-2 mt-4 mb-5">
    <div class="flex justify-between w-full max-w-md">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        @click="(e) => selectWellbeing(e, option.value)"
        class="flex flex-col items-center gap-1 transition-transform hover:scale-110"
        :class="[
          option.color,
          currentValue === option.value ? 'scale-125' : 'opacity-50'
        ]"
      >
        <span class="text-4xl">{{ option.emoji }}</span>
        <span class="text-xs text-gray-600 dark:text-gray-300">{{ option.label }}</span>
      </button>
    </div>
  </div>
</template> 