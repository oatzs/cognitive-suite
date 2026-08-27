import { describe, expect, it, vi } from 'vitest'
import { createAppDataRepository } from '../src/lib/appData.js'
import { DOCCT_STORAGE_KEYS } from '../src/lib/docct/persistence.js'
import {
  SYLLOGIMOUS_STORAGE_KEYS,
  clearSyllogimousStorage,
} from '../src/lib/syllogimous/persistence.js'

describe('app data repository', () => {
  it('resets both databases, all trainer storage keys, and Quad Box settings', async () => {
    const trainerStorageKeys = [...DOCCT_STORAGE_KEYS, ...SYLLOGIMOUS_STORAGE_KEYS]
    const storageValues = new Map(trainerStorageKeys.map((key) => [key, 'saved']))
    storageValues.set('unrelated', 'keep')
    const storage = {
      removeItem: vi.fn((key) => storageValues.delete(key)),
    }
    const deleteGames = vi.fn().mockResolvedValue(undefined)
    const deleteSyllogimousData = vi.fn().mockResolvedValue(undefined)
    const clearSyllogimousData = vi.fn(clearSyllogimousStorage)
    const resetQuadSettings = vi.fn()
    const repository = createAppDataRepository({
      deleteGames,
      deleteSyllogimousData,
      resetQuadSettings,
      storage,
      clearSyllogimousData,
    })

    await repository.resetAll()

    expect(deleteGames).toHaveBeenCalledTimes(1)
    expect(deleteSyllogimousData).toHaveBeenCalledTimes(1)
    expect(clearSyllogimousData).toHaveBeenCalledWith(storage)
    expect(resetQuadSettings).toHaveBeenCalledTimes(1)
    expect([...storageValues.keys()]).toEqual(['unrelated'])
    expect(storage.removeItem.mock.calls.map(([key]) => key)).toEqual(trainerStorageKeys)
  })

  it('does not clear storage or settings if either database deletion fails', async () => {
    const failure = new Error('database busy')
    const resetQuadSettings = vi.fn()
    const storage = { removeItem: vi.fn() }
    const deleteSyllogimousData = vi.fn().mockResolvedValue(undefined)
    const clearSyllogimousData = vi.fn()
    const repository = createAppDataRepository({
      deleteGames: vi.fn().mockRejectedValue(failure),
      deleteSyllogimousData,
      resetQuadSettings,
      storage,
      clearSyllogimousData,
    })

    await expect(repository.resetAll()).rejects.toThrow('only partially completed')
    expect(deleteSyllogimousData).toHaveBeenCalledTimes(1)
    expect(clearSyllogimousData).not.toHaveBeenCalled()
    expect(resetQuadSettings).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})
