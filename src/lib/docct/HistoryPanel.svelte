<script lang="ts">
  import type { Engine, GameState } from './engine';
  import { onDestroy, onMount, untrack } from 'svelte';

  let { engine, close, restoreFocusTo }: { engine: Engine; close: () => void; restoreFocusTo: HTMLElement | null } = $props();
  let state = $state<GameState>(untrack(() => engine.getState()));
  // Canvas bindings are assigned by Svelte and consumed imperatively by Chart.js.
  // svelte-ignore non_reactive_update
  let chartCanvas: HTMLCanvasElement;
  // svelte-ignore non_reactive_update
  let intervalChartCanvas: HTMLCanvasElement;
  let Chart: any;
  let accuracyChart: any;
  let intervalChart: any;
  let dialogEl: HTMLElement;
  let mounted = false;

  $effect(() => {
    return engine.subscribe((s) => { state = s; });
  });

  $effect(() => {
    if (state.history.length > 0 && chartCanvas && Chart) {
      renderCharts();
    }
  });

  onMount(async () => {
    mounted = true;
    dialogEl?.focus();
    const chartModule = await import('chart.js/auto');
    if (!mounted) return;
    Chart = chartModule.default;

    if (state.history.length > 0) {
      renderCharts();
    }
  });

  onDestroy(() => {
    mounted = false;
    accuracyChart?.destroy();
    intervalChart?.destroy();
    queueMicrotask(() => restoreFocusTo?.focus());
  });

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialogEl.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hasAttribute('disabled'));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogEl.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if ((event.shiftKey && (document.activeElement === first || document.activeElement === dialogEl))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogEl)) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderCharts() {
    if (!chartCanvas || !Chart) return;

    const sessions = [...state.history].reverse();

    // Accuracy chart
    accuracyChart?.destroy();
    accuracyChart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: sessions.map(() => ''),
        datasets: [{
          data: sessions.map(s => Math.round(s.accuracy * 100)),
          borderColor: '#10b981',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#10b981',
          fill: false,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#7e889c', font: { size: 10 } },
            grid: { color: '#121621' }
          }
        }
      }
    });

    // Interval chart
    if (intervalChartCanvas) {
      intervalChart?.destroy();
      intervalChart = new Chart(intervalChartCanvas, {
        type: 'line',
        data: {
          labels: sessions.map(() => ''),
          datasets: [{
            data: sessions.map(s => s.fastestIntervalMs),
            borderColor: '#10b981',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#10b981',
            fill: false,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              ticks: { color: '#7e889c', font: { size: 10 } },
              grid: { color: '#121621' }
            }
          }
        }
      });
    }
  }

  function formatTime(ms: number): string {
    const secs = Math.floor(ms / 1000);
    const msRemainder = ms % 1000;
    if (secs === 0) return `${msRemainder}ms`;
    return `${secs}.${Math.floor(msRemainder / 100)}s`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatResponseTime(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
  }

  function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    if (minutes === 0) return `${remainder}s`;
    if (remainder === 0) return `${minutes}m`;
    return `${minutes}m ${remainder}s`;
  }
</script>

<div class="bg-black/80 fixed inset-0 z-3 flex items-center justify-center">
  <button tabindex="-1" class="absolute inset-0 cursor-default" aria-label="Close history" onclick={close}></button>
  <div
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="history-title"
    tabindex="-1"
    class="bg-[#0f121a] rounded-[24px] p-6 max-w-[600px] w-full mx-4 max-h-[80vh] overflow-y-auto border border-[#a9b4cc] outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
    onkeydown={handleDialogKeydown}
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h2 id="history-title" class="text-[#ffffff] text-2xl font-bold">History</h2>
      <button class="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#7e889c] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10b981] cursor-pointer" aria-label="Close history" onclick={close}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.3 5.71a1 1 0 0 0-1.42 0L12 10.59 7.12 5.71A1 1 0 0 0 5.7 7.12L10.59 12l-4.88 4.88a1 1 0 0 0 1.42 1.42L12 13.41l4.88 4.88a1 1 0 0 0 1.42-1.42L13.41 12l4.88-4.88a1 1 0 0 0 0-1.41z"/>
        </svg>
      </button>
    </div>

    {#if state.history.length === 0}
      <div class="text-center py-12">
        <span class="text-[#7e889c] text-lg">No sessions yet</span>
      </div>
    {:else}
      <div class="flex flex-col">
      <!-- Charts -->
      <div class="order-2 mb-6 md:order-1">
        <h3 class="text-[#a9b4cc] text-sm font-medium mb-3">Accuracy Trend</h3>
        <div class="bg-[#121621] rounded-xl p-4 h-[160px]">
          <canvas bind:this={chartCanvas}></canvas>
        </div>
      </div>

      <div class="order-3 mb-6 md:order-2">
        <h3 class="text-[#a9b4cc] text-sm font-medium mb-3">Fastest Interval Trend</h3>
        <div class="bg-[#121621] rounded-xl p-4 h-[160px]">
          <canvas bind:this={intervalChartCanvas}></canvas>
        </div>
      </div>

      <!-- Session list -->
      <div class="order-1 mb-6 flex flex-col gap-2 md:order-3 md:mb-0">
        {#each state.history as session (session.sessionId)}
          <div class="bg-[#121621] rounded-xl p-4 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[#7e889c] text-xs">{formatDate(session.completedAt)}</span>
              <span class="text-[#a9b4cc] text-xs px-2 py-0.5 rounded-md bg-[#0f121a]">
                {session.mode} · {session.intervalMode === 'fixed' ? 'Fixed' : session.adaptationMode === 'classic' ? `Adaptive · Constant ${(session.adaptationStepMs / 1000).toFixed(2).replace(/0$/, '')}s` : 'Adaptive · Proportional'}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div class="flex flex-col">
                <span class="text-[#7e889c] text-xs">Accuracy</span>
                <span class="text-[#10b981] text-lg font-bold">{Math.round(session.accuracy * 100)}%</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[#7e889c] text-xs">Fastest</span>
                <span class="text-white text-lg font-bold">{formatTime(session.fastestIntervalMs)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[#7e889c] text-xs">Correct</span>
                <span class="text-[#4fe84f] text-lg font-bold">{session.correctCount}/{session.totalAnswers}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[#7e889c] text-xs">Avg response</span>
                <span class="text-white text-lg font-bold">{formatResponseTime(session.averageResponseTimeMs)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[#7e889c] text-xs">Session length</span>
                <span class="text-white text-lg font-bold">{formatDuration(session.durationSec)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[#7e889c] text-xs">Streaks</span>
                <span class="text-white text-lg font-bold">{session.streaks}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
      </div>
    {/if}
  </div>
</div>
