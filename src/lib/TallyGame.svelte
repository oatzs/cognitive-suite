<script>
import Grid from "./Grid.svelte"
import NumberKey from "./NumberKey.svelte"
import VisualCrank from "./VisualCrank.svelte"
import AudioIndicator from "./AudioIndicator.svelte"
import { generateTallyGame } from "./nback"
import { onDestroy } from "svelte"
import { audioPlayer } from "./audioPlayer"
import { settings } from "../stores/settingsStore"
import { tallyFeedback } from "../stores/tallyFeedbackStore"
import { analytics } from "../stores/analyticsStore"
import { mobile } from "../stores/mobileStore"
import { isPlaying, gameDisplayInfo } from "../stores/gameRunningStore"
import { applyTallyCount, createSessionController } from "./sessionController"

let trials
let currentTrial
let nextTrial
let trialsIndex
let scoresheet = []
let presentation
let gameMeta = {}
let sessionSettings = {}
let gameId = 0
let controller

const resetRuntimeData = () => {
  gameDisplayInfo.set({})
  trials = []
  currentTrial = {}
  nextTrial = {}
  trialsIndex = 0
  scoresheet = []
  presentation = { highlight: false, flash: false }
  gameMeta = {}
  sessionSettings = {}
  gameId++
}

resetRuntimeData()

const applyNewGame = (game, isPlaying) => {
  if (!isPlaying) {
    gameMeta = { ...game.meta }
    gameDisplayInfo.set(gameMeta)
  }
}

$: isMobile = $mobile
$: gameSettings = $settings.gameSettings[$settings.mode]
$: game = generateTallyGame(gameSettings, $settings, gameId)
$: applyNewGame(game, $isPlaying)
$: trialDisplay = $settings.feedback === 'show' ? ($isPlaying ? trials.length : game.trials.length) - trialsIndex : ''
$: keys = gameDisplayInfo.getNumberKeys($gameDisplayInfo)

const flashCube = async () => {
  presentation.flash = true
  try {
    await delay(350)
  } catch {
    // ignore
  }
  presentation.flash = false
}

const delay = (ms) => controller.delay(ms)

const selectTrial = (i) => {
  controller.cancelPending()
  if (i >= trials.length) {
    endGame('completed')
    return
  }
  flashCube()
  currentTrial = trials[i]
  trialsIndex = i
  if (i < trials.length - 1) {
    nextTrial = trials[i+1]
  }
  if (currentTrial.audio) {
    audioPlayer.play(currentTrial.audio)
  }
}

const startGame = async () => {
  if (!controller.begin()) return
  sessionSettings = structuredClone($settings)
  gameMeta = { ...structuredClone(game.meta), start: Date.now(), rotationSpeed: sessionSettings.rotationSpeed }
  gameDisplayInfo.set(gameMeta)
  audioPlayer.cacheAudioSource(sessionSettings.gameSettings[sessionSettings.mode].audioSource)
  trials = structuredClone(game.trials)
  scoresheet = new Array(trials.length).fill().map(() => ({}))
  presentation.highlight = true
  selectTrial(0)
}

const finalizeGame = async (status) => {
  if (status === 'completed') {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const gameInfoRecord = { ...gameMeta, timestamp: Date.now() }
  if (trialsIndex > gameInfoRecord.nBack) {
    await analytics.scoreTallyTrials(gameInfoRecord, status === 'completed' ? scoresheet : scoresheet.slice(0, trialsIndex), status)
  } else {
    console.debug('Game not recorded', trialsIndex, gameInfoRecord, scoresheet, trials)
  }
}

const cleanupGame = () => {
  resetRuntimeData()
  tallyFeedback.reset()
}

controller = createSessionController({
  setRunning: (running) => isPlaying.set(running),
  finalize: finalizeGame,
  cleanup: cleanupGame,
})

const endGame = (status) => controller.finish(status)

const toggleGame = () => {
  if ($isPlaying) {
    endGame('cancelled')
  } else {
    startGame()
  }
}

const handleCount = (count) => {
  if (controller.phase() !== 'active') return
  const result = applyTallyCount({
    scoresheet,
    trialIndex: trialsIndex,
    nBack: gameMeta.nBack,
    count,
    matchCount: currentTrial.matches.length,
  })
  if (result.nextTrialIndex === trialsIndex) return
  if (result.warmup) {
    selectTrial(result.nextTrialIndex)
    return
  }

  tallyFeedback.reset()
  if (scoresheet[trialsIndex].success) {
    tallyFeedback.apply({ [count]: 'success' })
  } else {
    tallyFeedback.apply({ [count]: 'failure', [currentTrial.matches.length]: 'success' })
  }
  selectTrial(result.nextTrialIndex)
}

const handleKey = (event) => {
  switch (event.code) {
    case 'Space':
      startGame()
      break
    case 'Escape':
      endGame('cancelled')
      break
  }

  for (const key of keys) {
    if (key.toString() === event.key) {
      handleCount(key)
    }
  }
}

const suppressKey = (event) => {
  event.preventDefault()
}

document.addEventListener('keydown', handleKey)

onDestroy(() => {
  document.removeEventListener('keydown', handleKey)
  void endGame('cancelled')
})

</script>

{#if $gameDisplayInfo.rules === 'vtally'}
<VisualCrank trial={currentTrial} {nextTrial} trialIndex={trialsIndex} />
{:else if $gameDisplayInfo.rules === 'atally'}
<AudioIndicator {presentation} />
{:else}
<Grid trial={currentTrial} {nextTrial} {presentation} />
{/if}
<div class="stretch grid grid-cols-[1fr_3fr_3fr_1fr] "
  class:grid-rows-[10fr_70fr_8fr]={!isMobile}
  class:grid-rows-[8fr_60fr_15fr]={isMobile}>
{#if isMobile}
  <div class="w-full h-full flex items-center justify-center text-4xl row-start-1 col-start-1 select-none opacity-30 p-8 pl-10">{trialDisplay}</div>
  <div class="w-full h-full flex items-center justify-center row-start-1 col-start-4 col-span-1 p-8">
    <button class="game-button text-4xl p-8"
      on:click={toggleGame}
      on:keydown={suppressKey}
      on:keypress={suppressKey}
      on:keyup={suppressKey}
      tabindex="-1"
    >{#if $isPlaying} Stop {:else} Play {/if}</button>
  </div>
{:else}
  <div class="w-full h-full flex items-center justify-center text-6xl row-start-1 col-start-1 select-none opacity-30">{trialDisplay}</div>
  <div class="w-full h-full flex items-center justify-between row-start-1 col-start-4 col-span-1 px-2">
    <div></div>
    <button class="game-button text-5xl px-12 py-10 max-w-[90%] mr-4"
      on:click={toggleGame}
      on:keydown={suppressKey}
      on:keypress={suppressKey}
      on:keyup={suppressKey}
      tabindex="-1"
    >{#if $isPlaying} Stop {:else} Play {/if}</button>
  </div>
{/if}
  <div class="w-full h-full flex gap-1 items-center justify-around py-1 row-start-3"
    class:col-start-2={!isMobile}
    class:col-span-2={!isMobile}
    class:coll-start-1={isMobile}
    class:col-span-4={isMobile}>
    {#each keys as key (key)}
      <NumberKey count={key} {handleCount}>{key}</NumberKey>
    {/each}
  </div>
</div>
