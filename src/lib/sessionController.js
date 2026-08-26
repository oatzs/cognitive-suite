export class SessionCancelledError extends Error {
  constructor() {
    super('Session cancelled')
    this.name = 'SessionCancelledError'
  }
}

export function createSessionController({
  finalize = async () => {},
  cleanup = async () => {},
  setRunning = () => {},
} = {}) {
  let currentPhase = 'idle'
  let finishing = null
  const cancellables = new Set()

  const track = (originalPromise, cancelOriginal = () => {}) => {
    let settled = false
    let rejectTracked
    const cancel = () => {
      if (settled) return
      settled = true
      cancelOriginal()
      rejectTracked(new SessionCancelledError())
      cancellables.delete(cancel)
    }
    const tracked = new Promise((resolve, reject) => {
      rejectTracked = reject
      Promise.resolve(originalPromise).then(
        (value) => {
          if (settled) return
          settled = true
          cancellables.delete(cancel)
          resolve(value)
        },
        (reason) => {
          if (settled) return
          settled = true
          cancellables.delete(cancel)
          reject(reason)
        },
      )
    })
    cancellables.add(cancel)
    return tracked
  }

  const cancelPending = () => {
    for (const cancel of [...cancellables]) cancel()
  }

  return {
    phase: () => currentPhase,

    begin() {
      if (currentPhase !== 'idle') return false
      currentPhase = 'active'
      setRunning(true)
      return true
    },

    delay(ms) {
      let timeoutId
      const promise = new Promise((resolve) => {
        timeoutId = setTimeout(resolve, ms)
      })
      return track(promise, () => clearTimeout(timeoutId))
    },

    track,
    cancelPending,

    finish(reason) {
      if (currentPhase === 'ending') return finishing
      if (currentPhase !== 'active') return Promise.resolve(false)

      currentPhase = 'ending'
      cancelPending()
      finishing = (async () => {
        try {
          await finalize(reason)
          return true
        } finally {
          try {
            await cleanup()
          } finally {
            setRunning(false)
            currentPhase = 'idle'
            finishing = null
          }
        }
      })()
      return finishing
    },
  }
}

export function applyTallyCount({ scoresheet, trialIndex, nBack, count, matchCount }) {
  if (!Array.isArray(scoresheet) || trialIndex < 0 || trialIndex >= scoresheet.length) {
    return { accepted: false, nextTrialIndex: trialIndex, warmup: false }
  }
  if (scoresheet[trialIndex].success !== undefined) {
    return { accepted: false, nextTrialIndex: trialIndex, warmup: false }
  }
  if (trialIndex < nBack) {
    return { accepted: false, nextTrialIndex: trialIndex + 1, warmup: true }
  }

  scoresheet[trialIndex].success = count === matchCount
  scoresheet[trialIndex].count = matchCount
  return { accepted: true, nextTrialIndex: trialIndex + 1, warmup: false }
}
