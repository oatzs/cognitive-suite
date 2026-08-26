<script>
  import { analytics } from '../stores/analyticsStore'
  import { mobile } from '../stores/mobileStore'
  import { recentGamesState } from '../stores/recentGamesStore'
  import { ChartColumn } from '@lucide/svelte'
  import RecentGames from './RecentGames.svelte'
  import TimeStats from './TimeStats.svelte'

  let show = false
  let tab = 'recent-games'
  let progressChartPromise
  const openModal = async () => {
    show = true
  }

  const closeModal = () => {
    show = false
  }

  const handleKeydown = (event) => {
    if (event.key === "Escape") closeModal()
  }

  const selectTab = (nextTab) => {
    tab = nextTab
    if (nextTab === 'progress-chart' && !progressChartPromise) {
      progressChartPromise = import('./ProgressChart.svelte')
    }
  }

</script>

<svelte:window on:keydown={handleKeydown} />
<button class="flex items-center justify-center" on:click={openModal}>
  <ChartColumn class="btn btn-square btn-ghost h-8 lg:h-6" />
</button>
{#if show}
  <div class="modal modal-open" role="dialog" aria-modal="true" aria-label="Training history">
    <button type="button" class="fixed inset-0 cursor-default" aria-label="Close training history" on:click={closeModal}></button>
    <div class="modal-box relative w-[90%] max-w-[1500px]">
      <div role="tablist" class="tabs tabs-lift relative">
        <button type="button" role="tab"
          aria-selected={tab === 'recent-games'}
          class="tab" 
          class:tab-active={tab === 'recent-games'} 
          on:click={() => selectTab('recent-games')}>
          Recent Games
        </button>
        <button type="button" role="tab"
          aria-selected={tab === 'progress-chart'}
          class="tab"
          class:tab-active={tab === 'progress-chart'}
          on:click={() => selectTab('progress-chart')}>
          Progress Chart
        </button>
      </div>
      <div class="w-full h-[65svh] overflow-y-auto">
        {#if tab === 'recent-games'}
        <RecentGames />
        {:else}
        <TimeStats />
        <div class="h-[50svh]">
          {#await progressChartPromise}
            <div class="flex h-full items-center justify-center"><span class="loading loading-spinner"></span></div>
          {:then module}
            <svelte:component this={module.default} />
          {/await}
        </div>
        {/if}
      </div>
      <div class="flex flex-row-reverse items-center justify-between select-none">
        <button class="btn" on:click={closeModal}>Close</button>
        {#if $mobile}
          <div class="flex flex-col gap-2 text-sm">
          {#if tab === 'recent-games'}
            <span class="">
              Show cancelled
              <input type="checkbox" class="toggle" checked={$recentGamesState.filter !== 'completed'} on:click={() => $recentGamesState.filter = $recentGamesState.filter === 'completed' ? 'all' : 'completed'} />
            </span>
          {/if}
          {#if $analytics.playTime}
            <div>Today: {$analytics.playTime}</div>
          {/if}
          </div>
        {:else}
          {#if tab === 'recent-games'}
            <div class="text-sm">
              <span class="">
                Show cancelled
                <input type="checkbox" class="toggle" checked={$recentGamesState.filter !== 'completed'} on:click={() => $recentGamesState.filter = $recentGamesState.filter === 'completed' ? 'all' : 'completed'} />
              </span>
            </div>
          {/if}
        {/if}


      </div>
    </div>
  </div>
{/if}
