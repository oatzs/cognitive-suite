export const ICT_STORAGE_KEYS = ['ict.ict']

export function clearIctPersistence(storage = globalThis.localStorage) {
  if (!storage) return
  for (const key of ICT_STORAGE_KEYS) storage.removeItem(key)
}
