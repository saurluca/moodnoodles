<script setup>
import FormattedRow from './FormattedRow.vue'

defineProps({
  form: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <div class="space-y-2 p-4 border rounded bg-green-50 dark:bg-slate-700">
    <FormattedRow label="Wellbeing" :value="`${form.wellbeing}/10`" />
    <FormattedRow label="Sleep" :value="`${form.sleep_time}h`" />
    <FormattedRow label="Bed Time" :value="`${form.sleep_start_hour}:${form.sleep_start_minute || '00'}`" />
    <FormattedRow label="Wake Time" :value="`${form.sleep_end_hour}:${form.sleep_end_minute || '00'}`" />
    <FormattedRow label="Steps" :value="form.steps" />
    <FormattedRow label="Breadstuff" :value="form.breadstuff" />
    <FormattedRow label="Meditated" :value="form.meditated" />
    <FormattedRow label="Walk" :value="form.walk" />
    <FormattedRow label="Sport" :value="form.did_sport" />
    <FormattedRow label="Sweets" :value="form.sweets" />
    <FormattedRow label="Period" :value="form.period" />
    <FormattedRow label="Gratitude" :value="form.gratitude" :isFullWidth="true" />
    <FormattedRow label="Insight" :value="form.insight" :isFullWidth="true" />
  </div>
</template> 