<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSupabaseClient, useSupabaseUser } from '#imports'

const client = useSupabaseClient()
const user = useSupabaseUser()
const selectedItems = ref([])
const availableItems = ref([])
const inputValue = ref('')
const showDropdown = ref(false)
const isLoading = ref(true)
const isSubmitting = ref(false)
const submissionDate = ref(new Date().toISOString().split('T')[0])

// Add debug logging for user state
console.log('Current user:', user.value)

// Fetch media options from database
async function fetchMediaOptions() {
  if (!user.value) {
    console.log('No user authenticated')
    return
  }
  
  isLoading.value = true
  try {
    // First check if we can access the media table at all
    const { count, error: countError } = await client
      .from('media')
      .select('*', { count: 'exact', head: true })

    console.log('Media table count:', count)
    if (countError) {
      console.error('Count error:', countError)
    }

    // Then try to get the actual data
    const { data, error } = await client
      .from('media')
      .select('id, name')
      .order('name')
    
    if (error) {
      console.error('Supabase error:', error)
      throw error
    }
    console.log('Raw media data:', data)
    availableItems.value = data?.map(item => item.name) || []
  } catch (err) {
    console.error('Error fetching media options:', err.message)
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
  }
  inputValue.value = ''
  showDropdown.value = false
}

async function createNew() {
  if (!user.value) return
  
  const newValue = inputValue.value.trim()
  if (newValue && !availableItems.value.includes(newValue)) {
    try {
      // First insert the media name
      const { data: mediaData, error: mediaError } = await client
        .from('media')
        .insert([{ 
          name: newValue
        }])
        .select()
        .single()
      
      if (mediaError) {
        console.error('Media insert error:', mediaError)
        throw mediaError
      }
      
      console.log('Created media entry:', mediaData)
      
      // Fetch updated list of media items
      await fetchMediaOptions()
      
      // Add to selected items
      selectedItems.value.push(newValue)
      
      // Clear input and close dropdown
      inputValue.value = ''
      showDropdown.value = false
      
    } catch (err) {
      console.error('Error creating new media item:', err)
    }
  }
}

function removeItem(item) {
  selectedItems.value = selectedItems.value.filter(i => i !== item)
}

// Add authentication watch to refetch when user logs in
watch(user, (newUser) => {
  if (newUser) {
    fetchMediaOptions()
  } else {
    availableItems.value = []
  }
})

// Add immediate user check
if (user.value) {
  console.log('User is authenticated:', user.value.id)
} else {
  console.log('No user is authenticated')
}

// Add function to get media IDs
async function getMediaIds(mediaNames) {
  const { data, error } = await client
    .from('media')
    .select('id, name')
    .in('name', mediaNames)

  if (error) throw error
  return data
}

// Add submit function
async function handleSubmit() {
  if (!user.value || selectedItems.value.length === 0) return
  
  isSubmitting.value = true
  try {
    // Get media IDs for selected items
    const mediaData = await getMediaIds(selectedItems.value)
    
    // Prepare entries for media_consumed table
    const entries = mediaData.map(media => ({
      user: user.value.id,
      date: submissionDate.value,
      media: media.id
    }))

    // Insert entries into media_consumed table
    const { error } = await client
      .from('media_consumed')
      .insert(entries)

    if (error) throw error

    // Clear selected items after successful submission
    selectedItems.value = []
    console.log('Successfully saved media consumption entries')
  } catch (err) {
    console.error('Error submitting media consumption:', err)
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  fetchMediaOptions()
})
</script>

<template>
  <d-page>
    <div class="flex justify-between items-center mb-6">
      <h1 class="page-title">Media Tracking</h1>
      <div class="flex gap-2">
        <d-button-darkmode />
      </div>
    </div>

    <div v-if="!user" class="text-center py-4 text-gray-500 dark:text-gray-400">
      Please log in to manage media items
    </div>

    <div v-else class="space-y-6">
      <!-- Date Input -->
      <div>
        <label class="block text-sm font-medium mb-2 dark:text-gray-200">
          Date
        </label>
        <input
          v-model="submissionDate"
          type="date"
          class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
        />
      </div>

      <!-- Media Input -->
      <div class="relative">
        <label class="block text-sm font-medium mb-2 dark:text-gray-200">
          Select Media
        </label>
        <input
          v-model="inputValue"
          type="text"
          placeholder="Type to search or create new..."
          class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          @focus="showDropdown = true"
          :disabled="isLoading"
        />
        
        <!-- Loading indicator -->
        <div v-if="isLoading" class="absolute right-2 top-9">
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
      <div v-if="selectedItems.length > 0">
        <label class="block text-sm font-medium mb-2 dark:text-gray-200">
          Selected Media
        </label>
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

      <!-- Submit Button -->
      <div class="mt-6">
        <button
          @click="handleSubmit"
          :disabled="isSubmitting || selectedItems.length === 0"
          class="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed relative"
        >
          <span v-if="isSubmitting" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </span>
          <span :class="{ invisible: isSubmitting }">
            Save Media Consumption
          </span>
        </button>
      </div>
    </div>
  </d-page>
</template>

<style scoped>
select option:disabled {
  color: #999;
  font-style: italic;
}
</style>
