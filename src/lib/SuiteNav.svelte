<script>
  import { Box, ChartNoAxesCombined, Sigma } from '@lucide/svelte'

  export let active = 'quad-box'
  export let locked = false
  export let onNavigate = () => {}

  const views = [
    { id: 'quad-box', label: 'Quad Box', icon: Box },
    { id: 'docct', label: 'DocCT', icon: Sigma },
    { id: 'statistics', label: 'Statistics', icon: ChartNoAxesCombined },
  ]
</script>

<header class="suite-nav h-12 shrink-0 border-b border-base-300 bg-base-100 text-base-content">
  <div class="flex h-full min-w-0 items-center gap-2 px-2 sm:px-3">
    <div class="flex min-w-8 items-center gap-2 pr-1 sm:min-w-36">
      <img src="./quadbox.svg" alt="" class="h-7 w-7 shrink-0" />
      <span class="hidden truncate text-sm font-semibold sm:block">Cognitive Suite</span>
    </div>

    <nav aria-label="Training views" class="flex h-full min-w-0 flex-1 items-center justify-center gap-1">
      {#each views as view (view.id)}
        <button
          type="button"
          class="suite-nav-item flex h-9 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium sm:px-4 sm:text-sm"
          class:suite-nav-item-active={active === view.id}
          disabled={locked && active !== view.id}
          aria-current={active === view.id ? 'page' : undefined}
          title={locked && active !== view.id ? 'Finish the current session before switching views' : view.label}
          on:click={() => onNavigate(view.id)}
        >
          <svelte:component this={view.icon} size={17} strokeWidth={1.8} />
          <span class="truncate">{view.label}</span>
        </button>
      {/each}
    </nav>

    <div class="hidden min-w-36 sm:block"></div>
  </div>
</header>

<style>
  .suite-nav-item {
    color: color-mix(in oklab, currentColor 70%, transparent);
  }

  .suite-nav-item:hover:not(:disabled) {
    background: color-mix(in oklab, currentColor 9%, transparent);
    color: currentColor;
  }

  .suite-nav-item-active {
    background: color-mix(in oklab, #16a34a 18%, transparent);
    color: currentColor;
    box-shadow: inset 0 -2px #16a34a;
  }

  .suite-nav-item:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }
</style>
