// @vitest-environment jsdom
import { mount, tick, unmount } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TallyGame from '../src/lib/TallyGame.svelte'
import { settings } from '../src/stores/settingsStore.js'
import { isPlaying } from '../src/stores/gameRunningStore.js'

const scoreTallyTrials = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../src/stores/analyticsStore.js', () => ({
  analytics: { scoreTallyTrials },
}))

vi.mock('../src/lib/audioPlayer.js', () => ({
  audioPlayer: {
    cacheAudioSource: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../src/lib/shapeSvgPool.js', () => ({
  default: {
    getShapeSvg: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  },
}))

vi.mock('../src/lib/nback.js', () => ({
  generateTallyGame: () => ({
    meta: {
      mode: 'tally',
      title: 'tally dual',
      rules: 'tally',
      nBack: 2,
      numTrials: 4,
      tags: ['position0'],
      positionWidth: 1,
      enablePositionWidthSequence: false,
      positionWidthSequence: [1, 1],
      grid: 'static2D',
    },
    trials: [
      { matches: [], position0: '1-1' },
      { matches: [], position0: '1-1' },
      { matches: [], position0: '1-1' },
      { matches: [], position0: '1-1' },
    ],
  }),
}))

const findButton = (target, label) => [...target.querySelectorAll('button')]
  .find((button) => button.textContent.trim() === label)

describe('TallyGame warm-up scoring', () => {
  let component
  let target
  let previousSettings

  beforeEach(() => {
    vi.useFakeTimers()
    scoreTallyTrials.mockClear()
    const storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    })
    previousSettings = structuredClone(get(settings))
    settings.set({ ...previousSettings, mode: 'tally' })
    target = document.createElement('div')
    document.body.append(target)
    component = mount(TallyGame, { target })
  })

  afterEach(async () => {
    if (component) await unmount(component)
    isPlaying.set(false)
    if (previousSettings) settings.set(previousSettings)
    target?.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not turn nonzero answers during the first N trials into misses', async () => {
    findButton(target, 'Play').click()
    await tick()

    findButton(target, '1').click()
    findButton(target, '1').click()
    findButton(target, '0').click()
    findButton(target, '0').click()
    await vi.advanceTimersByTimeAsync(100)

    expect(scoreTallyTrials).toHaveBeenCalledTimes(1)
    expect(scoreTallyTrials.mock.calls[0][1]).toEqual([
      {},
      {},
      { success: true, count: 0 },
      { success: true, count: 0 },
    ])
  })
})
