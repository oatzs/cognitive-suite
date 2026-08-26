<script lang="ts">
  import type { Engine, GameState } from './engine';
  import {
    DOCCT_HIGH_SCORES_KEY,
    LEGACY_DOCCT_HIGH_SCORES_KEY,
    readDocctValue,
  } from './persistence.js';
  import { onMount, untrack } from 'svelte';

  let { engine, onHistory }: { engine: Engine; onHistory?: () => void } = $props();
  let state = $state<GameState>(untrack(() => engine.getState()));
  // Canvas bindings are assigned by Svelte and consumed imperatively by Chart.js.
  // svelte-ignore non_reactive_update
  let accuracyCanvas: HTMLCanvasElement;
  // svelte-ignore non_reactive_update
  let intervalCanvas: HTMLCanvasElement;

  $effect(() => {
    return engine.subscribe((s) => { state = s; });
  });

  const session = $derived(state.history.length > 0 ? state.history[state.history.length - 1] : null);

  // All-time best for this mode (from high scores)
  function getBestScores(mode: string) {
    try {
      const raw = readDocctValue(DOCCT_HIGH_SCORES_KEY, LEGACY_DOCCT_HIGH_SCORES_KEY);
      if (raw) {
        const all = JSON.parse(raw);
        return all[mode] || { fastest: 0, mostStreaks: 0, mostCorrect: 0 };
      }
    } catch {
      // Ignore corrupt legacy high-score data.
    }
    return { fastest: 0, mostStreaks: 0, mostCorrect: 0 };
  }

  const bestScores = $derived(getBestScores(
    session?.intervalMode === 'fixed'
      ? `${session.mode}:fixed`
      : (session?.mode || state.settings.taskMode)
  ));

  // Positive change = improvement (green up arrow)
  // For accuracy/streaks: higher is better
  function changeFromBest(current: number, best: number): number {
    if (!best || best === 0) return 0;
    return Number(((current - best) / best).toFixed(2));
  }

  // For fastest interval: LOWER is better, so inverse
  function changeFromBestFastest(current: number, best: number): number {
    if (!best || best === 0) return 0;
    return Number(((best - current) / best).toFixed(2));
  }

  function formatInterval(ms: number): string {
    if (!ms) return 'N/A';
    const secs = ms / 1000;
    const decimals = Number.isInteger(secs) ? 0 : secs < 1 ? 2 : 1;
    return `${secs.toFixed(decimals)} SECOND${secs === 1 ? '' : 'S'}`;
  }

  function formatResponseTime(ms: number): string {
    if (!ms) return 'N/A';
    const secs = ms / 1000;
    return `${secs.toFixed(2)}s`;
  }

  const accuracy = $derived(session?.accuracy ?? 0);
  const fastest = $derived(session?.fastestIntervalMs ?? 0);
  const streaks = $derived(session?.streaks ?? 0);
  const responseTime = $derived(session?.averageResponseTimeMs ?? 0);
  const responseCount = $derived(session?.totalAnswers ?? 0);

  // Change indicators vs all-time best
  const accuracyChange = $derived(changeFromBest(accuracy, bestScores.mostCorrect));
  const fastestChange = $derived(changeFromBestFastest(fastest, bestScores.fastest));
  const streaksChange = $derived(changeFromBest(streaks, bestScores.mostStreaks));

  onMount(async () => {
    if (!accuracyCanvas || !intervalCanvas) return;
    try {
      const chartModule = await import('chart.js/auto');
      const Chart = chartModule.default;
      const fontFamily = "'DM Sans', sans-serif";
      const fontConfig = { family: fontFamily, size: 12, weight: 500 };

      // Accuracy chart
      const accuracyData = state.history.slice().reverse().map((s, i) => ({ x: i, y: Math.round(s.accuracy * 100) }));
      new Chart(accuracyCanvas, {
        type: 'line',
        data: {
          labels: accuracyData.map(() => ''),
          datasets: [{
            data: accuracyData.map(d => d.y),
            borderColor: '#10b981',
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: '#dce7ff',
            pointBorderColor: '#dce7ff',
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#dce7ff',
            pointHoverBorderColor: '#10b981',
            fill: true,
            backgroundColor: 'rgba(79,121,232,0.18)',
            tension: 0.28
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => `Accuracy: ${ctx.parsed.y}%`
              }
            }
          },
          scales: {
            x: { display: false },
            y: {
              min: 0, max: 100,
              ticks: { color: '#7e8baa', font: fontConfig, stepSize: 25, callback: (v: any) => `${v}%` },
              grid: { color: '#121621' },
              border: { display: false }
            }
          },
          spanGaps: true
        }
      });

      // Interval chart
      const intervalData = state.history.slice().reverse().map((s, i) => ({ x: i, y: s.fastestIntervalMs / 1000 }));
      const intervalMin = Math.min(...intervalData.map(d => d.y));
      const intervalMax = Math.max(...intervalData.map(d => d.y));
      const intervalPadding = Math.max(0.1, (intervalMax - intervalMin) * 0.1);

      new Chart(intervalCanvas, {
        type: 'line',
        data: {
          labels: intervalData.map(() => ''),
          datasets: [{
            data: intervalData.map(d => d.y),
            borderColor: '#d5b15e',
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: '#fff0c7',
            pointBorderColor: '#fff0c7',
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#fff0c7',
            pointHoverBorderColor: '#d5b15e',
            fill: true,
            backgroundColor: 'rgba(213,177,94,0.14)',
            tension: 0.28
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => `Fastest: ${ctx.parsed.y.toFixed(1)}s`
              }
            }
          },
          scales: {
            x: { display: false },
            y: {
              min: Math.max(0, intervalMin - intervalPadding),
              max: intervalMax + intervalPadding,
              ticks: { color: '#7e8baa', font: fontConfig, callback: (v: any) => `${v}s` },
              grid: { color: '#121621' },
              border: { display: false }
            }
          },
          spanGaps: true
        }
      });
    } catch {
      // Charts are optional; the session summary remains usable without them.
    }
  });
</script>

<div class="flex grow flex-col">
  <!-- Header row: "What a session!" + buttons -->
  <div class="flex pt-12 pb-6 md:pb-0 justify-center md:justify-between gap-2 items-center w-full max-w-5xl">
    <span class="hidden md:inline text-2xl text-white">What a session!</span>
    <div class="flex gap-3">
      <button class="cursor-pointer flex items-center gap-6 bg-[#0f121a] hover:bg-[#121621] py-3 px-8 rounded-full border border-[#7e889c]" onclick={() => onHistory?.()}>
        <span class="text-[#a9b4cc] font-semibold">History</span>
      </button>
      <button class="cursor-pointer flex items-center gap-6 bg-[#10b981] hover:opacity-75 py-3 px-18 rounded-full" onclick={() => engine.restart()}>
        <span class="text-[#090a0d] font-semibold">Start again</span>
      </button>
    </div>
  </div>

  {#if session}
    <!-- Score cards in horizontal row -->
    <div class="flex flex-col md:flex-row gap-6 max-w-5xl w-full">
      <!-- Accuracy card -->
      <div class="flex flex-col flex-1 justify-center gap-6 p-6 md:flex-row md:items-center">
        <div class="flex flex-col gap-[5px] rounded-[24px] overflow-hidden flex-1">
          <div class="flex flex-col bg-[#0f121a] pt-6 text-center items-center">
            <span class="text-2xl text-[#a9b4cc] px-6">Accuracy</span>
            <div class="flex gap-3 items-center">
              <span class="text-[#ffffff] py-12 font-medium">{Math.round(accuracy * 100)}%</span>
              {#if accuracyChange > 0}
                <div class="flex gap-1 bg-[#4fe84f] p-1 rounded-md items-center mt-[-15px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#0f121a" viewBox="0 0 256 256"><path d="M215.39,163.06A8,8,0,0,1,208,168H48a8,8,0,0,1-5.66-13.66l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,215.39,163.06Z"></path></svg>
                  <span class="text-xs text-[#0f121a] font-mono font-medium">{Math.abs(accuracyChange).toFixed(2)}X</span>
                </div>
              {:else if accuracyChange < 0}
                <div class="flex gap-1 bg-[#e85c4f] p-1 rounded-md items-center mb-[-15px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#0f121a" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,48,88H208a8,8,0,0,1,5.66,13.66Z"></path></svg>
                  <span class="text-xs text-[#0f121a] font-mono font-medium">{Math.abs(accuracyChange).toFixed(2)}X</span>
                </div>
              {/if}
            </div>
          </div>
          <div class="flex gap-6 bg-[#000000] p-6 justify-center">
            <span class="text-xs text-[#7e889c] font-medium">ALL-TIME TOP ACCURACY</span>
            <span class="text-xs text-[#ffffff] font-medium">{Math.round(bestScores.mostCorrect * 100)}%</span>
          </div>
        </div>
      </div>

      <!-- Fastest Interval card -->
      <div class="flex flex-col flex-1 justify-center gap-6 p-6 md:flex-row md:items-center">
        <div class="flex flex-col gap-[5px] rounded-[24px] overflow-hidden flex-1">
          <div class="flex flex-col bg-[#0f121a] pt-6 text-center items-center">
            <span class="text-2xl text-[#a9b4cc] px-6">Fastest Interval</span>
            <div class="flex gap-3 items-center">
              <span class="text-[#ffffff] py-12 font-medium">{formatInterval(fastest)}</span>
              {#if fastestChange > 0}
                <div class="flex gap-1 bg-[#4fe84f] p-1 rounded-md items-center mt-[-15px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#0f121a" viewBox="0 0 256 256"><path d="M215.39,163.06A8,8,0,0,1,208,168H48a8,8,0,0,1-5.66-13.66l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,215.39,163.06Z"></path></svg>
                  <span class="text-xs text-[#0f121a] font-mono font-medium">{Math.abs(fastestChange).toFixed(2)}X</span>
                </div>
              {:else if fastestChange < 0}
                <div class="flex gap-1 bg-[#e85c4f] p-1 rounded-md items-center mb-[-15px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#0f121a" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,48,88H208a8,8,0,0,1,5.66,13.66Z"></path></svg>
                  <span class="text-xs text-[#0f121a] font-mono font-medium">{Math.abs(fastestChange).toFixed(2)}X</span>
                </div>
              {/if}
            </div>
          </div>
          <div class="flex gap-6 bg-[#000000] p-6 justify-center">
            <span class="text-xs text-[#7e889c] font-medium">ALL-TIME FASTEST</span>
            <span class="text-xs text-[#ffffff] font-medium">{formatInterval(bestScores.fastest)}</span>
          </div>
        </div>
      </div>

      <!-- Streaks card -->
      <div class="flex flex-col flex-1 justify-center gap-6 p-6 md:flex-row md:items-center">
        <div class="flex flex-col gap-[5px] rounded-[24px] overflow-hidden flex-1">
          <div class="flex flex-col bg-[#0f121a] pt-6 text-center items-center">
            <span class="text-2xl text-[#a9b4cc] px-6">Streaks</span>
            <div class="flex gap-3 items-center">
              <span class="text-[#ffffff] py-12 font-medium">{streaks}</span>
              {#if streaksChange > 0}
                <div class="flex gap-1 bg-[#4fe84f] p-1 rounded-md items-center mt-[-15px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#0f121a" viewBox="0 0 256 256"><path d="M215.39,163.06A8,8,0,0,1,208,168H48a8,8,0,0,1-5.66-13.66l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,215.39,163.06Z"></path></svg>
                  <span class="text-xs text-[#0f121a] font-mono font-medium">{Math.abs(streaksChange).toFixed(2)}X</span>
                </div>
              {:else if streaksChange < 0}
                <div class="flex gap-1 bg-[#e85c4f] p-1 rounded-md items-center mb-[-15px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#0f121a" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,48,88H208a8,8,0,0,1,5.66,13.66Z"></path></svg>
                  <span class="text-xs text-[#0f121a] font-mono font-medium">{Math.abs(streaksChange).toFixed(2)}X</span>
                </div>
              {/if}
            </div>
          </div>
          <div class="flex gap-6 bg-[#000000] p-6 justify-center">
            <span class="text-xs text-[#7e889c] font-medium">ALL-TIME MOST STREAKS</span>
            <span class="text-xs text-[#ffffff] font-medium">{bestScores.mostStreaks}</span>
          </div>
        </div>
      </div>

      <!-- Avg Response Time card -->
      <div class="flex flex-col flex-1 justify-center gap-6 p-6 md:flex-row md:items-center">
        <div class="flex flex-col gap-[5px] rounded-[24px] overflow-hidden flex-1">
          <div class="flex flex-col bg-[#0f121a] pt-6 text-center items-center">
            <span class="text-2xl text-[#a9b4cc] px-6">Avg. Response Time</span>
            <div class="flex gap-3 items-center">
              <span class="text-[#ffffff] py-12 font-medium">{formatResponseTime(responseTime)}</span>
            </div>
          </div>
          <div class="flex gap-6 bg-[#000000] p-6 justify-center">
            <span class="text-xs text-[#7e889c] font-medium">ANSWERED TRIALS</span>
            <span class="text-xs text-[#ffffff] font-medium">{responseCount}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts section -->
    <div class="grid grid-cols-1 gap-4 max-w-5xl w-full mt-4">
      <section class="rounded-[24px] bg-[#0f121a] p-5">
        <span class="text-lg font-medium text-[#a9b4cc]">Accuracy</span>
        <div class="mt-4 h-[200px] min-w-0 sm:h-[220px] md:h-[240px] lg:h-[260px]">
          <canvas bind:this={accuracyCanvas}></canvas>
        </div>
      </section>

      <section class="rounded-[24px] bg-[#0f121a] p-5">
        <span class="text-lg font-medium text-[#a9b4cc]">Fastest Interval</span>
        <div class="mt-4 h-[200px] min-w-0 sm:h-[220px] md:h-[240px] lg:h-[260px]">
          <canvas bind:this={intervalCanvas}></canvas>
        </div>
      </section>
    </div>
  {:else}
    <div class="rounded-[24px] bg-[#0f121a] p-8 text-center max-w-5xl w-full">
      <span class="text-lg font-semibold text-white">No sessions yet</span>
      <p class="mt-3 text-sm leading-6 text-[#7e889c]">Finish a session in this mode and the progress charts will show up here.</p>
    </div>
  {/if}
</div>
