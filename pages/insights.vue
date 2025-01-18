<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'
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

// Add a ref to track chart instances
const chartInstances = ref<{ [key: string]: Chart }>({})

function destroyCharts() {
  // Destroy each chart instance
  Object.values(chartInstances.value).forEach(chart => {
    if (chart) {
      chart.destroy()
    }
  })
  // Clear the instances object
  chartInstances.value = {}
}

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
  
  // Destroy existing charts first
  destroyCharts()
  
  // Create new charts
  renderMainChart()
  renderWeekdayChart()
  renderDistributionChart()
  renderMovingAverageChart()
  renderScatterPlot()
  renderBooleanComparison()
}

function renderMainChart() {
  const canvas = document.querySelector('#combinedChart') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
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
  
  // Create new chart and store the instance
  chartInstances.value.combined = new Chart(ctx, {
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
  const canvas = document.querySelector('#weekdayChart') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  const weekdayData = weekdays.map(day => {
    const dayEntries = trackerData.value.filter(e => new Date(e.date).getDay() === weekdays.indexOf(day))
    return {
      wellbeing: dayEntries.reduce((acc, e) => acc + (e.wellbeing || 0), 0) / dayEntries.length || 0,
      sleep: dayEntries.reduce((acc, e) => acc + (e.sleep_time || 0), 0) / dayEntries.length || 0,
      steps: dayEntries.reduce((acc, e) => acc + (e.steps || 0), 0) / dayEntries.length || 0
    }
  })

  // Create new chart and store the instance
  chartInstances.value.weekday = new Chart(ctx, {
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
}

function renderDistributionChart() {
  const canvas = document.querySelector('#distributionChart') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
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

  // Create new chart and store the instance
  chartInstances.value.distribution = new Chart(ctx, {
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
  const canvas = document.querySelector('#movingAverageChart') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const windowSize = 14
  const maData = calculateMovingAverage(wellbeingData.value, windowSize)
  
  // Calculate min and max values
  const minValue = Math.min(...maData)
  const maxValue = Math.max(...maData)
  
  // Reduce the y-axis range to show more detail
  // Use 0.5 instead of 1 for padding
  const yMin = Math.max(0, Math.floor(minValue - 0.5))
  const yMax = Math.min(10, Math.ceil(maxValue + 0.5))

  // Create new chart and store the instance
  chartInstances.value.movingAverage = new Chart(ctx, {
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
}

function renderScatterPlot() {
  const canvas = document.querySelector('#scatterChart') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // Only render if selected metric is not a boolean
  if (['meditated', 'did_sport', 'sweets'].includes(selectedMetric.value)) {
    return
  }
  
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
  
  // Create new chart and store the instance
  chartInstances.value.scatter = new Chart(ctx, {
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

// Add new function to calculate averages for boolean variables
function renderBooleanComparison() {
  const canvas = document.querySelector('#booleanChart') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const booleanMetrics = ['meditated', 'did_sport', 'sweets']
  const comparisons = booleanMetrics.map(metric => {
    const trueEntries = trackerData.value.filter(e => e[metric] === true && e.wellbeing != null)
    const falseEntries = trackerData.value.filter(e => e[metric] === false && e.wellbeing != null)
    
    const trueAvg = trueEntries.length > 0 
      ? trueEntries.reduce((acc, e) => acc + e.wellbeing, 0) / trueEntries.length 
      : null
    const falseAvg = falseEntries.length > 0 
      ? falseEntries.reduce((acc, e) => acc + e.wellbeing, 0) / falseEntries.length 
      : null
    
    return {
      metric,
      trueAvg: trueAvg || 0,
      falseAvg: falseAvg || 0,
      difference: (trueAvg || 0) - (falseAvg || 0),
      trueCount: trueEntries.length,
      falseCount: falseEntries.length,
      totalCount: trackerData.value.length,
      nullCount: trackerData.value.filter(e => e[metric] == null).length
    }
  })

  const allValues = comparisons.flatMap(c => [c.trueAvg, c.falseAvg].filter(v => v !== null))
  const minValue = Math.min(...allValues)
  const maxValue = Math.max(...allValues)
  const yMin = Math.max(0, Math.floor(minValue - 0.5))
  const yMax = Math.min(10, Math.ceil(maxValue + 0.5))

  const labels = {
    meditated: 'Meditation',
    did_sport: 'Exercise',
    sweets: 'No Sweets'
  }

  // Create new chart and store the instance
  chartInstances.value.boolean = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: comparisons.map(c => {
        const label = labels[c.metric]
        const total = c.trueCount + c.falseCount
        return `${label} (${total} days)`
      }),
      datasets: [
        {
          label: comparisons.map(c => 
            c.metric === 'sweets' 
              ? 'Had Sweets'
              : 'Did Activity'
          ),
          data: comparisons.map(c => c.trueAvg),
          backgroundColor: comparisons.map(c => 
            c.metric === 'sweets' 
              ? 'rgba(255, 0, 0, 0.5)'
              : 'rgba(0, 255, 0, 0.5)'
          ),
          borderColor: comparisons.map(c => 
            c.metric === 'sweets' 
              ? 'rgba(255, 0, 0, 1)'
              : 'rgba(0, 255, 0, 1)'
          ),
          borderWidth: 1
        },
        {
          label: comparisons.map(c => 
            c.metric === 'sweets' 
              ? 'No Sweets'
              : 'Skipped Activity'
          ),
          data: comparisons.map(c => c.falseAvg),
          backgroundColor: comparisons.map(c => 
            c.metric === 'sweets' 
              ? 'rgba(0, 255, 0, 0.5)'
              : 'rgba(255, 0, 0, 0.5)'
          ),
          borderColor: comparisons.map(c => 
            c.metric === 'sweets' 
              ? 'rgba(0, 255, 0, 1)'
              : 'rgba(255, 0, 0, 1)'
          ),
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Average Wellbeing Comparison'
        },
        legend: {
          position: 'top',
          labels: {
            generateLabels: (chart) => {
              return [
                {
                  text: 'Did Meditation/Exercise',
                  fillStyle: 'rgba(0, 255, 0, 0.5)',
                  strokeStyle: 'rgba(0, 255, 0, 1)',
                  lineWidth: 1,
                },
                {
                  text: 'Skipped Meditation/Exercise',
                  fillStyle: 'rgba(255, 0, 0, 0.5)',
                  strokeStyle: 'rgba(255, 0, 0, 1)',
                  lineWidth: 1,
                },
                {
                  text: 'Had Sweets',
                  fillStyle: 'rgba(255, 0, 0, 0.5)',
                  strokeStyle: 'rgba(255, 0, 0, 1)',
                  lineWidth: 1,
                },
                {
                  text: 'No Sweets',
                  fillStyle: 'rgba(0, 255, 0, 0.5)',
                  strokeStyle: 'rgba(0, 255, 0, 1)',
                  lineWidth: 1,
                }
              ]
            },
            padding: 20,
            boxWidth: 15,
            boxHeight: 15,
          },
          maxWidth: 400,
          maxHeight: 100,
          align: 'center',
        },
        legendItem: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            boxWidth: 15,
            padding: 15,
            generateLabels: (chart) => {
              const width = chart.width || 0
              const itemWidth = width / 2.5 // Adjust this value to control spacing
              return chart.legend.legendItems.map((item, index) => ({
                ...item,
                x: (index % 2) * itemWidth + itemWidth / 2,
                y: Math.floor(index / 2) * 25 + 10, // Adjust 25 to control vertical spacing
              }))
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const comparison = comparisons[context.dataIndex]
              const value = context.raw as number
              const isSweets = comparison.metric === 'sweets'
              
              let label
              const totalDays = comparison.trueCount + comparison.falseCount
              
              if (context.datasetIndex === 0) {
                // First dataset (Did Activity/Had Sweets)
                label = isSweets ? 'Had Sweets' : 'Did Activity'
                return [
                  `${label}: ${comparison.trueCount} out of ${totalDays} days`,
                  `Average wellbeing: ${value.toFixed(2)}`,
                  `Missing data: ${comparison.nullCount} days`
                ]
              } else {
                // Second dataset (Skipped Activity/No Sweets)
                label = isSweets ? 'No Sweets' : 'Skipped Activity'
                return [
                  `${label}: ${comparison.falseCount} out of ${totalDays} days`,
                  `Average wellbeing: ${value.toFixed(2)}`,
                  `Missing data: ${comparison.nullCount} days`,
                  `Difference: ${comparison.difference.toFixed(2)}`
                ]
              }
            }
          }
        }
      },
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: {
            stepSize: 0.5
          },
          title: {
            display: true,
            text: 'Average Wellbeing'
          }
        }
      }
    }
  })
}

// Clean up when component is unmounted
onUnmounted(() => {
  destroyCharts()
})
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
    <div class="overflow-y-auto flex-1 p-1 px-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 dark:hover:scrollbar-thumb-gray-500">
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
        
        <!-- Boolean comparison chart -->
        <div class="p-4 border rounded-lg">
          <canvas id="booleanChart"></canvas>
        </div>
      </div>
    </div>
  </d-page>
</template>
