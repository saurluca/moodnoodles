<script setup>
import { ref, computed } from 'vue'
import { useSupabaseClient, useSupabaseUser } from '#imports'

const props = defineProps({
  form: {
    type: Object,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true
  }
})

const client = useSupabaseClient()
const user = useSupabaseUser()
const selectedItems = ref([])
const availableItems = ref([])
const inputValue = ref('')
const showDropdown = ref(false)
const isLoading = ref(true)

// Fetch media options from database
async function fetchMediaOptions() {
  if (!user.value) return
  
  isLoading.value = true
  try {
    const { data, error } = await client
      .from('media')
      .select('id, name')
      .order('name')
    
    if (error) throw error
    availableItems.value = data?.map(item => item.name) || []
  } catch (err) {
    console.error('Error fetching media options:', err)
    availableItems.value = []
  } finally {
    isLoading.value = false
  }
}

const filteredOptions = computed(() => {
  if (!inputValue.value) return availableItems.value
  return availableItems.value.filter(item => 
    item.toLowerCase().includes(inputValue.value.toLowerCase()) &&
    !selectedItems.value.includes(item)
  )
})

function handleSelect(item) {
  if (!selectedItems.value.includes(item)) {
    selectedItems.value.push(item)
    props.form[props.slug] = selectedItems.value
  }
  inputValue.value = ''
  showDropdown.value = false
}

async function createNew() {
  if (!user.value) return
  
  const newValue = inputValue.value.trim()
  if (newValue && !availableItems.value.includes(newValue)) {
    try {
      const { data: mediaData, error: mediaError } = await client
        .from('media')
        .insert([{ name: newValue }])
        .select()
        .single()
      
      if (mediaError) throw mediaError
      
      await fetchMediaOptions()
      handleSelect(newValue)
      
    } catch (err) {
      console.error('Error creating new media item:', err)
    }
  }
}

function removeItem(item) {
  selectedItems.value = selectedItems.value.filter(i => i !== item)
  props.form[props.slug] = selectedItems.value
}

// Initialize
fetchMediaOptions()
</script>

<template>
  <div>
    <label class="tracker-title-input">{{ title }}</label>
    
    <div class="relative">
      <input
        v-model="inputValue"
        type="text"
        placeholder="Type to search or create new..."
        class="w-full border p-2 rounded text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
        @focus="showDropdown = true"
        :disabled="isLoading"
      />
      
      <!-- Loading indicator -->
      <div v-if="isLoading" class="absolute right-2 top-2">
        <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
      
      <!-- Dropdown -->
      <div
        v-if="!isLoading && showDropdown && (filteredOptions.length > 0 || inputValue)"
        class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-60 overflow-y-auto"
      >
        <ul>
          <li
            v-for="option in filteredOptions"
            :key="option"
            @click="handleSelect(option)"
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer dark:text-gray-200"
          >
            {{ option }}
          </li>
          <li
            v-if="inputValue && !filteredOptions.includes(inputValue)"
            @click="createNew"
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-blue-500"
          >
            Create "{{ inputValue }}"
          </li>
        </ul>
      </div>
    </div>

    <!-- Selected Items -->
    <div v-if="selectedItems.length > 0" class="mt-2">
      <div class="flex flex-wrap gap-2">
        <div
          v-for="item in selectedItems"
          :key="item"
          class="bg-blue-100 dark:bg-blue-800 px-3 py-1 rounded-full flex items-center gap-2"
        >
          <span class="dark:text-gray-200">{{ item }}</span>
          <button
            @click="removeItem(item)"
            class="text-sm hover:text-red-500 dark:hover:text-red-400"
            type="button"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template> 