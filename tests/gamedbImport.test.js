import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addDocctSession,
  addImportedGames,
  deleteDB,
  getAllCompletedGames,
} from '../src/lib/gamedb.js'

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
})
