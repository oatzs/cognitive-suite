<script lang="ts">
  import type { Engine } from './engine';
  import { onMount } from 'svelte';

  let { engine }: { engine: Engine } = $props();
  let dialogEl: HTMLElement;
  let continueButton: HTMLButtonElement;

  onMount(() => {
    // SvelteKit may restore page focus after child onMount callbacks during
    // hydration. Focus on the first frame so the modal reliably wins that race.
    const frame = requestAnimationFrame(() => continueButton?.focus());
    return () => cancelAnimationFrame(frame);
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      event.preventDefault();
      continueButton.focus();
    }
  }

  function continueToSetup() {
    engine.completeOnboarding();
    queueMicrotask(() => {
      [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Start session"]')]
        .find((button) => button.getClientRects().length > 0)
        ?.focus();
    });
  }
</script>

<div class="fixed inset-0 z-20 overflow-y-auto bg-black/75 p-4 md:flex md:items-center md:justify-center md:p-6">
  <div class="flex min-h-full flex-col justify-center md:min-h-0 md:w-full md:max-w-5xl">
    <div
      bind:this={dialogEl}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      tabindex="-1"
      class="flex flex-col gap-6 rounded-[28px] bg-[#090a0d] p-5 outline-none sm:p-6 md:gap-8 md:p-8"
      onkeydown={handleKeydown}
    >
      <h1 id="onboarding-title" class="text-2xl leading-[1.2] text-white sm:text-3xl md:text-4xl">
        This is an exercise that targets cognitive control, the brain's ability to regulate attention, impulses, and emotions.
      </h1>

      <p class="text-2xl leading-[1.2] text-white sm:text-3xl md:text-4xl">
        Each time, a number (1-9) will be displayed or spoken out loud. Add that number to the one before it and say the sum (2-18). If the first number is 7 and the next is 3, you answer 10. If the number shown after 3 is 2, you answer 5.
      </p>

      <div class="flex justify-stretch md:justify-end">
        <!-- svelte-ignore a11y_autofocus: required initial focus inside this modal -->
        <button
          autofocus
          bind:this={continueButton}
          class="flex min-h-11 w-full cursor-pointer items-center justify-center gap-6 rounded-full border bg-[#10b981] px-8 py-3 hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:w-auto"
          onclick={continueToSetup}
        >
          <span class="font-semibold text-[#0f121a]">Continue</span>
        </button>
      </div>
    </div>
  </div>
</div>
