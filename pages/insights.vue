<script setup lang="ts">
import {ref, onMounted} from 'vue'
import {Chart, registerables} from 'chart.js'
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix'

Chart.register(...registerables)
Chart.register(MatrixController, MatrixElement)

let chart = null
const client = useSupabaseClient()
const user = useSupabaseUser()

const trackerData = ref([])
const wellbeingData = ref([])
const sleepData = ref([])
const stepsData = ref([])

const charts = ref([])
const correlationData = ref(null)

const selectedMetric = ref('sleep_time')
const metricOptions = [
  { value: 'sleep_time', label: 'Sleep Time' },
  { value: 'steps', label: 'Steps' },
  { value: 'gratitude_length', label: 'Gratitude Length' }
]

onMounted(async () => {
  await fetchData()
  renderCharts()
})

async function fetchData() {
  if (!user.value) return
  const {data} = await client.from('tracker').select().eq('user_id', user.value?.id)

  if (data) {
    trackerData.value = calculateGratitudeLength(data)
    wellbeingData.value = data.map(e => e.wellbeing ?? 0)
    sleepData.value = data.map(e => e.sleep_time ?? 0)
    stepsData.value = data.map(e => e.steps ?? 0)
  }
}

// Median helper
function median(arr) {
  const filtered = arr.filter(x => x > 0) // only consider positive values for log
  const sorted = [...filtered].sort((a, b) => a - b)
  if (!sorted.length) return 0.1 // fallback if no valid data
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2
}

// Logarithmic normalization
// formula: y = 5 + (log10(x) - log10(median)) / scaleFactor
function normalizeLog(arr, med, scaleFactor) {
  return arr.map(x => {
    if (x <= 0) x = 0.1 // avoid log of zero or negative
    return 5 + (Math.log10(x) - Math.log10(med)) / scaleFactor
  })
}

// Keep steps on linear normalization for contrast
function normalizeLinear(arr, med, scaleFactor) {
  return arr.map(x => 5 + (x - med) / scaleFactor)
}

function calculateCorrelation(arr1: number[], arr2: number[]): number {
  const n = Math.min(arr1.length, arr2.length)
  if (n < 2) return 0
  
  const mean1 = arr1.reduce((a, b) => a + b, 0) / n
  const mean2 = arr2.reduce((a, b) => a + b, 0) / n
  
  const variance1 = arr1.reduce((a, b) => a + Math.pow(b - mean1, 2), 0)
  const variance2 = arr2.reduce((a, b) => a + Math.pow(b - mean2, 2), 0)
  
  const covariance = arr1
    .map((x, i) => (x - mean1) * (arr2[i] - mean2))
    .reduce((a, b) => a + b, 0)
    
  return covariance / Math.sqrt(variance1 * variance2)
}

function calculateMovingAverage(data: number[], window: number): number[] {
  return data.map((_, idx) => {
    const start = Math.max(0, idx - window + 1)
    const subset = data.slice(start, idx + 1)
    return subset.reduce((a, b) => a + b, 0) / subset.length
  })
}

function renderCharts() {
  if (!trackerData.value.length) return
  
  // Cleanup existing charts - destroy them first
  charts.value.forEach(chart => {
    if (chart) {
      chart.destroy()
    }
  })
  charts.value = [] // Clear the array
  
  // Create new charts
  renderMainChart()
  renderWeekdayChart()
  renderDistributionChart()
  renderMovingAverageChart()
  renderScatterPlot()
}

function renderMainChart() {
  const ctx = document.querySelector('#combinedChart').getContext('2d')
  
  // Calculate medians for each metric
  const medWellbeing = median(wellbeingData.value)
  const medSleep = median(sleepData.value)
  const medSteps = median(stepsData.value)
  
  // Make sleep changes more visible by reducing normalization factor
  const sleepNorm = normalizeLog(sleepData.value, medSleep, 0.15)
  const stepsNorm = normalizeLinear(stepsData.value, medSteps, medSteps)
  
  // Set offsets based on desired vertical positions (using 3-unit spacing)
  const wellbeingOffset = 7 - medWellbeing  // Center wellbeing around y=7
  const sleepOffset = 4 - median(sleepNorm)  // Center sleep around y=4
  const stepsOffset = 1 - median(stepsNorm)  // Center steps around y=1
  
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trackerData.value.map(e => e.date),
      datasets: [
        {
          label: 'Wellbeing',
          data: wellbeingData.value.map(v => v + wellbeingOffset),
          borderColor: 'green',
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: 'Sleep h (Log Scale)',
          data: sleepNorm.map(v => v + sleepOffset),
          borderColor: 'blue',
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: 'Steps (Normalized)',
          data: stepsNorm.map(v => v + stepsOffset),
          borderColor: 'orange',
          tension: 0.3,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: {
            callback: (value) => {
              // Show median values at their centered positions
              if (value === 7) return `Wellbeing: ${medWellbeing.toFixed(1)}`
              if (value === 4) return `Sleep: ${medSleep.toFixed(1)}h`
              if (value === 1) return `Steps: ${medSteps.toFixed(0)}`
              return ''
            },
            autoSkip: false
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw as number
              const datasetLabel = context.dataset.label
              if (datasetLabel === 'Wellbeing') {
                return `Wellbeing: ${(value - wellbeingOffset).toFixed(1)}`
              }
              if (datasetLabel === 'Sleep h (Log Scale)') {
                const realSleep = (value - sleepOffset)
                return `Sleep: ${realSleep.toFixed(1)}h`
              }
              const realSteps = (value - stepsOffset)
              return `Steps: ${realSteps.toFixed(0)}k`
            }
          }
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderCorrelationChart() {
  const ctx = document.querySelector('#correlationChart').getContext('2d')
  const metrics = ['wellbeing', 'sleep', 'steps']
  const correlations = []
  
  metrics.forEach(m1 => {
    metrics.forEach(m2 => {
      // Skip self-correlations (e.g., wellbeing vs wellbeing)
      if (m1 === m2) return
      
      const corr = calculateCorrelation(
        trackerData.value.map(e => e[m1] || 0),
        trackerData.value.map(e => e[m2] || 0)
      )
      correlations.push({ m1, m2, corr })
    })
  })

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: correlations.map(c => `${c.m1} vs ${c.m2}`),
      datasets: [{
        label: 'Correlation',
        data: correlations.map(c => c.corr),
        backgroundColor: correlations.map(c => {
          // Color based on correlation strength
          const value = Math.abs(c.corr)
          return c.corr >= 0 
            ? `rgba(0, ${Math.floor(value * 255)}, 0, 0.7)`
            : `rgba(${Math.floor(value * 255)}, 0, 0, 0.7)`
        })
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Correlation Between Metrics'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: -1,
          max: 1
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderWeekdayChart() {
  const ctx = document.querySelector('#weekdayChart').getContext('2d')
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  const weekdayData = weekdays.map(day => {
    const dayEntries = trackerData.value.filter(e => new Date(e.date).getDay() === weekdays.indexOf(day))
    return {
      wellbeing: dayEntries.reduce((acc, e) => acc + (e.wellbeing || 0), 0) / dayEntries.length || 0,
      sleep: dayEntries.reduce((acc, e) => acc + (e.sleep_time || 0), 0) / dayEntries.length || 0,
      steps: dayEntries.reduce((acc, e) => acc + (e.steps || 0), 0) / dayEntries.length || 0
    }
  })

  const chart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: weekdays,
      datasets: [
        {
          label: 'Wellbeing',
          data: weekdayData.map(d => d.wellbeing),
          borderColor: 'green',
          fill: true,
          backgroundColor: 'rgba(0, 255, 0, 0.1)'
        },
        {
          label: 'Sleep (h)',
          data: weekdayData.map(d => d.sleep),
          borderColor: 'blue',
          fill: true,
          backgroundColor: 'rgba(0, 0, 255, 0.1)'
        },
        {
          label: 'Steps (k)',
          data: weekdayData.map(d => d.steps / 1000),
          borderColor: 'orange',
          fill: true,
          backgroundColor: 'rgba(255, 165, 0, 0.1)'
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Metrics by Day of Week'
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderDistributionChart() {
  const ctx = document.querySelector('#distributionChart').getContext('2d')
  
  // Modified getBins function for integer wellbeing values
  const getWellbeingDistribution = (data: number[]) => {
    const counts = new Array(11).fill(0) // 0-10 scale
    data.filter(x => x >= 0 && x <= 10).forEach(val => {
      counts[Math.round(val)]++
    })
    return {
      counts,
      labels: Array.from({length: 11}, (_, i) => i.toString()) // 0-10 as strings
    }
  }

  const wellbeingDist = getWellbeingDistribution(wellbeingData.value.filter(x => x > 0))

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: wellbeingDist.labels,
      datasets: [
        {
          label: 'Wellbeing',
          data: wellbeingDist.counts,
          backgroundColor: 'rgba(0, 255, 0, 0.5)'
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Distribution of Wellbeing Scores'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Wellbeing Score'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Frequency'
          },
          beginAtZero: true
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderTimeOfDayChart() {
  const ctx = document.querySelector('#timeOfDayChart').getContext('2d')
  const hours = Array.from({length: 24}, (_, i) => i)
  
  const hourlyData = hours.map(hour => {
    const entries = trackerData.value.filter(e => new Date(e.date).getHours() === hour)
    return {
      wellbeing: entries.reduce((acc, e) => acc + (e.wellbeing || 0), 0) / entries.length || 0,
      steps: entries.reduce((acc, e) => acc + (e.steps || 0), 0) / entries.length || 0
    }
  })

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours.map(h => `${h}:00`),
      datasets: [
        {
          label: 'Wellbeing',
          data: hourlyData.map(d => d.wellbeing),
          borderColor: 'green',
          tension: 0.4
        },
        {
          label: 'Steps',
          data: hourlyData.map(d => d.steps / 1000),
          borderColor: 'orange',
          tension: 0.4
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Metrics by Time of Day'
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderMovingAverageChart() {
  const ctx = document.querySelector('#movingAverageChart').getContext('2d')
  
  const windowSize = 14
  const maData = calculateMovingAverage(wellbeingData.value, windowSize)
  
  // Calculate min and max values
  const minValue = Math.min(...maData)
  const maxValue = Math.max(...maData)
  
  // Reduce the y-axis range to show more detail
  // Use 0.5 instead of 1 for padding
  const yMin = Math.max(0, Math.floor(minValue - 0.5))
  const yMax = Math.min(10, Math.ceil(maxValue + 0.5))

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trackerData.value.map(e => e.date),
      datasets: [{
        label: `${windowSize}-day Moving Average`,
        data: maData,
        borderColor: 'green',
        tension: 0.4
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Wellbeing Trend (Moving Average)'
        }
      },
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: {
            stepSize: 0.5  // Changed to 0.5 for more detail
          }
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderScatterPlot() {
  const ctx = document.querySelector('#scatterChart').getContext('2d')
  
  // Filter out entries with missing data
  const validData = trackerData.value.filter(e => e.wellbeing && e[selectedMetric.value])
  
  // Add jitter function with dynamic amount based on metric
  const jitter = (value: number, metric: string) => {
    const jitterAmount = metric === 'gratitude_length' ? 2 : 0.2
    return value + (Math.random() - 0.5) * jitterAmount
  }
  
  // Calculate correlation
  const correlation = calculateCorrelation(
    validData.map(e => e[selectedMetric.value]),
    validData.map(e => e.wellbeing)
  )
  
  // Calculate linear regression
  const xValues = validData.map(e => e[selectedMetric.value])
  const yValues = validData.map(e => e.wellbeing)
  const n = xValues.length
  const xMean = xValues.reduce((a, b) => a + b) / n
  const yMean = yValues.reduce((a, b) => a + b) / n
  
  const slope = xValues.map((x, i) => (x - xMean) * (yValues[i] - yMean))
    .reduce((a, b) => a + b) / xValues.map(x => Math.pow(x - xMean, 2))
    .reduce((a, b) => a + b)
  
  const intercept = yMean - slope * xMean
  
  // Generate trend line points
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const trendLinePoints = [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept }
  ]

  // Calculate y-axis range
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  const yMin = Math.max(0, Math.floor(minY - 1))
  const yMax = Math.min(10, Math.ceil(maxY + 1))
  
  // Helper function to describe correlation strength
  const describeCorrelation = (corr: number) => {
    const absCorr = Math.abs(corr)
    if (absCorr < 0.2) return 'Very weak'
    if (absCorr < 0.4) return 'Weak'
    if (absCorr < 0.6) return 'Moderate'
    if (absCorr < 0.8) return 'Strong'
    return 'Very strong'
  }

  const correlationPercent = (correlation * 100).toFixed(1)
  const correlationStrength = describeCorrelation(correlation)
  const direction = slope > 0 ? 'positive' : 'negative'
  
  const chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: `${metricOptions.find(m => m.value === selectedMetric.value)?.label} vs Wellbeing`,
          data: validData.map(e => ({
            x: jitter(e[selectedMetric.value], selectedMetric.value),
            y: jitter(e.wellbeing, 'wellbeing')
          })),
          backgroundColor: 'rgba(0, 0, 255, 0.3)',
          pointRadius: 5
        },
        {
          label: 'Trend Line',
          data: trendLinePoints,
          type: 'line',
          borderColor: 'rgba(255, 0, 0, 0.5)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: [
            `${metricOptions.find(m => m.value === selectedMetric.value)?.label} vs Wellbeing`,
            `${correlationStrength} ${direction} correlation (${correlationPercent}%)`,
            slope > 0 
              ? `Higher values tend to correlate with better wellbeing` 
              : `Higher values tend to correlate with lower wellbeing`
          ]
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const point = context.raw
              if (selectedMetric.value === 'gratitude_length') {
                return `Length: ${Math.round(point.x)} chars, Wellbeing: ${point.y.toFixed(1)}`
              }
              return `${context.dataset.label}: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: selectedMetric.value === 'gratitude_length' 
              ? 'Characters in Gratitude Entry'
              : metricOptions.find(m => m.value === selectedMetric.value)?.label
          },
          min: Math.max(0, Math.floor(minX - (selectedMetric.value === 'gratitude_length' ? 10 : 1))),
          max: Math.ceil(maxX + (selectedMetric.value === 'gratitude_length' ? 10 : 1))
        },
        y: {
          title: {
            display: true,
            text: 'Wellbeing'
          },
          min: yMin,
          max: yMax,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  })
  charts.value.push(chart)
}

function renderChart() {
  if (!trackerData.value.length) return

  // Calculate medians
  const medSleep = median(sleepData.value)   // e.g. ~8
  const medSteps = median(stepsData.value)   // e.g. ~12000
  const medWellbeing = median(wellbeingData.value) // Might be around 6-7

  // Adjust scale factors so typical data stays within 0–10
  // For Sleep: use a small scaleFactor if you want small hour changes to be noticeable
  const sleepScale = 0.08
  // For Steps: keep the old linear approach
  const stepsScale = 2000

  // Normalize
  const sleepNorm = normalizeLog(sleepData.value, medSleep, sleepScale)
  const stepsNorm = normalizeLinear(stepsData.value, medSteps, stepsScale)

  const ctx = document.querySelector('#combinedChart').getContext('2d')
  if (chart) chart.destroy()

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trackerData.value.map(e => e.date),
      datasets: [
        {
          label: 'Wellbeing (0–10)',
          data: wellbeingData.value,
          borderColor: 'green',
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: 'Sleep h (Log Scale)',
          data: sleepNorm,
          borderColor: 'blue',
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: 'Steps (Normalized)',
          data: stepsNorm,
          borderColor: 'orange',
          tension: 0.3,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          // Force the axis to range 0–10
          min: 0,
          max: 10,
          // Show custom ticks at 0, 5, 10
          ticks: {
            callback: (value) => {
              // Display a custom label at value 5
              if (value === 5) {
                return `${medSleep}h / ${medSteps}st`;
              }
              // Display labels for even values
              if (value % 2 === 0) {
                return value;
              }
              // Hide labels for other values
              return null;
            },
            autoSkip: false, // Ensure all specified ticks are considered
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      }
    }
  })
}

// Add helper function to calculate text length
function calculateGratitudeLength(data) {
  return data.map(entry => ({
    ...entry,
    gratitude_length: entry.gratitude?.length || 0
  }))
}
</script>

<template>
  <d-page>
    <!-- Fixed header section -->
    <div class="flex flex-row justify-between mb-2">
      <h1 class="page-title">Moody Noodles Insights</h1>
      <div class="flex flex-row gap-1">
        <d-button-home/>
        <d-button-darkmode/>
      </div>
    </div>
    
    <!-- Scrollable content section -->
    <div class="overflow-y-auto flex-1">
      <!-- Charts in single column -->
      <div class="flex flex-col gap-4">
        <!-- Main trend chart -->
        <div class="p-4 border rounded-lg">
          <canvas id="combinedChart"></canvas>
        </div>
        
        <!-- Weekday chart -->
        <div class="p-4 border rounded-lg">
          <canvas id="weekdayChart"></canvas>
        </div>
        
        <!-- Distribution chart -->
        <div class="p-4 border rounded-lg">
          <canvas id="distributionChart"></canvas>
        </div>
        
        <!-- Moving average chart -->
        <div class="p-4 border rounded-lg">
          <canvas id="movingAverageChart"></canvas>
        </div>
        
        <!-- Scatter plot with selector -->
        <div class="p-4 border rounded-lg">
          <div class="mb-2">
            <select 
              v-model="selectedMetric"
              class="p-2 rounded border dark:bg-slate-700 dark:border-slate-600"
              @change="renderCharts"
            >
              <option 
                v-for="option in metricOptions" 
                :key="option.value" 
                :value="option.value"
              >
                {{ option.label }} vs Wellbeing
              </option>
            </select>
          </div>
          <canvas id="scatterChart"></canvas>
        </div>
      </div>
    </div>
  </d-page>
</template>
