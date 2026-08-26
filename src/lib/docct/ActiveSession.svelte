<script lang="ts">
  import { flushSync, untrack } from 'svelte';
  import type { Engine, GameState } from './engine';

  let { engine }: { engine: Engine } = $props();
  let gameState = $state<GameState>(untrack(() => engine.getState()));

  $effect(() => {
    return engine.subscribe((s) => { gameState = s; });
  });

  // ── UI gameState (local to this component, not part of engine) ─────────────
  let selectedButton = $state<number | null>(null); // which keypad button is visually highlighted
  let keyValue = $state('');       // current keyboard input value (text input mode)
  let swipeActive = $state(false); // true while finger is down on the keypad (touch mode)
  let lastTouchStartTime = $state(0); // timestamp of last touchstart (guards stale stuck touches)
  let lastTouchEndTime = $state(0); // timestamp of last touchend (suppresses synthetic click)
  let touchFailsafeTimer: ReturnType<typeof setTimeout> | null = null;
  let ringProgress = $state(201);  // SVG circle stroke-dashoffset (201 = empty, 0 = full)
  const answerValues = Array.from({ length: 17 }, (_, index) => index + 2);

  // Derived primitives: Svelte 5 $effect tracks the whole `gameState` proxy, so any
  // notify() (including submitAnswer) re-runs the effect and restarts the ring.
  // By extracting primitives into $derived, the effect only re-runs when the
  // underlying value actually changes — not on every gameState object replacement.
  const ringInterval = $derived(gameState.currentInterval);
  const ringDigitGen = $derived(gameState.digitGeneration);
  const ringDigit = $derived(gameState.currentDigit);
  const ringVoice = $derived(gameState.settings.useVoice);

  // JS-driven progress ring: runs on every new digit, animates via requestAnimationFrame.
  // Depends on derived primitives only — submitAnswer() → notify() does NOT change
  // digitGeneration or currentInterval, so the ring won't restart mid-turn.
  $effect(() => {
    const interval = ringInterval;
    const _gen = ringDigitGen; // track but just ensure effect re-runs on new digit
    if (ringVoice || ringDigit === null) return;

    ringProgress = 201; // start empty
    const startTime = performance.now();
    let rafId: number;

    function tick() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / interval, 1);
      ringProgress = 201 * (1 - progress);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  });

  /** Hit-test against all keypad buttons using getBoundingClientRect.
   *  elementFromPoint is unreliable during active touch on mobile Safari. */
  function buttonFromTouch(touch: Touch): number | null {
    const buttons = document.querySelectorAll('[data-answer]');
    const pad = 6; // generous padding so finger-edge catches the button
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      if (
        touch.clientX >= rect.left - pad &&
        touch.clientX <= rect.right + pad &&
        touch.clientY >= rect.top - pad &&
        touch.clientY <= rect.bottom + pad
      ) {
        return parseInt((btn as HTMLElement).dataset.answer!);
      }
    }
    return null;
  }

  function endSwipe() {
    swipeActive = false;
    lastTouchEndTime = Date.now();
    if (touchFailsafeTimer) {
      clearTimeout(touchFailsafeTimer);
      touchFailsafeTimer = null;
    }
  }

  function handleKeypadTouchStart(answer: number, e: TouchEvent) {
    e.preventDefault();
    swipeActive = true;
    lastTouchStartTime = Date.now();
    if (touchFailsafeTimer) clearTimeout(touchFailsafeTimer);
    // Mobile browsers can drop touchend/touchcancel when a gesture is
    // interrupted. If swipeActive gets stuck, the new-digit effect keeps
    // re-submitting the old selected button and every answer looks wrong.
    touchFailsafeTimer = setTimeout(() => {
      swipeActive = false;
      touchFailsafeTimer = null;
    }, 750);
    selectedButton = answer;
    engine.submitAnswer(answer);
  }

  function handleKeypadTouchMove(e: TouchEvent) {
    if (!swipeActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const answer = buttonFromTouch(touch);
    if (answer !== null && answer !== selectedButton) {
      selectedButton = answer;
      engine.submitAnswer(answer);
    }
  }

  function handleKeypadTouchEnd() {
    if (!swipeActive) return;
    endSwipe();
    // Already submitted in touchstart/touchmove — nothing more to do.
  }

  function handleKeypadClick(answer: number, e: MouseEvent) {
    // If we're in a swipe/touch sequence, suppress the synthetic click.
    // Mobile browsers synthesize a click ~300ms after touchend on the
    // element where the touch STARTED — which is the wrong button for
    // a swipe.  swipeActive is the single source of truth: it is set
    // on touchstart and cleared in touchend.
    if (swipeActive) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return;
    }
    // Belt-and-braces: also suppress clicks very close to a touchend
    // (catches edge cases where swipeActive was already cleared).
    if (Date.now() - lastTouchEndTime < 500) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return;
    }
    // Flush any digit-generation update that was already pending before this
    // click, then mark the answer selected for the current turn. The next
    // digit-generation effect clears it exactly once the next turn begins.
    engine.submitAnswer(answer);
    flushSync();
    selectedButton = answer;
  }

  function keepAboveKeyboard(node: HTMLInputElement) {
    const viewport = window.visualViewport;
    const shell = document.querySelector<HTMLElement>('[data-app-shell]');
    if (!viewport || !shell) return {};

    function syncViewport() {
      shell!.style.height = `${viewport!.height}px`;
      shell!.style.top = `${viewport!.offsetTop}px`;
      if (document.activeElement === node) {
        requestAnimationFrame(() => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
      }
    }

    syncViewport();
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);
    return {
      destroy() {
        viewport.removeEventListener('resize', syncViewport);
        viewport.removeEventListener('scroll', syncViewport);
        shell.style.removeProperty('height');
        shell.style.removeProperty('top');
      }
    };
  }

  function resumeSession() {
    engine.resume();
    // Resume is an explicit tap, so restore the numeric keyboard while mobile
    // user activation is still available. Do not refocus on later digit updates.
    document.querySelector<HTMLInputElement>('[aria-label="Answer input"]')?.focus();
  }

  function handleBeforeInput(e: InputEvent) {
    if (isPaused || !gameState.canAnswer) e.preventDefault();
  }

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (isPaused || !gameState.canAnswer) {
      input.value = '';
      keyValue = '';
      return;
    }
    // Strip non-digits, limit to 2 chars
    let raw = input.value.replace(/\D/g, '').slice(0, 2);
    // Clamp 0-99
    if (raw !== '') {
      const num = parseInt(raw);
      if (num > 99) raw = '99';
    }
    keyValue = raw;
    // Auto-submit if valid 2-digit range
    if (raw !== '' && gameState.canAnswer) {
      const num = parseInt(raw);
      if (num >= 2 && num <= 18) {
        engine.submitAnswer(num);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      return; // Enter does nothing in original
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      keyValue = '';
      if (gameState.phase === 'active') {
        engine.pause();
      }
      return;
    }
  }

  const isPaused = $derived(gameState.phase === 'paused');
  const inputGeneration = $derived(gameState.digitGeneration);

  // Clear selection and keyboard input on every new interval, even when two
  // consecutive intervals happen to generate the same digit.
  // If the user's finger is still on a button (swipeActive), re-submit that
  // answer instead of clearing — otherwise the held button goes unregistered
  // and the turn is marked wrong. Guard with a short freshness window so a
  // missed touchend/touchcancel cannot keep submitting stale answers forever.
  // Uses untrack() for swipeActive/selectedButton so the effect ONLY re-runs
  // when digitGeneration advances — not on every notify() → gameState replacement,
  // which would clear the input or highlight immediately after submission.
  $effect(() => {
    void inputGeneration; // only tracked dependency
    const swiping = untrack(() => swipeActive);
    const selected = untrack(() => selectedButton);
    const touchAge = Date.now() - untrack(() => lastTouchStartTime);
    if (swiping && selected !== null && touchAge < 750) {
      // Finger still down on a button — re-submit for the new turn
      engine.submitAnswer(selected);
    } else {
      if (swiping && touchAge >= 750) endSwipe();
      selectedButton = null;
    }
    keyValue = '';
  });

  // Status text for keyboard mode
  const statusText = $derived(
    isPaused ? 'Paused' :
    gameState.canAnswer ? 'Type a number' :
    'Wait for enough digits...'
  );
</script>

{#snippet digitDisplay(compact = false)}
  <div
    data-digit-display
    class="flex items-center justify-center {compact ? 'h-[72px] w-[72px] md:h-[88px] md:w-[88px]' : 'w-[88px] py-6'}"
  >
    {#if gameState.settings.useVoice}
      {#if gameState.isPlayingAudio}
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="#a9b4cc" viewBox="0 0 256 256" aria-label="Playing digit"><path d="M168,32V224a8,8,0,0,1-12.91,6.31L85.25,176H40a16,16,0,0,1-16-16V96A16,16,0,0,1,40,80H85.25l69.84-54.31A8,8,0,0,1,168,32Zm32,64a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V104A8,8,0,0,0,200,96Zm32-16a8,8,0,0,0-8,8v80a8,8,0,0,0,16,0V88A8,8,0,0,0,232,80Z"></path></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="#a9b4cc" viewBox="0 0 256 256" aria-label="Voice digit"><path d="M168,32V224a8,8,0,0,1-12.91,6.31L85.25,176H40a16,16,0,0,1-16-16V96A16,16,0,0,1,40,80H85.25l69.84-54.31A8,8,0,0,1,168,32Zm32,64a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V104A8,8,0,0,0,200,96Z"></path></svg>
      {/if}
    {:else if gameState.currentDigit !== null}
      <div class="relative">
        <span role="status" aria-live="assertive" aria-atomic="true" aria-label={`Current digit ${gameState.currentDigit}`} class="text-4xl font-medium text-[#ffffff]">{gameState.currentDigit}</span>
        <svg class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="32" fill="none" stroke="#1a1f2e" stroke-width="4" />
          <circle
            cx="36" cy="36" r="32"
            fill="none"
            stroke="#10b981"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="201"
            stroke-dashoffset={ringProgress}
            style="transform: rotate(-90deg); transform-origin: center;"
          />
        </svg>
      </div>
    {/if}
  </div>
{/snippet}

<div class="active-session relative flex grow select-none flex-col items-center justify-end gap-12 py-6 md:flex-row md:grow-0 md:justify-evenly md:gap-24">
  <!-- Streak bar + label -->
  <div class="relative flex flex-col items-center">
    <div class="flex md:flex-col w-[200px] md:w-auto md:h-[200px] overflow-hidden rounded-full gap-3">
      <div class="grow w-[10px] h-[10px] {gameState.correctStreak >= 1 ? 'streak-bar bg-[#4fe84f]' : gameState.wrongStreak >= 1 ? 'streak-bar bg-[#e85c4f]' : 'bg-[#10b981]'}"></div>
      <div class="w-[10px] h-[10px] {gameState.correctStreak >= 2 ? 'streak-bar bg-[#4fe84f]' : gameState.wrongStreak >= 2 ? 'streak-bar bg-[#e85c4f]' : 'bg-[#0f121a]'}"></div>
      <div class="w-[10px] h-[10px] {gameState.correctStreak >= 3 ? 'streak-bar bg-[#4fe84f]' : gameState.wrongStreak >= 3 ? 'streak-bar bg-[#e85c4f]' : 'bg-[#0f121a]'}"></div>
      <div class="w-[10px] h-[10px] rounded-r-full md:rounded-r-none md:rounded-b-full {gameState.correctStreak === 4 ? 'streak-bar bg-[#4fe84f]' : gameState.wrongStreak >= 4 ? 'streak-bar bg-[#e85c4f]' : 'bg-[#0f121a]'}"></div>
    </div>
    <span class="absolute top-full mt-12 hidden whitespace-nowrap text-xs font-medium text-[#a9b4cc] md:inline">
      <span class="font-extrabold">{gameState.correctStreak}</span> STREAKS
    </span>
  </div>

  <!-- Center column -->
  <div class="center-column flex flex-col justify-end gap-6 md:grow">
    <!-- Controls row: interval + mode status + pause/resume -->
    <div class="flex flex-col items-center justify-center gap-6 md:flex-row md:gap-0">
      <div class="flex grow items-center justify-center gap-3 md:justify-end">
        {#if gameState.settings.displayMode === 'standard'}
          <span data-interval-readout class="text-sm text-[#a9b4cc]"><span class="font-extrabold">{(gameState.currentInterval / 1000).toFixed(2)}</span> SECONDS</span>
          {#if gameState.settings.intervalMode === 'fixed'}
            <span class="rounded-full bg-[#121621] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#10b981]">Fixed</span>
          {/if}
        {/if}
        {#if gameState.settings.taskMode === 'variable'}
          <span class="rounded-full border border-[#10b981] px-3 py-1 text-xs font-semibold text-[#10b981]">{gameState.nBack}-BACK</span>
        {/if}

        {#if isPaused}
          <span role="status" class="rounded-full border border-[#10b981] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#10b981]">Paused</span>
          <button aria-label="Resume session" title="Resume" class="flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-full bg-[#0f121a] hover:bg-[#121621]" onclick={resumeSession}>
            <svg viewBox="0 0 24 24" height="20" width="20" aria-hidden="true"><path fill="#10b981" d="M7 4.8v14.4c0 1.45 1.6 2.32 2.82 1.53l10.7-6.87a2.2 2.2 0 0 0 0-3.72L9.82 3.27A1.82 1.82 0 0 0 7 4.8Z"></path></svg>
          </button>
        {:else}
          <button aria-label="Pause session" title="Pause" class="flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-full bg-[#0f121a] hover:bg-[#121621]" onclick={() => engine.pause()}>
            <svg viewBox="0 0 24 24" height="20" width="20" aria-hidden="true"><rect x="4" y="3" width="6" height="18" rx="2" fill="#a9b4cc"></rect><rect x="14" y="3" width="6" height="18" rx="2" fill="#10b981"></rect></svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Keypad area -->
    {#if gameState.settings.useKeypad}
      <div
        data-keypad-layout={gameState.settings.keypadLayout}
        role="group"
        aria-label="Answer keypad"
        class="flex justify-center"
        style="touch-action: none;"
        ontouchmove={handleKeypadTouchMove}
        ontouchend={handleKeypadTouchEnd}
        ontouchcancel={handleKeypadTouchEnd}
      >
        {#if gameState.settings.keypadLayout === 'sequential'}
          <div class="sequential-keypad flex flex-col items-center gap-3">
            {@render digitDisplay(true)}
            <div class="grid grid-cols-6 gap-2 md:gap-3">
              {#each answerValues as answer (answer)}
                <button
                  data-answer={answer}
                  aria-label={`Answer ${answer}`}
                  class="sequential-answer flex h-12 w-12 select-none items-center justify-center rounded-xl border-2 md:h-[72px] md:w-[72px] md:rounded-2xl {selectedButton === answer ? 'border-[#000000] bg-[#000000]' : 'cursor-pointer border-[#0f121a] hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}"
                  ontouchstart={(e) => handleKeypadTouchStart(answer, e)}
                  onclick={(e) => handleKeypadClick(answer, e)}
                >
                  <span class="select-none text-xl font-extrabold text-[#10b981] md:text-3xl">{answer}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="classic-keypad flex flex-col gap-3 overflow-hidden">
          <!-- Row 1: digit/speaker + 2,3 | 4,5,6 -->
          <div class="flex flex-col md:flex-row gap-3">
            <div class="flex gap-3">
              {@render digitDisplay()}
              <button data-answer="2" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 2 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(2, e)} onclick={(e) => handleKeypadClick(2, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">2</span></button>
              <button data-answer="3" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 3 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(3, e)} onclick={(e) => handleKeypadClick(3, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">3</span></button>
            </div>
            <div class="flex gap-3">
              <button data-answer="4" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 4 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(4, e)} onclick={(e) => handleKeypadClick(4, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">4</span></button>
              <button data-answer="5" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 5 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(5, e)} onclick={(e) => handleKeypadClick(5, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">5</span></button>
              <button data-answer="6" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 6 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(6, e)} onclick={(e) => handleKeypadClick(6, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">6</span></button>
            </div>
          </div>
          <!-- Row 2: 7,8,9 | 10,11,12 -->
          <div class="flex flex-col md:flex-row gap-3">
            <div class="flex gap-3">
              <button data-answer="7" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 7 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(7, e)} onclick={(e) => handleKeypadClick(7, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">7</span></button>
              <button data-answer="8" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 8 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(8, e)} onclick={(e) => handleKeypadClick(8, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">8</span></button>
              <button data-answer="9" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 9 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(9, e)} onclick={(e) => handleKeypadClick(9, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">9</span></button>
            </div>
            <div class="flex gap-3">
              <button data-answer="10" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 10 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(10, e)} onclick={(e) => handleKeypadClick(10, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">10</span></button>
              <button data-answer="11" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 11 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(11, e)} onclick={(e) => handleKeypadClick(11, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">11</span></button>
              <button data-answer="12" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 12 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(12, e)} onclick={(e) => handleKeypadClick(12, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">12</span></button>
            </div>
          </div>
          <!-- Row 3: 13,14,15 | 16,17,18 -->
          <div class="flex flex-col md:flex-row gap-3">
            <div class="flex gap-3">
              <button data-answer="13" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 13 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(13, e)} onclick={(e) => handleKeypadClick(13, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">13</span></button>
              <button data-answer="14" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 14 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(14, e)} onclick={(e) => handleKeypadClick(14, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">14</span></button>
              <button data-answer="15" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 15 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(15, e)} onclick={(e) => handleKeypadClick(15, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">15</span></button>
            </div>
            <div class="flex gap-3">
              <button data-answer="16" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 16 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(16, e)} onclick={(e) => handleKeypadClick(16, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">16</span></button>
              <button data-answer="17" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 17 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(17, e)} onclick={(e) => handleKeypadClick(17, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">17</span></button>
              <button data-answer="18" class="classic-answer flex select-none items-center justify-center py-6 w-[88px] border-2 border-[#0f121a] rounded-2xl {selectedButton === 18 ? 'bg-[#000000] border-[#000000]' : 'cursor-pointer hover:bg-[#0f121a] active:border-[#000000] active:bg-[#000000]'}" ontouchstart={(e) => handleKeypadTouchStart(18, e)} onclick={(e) => handleKeypadClick(18, e)}><span class="select-none text-[#10b981] text-4xl font-extrabold">18</span></button>
            </div>
          </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Keyboard input mode -->
      <div class="flex max-w-screen flex-col px-6 md:p-0">
        <input
          aria-label="Answer input"
          use:keepAboveKeyboard
          type="text"
          inputmode="numeric"
          tabindex="0"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          style="-webkit-user-select:text; user-select:text;"
          class="pointer-events-auto select-text caret-[#10b981] md:h-[288px] md:w-[588px] rounded-4xl bg-[#000000] py-6 text-center text-4xl font-extrabold text-[#10b981] placeholder:text-base sm:placeholder:text-xl [appearance:textfield] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090a0d] md:py-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-disabled={isPaused || !gameState.canAnswer}
          placeholder={statusText}
          value={keyValue}
          onbeforeinput={handleBeforeInput}
          oninput={handleInput}
          onkeydown={handleKeydown}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  @media (max-width: 767px) and (max-height: 650px) {
    .active-session {
      justify-content: flex-start;
      gap: 0.75rem;
      padding-block: 0.5rem 1rem;
    }

    .center-column {
      gap: 0.5rem;
    }

    .classic-keypad,
    .classic-keypad :global(.gap-3) {
      gap: 0.25rem;
    }

    .classic-keypad :global([data-digit-display]),
    .classic-answer {
      height: 2.75rem;
      width: 5.5rem;
      padding-block: 0;
      border-radius: 0.75rem;
    }

    .classic-answer :global(span) {
      font-size: 1.5rem;
    }

    .classic-keypad :global([data-digit-display] svg) {
      height: 2.75rem;
      width: 2.75rem;
    }
  }

  @media (max-width: 350px) {
    .sequential-keypad :global(.grid) {
      gap: 0.25rem;
    }

    .sequential-answer {
      height: 2.75rem;
      width: 2.75rem;
    }
  }
</style>
