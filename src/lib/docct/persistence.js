export const DOCCT_SETTINGS_KEY = 'docct:settings:v1'
export const DOCCT_HISTORY_KEY = 'docct:session-history:v1'
export const DOCCT_HIGH_SCORES_KEY = 'docct:high-scores:v1'

export const LEGACY_DOCCT_SETTINGS_KEY = 'settings'
export const LEGACY_DOCCT_HISTORY_KEY = 'sessionHistory'
export const LEGACY_DOCCT_HIGH_SCORES_KEY = 'highScores'

export const DOCCT_STORAGE_KEYS = [
  DOCCT_SETTINGS_KEY,
  DOCCT_HISTORY_KEY,
  DOCCT_HIGH_SCORES_KEY,
  LEGACY_DOCCT_SETTINGS_KEY,
  LEGACY_DOCCT_HISTORY_KEY,
  LEGACY_DOCCT_HIGH_SCORES_KEY,
]

const getStorage = (storage) => storage ?? globalThis.localStorage

export function readDocctValue(currentKey, legacyKey, storage) {
  const target = getStorage(storage)
  if (!target) return null
  return target.getItem(currentKey) ?? target.getItem(legacyKey)
}

export function writeDocctValue(key, value, storage) {
  const target = getStorage(storage)
  if (!target) return
  target.setItem(key, value)
}

export function clearDocctPersistence(storage) {
  const target = getStorage(storage)
  if (!target) return
  for (const key of DOCCT_STORAGE_KEYS) target.removeItem(key)
}
