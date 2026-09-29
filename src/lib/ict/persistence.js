export const ICT_STORAGE_KEYS = ['ict.ict', 'ict.modes']

export function clearIctPersistence(storage = globalThis.localStorage) {
  if (!storage) return
  for (const key of ICT_STORAGE_KEYS) storage.removeItem(key)
}
