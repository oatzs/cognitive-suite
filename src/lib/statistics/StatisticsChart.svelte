<script>
  import { onDestroy, onMount } from 'svelte'
  import { Chart, registerables } from 'chart.js'
  import 'chartjs-adapter-date-fns'

  Chart.register(...registerables)

  export let points = []
  export let metric = 'accuracy'
  export let metricLabel = 'Accuracy'
  export let unit = 'percent'
  export let theme = 'dark'

  let canvas
  let chart
  let mounted = false

  const colors = () => {
    const dark = theme === 'dark'
    return {
      text: dark ? '#cbd5e1' : '#334155',
      grid: dark ? 'rgba(148,163,184,.16)' : 'rgba(51,65,85,.13)',
      tooltip: dark ? '#111827' : '#ffffff',
      tooltipText: dark ? '#f8fafc' : '#0f172a',
    }
  }

  const valueLabel = (value) => {
    if (unit === 'percent') return `${value.toFixed(0)}%`
    if (unit === 'seconds') return `${value.toFixed(2)}s`
    if (unit === 'milliseconds') return `${value.toFixed(0)}ms`
    return value.toFixed(2)
  }

  function render() {
    if (!mounted || !canvas) return
    chart?.destroy()
    chart = null
    if (points.length < 2) return

    const palette = colors()
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Daily average',
            data: points.map((point) => ({ x: point.day, y: point.average })),
            borderColor: '#2563eb',
            backgroundColor: '#2563eb',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.18,
          },
          {
            label: 'Daily best',
            data: points.map((point) => ({ x: point.day, y: point.best })),
            borderColor: '#ef4444',
            backgroundColor: '#ef4444',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            type: 'time',
            time: { unit: points.length > 120 ? 'month' : 'day', tooltipFormat: 'PP' },
            ticks: { color: palette.text, maxRotation: 0 },
            grid: { color: palette.grid },
            title: { display: true, text: 'Date', color: palette.text },
          },
          y: {
            beginAtZero: unit === 'percent',
            suggestedMax: unit === 'percent' ? 100 : undefined,
            max: unit === 'percent' ? 100 : undefined,
            ticks: {
              color: palette.text,
              callback: (value) => valueLabel(Number(value)),
            },
            grid: { color: palette.grid },
            title: { display: true, text: metricLabel, color: palette.text },
          },
        },
        plugins: {
          legend: { labels: { color: palette.text, usePointStyle: true, pointStyle: 'line' } },
          tooltip: {
            backgroundColor: palette.tooltip,
            titleColor: palette.tooltipText,
            bodyColor: palette.tooltipText,
            callbacks: { label: (context) => `${context.dataset.label}: ${valueLabel(context.parsed.y)}` },
          },
        },
      },
    })
  }

  onMount(() => {
    mounted = true
    render()
  })

  $: if (mounted) {
    void points
    void metric
    void metricLabel
    void unit
    void theme
    render()
  }

  onDestroy(() => chart?.destroy())
</script>

<div class="relative h-full min-h-64 w-full">
  <canvas bind:this={canvas} class:opacity-0={points.length < 2}></canvas>
  {#if points.length < 2}
    <div class="absolute inset-0 flex items-center justify-center text-center text-sm opacity-60">
      Complete sessions on at least two training days to see progress.
    </div>
  {/if}
</div>
