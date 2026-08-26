<script>
  import { settings } from '../stores/settingsStore'
  import { isPlaying } from '../stores/gameRunningStore'
  import { Triangle } from '@lucide/svelte'
  import { CircleHelp } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  $: mode = $settings.mode

  const formatMode = (mode) => {
    return (mode === 'custom' ? 'custom a' : (mode === 'customB' ? 'custom b' : mode)).toUpperCase()
  }
  let showModeDropdown = false
  let showTallyExplanation = false

  const darkColors = new Map([
    ['quad', 'bg-rose-900'],
    ['dual', 'bg-cyan-800'],
    ['custom', 'bg-orange-800'],
    ['customB', 'bg-yellow-700'],
    ['tally', 'bg-indigo-800'],
    ['vtally', 'bg-emerald-800'],
    ['atally', 'bg-purple-800'],
  ])

  const lightColors = new Map([
    ['quad', 'bg-rose-400'],
    ['dual', 'bg-cyan-400'],
    ['custom', 'bg-orange-400'],
    ['customB', 'bg-yellow-400'],
    ['tally', 'bg-indigo-400'],
    ['vtally', 'bg-emerald-400'],
    ['atally', 'bg-purple-400'],
  ])

  const allModes = [...lightColors.keys()]

  $: modes = [...$settings.enabledModes].sort((a, b) => allModes.indexOf(a) - allModes.indexOf(b))
  $: displayModes = new Map(
    allModes.map(m => [m, modes.includes(m)]),
  )

  $: bg = $settings.theme === 'light' ? lightColors.get(mode) : darkColors.get(mode)

  const nextMode = () => {
    if ($isPlaying || modes.length <= 1) return
    let nextIndex = modes.indexOf(mode) + 1
    if (nextIndex > modes.length - 1) {
      nextIndex = 0
    }
    settings.update('mode', modes[nextIndex])
  }

  const prevMode = () => {
    if ($isPlaying || modes.length <= 1) return
    let prevIndex = modes.indexOf(mode) - 1
    if (prevIndex < 0) {
      prevIndex = modes.length - 1
    }
    settings.update('mode', modes[prevIndex])
  }

  const handleKey = (event) => {
    if ($isPlaying) return
    switch (event.code) {
      case 'PageUp':
        prevMode()
        break
      case 'PageDown':
        nextMode()
        break
    }
  }

  const setMode = (nextMode) => {
    if ($isPlaying) return
    settings.update('mode', nextMode)
    showModeDropdown = false
  }

  const toggleEnabledMode = (nextMode) => {
    if ($isPlaying) return
    settings.update('enabledModes', $settings.enabledModes.includes(nextMode)
      ? $settings.enabledModes.filter((enabledMode) => enabledMode !== nextMode)
      : [...$settings.enabledModes, nextMode])
  }

  $: if ($isPlaying) showModeDropdown = false

  const handleClickOutside = (event) => {
    if (!event.target.closest('#mode-dropdown')) {
      showModeDropdown = false
    }
  }

  document.addEventListener('keydown', handleKey)
  document.addEventListener('click', handleClickOutside)

  onDestroy(async () => {
    document.removeEventListener('keydown', handleKey)
    document.removeEventListener('click', handleClickOutside)
  })
</script>

<div class="flex bg- items-center justify-around relative">
  <button on:click={prevMode} disabled={$isPlaying} class="btn rounded border-0 px-2 -rotate-90" aria-label="Previous mode"><Triangle class="fill-base-100" /></button>
  <div class="flex-grow mx-2 relative">
    <button type="button" disabled={$isPlaying} class="w-full p-1 text-2xl select-none transition-colors duration-100 cursor-pointer {bg}" on:click|stopPropagation={() => showModeDropdown = !showModeDropdown}>
      {formatMode(mode)}
    </button>
    {#if mode.includes('tally')}
      <button type="button" class="absolute right-6 top-1/2 -translate-y-1/2" aria-label="Explain tally mode" on:click|stopPropagation={() => showTallyExplanation = true}>
        <CircleHelp class="h-5 dark:hover:text-cyan-300 light:hover:text-cyan-100" />
      </button>
    {/if}
  </div>
  {#if showModeDropdown}
  <div id='mode-dropdown' class="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-60 rounded shadow-lg z-10 grid grid-cols-10 items-center justify-center place-items-center { $settings.theme === 'light' ? 'bg-base-200 text-base-content' : 'bg-base-300 text-base-content' }">
  {#each Array.from(displayModes) as [m, enabled] (m)}
    <input class="duration-0 checkbox m-0 w-10 h-10 col-span-2" type="checkbox" id={m} checked={enabled} disabled={$isPlaying} on:click={() => toggleEnabledMode(m)} />
    <div class="relative col-span-8 w-full">
      <button type="button" disabled={$isPlaying} on:click|stopPropagation={() => setMode(m)} class="p-2 w-full text-center text-xl select-none transition-colors duration-100 cursor-pointer { $settings.theme === 'light' ? lightColors.get(m) : darkColors.get(m) }">
        {formatMode(m)}
      </button>
      {#if m.includes('tally')}
        <button type="button" class="absolute right-1 top-1/2 -translate-y-1/2" aria-label={`Explain ${formatMode(m)} mode`} on:click|stopPropagation={() => showTallyExplanation = true}>
          <CircleHelp class="dark:hover:text-cyan-300 light:hover:text-cyan-100" />
        </button>
      {/if}
    </div>
  {/each}
  </div>
  {/if}
  <button on:click={nextMode} disabled={$isPlaying} class="btn rounded border-0 px-2 rotate-90" aria-label="Next mode"><Triangle class="fill-base-100" /></button>
</div>

{#if showTallyExplanation}
<div class="fixed inset-0 bg-opacity-50 flex items-center justify-center z-20" role="dialog" aria-modal="true" aria-labelledby="tally-explanation-title">
  <button type="button" class="absolute inset-0 cursor-default" aria-label="Close tally explanation" on:click={() => showTallyExplanation = false}></button>
  <div class="relative bg-base-200 text-base-content p-6 rounded shadow-lg max-w-lg mx-4">
    <h2 id="tally-explanation-title" class="text-xl font-bold mb-4">Tally Modes</h2>
    <div class="prose text-sm flex flex-col gap-2 ml-4">
      <p>Tally mode changes how matches are handled. Instead of pressing a hotkey for every stimulus that matches during a trial, you enter the <em>count</em> of how many stimuli matched.</p>
      <p>Because only one input is needed per trial, there’s no fixed trial timer. The game advances when you enter a number, and will be as fast as you're able to keep up.</p>
      {#if mode === 'atally'}
      <p>Audio tally plays one sound per trial, so the count is always 0 or 1: press 1 if it matches the sound from N trials back, 0 if it doesn't.</p>
      {/if}
    </div>
    <div class="flex justify-end w-full"><button class="btn btn-primary mt-4" on:click={() => showTallyExplanation = false}>Close</button></div>
  </div>
</div>
{/if}
