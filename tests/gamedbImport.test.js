import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  addDocctSession,
  addImportedGames,
  addSyllogimousSession,
  deleteDB,
  deleteGamesBySource,
  getAllCompletedGames,
  getTrainingSummarySince4AM,
  getYearOfPlayTime,
} from '../src/lib/gamedb.js'
import { parseSessionBackup, serializeSessionBackup } from '../src/lib/sessionBackup.js'
import {
  getModalityRollups,
  groupDaily,
  METRICS,
  normalizeGames,
  sessionsToCsv,
  summarizeSessions,
} from '../src/lib/statistics/stats.js'

const game = (sessionId, timestamp) => ({
  sessionId,
  source: 'quad-box',
  timestamp,
  status: 'completed',
  title: 'dual',
  mode: 'dual',
  variant: 'dual',
  nBack: 2,
  tags: ['position'],
  scores: { position: { hits: 8, misses: 2 } },
  completedTrials: 10,
  trialTime: 2500,
})

const syllogimousSession = (timestamp = Date.now()) => ({
  sessionId: 'syllogimous-session-a',
  startedAt: new Date(timestamp - 90_000).toISOString(),
  completedAt: new Date(timestamp).toISOString(),
  durationSec: 90,
  mode: 'syllogism',
  correctCount: 7,
  totalAnswers: 10,
  averageResponseTimeMs: 1250,
  averagePremises: 3.4,
  categoryCounts: { syllogism: 10 },
})

describe('imported game persistence', () => {
  beforeEach(async () => {
    await deleteDB()
  })

  afterEach(async () => {
    await deleteDB()
  })

  it('commits imported sessions in one batch', async () => {
    await expect(addImportedGames([
      game('session-a', 1_700_000_000_000),
      game('session-b', 1_700_000_100_000),
    ])).resolves.toBe(2)

    const stored = await getAllCompletedGames()
    expect(stored.map((entry) => entry.sessionId).sort()).toEqual(['session-a', 'session-b'])
  })

  it('rolls back the full batch when a session ID conflicts', async () => {
    await expect(addImportedGames([
      game('duplicate-session', 1_700_000_000_000),
      game('duplicate-session', 1_700_000_100_000),
    ])).rejects.toBeTruthy()

    await expect(getAllCompletedGames()).resolves.toEqual([])
  })

  it('does not duplicate a legacy DocCT session when it gains a session ID', async () => {
    const completedAt = '2026-08-23T12:00:00.000Z'
    const base = {
      completedAt,
      mode: '1-back',
      durationSec: 600,
      correctCount: 8,
      totalAnswers: 10,
      endingIntervalMs: 1200,
    }

    await expect(addDocctSession(base)).resolves.toBe(true)
    await expect(addDocctSession({
      ...base,
      sessionId: `docct:${completedAt}`,
    })).resolves.toBe(false)
    await expect(getAllCompletedGames()).resolves.toHaveLength(1)
  })

  it('adds a Syllogimous session once and includes it in today’s training summary', async () => {
    const session = syllogimousSession()

    await expect(addSyllogimousSession(session)).resolves.toBe(true)
    await expect(addSyllogimousSession(structuredClone(session))).resolves.toBe(false)

    const stored = await getAllCompletedGames()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      sessionId: 'syllogimous-session-a',
      source: 'syllogimous',
      sourceSessionId: 'syllogimous-session-a',
      status: 'completed',
      title: 'syllogimous syllogism',
      mode: 'syllogimous',
      variant: 'syllogism',
      completedTrials: 10,
      elapsedSeconds: 90,
      total: { hits: 7, misses: 3, possible: 10, percent: 0.7 },
      syllogimous: {
        mode: 'syllogism',
        correctCount: 7,
        totalAnswers: 10,
        averageResponseTimeMs: 1250,
        averagePremises: 3.4,
        categoryCounts: { syllogism: 10 },
      },
    })
    await expect(getTrainingSummarySince4AM()).resolves.toEqual({
      playTime: 90,
      sessionCount: 1,
    })
  })

  it('clears Syllogimous statistics without deleting another trainer’s history', async () => {
    const now = Date.now()
    await addImportedGames([game('quad-session', now)])
    await addSyllogimousSession(syllogimousSession(now))

    await expect(deleteGamesBySource('syllogimous')).resolves.toBe(1)
    const stored = await getAllCompletedGames()
    expect(stored).toHaveLength(1)
    expect(stored[0].sessionId).toBe('quad-session')
  })

  it('counts only completed sessions in the current training day', async () => {
    const now = Date.now()
    await addImportedGames([
      game('completed-a', now),
      game('completed-b', now),
      {
        ...game('completed-docct', now),
        source: 'docct',
        mode: 'docct',
        variant: '1-back',
        start: now - 30_000,
      },
      { ...game('cancelled', now), status: 'cancelled' },
    ])

    await expect(getTrainingSummarySince4AM()).resolves.toEqual({
      playTime: 80,
      sessionCount: 3,
    })

    const yearlyMinutes = await getYearOfPlayTime()
    expect(Object.values(yearlyMinutes).reduce((sum, minutes) => sum + minutes, 0)).toBeCloseTo(80 / 60)
  })

  it('can store, normalize, summarize, display, and export every generated accepted backup', async () => {
    const timestampArbitrary = fc.integer({ min: 1_600_000_000_000, max: 4_102_444_800_000 })
    const baseArbitrary = fc.record({
      sessionId: fc.uuid(),
      timestamp: timestampArbitrary,
      nBack: fc.integer({ min: 1, max: 12 }),
    })
    const quadArbitrary = fc.record({
      base: baseArbitrary,
      hits: fc.integer({ min: 0, max: 100 }),
      misses: fc.integer({ min: 0, max: 100 }),
      trialTime: fc.integer({ min: 500, max: 5000 }),
    }).map(({ base, hits, misses, trialTime }) => ({
      ...base,
      source: 'quad-box',
      status: 'completed',
      title: 'dual',
      mode: 'dual',
      variant: 'dual',
      tags: ['position'],
      scores: { position: { hits, misses, possible: hits + misses } },
      completedTrials: hits + misses,
      trialTime,
    }))
    const tallyArbitrary = fc.record({
      base: baseArbitrary,
      hits: fc.integer({ min: 0, max: 100 }),
      misses: fc.integer({ min: 0, max: 100 }),
    }).map(({ base, hits, misses }) => {
      const possible = hits + misses
      const completedTrials = possible + base.nBack
      return {
        ...base,
        source: 'quad-box',
        start: base.timestamp - Math.max(1, completedTrials) * 1000,
        status: 'completed',
        title: 'tally dual',
        mode: 'tally',
        variant: 'tally dual',
        tags: ['position0'],
        scores: { tally: { hits, misses: 0, possible } },
        completedTrials: Math.max(1, completedTrials),
      }
    })
    const docctArbitrary = fc.record({
      base: baseArbitrary,
      correctCount: fc.integer({ min: 0, max: 100 }),
      wrongCount: fc.integer({ min: 0, max: 100 }),
      durationSec: fc.integer({ min: 0, max: 3600 }),
      endingIntervalMs: fc.integer({ min: 500, max: 5000 }),
    }).map(({ base, correctCount, wrongCount, durationSec, endingIntervalMs }) => {
      const totalAnswers = correctCount + wrongCount
      const completedAt = new Date(base.timestamp).toISOString()
      return {
        ...base,
        source: 'docct',
        timestamp: base.timestamp,
        start: base.timestamp - durationSec * 1000,
        status: 'completed',
        title: 'docct 1-back',
        mode: 'docct',
        variant: '1-back',
        nBack: 1,
        tags: ['answer'],
        scores: { answer: { hits: correctCount, misses: wrongCount, possible: totalAnswers } },
        completedTrials: totalAnswers,
        trialTime: endingIntervalMs,
        docct: {
          sessionId: base.sessionId,
          completedAt,
          mode: '1-back',
          intervalMode: 'adaptive',
          adaptationMode: 'responsive',
          adaptationStepMs: 100,
          durationSec,
          accuracy: totalAnswers > 0 ? correctCount / totalAnswers : 0,
          fastestIntervalMs: endingIntervalMs,
          endingIntervalMs,
          averageResponseTimeMs: 250,
          correctCount,
          totalAnswers,
          streaks: 0,
          useVoice: false,
          useKeypad: true,
        },
      }
    })
    const sessionsArbitrary = fc.uniqueArray(
      fc.oneof(quadArbitrary, tallyArbitrary, docctArbitrary),
      { selector: (session) => session.sessionId, maxLength: 8 },
    )

    await fc.assert(fc.asyncProperty(sessionsArbitrary, async (sessions) => {
      await deleteDB()
      try {
        const parsed = parseSessionBackup(serializeSessionBackup(sessions, '2026-08-26T12:00:00.000Z'))
        await addImportedGames(parsed.games)
        const stored = await getAllCompletedGames()
        const normalized = normalizeGames(stored)

        expect(stored).toHaveLength(sessions.length)
        expect(normalized).toHaveLength(sessions.length)
        expect(() => summarizeSessions(normalized)).not.toThrow()
        expect(() => getModalityRollups(normalized)).not.toThrow()
        for (const metric of Object.keys(METRICS)) {
          expect(() => groupDaily(normalized, metric)).not.toThrow()
        }
        expect(() => sessionsToCsv(normalized)).not.toThrow()
        expect(() => serializeSessionBackup(stored, '2026-08-26T12:00:00.000Z')).not.toThrow()
      } finally {
        await deleteDB()
      }
    }), { numRuns: 50 })
  })
})
