<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createEngine, type GameState, type SessionResult } from './engine';
  import Onboarding from './Onboarding.svelte';
  import Setup from './Setup.svelte';
  import ActiveSession from './ActiveSession.svelte';
  import SessionComplete from './SessionComplete.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';

  let {
    onActiveChange = (_active: boolean) => {},
    onSessionComplete = (_session: SessionResult) => {},
  }: {
    onActiveChange?: (active: boolean) => void;
    onSessionComplete?: (session: SessionResult) => void;
  } = $props();

  const engine = createEngine(undefined, onSessionComplete);
  for (const session of engine.loadHistory()) {
    onSessionComplete(session);
  }
  let state = $state<GameState>(engine.getState());
  let settingsOpen = $state(false);
  let historyOpen = $state(false);
  let historyReturnFocus = $state(null as HTMLElement | null);
  let digitDropdownOpen = $state(false);
  let answerDropdownOpen = $state(false);

  $effect(() => {
    return engine.subscribe((s) => { state = s; });
  });

  const isActive = $derived(state.phase === 'active' || state.phase === 'paused');
  const isSetup = $derived(state.phase === 'setup' || state.phase === 'onboarding');

  $effect(() => {
    onActiveChange(isActive);
  });

  onDestroy(() => {
    onActiveChange(false);
    engine.dispose();
  });

  function handlePageKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;

    if (digitDropdownOpen || answerDropdownOpen) {
      event.preventDefault();
      digitDropdownOpen = false;
      answerDropdownOpen = false;
      return;
    }

    if (state.phase === 'active') {
      event.preventDefault();
      engine.pause();
    }
  }

  function openHistory() {
    historyReturnFocus = document.activeElement as HTMLElement | null;
    historyOpen = true;
  }

  function formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
</script>

<svelte:window onkeydown={handlePageKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div data-app-shell class="docct-app relative flex w-full h-full z-2 overflow-auto bg-[#090a0d]">
  <!-- Onboarding overlay (sibling, positioned fixed) -->
  {#if state.phase === 'onboarding'}
    <Onboarding {engine} />
  {/if}

  <!-- Main layout (direct child of root) -->
  <main aria-hidden={state.phase === 'onboarding' || historyOpen} inert={state.phase === 'onboarding' || historyOpen ? true : undefined} class="flex flex-col grow md:px-6 md:items-center {isActive ? 'select-none' : ''}">
    <h1 class="sr-only">DOCCT Cognitive Control Training</h1>
    <!-- Header bar -->
    <div class="md:flex md:py-6 justify-between gap-2 w-full max-w-7xl">
      <!-- Left side: timer -->
      <div class="{isActive ? 'flex px-4 pt-4' : 'hidden'} gap-6 items-center md:flex md:px-0 md:pt-0">
        {#if isActive}
          <button class="cursor-pointer flex gap-2 items-center bg-[#a9b4cc] hover:bg-[#ffffff] p-1 px-4 rounded-md" onclick={() => engine.stop()}>
            <span class="text-[#090a0d] text-xs font-semibold">END SESSION</span>
          </button>
        {/if}
        <!-- Timer stays visible during setup; Focus hides it only while training. -->
        {#if !isActive || state.settings.displayMode === 'standard'}
          <div data-session-timer class="hidden items-center gap-3 md:flex">
            <svg class="rounded-xl bg-[#a9b4cc]" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#090a0d" viewBox="0 0 256 256"><path d="M208,96a12,12,0,1,1,12,12A12,12,0,0,1,208,96ZM196,72a12,12,0,1,0-12-12A12,12,0,0,0,196,72Zm28.66,56a8,8,0,0,0-8.63,7.31A88.12,88.12,0,1,1,120.66,40,8,8,0,0,0,119.34,24,104.12,104.12,0,1,0,232,136.66,8,8,0,0,0,224.66,128ZM128,56a72,72,0,1,1-72,72A72.08,72.08,0,0,1,128,56Zm-8,72a8,8,0,0,0,8,8h48a8,8,0,0,0,0-16H136V80a8,8,0,0,0-16,0Zm40-80a12,12,0,1,0-12-12A12,12,0,0,0,160,48Z"></path></svg>
            <div class="flex h-[30px] items-center rounded-md border border-[#7e889c] bg-[#0f121a] px-4">
              <span class="text-xs font-extrabold text-[#ffffff]">{formatTime(state.timeLeft)}</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Right side: settings (hidden on mobile during active) -->
      <div class="{isActive ? 'hidden md:flex' : 'flex'} pt-6 pb-4 md:pt-0 md:pb-0 flex-col md:flex-row gap-2 items-center">
          <!-- DIGIT dropdown -->
          <div class="relative">
            <button aria-expanded={digitDropdownOpen} aria-controls="digit-options" aria-haspopup="true" class="cursor-pointer flex items-center p-1 px-4 border border-[#a9b4cc] gap-4 rounded-md" onclick={() => { digitDropdownOpen = !digitDropdownOpen; answerDropdownOpen = false; }}>
              <span class="text-[#7e889c]">DIGIT</span>
              <div class="flex items-center gap-1">
                <span class="text-[#a9b4cc] font-medium">{state.settings.useVoice ? 'Voice' : 'Text'}</span>
                <svg class="{digitDropdownOpen ? 'rotate-[-90deg] transition-rotate duration-[0.1s]' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="20" width="20"><g><path fill="#10b981" d="M11.2929 8H5.5703c-0.52841 0 -0.77161 0.79094 -0.3704 1.20467l2.40658 2.48173L11.2929 8Z" stroke-width="1"></path><path fill="#a9b4cc" d="m8.30273 12.4044 3.32687 3.4307c0.2132 0.2198 0.5277 0.2198 0.7408 0l6.4297 -6.63043C19.2013 8.79094 18.9581 8 18.4297 8h-5.7226l-4.40437 4.4044Z" stroke-width="1"></path></g></svg>
              </div>
            </button>
            {#if digitDropdownOpen}
              <div id="digit-options" role="group" aria-label="Digit presentation" class="absolute flex top-[42px] left-0 w-full pt-3 z-2">
                <div class="flex grow flex-col bg-[#a9b4cc] p-1 rounded-md">
                  <button aria-pressed={state.settings.useVoice} class="group min-h-11 hover:bg-[#000000] rounded-md cursor-pointer flex p-2 justify-end" onclick={() => { engine.updateSettings({ useVoice: true }); digitDropdownOpen = false; }}>
                    <span class="text-[#090a0d] group-hover:text-[#a9b4cc] font-medium">Voice</span>
                  </button>
                  <button aria-pressed={!state.settings.useVoice} class="group min-h-11 hover:bg-[#000000] rounded-md cursor-pointer flex p-2 justify-end" onclick={() => { engine.updateSettings({ useVoice: false }); digitDropdownOpen = false; }}>
                    <span class="text-[#090a0d] group-hover:text-[#a9b4cc] font-medium">Visual</span>
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- ANSWER dropdown -->
          <div class="relative">
            <button aria-expanded={answerDropdownOpen} aria-controls="answer-options" aria-haspopup="true" class="cursor-pointer flex items-center p-1 px-4 border border-[#a9b4cc] gap-4 rounded-md" onclick={() => { answerDropdownOpen = !answerDropdownOpen; digitDropdownOpen = false; }}>
              <span class="text-[#7e889c]">ANSWER</span>
              <div class="flex items-center gap-1">
                <span class="text-[#a9b4cc] font-medium">{state.settings.useKeypad ? 'On-screen keypad' : 'Keyboard'}</span>
                <svg class="{answerDropdownOpen ? 'rotate-[-90deg] transition-rotate duration-[0.1s]' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="20" width="20"><g><path fill="#10b981" d="M11.2929 8H5.5703c-0.52841 0 -0.77161 0.79094 -0.3704 1.20467l2.40658 2.48173L11.2929 8Z" stroke-width="1"></path><path fill="#a9b4cc" d="m8.30273 12.4044 3.32687 3.4307c0.2132 0.2198 0.5277 0.2198 0.7408 0l6.4297 -6.63043C19.2013 8.79094 18.9581 8 18.4297 8h-5.7226l-4.40437 4.4044Z" stroke-width="1"></path></g></svg>
              </div>
            </button>
            {#if answerDropdownOpen}
              <div id="answer-options" role="group" aria-label="Answer method" class="absolute flex top-[42px] left-0 w-full pt-3 z-2">
                <div class="flex grow flex-col bg-[#a9b4cc] p-1 rounded-md">
                  <button aria-pressed={state.settings.useKeypad} class="group min-h-11 hover:bg-[#000000] rounded-md cursor-pointer flex p-2 justify-end" onclick={() => { engine.updateSettings({ useKeypad: true }); answerDropdownOpen = false; }}>
                    <span class="text-[#090a0d] group-hover:text-[#a9b4cc] font-medium">On-screen keypad</span>
                  </button>
                  <button aria-pressed={!state.settings.useKeypad} class="group min-h-11 hover:bg-[#000000] rounded-md cursor-pointer flex p-2 justify-end" onclick={() => { engine.updateSettings({ useKeypad: false }); answerDropdownOpen = false; }}>
                    <span class="text-[#090a0d] group-hover:text-[#a9b4cc] font-medium">Keyboard</span>
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- HISTORY + SETTINGS row -->
          <div class="flex flex-row gap-2 items-center">
          <!-- HISTORY button (always visible) -->
        <button class="cursor-pointer flex items-center p-1 px-4 border border-[#a9b4cc] gap-4 rounded-md" onclick={openHistory}>
          <span class="text-[#a9b4cc] font-medium">HISTORY</span>
        </button>

        <!-- Settings -->
        <div class="relative flex">
          <button aria-expanded={settingsOpen} aria-controls="settings-panel" aria-haspopup="true" class="cursor-pointer flex items-center p-1 px-4 border border-[#a9b4cc] gap-4 rounded-md" onclick={() => settingsOpen = !settingsOpen}>
            <span class="text-[#a9b4cc] font-medium">SETTINGS</span>
          </button>
          {#if settingsOpen}
            <SettingsPanel {engine} close={() => settingsOpen = false} />
          {/if}
        </div>
          </div>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex grow">
      <div class="flex grow md:pb-[122px] md:justify-center">
        {#if state.phase === 'onboarding'}
          <Setup {engine} />
        {:else if state.phase === 'setup'}
          <Setup {engine} />
        {:else if state.phase === 'active' || state.phase === 'paused'}
          <ActiveSession {engine} />
        {:else if state.phase === 'complete'}
          <SessionComplete {engine} onHistory={openHistory} />
        {/if}
      </div>
    </div>
  </main>

  <!-- History panel (fixed overlay, sibling of main layout) -->
  {#if historyOpen}
    <HistoryPanel {engine} restoreFocusTo={historyReturnFocus} close={() => historyOpen = false} />
  {/if}
</div>
