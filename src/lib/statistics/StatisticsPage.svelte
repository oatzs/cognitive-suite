<script>
  import { onMount } from 'svelte'
  import { Download, FileJson, RefreshCw, Upload } from '@lucide/svelte'
  import { getAllCompletedGames } from '../gamedb'
  import { formatSeconds } from '../utils'
  import { settings } from '../../stores/settingsStore'
  import ActivityHeatmap from './ActivityHeatmap.svelte'
  import StatisticsChart from './StatisticsChart.svelte'
  import {
    exportSessionHistoryBackup,
    importSessionHistoryBackup,
  } from '../sessionTransfer'
  import { MAX_BACKUP_CHARACTERS } from '../sessionBackup'
  import {
    METRICS,
    filterSessions,
    formatMetric,
    getModalityRollups,
    groupDaily,
    metricValue,
    normalizeGames,
    sessionsToCsv,
    summarizeSessions,
  } from './stats'

  let games = []
  let loading = true
  let loadError = ''
  let source = 'all'
  let mode = 'all'
  let range = 'all'
  let metric = 'accuracy'
  let importInput
  let importing = false
  let importMessage = ''
  let importError = ''

  const brainWorkshopMetrics = ['adjusted', 'n', 'accuracy', 'nAccuracy', 'weightedAccuracy']
  const docctMetrics = [...brainWorkshopMetrics, 'fastestInterval', 'responseTime']

  async function load() {
    loading = true
    loadError = ''
    try {
      games = await getAllCompletedGames()
    } catch (reason) {
      loadError = reason?.message || 'Statistics could not be loaded.'
    } finally {
      loading = false
    }
  }

  onMount(load)

  $: sessions = normalizeGames(games)
  $: sourceSessions = source === 'all' ? sessions : sessions.filter((session) => session.source === source)
  $: modeOptions = [...new Map(sourceSessions.map((session) => [session.modeKey, session.modeLabel])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
  $: if (mode !== 'all' && !modeOptions.some(([key]) => key === mode)) mode = 'all'
  $: metricOptions = source === 'all' ? ['accuracy'] : source === 'docct' ? docctMetrics : brainWorkshopMetrics
  $: if (!metricOptions.includes(metric)) metric = metricOptions[0]
  $: thresholds = { advance: Number($settings.successCriteria) || 80, fallback: Number($settings.failureCriteria) || 50 }
  $: filtered = filterSessions(sessions, { source, mode, range })
  $: activitySessions = filterSessions(sessions, { source, mode, range: 'all' })
  $: summary = summarizeSessions(filtered)
  $: daily = groupDaily(filtered, metric, thresholds)
  $: rollups = getModalityRollups(filtered)
  $: recent = filtered.slice(0, 20)
  $: metricConfig = METRICS[metric]
  $: metricValues = filtered.map((session) => metricValue(session, metric, thresholds)).filter(Number.isFinite)
  $: bestMetric = metricValues.length
    ? (metricConfig.lowerIsBetter ? Math.min(...metricValues) : Math.max(...metricValues))
    : null

  function changeSource(nextSource) {
    source = nextSource
    mode = 'all'
    metric = nextSource === 'quad-box' ? 'adjusted' : 'accuracy'
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function exportCsv() {
    download('cognitive-suite-sessions.csv', sessionsToCsv(filtered), 'text/csv;charset=utf-8')
  }

  async function exportJson() {
    importError = ''
    try {
      const payload = await exportSessionHistoryBackup()
      download('cognitive-suite-backup.json', payload, 'application/json')
    } catch (reason) {
      importError = reason?.message || 'The backup could not be exported.'
    }
  }

  function chooseImportFile() {
    importInput?.click()
  }

  async function importJson(event) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    importing = true
    importMessage = ''
    importError = ''
    try {
      if (file.size > MAX_BACKUP_CHARACTERS) {
        throw new Error('Backup files must be 25 MB or smaller.')
      }
      const report = await importSessionHistoryBackup(await file.text())
      await load()
      importMessage = report.added > 0
        ? `Imported ${report.added} session${report.added === 1 ? '' : 's'}; skipped ${report.duplicates} duplicate${report.duplicates === 1 ? '' : 's'}. ${report.total} total sessions.`
        : `No new sessions found; skipped ${report.duplicates} duplicate${report.duplicates === 1 ? '' : 's'}. ${report.total} total sessions.`
    } catch (reason) {
      importError = `${reason?.message || 'The backup could not be imported.'} No sessions were changed.`
    } finally {
      importing = false
    }
  }

  const formatPercent = (value) => `${(value * 100).toFixed(0)}%`

  const formatDate = (timestamp) => new Date(timestamp).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const detailText = (session) => {
    if (session.source === 'docct') {
      const fastest = Number.isFinite(session.fastestIntervalMs) ? `${(session.fastestIntervalMs / 1000).toFixed(2)}s fastest` : 'No interval'
      const response = Number.isFinite(session.responseTimeMs) && session.responseTimeMs > 0 ? `${Math.round(session.responseTimeMs)}ms response` : 'No response time'
      return `${fastest} · ${response}`
    }
    return `${session.hits}/${session.possible} correct`
  }

  const scoreClass = (accuracy) => {
    const percent = accuracy * 100
    if (percent >= thresholds.advance) return 'score-advance'
    if (percent < thresholds.fallback) return 'score-fallback'
    return 'score-neutral'
  }
</script>

<div class="statistics-page h-full overflow-y-auto bg-base-100 text-base-content" data-testid="statistics-page">
  <div class="mx-auto flex w-full max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:px-8">
    <div class="flex flex-col gap-4 border-b border-base-300 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-xl font-semibold">Training statistics</h1>
        <p class="mt-1 text-sm opacity-60">Sessions roll over to a new training day at 4:00 AM.</p>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="stats-control">
          <span>Trainer</span>
          <select class="select select-sm min-w-32" value={source} on:change={(event) => changeSource(event.currentTarget.value)}>
            <option value="all">All trainers</option>
            <option value="quad-box">Quad Box</option>
            <option value="docct">DocCT</option>
          </select>
        </label>

        <label class="stats-control">
          <span>Mode</span>
          <select class="select select-sm min-w-32" bind:value={mode}>
            <option value="all">All modes</option>
            {#each modeOptions as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
        </label>

        <label class="stats-control">
          <span>Range</span>
          <select class="select select-sm min-w-28" bind:value={range}>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="all">All time</option>
          </select>
        </label>

        <button class="btn btn-sm btn-square btn-ghost" title="Refresh statistics" aria-label="Refresh statistics" on:click={load} disabled={loading}>
          <RefreshCw size={17} class={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>

    {#if loadError}
      <div class="my-6 border-l-4 border-error bg-error/10 px-4 py-3 text-sm">{loadError}</div>
    {:else}
      <section aria-label="Summary" class="summary-grid grid grid-cols-2 border-b border-base-300 py-5 md:grid-cols-3 xl:grid-cols-6">
        <div class="summary-item">
          <span>Today</span>
          <strong>{summary.todaySessions} sessions</strong>
          <small>{formatSeconds(summary.todayDurationSec)}</small>
        </div>
        <div class="summary-item">
          <span>Last 24 hours</span>
          <strong>{summary.rollingSessions} sessions</strong>
          <small>{formatSeconds(summary.rollingDurationSec)}</small>
        </div>
        <div class="summary-item">
          <span>Selected history</span>
          <strong>{summary.totalSessions} sessions</strong>
          <small>{formatSeconds(summary.totalDurationSec)}</small>
        </div>
        <div class="summary-item">
          <span>Average accuracy</span>
          <strong>{formatPercent(summary.averageAccuracy)}</strong>
          <small>{summary.activeDays} active days</small>
        </div>
        <div class="summary-item">
          <span>Training streak</span>
          <strong>{summary.current} days</strong>
          <small>{summary.longest} day best</small>
        </div>
        <div class="summary-item">
          <span>Best {metricConfig.shortLabel.toLowerCase()}</span>
          <strong>{formatMetric(bestMetric, metric)}</strong>
          <small>{metricConfig.lowerIsBetter ? 'Lowest result' : 'Highest result'}</small>
        </div>
      </section>

      <section class="border-b border-base-300 py-5">
        <div class="mb-3 flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold">Training activity</h2>
          <span class="text-xs opacity-55">Last 12 months</span>
        </div>
        <ActivityHeatmap sessions={activitySessions} />
      </section>

      <section class="border-b border-base-300 py-5">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 class="text-sm font-semibold">Daily progress</h2>
            <p class="mt-1 text-xs opacity-55">Daily average and best across completed sessions.</p>
          </div>
          <label class="stats-control">
            <span>Measure</span>
            <select class="select select-sm min-w-48" bind:value={metric}>
              {#each metricOptions as key}
                <option value={key}>{METRICS[key].label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="h-[360px] min-h-64 w-full sm:h-[430px]">
          <StatisticsChart
            points={daily}
            {metric}
            metricLabel={metricConfig.label}
            unit={metricConfig.unit}
            theme={$settings.theme}
          />
        </div>
      </section>

      <section class="border-b border-base-300 py-5">
        <div class="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 class="text-sm font-semibold">Recent modality accuracy</h2>
            <p class="mt-1 text-xs opacity-55">Latest 50 selected sessions.</p>
          </div>
        </div>
        {#if rollups.length}
          <div class="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {#each rollups as rollup}
              <div class="min-w-0">
                <div class="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span class="truncate">{rollup.label}</span>
                  <span class="font-semibold">{formatPercent(rollup.accuracy)}</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-sm bg-base-300">
                  <div class="h-full bg-success" style={`width: ${Math.min(100, rollup.accuracy * 100)}%`}></div>
                </div>
                <div class="mt-1 text-[11px] opacity-50">{rollup.hits}/{rollup.possible}</div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="py-6 text-sm opacity-55">No modality results in this selection.</div>
        {/if}
      </section>

      <section class="py-5">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-sm font-semibold">Recent sessions</h2>
            <p class="mt-1 text-xs opacity-55">Latest 20 selected sessions.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <input
              bind:this={importInput}
              type="file"
              accept=".json,application/json"
              class="hidden"
              on:change={importJson}
            />
            <button class="btn btn-sm" on:click={chooseImportFile} disabled={importing}>
              <Upload size={16} /> {importing ? 'Importing' : 'Import JSON'}
            </button>
            <button class="btn btn-sm" on:click={exportCsv} disabled={!filtered.length}>
              <Download size={16} /> CSV
            </button>
            <button class="btn btn-sm" on:click={exportJson} disabled={!games.length}>
              <FileJson size={16} /> Export JSON
            </button>
          </div>
        </div>

        {#if importMessage}
          <div class="mb-4 border-l-4 border-success bg-success/10 px-4 py-3 text-sm" role="status" aria-live="polite">
            {importMessage}
          </div>
        {:else if importError}
          <div class="mb-4 border-l-4 border-error bg-error/10 px-4 py-3 text-sm" role="alert">
            {importError}
          </div>
        {/if}

        <div class="overflow-x-auto border border-base-300">
          <table class="table table-sm min-w-[850px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Trainer</th>
                <th>Mode</th>
                <th>{metricConfig.shortLabel}</th>
                <th>Accuracy</th>
                <th>Time</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {#each recent as session (session.source + ':' + session.id + ':' + session.timestamp)}
                <tr>
                  <td>{formatDate(session.timestamp)}</td>
                  <td>{session.sourceLabel}</td>
                  <td>{session.modeLabel}</td>
                  <td>{formatMetric(metricValue(session, metric, thresholds), metric)}</td>
                  <td><span class="score-pill {scoreClass(session.accuracy)}">{formatPercent(session.accuracy)}</span></td>
                  <td>{formatSeconds(session.durationSec)}</td>
                  <td class="text-xs opacity-65">{detailText(session)}</td>
                </tr>
              {:else}
                <tr>
                  <td colspan="7" class="py-10 text-center opacity-55">No completed sessions in this selection.</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .stats-control {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stats-control > span {
    font-size: 0.7rem;
    opacity: 0.58;
  }

  .summary-item {
    min-width: 0;
    padding: 0.65rem 1rem;
    border-left: 1px solid color-mix(in oklab, currentColor 12%, transparent);
  }

  .summary-item:first-child {
    border-left: 0;
  }

  .summary-item > span,
  .summary-item > small {
    display: block;
    font-size: 0.7rem;
    opacity: 0.58;
  }

  .summary-item > strong {
    display: block;
    margin: 0.2rem 0;
    font-size: 1.05rem;
    font-weight: 650;
  }

  .score-pill {
    display: inline-block;
    min-width: 3.25rem;
    border-radius: 4px;
    padding: 0.2rem 0.45rem;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 650;
  }

  .score-advance { background: #15803d; color: white; }
  .score-fallback { background: #b91c1c; color: white; }
  .score-neutral { background: #ca8a04; color: #111827; }

  @media (max-width: 1279px) {
    .summary-item:nth-child(4) {
      border-left: 0;
    }
  }

  @media (max-width: 767px) {
    .summary-item:nth-child(odd) {
      border-left: 0;
    }
  }
</style>
