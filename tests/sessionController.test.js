import { describe, expect, it, vi } from 'vitest'
import {
  applyTallyCount,
  createSessionController,
  SessionCancelledError,
} from '../src/lib/sessionController.js'

describe('session controller', () => {
  it('finishes once and returns the same promise to repeated callers', async () => {
    let resolveSave
    const save = vi.fn(() => new Promise((resolve) => { resolveSave = resolve }))
    const setRunning = vi.fn()
    const cleanup = vi.fn()
    const controller = createSessionController({ finalize: save, setRunning, cleanup })

    expect(controller.begin()).toBe(true)
    const first = controller.finish('completed')
    const second = controller.finish('cancelled')

    expect(first).toBe(second)
    expect(controller.phase()).toBe('ending')
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('completed')
    expect(setRunning).toHaveBeenLastCalledWith(true)

    resolveSave()
    await first

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(controller.phase()).toBe('idle')
    expect(setRunning).toHaveBeenLastCalledWith(false)
  })

  it('always cancels timers and cleans up when persistence fails', async () => {
    const failure = new Error('storage failed')
    const cleanup = vi.fn()
    const setRunning = vi.fn()
    const controller = createSessionController({
      finalize: vi.fn().mockRejectedValue(failure),
      cleanup,
      setRunning,
    })

    controller.begin()
    const pendingDelay = controller.delay(60_000)
    const finishing = controller.finish('completed')

    await expect(pendingDelay).rejects.toBeInstanceOf(SessionCancelledError)
    await expect(finishing).rejects.toBe(failure)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(controller.phase()).toBe('idle')
    expect(setRunning).toHaveBeenLastCalledWith(false)
  })
})

describe('tally gameplay scoring', () => {
  it('advances through N warm-up trials without scoring nonzero answers as misses', () => {
    const scoresheet = [{}, {}, {}]

    expect(applyTallyCount({ scoresheet, trialIndex: 0, nBack: 2, count: 1, matchCount: 0 }))
      .toEqual({ accepted: false, nextTrialIndex: 1, warmup: true })
    expect(applyTallyCount({ scoresheet, trialIndex: 1, nBack: 2, count: 3, matchCount: 0 }))
      .toEqual({ accepted: false, nextTrialIndex: 2, warmup: true })
    expect(scoresheet).toEqual([{}, {}, {}])

    expect(applyTallyCount({ scoresheet, trialIndex: 2, nBack: 2, count: 0, matchCount: 0 }))
      .toEqual({ accepted: true, nextTrialIndex: 3, warmup: false })
    expect(scoresheet).toEqual([{}, {}, { success: true, count: 0 }])
  })
})
