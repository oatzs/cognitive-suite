<script>
  import { onMount, tick } from 'svelte'
  import { Check, ChevronDown } from '@lucide/svelte'
  import { DEFAULT_THRESHOLDS, METRICS, getMetricExplanation } from './stats'

  export let options = []
  export let value
  export let thresholds = DEFAULT_THRESHOLDS
  export let onChange = () => {}
  export let labelledby = undefined

  let root
  let trigger
  let open = false
  let preview = value

  $: if (!open) preview = value
  $: if (!options.includes(preview)) preview = options[0]
  $: selectedMetric = METRICS[value] ?? METRICS[options[0]]
  $: previewMetric = METRICS[preview] ?? selectedMetric
  $: previewExplanation = getMetricExplanation(preview, thresholds)
  $: triggerLabelledby = [labelledby, 'measure-picker-current'].filter(Boolean).join(' ')

  const optionExplanation = (key) => getMetricExplanation(key, thresholds)

  const focusSelectedOption = async () => {
    await tick()
    const selected = root?.querySelector(`[data-measure-option="${value}"]`)
    const first = root?.querySelector('[data-measure-option]')
    ;(selected || first)?.focus()
  }

  const toggle = () => {
    open = !open
    preview = value
  }

  const selectMeasure = (key) => {
    onChange(key)
    open = false
    trigger?.focus()
  }

  const handleTriggerKeydown = (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      open = false
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    open = true
    preview = value
    focusSelectedOption()
  }

  const handlePickerKeydown = (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      open = false
      trigger?.focus()
      return
    }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return

    const buttons = [...root.querySelectorAll('[data-measure-option]')]
    const currentIndex = buttons.indexOf(document.activeElement)
    if (currentIndex < 0) return
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + buttons.length) % buttons.length
    buttons[nextIndex].focus()
  }

  onMount(() => {
    const closeOnOutsidePointer = (event) => {
      if (open && !root?.contains(event.target)) open = false
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  })
</script>

<div class="relative" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="btn btn-sm min-w-52 justify-between border-base-300 bg-base-100 px-3 font-normal hover:bg-base-200"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="measure-options"
    aria-labelledby={triggerLabelledby}
    data-measure-trigger
    on:click={toggle}
    on:keydown={handleTriggerKeydown}
  >
    <span id="measure-picker-current">{selectedMetric?.label ?? 'Choose measure'}</span>
    <ChevronDown size={15} class="transition-transform {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <div
      class="absolute right-0 top-full z-40 mt-1 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-base-300 bg-base-100 shadow-xl"
      data-measure-menu
    >
      <p class="px-3 pb-1 pt-2 text-[0.68rem] opacity-55">Hover or focus a measure to see how it works.</p>
      <div
        id="measure-options"
        class="max-h-72 overflow-y-auto p-1"
        role="listbox"
        tabindex="-1"
        aria-labelledby={labelledby}
        on:keydown={handlePickerKeydown}
      >
        {#each options as key (key)}
          <button
            type="button"
            role="option"
            aria-selected={value === key}
            class="group flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left hover:bg-base-200 focus:bg-base-200 focus:outline-none"
            data-measure-option={key}
            on:mouseenter={() => preview = key}
            on:focus={() => preview = key}
            on:click={() => selectMeasure(key)}
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{METRICS[key].label}</span>
              <span class="mt-0.5 block text-xs leading-snug opacity-60">{optionExplanation(key).summary}</span>
            </span>
            <span class="mt-0.5 w-4 shrink-0" aria-hidden="true">
              {#if value === key}<Check size={15} />{/if}
            </span>
          </button>
        {/each}
      </div>

      <div class="border-t border-base-300 bg-base-200/65 px-3 py-3" data-measure-details aria-live="polite">
        <strong class="block text-xs font-semibold">{previewMetric?.label}</strong>
        <p class="mt-1 text-xs leading-relaxed opacity-75">{previewExplanation.detail ?? previewExplanation.summary}</p>
        {#if previewExplanation.formula}
          <code class="mt-2 block whitespace-normal rounded-sm bg-base-100 px-2 py-1.5 text-[0.72rem] leading-relaxed">{previewExplanation.formula}</code>
        {/if}
        {#if previewExplanation.examples?.length}
          <div class="mt-2 text-[0.7rem] opacity-70">
            <span class="mb-1 block">{previewExplanation.examplesLabel ?? 'Examples:'}</span>
            <div class="flex flex-wrap gap-x-3 gap-y-1">
              {#each previewExplanation.examples as example (example)}
                <span>{example}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
