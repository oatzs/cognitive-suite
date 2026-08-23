import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
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

  it('rejects malformed JSON and unsupported backup versions', () => {
    expect(() => parseSessionBackup('{broken')).toThrow('not valid JSON')
    expect(() => parseSessionBackup(JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-08-23T12:00:00.000Z',
      games: [],
    }))).toThrow('Unsupported backup version')
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

    expect(() => planSessionMerge([existing], [conflicting]))
      .toThrow('Conflicting imported session')
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
