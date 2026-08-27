import { settings } from '../stores/settingsStore.js'
import { deleteDB } from './gamedb.js'
import { clearDocctPersistence } from './docct/persistence.js'
import {
  clearSyllogimousStorage,
  deleteSyllogimousDatabase,
} from './syllogimous/persistence.js'

export function createAppDataRepository({
  deleteGames,
  deleteSyllogimousData = async () => {},
  resetQuadSettings,
  storage,
  clearSyllogimousData = () => {},
}) {
  return {
    async resetAll() {
      const results = await Promise.allSettled([deleteGames(), deleteSyllogimousData()])
      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length) {
        const cleared = [
          results[0].status === 'fulfilled' ? 'suite training history' : null,
          results[1].status === 'fulfilled' ? 'Syllogimous local history' : null,
        ].filter(Boolean)
        const message = cleared.length
          ? `The reset was only partially completed. Cleared ${cleared.join(' and ')}, but another data store could not be cleared.`
          : 'The reset could not clear either training-history database.'
        throw new AggregateError(failures.map((failure) => failure.reason), message)
      }
      clearDocctPersistence(storage)
      clearSyllogimousData(storage)
      resetQuadSettings()
    },
  }
}

export const appDataRepository = createAppDataRepository({
  deleteGames: deleteDB,
  deleteSyllogimousData: deleteSyllogimousDatabase,
  resetQuadSettings: () => settings.reset(),
  storage: globalThis.localStorage,
  clearSyllogimousData: clearSyllogimousStorage,
})
