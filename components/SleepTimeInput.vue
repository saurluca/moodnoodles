<script setup>
import { computed } from 'vue'

const props = defineProps({
  form: { type: Object, required: true }
})

const emit = defineEmits(['update:sleepTime'])

// Validate and constrain hour input
function validateHour(value, field) {
  let num = parseInt(value)
  if (isNaN(num)) {
    props.form[field] = ''
  } else {
    num = Math.max(0, Math.min(23, num))
    props.form[field] = num.toString()
  }
}

// Validate and constrain minute input
function validateMinute(value, field) {
  let num = parseInt(value)
  if (isNaN(num)) {
    props.form[field] = ''
  } else {
    num = Math.max(0, Math.min(59, num))
    props.form[field] = num.toString()
  }
}

// Calculate sleep duration when either time changes
const sleepDuration = computed(() => {
  if (!props.form.sleep_start_hour || !props.form.sleep_end_hour) return ''
  const startMinute = props.form.sleep_start_minute || 0
  const endMinute = props.form.sleep_end_minute || 0
  const startHour = Number(props.form.sleep_start_hour)
  const endHour = Number(props.form.sleep_end_hour)
  
  let start = new Date(2000, 0, 1, startHour, startMinute)
  let end = new Date(2000, 0, 1, endHour, endMinute)
  
  // If end time is before start time, add one day to end time
  if (end < start) {
    end.setDate(end.getDate() + 1)
  }
  
  const diff = (end - start) / (1000 * 60 * 60) // Convert to hours
  props.form.sleep_time = diff.toFixed(1)
  return diff.toFixed(1)
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex gap-4 items-center">
      <div class="flex-1">
        <label class="font-bold dark:text-gray-400">Bed Time</label>
        <div class="flex gap-2 items-center">
          <input
            type="number"
            v-model="form.sleep_start_hour"
            @input="validateHour($event.target.value, 'sleep_start_hour')"
            min="0"
            max="23"
            placeholder="HH"
            class="w-16 border p-3 rounded text-base dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <span class="text-xl font-bold">:</span>
          <input
            type="number"
            v-model="form.sleep_start_minute"
            @input="validateMinute($event.target.value, 'sleep_start_minute')"
            min="0"
            max="59"
            placeholder="MM"
            class="w-16 border p-3 rounded text-base dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>
      <div class="flex-1">
        <label class="font-bold dark:text-gray-400">Wake Up Time</label>
        <div class="flex gap-2 items-center">
          <input
            type="number"
            v-model="form.sleep_end_hour"
            @input="validateHour($event.target.value, 'sleep_end_hour')"
            min="0"
            max="23"
            placeholder="HH"
            class="w-16 border p-3 rounded text-base dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <span class="text-xl font-bold">:</span>
          <input
            type="number"
            v-model="form.sleep_end_minute"
            @input="validateMinute($event.target.value, 'sleep_end_minute')"
            min="0"
            max="59"
            placeholder="MM"
            class="w-16 border p-3 rounded text-base dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>
      <div class="flex-1">
        <label class="font-bold dark:text-gray-400">Total Sleep</label>
        <div class="flex items-center h-[42px]">
          <span class="text-gray-600 text-lg dark:text-gray-300">{{ sleepDuration || '-' }}h</span>
        </div>
      </div>
    </div>
  </div>
</template> 