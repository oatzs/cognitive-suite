import { settings } from '../stores/settingsStore.js'
import { deleteDB } from './gamedb.js'
import { clearDocctPersistence } from './docct/persistence.js'

export function createAppDataRepository({
  deleteGames,
  resetQuadSettings,
  storage,
}) {
  return {
    async resetAll() {
      await deleteGames()
      clearDocctPersistence(storage)
      resetQuadSettings()
    },
  }
}

export const appDataRepository = createAppDataRepository({
  deleteGames: deleteDB,
  resetQuadSettings: () => settings.reset(),
  storage: globalThis.localStorage,
})
