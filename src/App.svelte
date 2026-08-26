<script>
import Drawer from "./lib/Drawer.svelte"
import DefaultGame from "./lib/DefaultGame.svelte"
import TallyGame from "./lib/TallyGame.svelte"
import ErrorDisplay from "./lib/ErrorDisplay.svelte"
import SuiteNav from "./lib/SuiteNav.svelte"
import { settings } from "./stores/settingsStore"
import { setMobile } from "./stores/mobileStore"
import { isPlaying } from "./stores/gameRunningStore"
import { addDocctSession } from "./lib/gamedb"
import { error } from "./stores/errorStore"
import { onMount, onDestroy } from "svelte"

$: theme = $settings.theme === 'dark' ? 'black' : 'bumblebee'
let view = 'quad-box'
let docctActive = false
let renderedQuadMode = $settings.mode
let optionalViewPromise = null
const optionalViews = new Map()
$: navigationLocked = $isPlaying || docctActive
$: if (!$isPlaying) renderedQuadMode = $settings.mode
$: pageTitle = view === 'docct' ? 'DocCT' : view === 'statistics' ? 'Statistics' : 'Quad Box'

const navigate = (nextView) => {
  if (navigationLocked && nextView !== view) return
  view = nextView
  if (nextView === 'docct' || nextView === 'statistics') {
    if (!optionalViews.has(nextView)) {
      optionalViews.set(nextView, nextView === 'docct'
        ? import('./lib/docct/DocctApp.svelte')
        : import('./lib/statistics/StatisticsPage.svelte'))
    }
    optionalViewPromise = optionalViews.get(nextView)
  }
}

const persistDocctSession = (session) => {
  return addDocctSession(session).catch((reason) => {
    error.set({
      message: reason?.message || 'Could not save the DocCT session',
      stacktrace: reason?.stack || reason,
    })
  })
}

onMount(() => {
  setMobile()
})
const onResize = () => setMobile()
const onOrientationChange = () => setMobile()

window.addEventListener('resize', onResize)
window.addEventListener('orientationchange', onOrientationChange)

const handleTouchStart = (event) => {
  for (const touch of event.changedTouches) {
    const target = document.elementFromPoint(touch.clientX, touch.clientY)
    if (target?.classList.contains('stimulus-button')) {
      target.click()
    }
  }
}
document.addEventListener('touchstart', handleTouchStart)
const handleTouchMove = (event) => {
  for (const touch of event.touches) {
    const target = document.elementFromPoint(touch.clientX, touch.clientY)
    if (target?.classList.contains('stimulus-button')) {
      target.click()
    }
  }
}
document.addEventListener('touchmove', handleTouchMove)

onDestroy(async () => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onOrientationChange)
  document.removeEventListener('touchstart', handleTouchStart)
  document.removeEventListener('touchmove', handleTouchMove)
})

</script>

<svelte:head>
  <title>{pageTitle} · Cognitive Suite</title>
</svelte:head>

<div data-theme={theme} class="flex h-svh min-h-0 flex-col overflow-hidden {$settings.theme}">
  <ErrorDisplay />
  <SuiteNav active={view} locked={navigationLocked} onNavigate={navigate} />
  <div class="min-h-0 flex-1 overflow-hidden">
    {#if view === 'quad-box'}
      <main class="h-full">
        <Drawer>
          {#if renderedQuadMode === 'tally' || renderedQuadMode === 'vtally' || renderedQuadMode === 'atally'}
            <TallyGame />
          {:else}
            <DefaultGame />
          {/if}
        </Drawer>
      </main>
    {:else if view === 'docct'}
      {#await optionalViewPromise}
        <div class="flex h-full items-center justify-center"><span class="loading loading-spinner loading-lg"></span></div>
      {:then module}
        <svelte:component this={module.default} onActiveChange={(active) => docctActive = active} onSessionComplete={persistDocctSession} />
      {:catch reason}
        <div class="p-6 text-error">{reason?.message || 'Could not load DocCT'}</div>
      {/await}
    {:else}
      {#await optionalViewPromise}
        <div class="flex h-full items-center justify-center"><span class="loading loading-spinner loading-lg"></span></div>
      {:then module}
        <svelte:component this={module.default} />
      {:catch reason}
        <div class="p-6 text-error">{reason?.message || 'Could not load statistics'}</div>
      {/await}
    {/if}
  </div>
</div>

<style>
</style>
