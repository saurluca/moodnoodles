<script setup>
import {reactive, ref, onMounted, onBeforeUnmount, watch} from 'vue'
import {nanoid} from 'nanoid'
import WellbeingChart from '~/components/WellbeingChart.vue'
import {House} from 'lucide-vue-next'
import WellbeingEmoji from '~/components/WellbeingEmoji.vue'
import SleepTimeInput from '~/components/SleepTimeInput.vue'
import FormattedEntryDisplay from '~/components/FormattedEntryDisplay.vue'
import DMediaTracker from '~/components/d-media-tracker.vue'

// Initialize Supabase
const client = useSupabaseClient()
const user = useSupabaseUser()

// Main Form
const form = reactive({
  id: nanoid(),
  wellbeing: 0,
  meditated: null,
  sleep_time: '',
  sleep_start: '',
  sleep_end: '',
  did_sport: null,
  gratitude: '',
  insight: null,
  steps: null,
  period: null,
  sweets: null,
  walk: null,
  breadstuff: null,
  power_nap: null,
  media: [],
})

// Dialog and Submission States
const submitted = ref(false)
const showSuccessDialog = ref(false)
const showUpdateDialog = ref(false)
const showErrorDialog = ref(false)
const errorMessage = ref('')
const existingEntryId = ref(null)
const showLoginPrompt = ref(false)

// Add localStorage functionality
const STORAGE_KEY = 'wellbeing_form_data'
const today = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().split('T')[0]

// Save form data to localStorage
function saveToLocalStorage() {
  if (typeof window !== 'undefined') {
    const dataToSave = {
      ...form,
      savedDate: today
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
  }
}

// Load form data from localStorage
function loadFromLocalStorage() {
  if (typeof window !== 'undefined') {
    const savedData = localStorage.getItem(STORAGE_KEY)
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData)
        
        // Only restore if it's from today
        if (parsedData.savedDate === today) {
          // Preserve the ID from the current form
          const currentId = form.id
          
          // Merge saved data into form, excluding the savedDate property
          const { savedDate, ...dataToRestore } = parsedData
          Object.assign(form, dataToRestore)
          
          // Restore the current ID
          form.id = currentId
          
          console.log('Restored form data from localStorage')
          return true
        } else {
          // Clear localStorage if it's from a different day
          localStorage.removeItem(STORAGE_KEY)
          console.log('Cleared outdated form data from localStorage')
        }
      } catch (e) {
        console.error('Error parsing saved form data:', e)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    return false
  }
}

// Watch for form changes and save to localStorage
watch(form, () => {
  saveToLocalStorage()
}, { deep: true })

// Field Config
const fields = [
  {title: 'What are you grateful for today?', slug: 'gratitude', type: 'text'},
  {title: 'What did you learn today?', slug: 'insight', type: 'text'},
  {title: 'Steps taken', slug: 'steps', type: 'number'},
  {title: 'Media Consumed', slug: 'media', type: 'media'},
  {title: 'Bread eaten', slug: 'breadstuff', type: 'select', options: ['Bread', 'Buns', 'Both', 'None']},
  {title: 'Meditated', slug: 'meditated', type: 'bool'},
  {title: 'Went for a walk', slug: 'walk', type: 'bool'},
  {title: 'Did Sport', slug: 'did_sport', type: 'bool'},
  {title: 'Ate Sweets', slug: 'sweets', type: 'bool'},
  {title: 'Period', slug: 'period', type: 'bool'},
  {title: 'Power Nap', slug: 'power_nap', type: 'bool'},
]

// Convert "yes"/"no" to boolean or null
function parseBoolean(val) {
  if (val === 'yes') return true
  if (val === 'no') return false
  return null
}

// Update handleMediaEntries function
async function handleMediaEntries(date) {
  if (!user.value) return

  try {
    // If media array is empty, delete all entries for this date
    if (!form.media || form.media.length === 0) {
      const { error: deleteError } = await client
        .from('media_consumed')
        .delete()
        .eq('user', user.value.id)
        .eq('date', date)

      if (deleteError) throw deleteError
      return
    }

    // Get media IDs for selected items
    const { data: mediaData, error: mediaError } = await client
      .from('media')
      .select('id, name')
      .in('name', form.media)

    if (mediaError) throw mediaError

    // Get existing entries for this date
    const { data: existingEntries, error: fetchError } = await client
      .from('media_consumed')
      .select('media')
      .eq('user', user.value.id)
      .eq('date', date)

    if (fetchError) throw fetchError

    // Find entries to delete (entries that exist but aren't in the new selection)
    const selectedMediaIds = mediaData.map(m => m.id)
    const existingMediaIds = existingEntries?.map(entry => entry.media) || []
    
    const idsToDelete = existingMediaIds.filter(id => !selectedMediaIds.includes(id))
    
    // Delete removed entries
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await client
        .from('media_consumed')
        .delete()
        .eq('user', user.value.id)
        .eq('date', date)
        .in('media', idsToDelete)

      if (deleteError) throw deleteError
    }

    // Add new entries
    const newMediaEntries = mediaData
      .filter(media => !existingMediaIds.includes(media.id))
      .map(media => ({
        user: user.value.id,
        date: date,
        media: media.id
      }))

    if (newMediaEntries.length > 0) {
      const { error: insertError } = await client
        .from('media_consumed')
        .insert(newMediaEntries)

      if (insertError) throw insertError
    }

  } catch (err) {
    console.error('Error handling media entries:', err)
    throw new Error('Failed to save media consumption data')
  }
}

// Update the upsertEntry function
async function upsertEntry(dataToUpload) {
  if (existingEntryId.value) dataToUpload.id = existingEntryId.value

  try {
    // First handle the tracker data
    const { error } = await client
      .from('tracker')
      .upsert([dataToUpload], { onConflict: ['user_id', 'date'] })

    if (error) throw new Error('Error upserting tracker data: ' + error.message)

    // Then handle media entries
    await handleMediaEntries(dataToUpload.date)

    showSuccessDialog.value = true
    console.log('Entry successfully saved:', dataToUpload)
    
    // Clear localStorage after successful submission
    clearLocalStorage()
  } catch (err) {
    console.error('Unexpected error during upsert:', err.message)
    errorMessage.value = err.message
    showErrorDialog.value = true
  } finally {
    showUpdateDialog.value = false
    existingEntryId.value = null
  }
}

// Update fetchData function
async function fetchData() {
  // Try to load from localStorage first
  const loadedFromStorage = loadFromLocalStorage()
  
  // If not loaded from storage and user is logged in, fetch from database
  if (!loadedFromStorage && user.value) {
    try {
      const date = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      // Fetch tracker data
      const { data } = await client
        .from('tracker')
        .select()
        .eq('date', date)
      
      if (data && data[0]) {
        // Handle sleep time data
        if (data[0].sleep_start) {
          const [startHour, startMinute] = data[0].sleep_start.split(':')
          data[0].sleep_start_hour = startHour
          data[0].sleep_start_minute = startMinute
        }
        if (data[0].sleep_end) {
          const [endHour, endMinute] = data[0].sleep_end.split(':')
          data[0].sleep_end_hour = endHour
          data[0].sleep_end_minute = endMinute
        }
        
        Object.assign(form, data[0])
      }

      // Fetch media consumed for this date
      const { data: mediaData, error: mediaError } = await client
        .from('media_consumed')
        .select(`
          media (
            id,
            name
          )
        `)
        .eq('user', user.value.id)
        .eq('date', date)

      if (!mediaError && mediaData) {
        // Extract media names from the nested media objects
        form.media = mediaData.map(entry => entry.media.name)
        console.log('Fetched media:', form.media)
      }
      
      // Save the fetched data to localStorage
      saveToLocalStorage()
    } catch (err) {
      console.error('Error fetching data:', err)
    }
  }
}

// Prepare Data
function prepareFormData() {
  // Format times as HH:MM:SS for database
  const formatTimeForDB = (hour, minute) => {
    if (!hour) return null
    const h = hour.padStart(2, '0')
    const m = (minute || '0').padStart(2, '0')
    return `${h}:${m}:00`
  }

  return {
    id: form.id,
    wellbeing: Number(form.wellbeing),
    insight: (form.insight ?? '').trim() || null,
    meditated: parseBoolean(form.meditated),
    sleep_time: (form.sleep_time == null || form.sleep_time === '') ? null : Number(form.sleep_time),
    sleep_start: formatTimeForDB(form.sleep_start_hour, form.sleep_start_minute),
    sleep_end: formatTimeForDB(form.sleep_end_hour, form.sleep_end_minute),
    did_sport: parseBoolean(form.did_sport),
    gratitude: (form.gratitude ?? '').trim() || null,
    steps: (form.steps == null || form.steps === '') ? null : Number(form.steps),
    user_id: user.value?.id || null,
    walk: parseBoolean(form.walk),
    period: parseBoolean(form.period),
    sweets: parseBoolean(form.sweets),
    breadstuff: (form.breadstuff ?? '').trim() || null,
    power_nap: parseBoolean(form.power_nap),
    date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().split('T')[0],
  }
}

// Submit Handler
async function submitForm() {
  // If user is not logged in, show error with login button
  if (!user.value) {
    showErrorDialog.value = true
    errorMessage.value = 'You must be logged in to submit.'
    showLoginPrompt.value = true
    return
  }

  const dataToUpload = prepareFormData()
  submitted.value = true

  try {
    // Check existing entry
    const { data: existingEntry, error: fetchError } = await client
        .from('tracker')
        .select('id')
        .eq('user_id', user.value?.id)
        .eq('date', dataToUpload.date)
        .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error('Error checking existing entry: ' + fetchError.message)
    }

    if (existingEntry) {
      existingEntryId.value = existingEntry.id
      showUpdateDialog.value = true
      return
    }

    await upsertEntry(dataToUpload)
  } catch (err) {
    console.error('Unexpected error:', err.message)
    errorMessage.value = err.message
    showErrorDialog.value = true
  } finally {
    submitted.value = false
  }
}

// Update Wellbeing
function updateWellbeing(value) {
  form.wellbeing = Number(value)
}

//Update table fields
const toggleStates = ['no', 'yes', ' ']

function handleClick(item){
  let currentValue = form[item.slug]
  let index = toggleStates.indexOf(currentValue)
  let nextIndex = (index + 1) % toggleStates.length
  let nextState = toggleStates[nextIndex]
  form[item.slug] = nextState
}

// Clear localStorage after successful submission
function clearLocalStorage() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
    console.log('Cleared form data from localStorage after submission')
  }
}

onMounted(() => {
  fetchData()
})

</script>

<template>
  <d-page>
    <!-- Header -->
    <div class="flex flex-row justify-between mb-2">
      <h1 class="page-title">Daily Wellbeing Tracker</h1>
      <div class="flex flex-row gap-1">
        <d-button-insights/>
        <d-button-darkmode/>
      </div>
    </div>

    <!-- Form -->
    <form
        @submit.prevent="submitForm"
        class="space-y-4 h-full overflow-y-auto pr-2
             scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent
             hover:scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600
             dark:hover:scrollbar-thumb-gray-500"
    >
      <!-- Wellbeing -->
      <div>
        <label class="tracker-title-input ">How are you feeling today?</label>
        <WellbeingEmoji @pointSelected="updateWellbeing" v-model:formValue="form.wellbeing"/>
      </div>
      <SleepTimeInput :form="form" />
      <!-- Initial Dynamic Fields (First portion of the form) -->
      <d-tracker-input
          v-for="item in fields.slice(0, fields.length - 6)"
          :key="item.slug"
          :form="form"
          :title="item.title"
          :slug="item.slug"
          :type="item.type"
          :options="item.options"
      />

      <!-- Table for the Last Six Items -->
      <table class="min-w-full border-collapse border border-gray-200 mt-4">
        <tbody>
        <tr v-for="item in fields.slice(-6)"
            :key="item.slug"
            :form="form"
            :title="item.title"
            :slug="item.slug"
            :type="item.type"
            :options="item.options">
          <td class="font-bold border border-gray-300 p-2 w-1/4">{{ item.title }}</td>
          <td
              class="border border-gray-300 p-2 cursor-pointer hover:bg-gray-100"
              @click="handleClick(item)"
          >
            {{form[item.slug]}}
          </td>
        </tr>
        </tbody>
      </table>

      <button type="submit" class="w-full bg-blue-500 text-white p-2 rounded">
        Submit
      </button>
    </form>

    <!-- Success Dialog -->
    <div
        v-if="showSuccessDialog"
        class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4"
    >
      <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] flex flex-col">
        <h2 class="text-2xl font-bold mb-4 dark:text-white">Good Job!</h2>
        <p class="dark:text-gray-300">Your entry has been successfully saved.</p>
        
        <div class="mt-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          <FormattedEntryDisplay :form="form" />
        </div>

        <button 
          @click="showSuccessDialog = false"
          class="bg-blue-500 text-white p-2 mt-4 rounded w-full hover:bg-blue-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>

    <!-- Update Confirmation Dialog -->
    <div
        v-if="showUpdateDialog"
        class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div class="bg-white p-6 rounded-lg shadow-lg max-w-md text-center">
        <h2 class="text-xl font-bold mb-0">Entry Already Exists</h2>
        <p>Do you want to update it?</p>
        <div class="flex justify-around mt-4">
          <button
              @click="upsertEntry(prepareFormData())"
              class="bg-blue-500 text-white px-2 py-1 mr-4 rounded"
          >
            Yes, Update
          </button>
          <button
              @click="showUpdateDialog = false"
              class="bg-gray-300 text-black px-2 py-1 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Error Dialog -->
    <div
        v-if="showErrorDialog"
        class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg max-w-md text-center">
        <h2 class="text-xl font-bold mb-4 dark:text-white">Something Went Wrong</h2>
        <p class="mb-4 dark:text-gray-300">{{ errorMessage }}</p>
        
        <div v-if="showLoginPrompt" class="mb-4">
          <NuxtLink 
            to="/login" 
            class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Log In
          </NuxtLink>
        </div>
        
        <p v-else class="dark:text-gray-300">Please try again later.</p>
        <br v-if="!showLoginPrompt"/>
        <p v-if="!showLoginPrompt" class="dark:text-gray-300">If the problem persists, please contact mail@memetasks.com</p>
        
        <button
            class="bg-red-500 text-white p-2 mt-4 rounded w-full"
            @click="showErrorDialog = false"
        >
          Close
        </button>
      </div>
    </div>
  </d-page>
</template>
