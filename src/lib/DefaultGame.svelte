<script>
import Grid from "./Grid.svelte"
import LargeKey from "./LargeKey.svelte"
import SmallKey from "./SmallKey.svelte"
import { generateGame } from "./nback"
import { onDestroy } from "svelte"
import { audioPlayer } from "./audioPlayer"
import { runAutoProgression } from "./autoProgression"
import { settings } from "../stores/settingsStore"
import { feedback } from "../stores/feedbackStore"
import { analytics } from "../stores/analyticsStore"
import { mobile } from "../stores/mobileStore"
import { isPlaying, gameDisplayInfo } from "../stores/gameRunningStore"
import { createSessionController, SessionCancelledError } from "./sessionController"

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
  presentation = { highlight: false }
  gameMeta = {}
  sessionSettings = {}
  gameId++
}

resetRuntimeData()

const applyGame = (game, isPlaying) => {
  if (!isPlaying) {
    gameMeta = { ...game.meta }
    gameDisplayInfo.set(gameMeta)
  }
}

$: isMobile = $mobile
$: gameSettings = $settings.gameSettings[$settings.mode]
$: game = generateGame(gameSettings, $settings, gameId)
$: applyGame(game, $isPlaying)
$: trialDisplay = $settings.feedback === 'show' ? ($isPlaying ? trials.length : game.trials.length) - trialsIndex : ''

const playTrial = async (i) => {
  if (controller.phase() !== 'active') {
    return
  }

  if (i >= trials.length) {
    await delay(700)
    await endGame('completed')
    return
  }

  selectTrial(i)
  presentation.highlight = true
  const audioWait = currentTrial.audio ? makeCancellable(audioPlayer.play(currentTrial.audio)) : Promise.resolve()
  const presentationWait = delay(Math.min(2000, gameMeta.trialTime - 350)).then(() => presentation.highlight = false)
  const trialWait = delay(gameMeta.trialTime)
  await Promise.all([audioWait, presentationWait, trialWait])
  detectMissedStimuli()
  await playTrial(i + 1)
}

const selectTrial = (i) => {
  currentTrial = trials[i]
  if (i < trials.length - 1) {
    nextTrial = trials[i+1]
  }
  trialsIndex = i
}

const startGame = async () => {
  if (!controller.begin()) return
  sessionSettings = structuredClone($settings)
  gameMeta = { ...structuredClone(game.meta), start: Date.now(), rotationSpeed: sessionSettings.rotationSpeed }
  gameDisplayInfo.set(gameMeta)
  audioPlayer.cacheAudioSource(sessionSettings.gameSettings[sessionSettings.mode].audioSource)
  trials = structuredClone(game.trials)
  nextTrial = trials[0]
  scoresheet = new Array(trials.length).fill().map(() => ({}))
  selectTrial(0)
  try {
    await delay(700)
    await playTrial(0)
  } catch (e) {
    if (e instanceof SessionCancelledError) {
      console.debug('Game cancelled', e)
    } else {
      await controller.finish('cancelled')
      throw e
    }
  }
}

const finalizeGame = async (status) => {
  const variant = sessionSettings.mode?.startsWith('custom') ? 'custom' : sessionSettings.mode
  const gameInfoRecord = { ...gameMeta, variant, timestamp: Date.now() }
  if (trialsIndex > gameInfoRecord.nBack) {
    await analytics.scoreTrials(gameInfoRecord, status === 'completed' ? scoresheet : scoresheet.slice(0, trialsIndex), status)
    if (status === 'completed') {
      await runAutoProgression(gameInfoRecord, sessionSettings)
    }
  } else {
    console.debug('Game not recorded', trialsIndex, gameInfoRecord, scoresheet, trials)
  }
}

const cleanupGame = () => {
  resetRuntimeData()
  feedback.reset()
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

const detectMissedStimuli = () => {
  if (!('tags' in $gameDisplayInfo)) {
    return
  }
  let updates = {}
  for (const tag of $gameDisplayInfo.tags) {
    if (currentTrial.matches.includes(tag) &&!(tag in scoresheet[trialsIndex])) {
      scoresheet[trialsIndex][tag] = false
      updates[tag] = 'late-failure'
    } else {
      updates[tag] = 'blank'
    }
  }
  feedback.apply(updates)
}

const checkForMatch = (type) => {
  if (!$isPlaying || trialsIndex < $gameDisplayInfo.nBack) {
    return
  }

  if (type in currentTrial && !(type in scoresheet[trialsIndex])) {
    const isSuccess = currentTrial.matches.includes(type)
    scoresheet[trialsIndex][type] = isSuccess
    feedback.apply({ [type]: isSuccess ? 'success' : 'failure' })
  }
}

const delay = (ms) => controller.delay(ms)

const makeCancellable = (originalPromise) => controller.track(originalPromise)

const handleKey = (event) => {
  switch (event.code) {
    case 'Space':
      startGame()
      break
    case 'Escape':
      endGame('cancelled')
      break
  }

  const hotkeys = $isPlaying ? sessionSettings.hotkeys : $settings.hotkeys
  for (const [action, key] of Object.entries(hotkeys)) {
    if (key.toUpperCase() === event.key.toUpperCase()) {
      checkForMatch(action)
      if (action === 'shape') {
        checkForMatch('image')
      }
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


<Grid trial={currentTrial} {nextTrial} {presentation} />
{#if isMobile}
<div class="stretch grid grid-rows-[1fr_7fr_2fr] md:grid-rows-[1fr_8fr_2fr] gap-1">
  <div class="w-full h-full flex items-center justify-between row-start-1 p-8">
    <div class="text-4xl ml-2 select-none opacity-30" >{trialDisplay}</div>
    <button class="game-button text-4xl p-8 md:p-10"
      on:click={toggleGame}
      on:keydown={suppressKey}
      on:keypress={suppressKey}
      on:keyup={suppressKey}
      tabindex="-1"
    >{#if $isPlaying} Stop {:else} Play {/if}</button>
  </div>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] grid-rows-1 max-w-full gap-1 row-start-3 md:mt-6">
    <SmallKey field="position" display="Position" isPlaying={$isPlaying} {checkForMatch}></SmallKey>
    <SmallKey field="color" display="Color" isPlaying={$isPlaying} {checkForMatch}></SmallKey>
    <SmallKey field="shape" display="Shape" isPlaying={$isPlaying} {checkForMatch}></SmallKey>
    <SmallKey field="image" display="Image" isPlaying={$isPlaying} {checkForMatch}></SmallKey>
    <SmallKey field="audio" display="Audio" isPlaying={$isPlaying} {checkForMatch}></SmallKey>
  </div>
</div>
{:else}
<div class="stretch grid grid-cols-[1fr_3fr_3fr_1fr] grid-rows-[1fr_6fr_1fr]">
  <div class="w-full h-full flex items-center justify-between col-start-1 col-span-4 px-2">
    <div></div>
    <button class="game-button text-5xl px-12 py-10 max-w-[90%] mr-4"
      on:click={toggleGame}
      on:keydown={suppressKey}
      on:keypress={suppressKey}
      on:keyup={suppressKey}
      tabindex="-1"
    >{#if $isPlaying} Stop {:else} Play {/if}</button>
  </div>
  <div class="game-button-lg-group row-start-2 col-start-1 pr-24">
    {#if !$gameDisplayInfo.tags?.includes('image')}
    <LargeKey field="color" display="Color" isPlaying={$isPlaying} {checkForMatch}></LargeKey>
    {/if}
    <LargeKey field="position" display="Position" isPlaying={$isPlaying} {checkForMatch}></LargeKey>
  </div>
  <div class="game-button-lg-group row-start-2 col-start-4 pl-24">
    {#if $gameDisplayInfo.tags?.includes('image')}
    <LargeKey field="image" display="Image" isPlaying={$isPlaying} {checkForMatch}></LargeKey>
    {:else}
    <LargeKey field="shape" display="Shape" isPlaying={$isPlaying} {checkForMatch}></LargeKey>
    {/if}
    <LargeKey field="audio" display="Audio" isPlaying={$isPlaying} {checkForMatch}></LargeKey>
  </div>
  <div class="w-full h-full flex items-center justify-center text-6xl ml-6 row-start-3 col-start-4 select-none opacity-30">{trialDisplay}</div>
</div>
{/if}
