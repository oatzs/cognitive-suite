export const SYLLOGIMOUS_DB_NAME = 'SyllDB'

export const SYLLOGIMOUS_STORAGE_KEYS = [
  'sllgms-v3',
  'sllgms-v3-background',
  'sllgms-v3-profiles',
  'sllgms-v3-selected-profile',
  'sllgms-v3-app-state',
]

export function clearSyllogimousStorage(storage = globalThis.localStorage) {
  if (!storage) return
  for (const key of SYLLOGIMOUS_STORAGE_KEYS) storage.removeItem(key)
}

export function deleteSyllogimousDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(SYLLOGIMOUS_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Syllogimous reset is blocked by another open tab'))
  })
}
