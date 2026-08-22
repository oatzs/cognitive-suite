<script lang="ts">
  import { flushSync, untrack } from 'svelte';
  import type { Engine, GameState } from './engine';
  let { engine }: { engine: Engine } = $props();
  let state = $state<GameState>(untrack(() => engine.getState()));
  $effect(() => {
    return engine.subscribe((s) => { state = s; });
  });

  function handleDuration(minutes: number) {
    engine.updateSettings({ timer: Math.round(minutes * 60) });
  }

  function handleStartingInterval(val: number) {
    engine.updateSettings({ startingInterval: val * 1000 });
  }

  function handleMinimumInterval(val: number) {
    engine.updateSettings({ minimumInterval: val * 1000 });
  }

  function handleIntervalMode(intervalMode: 'adaptive' | 'fixed') {
    engine.updateSettings({ intervalMode });
  }

  function handleAdaptationMode(adaptationMode: 'responsive' | 'classic') {
    engine.updateSettings({ adaptationMode });
  }

  function handleAdaptationStep(ms: number) {
    engine.updateSettings({ adaptationStepMs: Math.max(50, Math.min(500, ms)) });
  }

  function startSession() {
    engine.start();
    // Keep focus inside the initiating tap. Mobile browsers only open their
    // virtual keyboard for a normal editable input focused during user activation.
    flushSync();
    document.querySelector<HTMLInputElement>('[aria-label="Answer input"]')
      ?.focus();
  }
</script>

<div class="flex flex-col justify-center grow gap-10 md:gap-18">
  <div class="flex flex-col md:flex-row gap-10 md:gap-18 items-center grow">
    <div class="flex flex-col gap-9">
      <!-- Pacing is independent from the Regular / 2-back / Variable task mode. -->
      <div class="flex flex-col items-start gap-4">
        <span class="text-sm text-[#7e889c]">INTERVAL MODE</span>
        <div class="inline-flex rounded-xl bg-[#0f121a] p-1" role="group" aria-label="Interval pacing">
          <button
            type="button"
            aria-pressed={state.settings.intervalMode === 'adaptive'}
            class="cursor-pointer rounded-lg px-5 py-3 text-sm font-semibold transition-colors {state.settings.intervalMode === 'adaptive' ? 'bg-[#10b981] text-[#090a0d]' : 'text-[#a9b4cc] hover:bg-[#121621]'}"
            onclick={() => handleIntervalMode('adaptive')}
          >Adaptive</button>
          <button
            type="button"
            aria-pressed={state.settings.intervalMode === 'fixed'}
            class="cursor-pointer rounded-lg px-5 py-3 text-sm font-semibold transition-colors {state.settings.intervalMode === 'fixed' ? 'bg-[#10b981] text-[#090a0d]' : 'text-[#a9b4cc] hover:bg-[#121621]'}"
            onclick={() => handleIntervalMode('fixed')}
          >Fixed</button>
        </div>
      </div>

      {#if state.settings.intervalMode === 'adaptive'}
        <div class="flex flex-col items-start gap-4">
          <span class="text-sm text-[#7e889c]">ADJUSTMENT</span>
          <div class="flex flex-col md:flex-row items-center md:items-center gap-4">
            <div class="inline-flex rounded-xl bg-[#0f121a] p-1" role="group" aria-label="Adaptive adjustment type">
              <button
                type="button"
                aria-pressed={state.settings.adaptationMode === 'responsive'}
                class="cursor-pointer rounded-lg px-5 py-3 text-sm font-semibold transition-colors {state.settings.adaptationMode === 'responsive' ? 'bg-[#10b981] text-[#090a0d]' : 'text-[#a9b4cc] hover:bg-[#121621]'}"
                onclick={() => handleAdaptationMode('responsive')}
              >Proportional</button>
              <button
                type="button"
                aria-pressed={state.settings.adaptationMode === 'classic'}
                class="cursor-pointer rounded-lg px-5 py-3 text-sm font-semibold transition-colors {state.settings.adaptationMode === 'classic' ? 'bg-[#10b981] text-[#090a0d]' : 'text-[#a9b4cc] hover:bg-[#121621]'}"
                onclick={() => handleAdaptationMode('classic')}
              >Constant</button>
            </div>
            {#if state.settings.adaptationMode === 'classic'}
              <div class="flex items-center gap-2">
                <button type="button" class="cursor-pointer bg-[#a9b4cc] p-2 rounded-md w-10 h-10 flex items-center justify-center font-bold text-[#0f121a] text-lg" onmousedown={(e) => e.preventDefault()} onclick={() => handleAdaptationStep(state.settings.adaptationStepMs - 50)} aria-label="Decrease step size">
                  <span>−</span>
                </button>
                <input aria-label="Step size in seconds" class="bg-[#0f121a] p-2 text-center text-xl font-medium text-white [appearance:textfield] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:ring-inset w-[80px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="text" inputmode="decimal" spellcheck="false" value={(state.settings.adaptationStepMs / 1000).toFixed(2).replace(/0$/, "")} onchange={(e) => handleAdaptationStep(Math.round(parseFloat((e.target as HTMLInputElement).value) * 1000))} onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
                <button type="button" class="cursor-pointer bg-[#a9b4cc] p-2 rounded-md w-10 h-10 flex items-center justify-center font-bold text-[#0f121a] text-lg" onmousedown={(e) => e.preventDefault()} onclick={() => handleAdaptationStep(state.settings.adaptationStepMs + 50)} aria-label="Increase step size">
                  <span>+</span>
                </button>
                <span class="text-sm text-[#7e889c] ml-1">s</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="flex flex-col md:flex-row gap-9">
        <!-- Duration -->
        <div class="flex flex-col items-start gap-4">
          <span class="text-sm text-[#7e889c]">DURATION</span>
          <div class="flex overflow-hidden rounded-xl">
            <input aria-label="Duration in minutes" class="bg-[#0f121a] p-2 text-center text-xl font-medium text-white [appearance:textfield] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:ring-inset w-[100px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="text" inputmode="decimal" spellcheck="false" value={(state.settings.timer / 60).toFixed(2).replace(/\.?0+$/, "")} onchange={(e) => handleDuration(parseFloat((e.target as HTMLInputElement).value))} onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
            <div class="flex gap-2 bg-[#0f121a] p-2 pl-0">
              {#each [5, 10, 15, 30, 60] as preset}
                <button type="button" aria-label={`Set duration to ${preset} minutes`} class="cursor-pointer bg-[#a9b4cc] p-2 rounded-md" onmousedown={(e) => e.preventDefault()} onclick={() => handleDuration(preset)}>
                  <span class="text-[#0f121a] text-sm font-bold">{preset}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- Starting interval becomes the only interval in Fixed pacing. -->
        <div class="flex flex-col items-start gap-4">
          <span class="text-sm text-[#7e889c]">{state.settings.intervalMode === 'fixed' ? 'INTERVAL' : 'STARTING INTERVAL'}</span>
          <div class="flex overflow-hidden rounded-xl">
            <input aria-label={state.settings.intervalMode === 'fixed' ? 'Fixed interval in seconds' : 'Starting interval in seconds'} class="bg-[#0f121a] p-2 text-center text-xl font-medium text-white [appearance:textfield] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:ring-inset w-[100px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="text" inputmode="decimal" spellcheck="false" value={(state.settings.startingInterval / 1000).toFixed(2).replace(/\.?0+$/, "")} onchange={(e) => handleStartingInterval(parseFloat((e.target as HTMLInputElement).value))} onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
            <div class="flex gap-2 bg-[#0f121a] p-2 pl-0">
              {#each [0.5, 1, 2, 3, 5] as preset}
                <button type="button" aria-label={`Set interval to ${preset} seconds`} class="cursor-pointer bg-[#a9b4cc] p-2 rounded-md" onmousedown={(e) => e.preventDefault()} onclick={() => handleStartingInterval(preset)}>
                  <span class="text-[#0f121a] text-sm font-bold">{preset}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>

        {#if state.settings.intervalMode === 'adaptive'}
          <!-- Minimum interval only applies while pacing adapts. -->
          <div class="flex flex-col items-start gap-4">
            <span class="text-sm text-[#7e889c]">MINIMUM INTERVAL</span>
            <div class="flex overflow-hidden rounded-xl">
              <input aria-label="Minimum interval in seconds" class="bg-[#0f121a] p-2 text-center text-xl font-medium text-white [appearance:textfield] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:ring-inset w-[100px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="text" inputmode="decimal" spellcheck="false" value={(state.settings.minimumInterval / 1000).toFixed(2).replace(/\.?0+$/, "")} onchange={(e) => handleMinimumInterval(parseFloat((e.target as HTMLInputElement).value))} onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
              <div class="flex gap-2 bg-[#0f121a] p-2 pl-0">
                {#each [0.5, 1, 2, 3, 5] as preset}
                  <button type="button" aria-label={`Set minimum interval to ${preset} seconds`} class="cursor-pointer bg-[#a9b4cc] p-2 rounded-md" onmousedown={(e) => e.preventDefault()} onclick={() => handleMinimumInterval(preset)}>
                    <span class="text-[#0f121a] text-sm font-bold">{preset}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Bottom section -->
  <div class="flex flex-col items-center gap-4 pb-12 md:pb-0">
    <button class="cursor-pointer flex justify-center items-center gap-3 bg-[#10b981] hover:opacity-75 py-5 px-16 rounded-full" onclick={startSession}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="h-5 w-5 text-[#090a0d]"><path d="M8 5v14l11-7z"/></svg>
      <span class="text-[#090a0d] font-semibold text-lg">Start session</span>
    </button>

    <div class="flex flex-wrap justify-center gap-x-6 gap-y-1 pt-4 text-sm">
      <a href="https://discord.com/invite/brain" target="_blank" rel="noreferrer" class="group flex flex-wrap items-center justify-center gap-x-2 text-[#7e889c] hover:text-[#a9b4cc]">
        <span>Mindbuilding Discord:</span>
        <span class="text-[#a9b4cc] group-hover:text-[#ffffff]">discord.gg/brain</span>
      </a>
      <a href="https://github.com/SafEight/docct" target="_blank" rel="noreferrer" class="group flex items-center justify-center gap-x-2 text-[#7e889c] hover:text-[#a9b4cc]">
        <span>GitHub:</span>
        <span class="text-[#a9b4cc] group-hover:text-[#ffffff]">SafEight/docct</span>
      </a>
    </div>
  </div>
</div>
