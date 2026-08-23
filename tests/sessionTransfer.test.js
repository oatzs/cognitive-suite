import { describe, expect, it, vi } from 'vitest'
import { createSessionTransfer } from '../src/lib/sessionTransfer.js'
import { createSessionBackup, serializeSessionBackup } from '../src/lib/sessionBackup.js'

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

describe('session transfer', () => {
  it('merges a backup and reports additions and duplicates', async () => {
    const existing = [game('session-a', 1_700_000_000_000)]
    const addSessions = vi.fn(async (sessions) => existing.push(...sessions))
    const transfer = createSessionTransfer({
      listSessions: async () => existing,
      addSessions,
    })
    const backupText = JSON.stringify(createSessionBackup([
      game('session-a', 1_700_000_000_000),
      game('session-b', 1_700_000_100_000),
    ], '2026-08-23T12:00:00.000Z'))

    await expect(transfer.importBackup(backupText)).resolves.toEqual({
      added: 1,
      duplicates: 1,
      total: 2,
    })
    expect(addSessions).toHaveBeenCalledTimes(1)
    expect(existing.map((entry) => entry.sessionId).sort()).toEqual(['session-a', 'session-b'])
  })

  it('exports the repository history through the versioned codec', async () => {
    const existing = [game('session-a', 1_700_000_000_000)]
    const transfer = createSessionTransfer({
      listSessions: async () => existing,
      addSessions: vi.fn(),
      now: () => new Date('2026-08-23T12:00:00.000Z'),
    })

    await expect(transfer.exportBackup()).resolves.toBe(
      serializeSessionBackup(existing, '2026-08-23T12:00:00.000Z'),
    )
  })

  it('does not write anything when the backup is invalid', async () => {
    const addSessions = vi.fn()
    const transfer = createSessionTransfer({
      listSessions: vi.fn(),
      addSessions,
    })

    await expect(transfer.importBackup('{broken')).rejects.toThrow('not valid JSON')
    expect(addSessions).not.toHaveBeenCalled()
  })
})
