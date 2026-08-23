import { addImportedGames, getAllCompletedGames } from './gamedb'
import {
  parseSessionBackup,
  planSessionMerge,
  serializeSessionBackup,
} from './sessionBackup'

export function createSessionTransfer({
  listSessions,
  addSessions,
  now = () => new Date(),
}) {
  if (typeof listSessions !== 'function' || typeof addSessions !== 'function') {
    throw new TypeError('Session transfer requires list and add adapters')
  }

  return {
    async exportBackup() {
      const games = await listSessions()
      return serializeSessionBackup(games, now().toISOString())
    },

    async importBackup(text) {
      const backup = parseSessionBackup(text)
      const existing = await listSessions()
      const plan = planSessionMerge(existing, backup.games)
      const total = existing.length + plan.additions.length
      if (plan.additions.length > 0) {
        await addSessions(plan.additions)
      }
      return {
        added: plan.additions.length,
        duplicates: plan.duplicates,
        total,
      }
    },
  }
}

const indexedDbTransfer = createSessionTransfer({
  listSessions: getAllCompletedGames,
  addSessions: addImportedGames,
})

export const exportSessionHistoryBackup = () => indexedDbTransfer.exportBackup()
export const importSessionHistoryBackup = (text) => indexedDbTransfer.importBackup(text)
