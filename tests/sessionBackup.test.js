import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  SESSION_BACKUP_SCHEMA_VERSION,
  createSessionBackup,
  parseSessionBackup,
  planSessionMerge,
  serializeSessionBackup,
} from '../src/lib/sessionBackup.js'

const sessionArbitrary = fc.record({
  sessionId: fc.uuid(),
  timestamp: fc.integer({ min: 1_600_000_000_000, max: 2_000_000_000_000 }),
  nBack: fc.integer({ min: 1, max: 8 }),
  hits: fc.integer({ min: 0, max: 80 }),
  misses: fc.integer({ min: 0, max: 80 }),
  title: fc.constantFrom('dual', 'quad', 'custom'),
}).map(({ sessionId, timestamp, nBack, hits, misses, title }) => ({
  id: 42,
  sessionId,
  source: 'quad-box',
  timestamp,
  status: 'completed',
  title,
  mode: title,
  variant: title,
  nBack,
  tags: ['position'],
  scores: { position: { hits, misses, possible: hits + misses, percent: 0.5 } },
  completedTrials: hits + misses,
  trialTime: 2500,
  elapsedSeconds: 100,
  dayTimestamp: timestamp,
  total: { hits, misses, possible: hits + misses, percent: 0.5 },
  ncalc: 2.8,
}))

const syllogimousSession = () => {
  const startedAt = '2026-08-23T11:58:30.000Z'
  const completedAt = '2026-08-23T12:00:00.000Z'
  return {
    sessionId: 'df4c3285-e8c7-4b45-b09b-8a80db7fdd1c',
    sourceSessionId: 'df4c3285-e8c7-4b45-b09b-8a80db7fdd1c',
    source: 'syllogimous',
    timestamp: new Date(completedAt).getTime(),
    start: new Date(startedAt).getTime(),
    status: 'completed',
    title: 'syllogimous syllogism',
    mode: 'syllogimous',
    variant: 'syllogism',
    tags: ['answer'],
    scores: { answer: { hits: 7, misses: 3, possible: 10 } },
    completedTrials: 10,
    syllogimous: {
      sessionId: 'df4c3285-e8c7-4b45-b09b-8a80db7fdd1c',
      startedAt,
      completedAt,
      durationSec: 90,
      mode: 'syllogism',
      correctCount: 7,
      totalAnswers: 10,
      averageResponseTimeMs: 1250,
      averagePremises: 3.4,
      categoryCounts: { syllogism: 10 },
    },
  }
}

describe('session backup codec', () => {
  it('round-trips portable session data and removes local/derived fields', () => {
    fc.assert(fc.property(
      fc.array(sessionArbitrary, { maxLength: 50 }),
      (games) => {
        const exportedAt = '2026-08-23T12:00:00.000Z'
        const expected = createSessionBackup(games, exportedAt)
        const parsed = parseSessionBackup(serializeSessionBackup(games, exportedAt))

        expect(parsed).toEqual(expected)
        for (const game of parsed.games) {
          expect(game).not.toHaveProperty('id')
          expect(game).not.toHaveProperty('elapsedSeconds')
          expect(game).not.toHaveProperty('dayTimestamp')
          expect(game).not.toHaveProperty('total')
          expect(game).not.toHaveProperty('ncalc')
        }
      },
    ), { numRuns: 100 })
  })

  it('round-trips tally sessions that use start time instead of trial time', () => {
    const tally = {
      sessionId: '8a4cb66f-6ff6-4cf0-9a16-a08697480a8f',
      source: 'quad-box',
      timestamp: 1_700_000_600_000,
      start: 1_700_000_000_000,
      status: 'completed',
      title: 'tally dual',
      mode: 'tally',
      variant: 'tally dual',
      nBack: 2,
      tags: ['position0', 'position1'],
      scores: { tally: { hits: 18, misses: 0, possible: 24 } },
      completedTrials: 30,
    }

    const parsed = parseSessionBackup(serializeSessionBackup([
      tally,
    ], '2026-08-23T12:00:00.000Z'))
    expect(parsed.games).toEqual([tally])
  })

  it('emits schema v2 and round-trips Syllogimous session metadata', () => {
    const game = syllogimousSession()
    const serialized = serializeSessionBackup([game], '2026-08-23T12:05:00.000Z')
    const parsed = parseSessionBackup(serialized)

    expect(parsed.schemaVersion).toBe(SESSION_BACKUP_SCHEMA_VERSION)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.games).toEqual([game])
    expect(parsed.games[0]).not.toHaveProperty('nBack')
  })

  it('accepts a schema v1 backup and upgrades it to the current schema', () => {
    const legacyGame = {
      sessionId: '5fefbd56-652f-4e98-bc47-a3d726fd33c6',
      timestamp: 1_700_000_000_000,
      status: 'completed',
      title: 'dual',
      mode: 'dual',
      variant: 'dual',
      nBack: 2,
      tags: ['position'],
      scores: { position: { hits: 8, misses: 2 } },
      completedTrials: 10,
      trialTime: 2500,
    }
    const parsed = parseSessionBackup(JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-08-23T12:00:00.000Z',
      games: [legacyGame],
    }))

    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.games).toEqual([{ source: 'quad-box', ...legacyGame }])
  })

  it('rejects malformed JSON and unsupported backup versions', () => {
    expect(() => parseSessionBackup('{broken')).toThrow('not valid JSON')
    expect(() => parseSessionBackup(JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-08-23T12:00:00.000Z',
      games: [],
    }))).toThrow('Unsupported backup version')
  })

  it('rejects unknown trainer sources instead of treating them as Quad Box', () => {
    const game = fc.sample(sessionArbitrary, 1)[0]
    game.source = 'unknown-trainer'

    expect(() => parseSessionBackup(JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-08-23T12:00:00.000Z',
      games: [game],
    }))).toThrow('Invalid session source')
  })

  it('rejects prototype-related keys in imported score maps', () => {
    const game = fc.sample(sessionArbitrary, 1)[0]
    game.scores = JSON.parse('{"__proto__":{"hits":1,"misses":0}}')
    const backup = {
      schemaVersion: 1,
      exportedAt: '2026-08-23T12:00:00.000Z',
      games: [game],
    }

    expect(() => parseSessionBackup(JSON.stringify(backup)))
      .toThrow('Invalid score key')
  })

  it('rejects timestamps that cannot be displayed or exported', () => {
    const game = fc.sample(sessionArbitrary, 1)[0]
    game.timestamp = 1e300

    expect(() => createSessionBackup([game])).toThrow('Invalid session timestamp')
  })

  it('accepts app-generated responsive intervals above the setup maximum', () => {
    const timestamp = 1_700_000_600_000
    const completedAt = new Date(timestamp).toISOString()
    const game = {
      sessionId: 'd602507b-a112-4a2a-9249-df90a36d5fe2',
      source: 'docct',
      timestamp,
      start: timestamp - 600_000,
      status: 'completed',
      title: 'docct 1-back',
      mode: 'docct',
      variant: '1-back',
      nBack: 1,
      tags: ['answer'],
      scores: { answer: { hits: 1, misses: 3, possible: 4 } },
      completedTrials: 4,
      trialTime: 65_000,
      docct: {
        sessionId: 'd602507b-a112-4a2a-9249-df90a36d5fe2',
        completedAt,
        mode: '1-back',
        intervalMode: 'adaptive',
        adaptationMode: 'responsive',
        adaptationStepMs: 100,
        durationSec: 600,
        accuracy: 0.25,
        fastestIntervalMs: 60_000,
        endingIntervalMs: 65_000,
        averageResponseTimeMs: 61_000,
        correctCount: 1,
        totalAnswers: 4,
        streaks: 0,
        useVoice: false,
        useKeypad: true,
      },
    }

    expect(() => createSessionBackup([game])).not.toThrow()
  })

  it('rejects inconsistent tally score shapes before persistence', () => {
    const tally = {
      sessionId: 'a5c5a0bb-a053-4956-a8c1-3f9933af15b7',
      source: 'quad-box',
      timestamp: 1_700_000_600_000,
      start: 1_700_000_000_000,
      status: 'completed',
      title: 'tally dual',
      mode: 'tally',
      variant: 'tally dual',
      nBack: 2,
      tags: ['position0'],
      scores: { tally: { hits: 5, misses: 0, possible: 4 } },
      completedTrials: 10,
    }

    expect(() => createSessionBackup([tally])).toThrow('Invalid tally scores')
    tally.scores.tally = { hits: 1, misses: 1, possible: 1 }
    expect(() => createSessionBackup([tally])).toThrow('Invalid tally scores')
    tally.scores.tally = { hits: 1, misses: 0, possible: 1 }
    delete tally.scores.tally.possible
    expect(() => createSessionBackup([tally])).toThrow('Invalid tally scores')
    delete tally.scores.tally
    expect(() => createSessionBackup([tally])).toThrow('Tally session requires tally scores')
  })

  it('rejects sessions whose start time is after completion', () => {
    const game = fc.sample(sessionArbitrary, 1)[0]
    game.start = game.timestamp + 1
    delete game.trialTime

    expect(() => createSessionBackup([game])).toThrow('Invalid session start')
  })
})

describe('session backup merge planning', () => {
  it('is idempotent when the same sessions are imported repeatedly', () => {
    fc.assert(fc.property(
      fc.uniqueArray(sessionArbitrary, { selector: (game) => game.sessionId, maxLength: 50 }),
      fc.nat(),
      (games, splitSeed) => {
        const split = games.length === 0 ? 0 : splitSeed % (games.length + 1)
        const existing = games.slice(0, split)
        const first = planSessionMerge(existing, games)
        const second = planSessionMerge([...existing, ...first.additions], games)

        expect(first.additions).toHaveLength(games.length - split)
        expect(first.duplicates).toBe(split)
        expect(second.additions).toEqual([])
        expect(second.duplicates).toBe(games.length)
      },
    ), { numRuns: 100 })
  })

  it('deduplicates legacy sessions even when their local row IDs differ', () => {
    const existing = fc.sample(sessionArbitrary, 1)[0]
    delete existing.sessionId
    existing.id = 12
    const imported = structuredClone(existing)
    imported.id = 9001

    expect(planSessionMerge([existing], [imported])).toEqual({
      additions: [],
      duplicates: 1,
    })
  })

  it('matches DocCT sessions by source ID across UUID migrations', () => {
    const completedAt = '2026-08-23T12:00:00.000Z'
    const existing = {
      source: 'docct',
      sourceSessionId: completedAt,
      timestamp: new Date(completedAt).getTime(),
      status: 'completed',
      title: 'docct 1-back',
      mode: 'docct',
      variant: '1-back',
      nBack: 1,
      tags: ['answer'],
      scores: { answer: { hits: 8, misses: 2 } },
      completedTrials: 10,
      trialTime: 1200,
    }
    const imported = {
      ...structuredClone(existing),
      sessionId: 'c9b4dd90-89c2-49b7-bb87-010d7991d5f8',
    }

    expect(planSessionMerge([existing], [imported])).toEqual({
      additions: [],
      duplicates: 1,
    })
  })

  it('rejects records that reuse a session ID with different data', () => {
    const existing = fc.sample(sessionArbitrary, 1)[0]
    const conflicting = structuredClone(existing)
    conflicting.scores.position.hits++
    conflicting.scores.position.possible++

    expect(() => planSessionMerge([existing], [conflicting]))
      .toThrow('Conflicting imported session')
  })

  it('rejects different source sessions that reuse one session ID', () => {
    const existing = fc.sample(sessionArbitrary, 1)[0]
    existing.sourceSessionId = 'source-a'
    const conflicting = structuredClone(existing)
    conflicting.sourceSessionId = 'source-b'

    expect(() => planSessionMerge([existing], [conflicting]))
      .toThrow('Conflicting imported session: session:')
  })

  it('rejects duplicate identities inside an otherwise valid backup', () => {
    const first = fc.sample(sessionArbitrary, 1)[0]
    const duplicate = structuredClone(first)
    duplicate.timestamp++

    expect(() => createSessionBackup([first, duplicate]))
      .toThrow('Duplicate session identity')
  })

  it('produces the same union regardless of import order', () => {
    fc.assert(fc.property(
      fc.uniqueArray(sessionArbitrary, { selector: (game) => game.sessionId, maxLength: 50 }),
      (games) => {
        const forwards = planSessionMerge([], games).additions
          .map((game) => game.sessionId)
          .sort()
        const backwards = planSessionMerge([], [...games].reverse()).additions
          .map((game) => game.sessionId)
          .sort()
        expect(backwards).toEqual(forwards)
      },
    ), { numRuns: 100 })
  })
})
