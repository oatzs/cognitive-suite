<script>
import Drawer from "./lib/Drawer.svelte"
import DefaultGame from "./lib/DefaultGame.svelte"
import TallyGame from "./lib/TallyGame.svelte"
import ErrorDisplay from "./lib/ErrorDisplay.svelte"
import SuiteNav from "./lib/SuiteNav.svelte"
import DocctApp from "./lib/docct/DocctApp.svelte"
import StatisticsPage from "./lib/statistics/StatisticsPage.svelte"
import { settings } from "./stores/settingsStore"
import { setMobile } from "./stores/mobileStore"
import { isPlaying } from "./stores/gameRunningStore"
import { addDocctSession } from "./lib/gamedb"
import { error } from "./stores/errorStore"
import { onMount, onDestroy } from "svelte"

$: theme = $settings.theme === 'dark' ? 'black' : 'bumblebee'
let view = 'quad-box'
let docctActive = false
$: navigationLocked = $isPlaying || docctActive
$: pageTitle = view === 'docct' ? 'DocCT' : view === 'statistics' ? 'Statistics' : 'Quad Box'

const navigate = (nextView) => {
  if (navigationLocked && nextView !== view) return
  view = nextView
}

const persistDocctSession = (session) => {
  addDocctSession(session).catch((reason) => {
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
          {#if $settings.mode === 'tally' || $settings.mode === 'vtally' || $settings.mode === 'atally'}
            <TallyGame />
          {:else}
            <DefaultGame />
          {/if}
        </Drawer>
      </main>
    {:else if view === 'docct'}
      <DocctApp onActiveChange={(active) => docctActive = active} onSessionComplete={persistDocctSession} />
    {:else}
      <StatisticsPage />
    {/if}
  </div>
</div>

<style>
</style>
