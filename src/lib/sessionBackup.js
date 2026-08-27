export const SESSION_BACKUP_SCHEMA_VERSION = 2
export const MAX_BACKUP_SESSIONS = 100_000
export const MAX_BACKUP_CHARACTERS = 25 * 1024 * 1024
export const MIN_SESSION_TIMESTAMP = 0
export const MAX_SESSION_TIMESTAMP = Date.UTC(2100, 0, 1)

const MAX_COUNT = 1_000_000
const MAX_DURATION_SECONDS = 86_400
const MAX_INTERVAL_MS = MAX_DURATION_SECONDS * 1000

export class SessionBackupError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SessionBackupError'
  }
}

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'
const unsafeObjectKeys = new Set(['__proto__', 'constructor', 'prototype'])
const sessionSources = new Set(['quad-box', 'docct', 'syllogimous'])

const finiteNumber = (value, field, { min = -Infinity, max = Infinity } = {}) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new SessionBackupError(`Invalid ${field}`)
  }
  return value
}

const integerNumber = (value, field, bounds) => {
  const number = finiteNumber(value, field, bounds)
  if (!Number.isInteger(number)) throw new SessionBackupError(`Invalid ${field}`)
  return number
}

const optionalString = (value, field, maxLength = 256) => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new SessionBackupError(`Invalid ${field}`)
  }
  return value
}

const requiredString = (value, field, maxLength = 256) => {
  const result = optionalString(value, field, maxLength)
  if (!result) throw new SessionBackupError(`Invalid ${field}`)
  return result
}

const sanitizeScores = (scores, tallyMode) => {
  if (!isPlainObject(scores)) throw new SessionBackupError('Invalid scores')
  const sanitized = {}

  for (const [key, score] of Object.entries(scores)) {
    if (!key || key.length > 100 || unsafeObjectKeys.has(key)) {
      throw new SessionBackupError('Invalid score key')
    }
    if (!isPlainObject(score)) {
      throw new SessionBackupError('Invalid score entry')
    }
    const hits = integerNumber(score.hits, `${key} hits`, { min: 0, max: MAX_COUNT })
    const misses = integerNumber(score.misses ?? 0, `${key} misses`, { min: 0, max: MAX_COUNT })
    sanitized[key] = { hits, misses }

    if (key === 'tally') {
      if (!tallyMode || score.possible === undefined) {
        throw new SessionBackupError('Invalid tally scores')
      }
      const possible = integerNumber(score.possible, `${key} possible`, { min: 0, max: MAX_COUNT })
      if (hits > possible || misses !== 0) throw new SessionBackupError('Invalid tally scores')
      sanitized[key].possible = possible
    } else if (score.possible !== undefined) {
      const possible = integerNumber(score.possible, `${key} possible`, { min: 0, max: MAX_COUNT })
      if (possible !== hits + misses) throw new SessionBackupError(`Invalid ${key} possible`)
      sanitized[key].possible = possible
    }
  }

  if (tallyMode && !Object.hasOwn(sanitized, 'tally')) {
    throw new SessionBackupError('Tally session requires tally scores')
  }

  return sanitized
}

const sanitizeDocct = (docct) => {
  if (docct === undefined || docct === null) return undefined
  if (!isPlainObject(docct)) throw new SessionBackupError('Invalid DocCT session data')

  const completedAt = requiredString(docct.completedAt, 'DocCT completion time')
  const completedTimestamp = new Date(completedAt).getTime()
  if (!Number.isFinite(completedTimestamp) || completedTimestamp < MIN_SESSION_TIMESTAMP || completedTimestamp > MAX_SESSION_TIMESTAMP) {
    throw new SessionBackupError('Invalid DocCT completion time')
  }
  const correctCount = integerNumber(docct.correctCount, 'DocCT correct count', { min: 0, max: MAX_COUNT })
  const totalAnswers = integerNumber(docct.totalAnswers, 'DocCT answer count', { min: 0, max: MAX_COUNT })
  if (correctCount > totalAnswers) throw new SessionBackupError('Invalid DocCT answer counts')

  const sanitized = {
    completedAt,
    mode: requiredString(docct.mode, 'DocCT mode', 50),
    intervalMode: requiredString(docct.intervalMode, 'DocCT interval mode', 50),
    adaptationMode: requiredString(docct.adaptationMode, 'DocCT adaptation mode', 50),
    adaptationStepMs: finiteNumber(docct.adaptationStepMs, 'DocCT adaptation step', { min: 50, max: 500 }),
    durationSec: finiteNumber(docct.durationSec, 'DocCT duration', { min: 0, max: MAX_DURATION_SECONDS }),
    accuracy: finiteNumber(docct.accuracy, 'DocCT accuracy', { min: 0, max: 1 }),
    fastestIntervalMs: finiteNumber(docct.fastestIntervalMs, 'DocCT fastest interval', { min: 1, max: MAX_INTERVAL_MS }),
    endingIntervalMs: finiteNumber(docct.endingIntervalMs, 'DocCT ending interval', { min: 1, max: MAX_INTERVAL_MS }),
    averageResponseTimeMs: finiteNumber(docct.averageResponseTimeMs, 'DocCT response time', { min: 0, max: MAX_INTERVAL_MS }),
    correctCount,
    totalAnswers,
    streaks: integerNumber(docct.streaks, 'DocCT streak count', { min: 0, max: MAX_COUNT }),
    useVoice: Boolean(docct.useVoice),
    useKeypad: Boolean(docct.useKeypad),
  }

  const sessionId = optionalString(docct.sessionId, 'DocCT session ID')
  if (sessionId) sanitized.sessionId = sessionId
  return sanitized
}

const sanitizeCategoryCounts = (counts, totalAnswers) => {
  if (!isPlainObject(counts)) throw new SessionBackupError('Invalid Syllogimous category counts')
  const sanitized = {}
  let total = 0
  for (const [category, count] of Object.entries(counts)) {
    if (!category || category.length > 100 || unsafeObjectKeys.has(category)) {
      throw new SessionBackupError('Invalid Syllogimous category')
    }
    const value = integerNumber(count, `${category} question count`, { min: 0, max: MAX_COUNT })
    sanitized[category] = value
    total += value
  }
  if (total !== totalAnswers) throw new SessionBackupError('Invalid Syllogimous category counts')
  return sanitized
}

const sanitizeSyllogimous = (syllogimous) => {
  if (syllogimous === undefined || syllogimous === null) return undefined
  if (!isPlainObject(syllogimous)) throw new SessionBackupError('Invalid Syllogimous session data')

  const startedAt = requiredString(syllogimous.startedAt, 'Syllogimous start time')
  const completedAt = requiredString(syllogimous.completedAt, 'Syllogimous completion time')
  const startTimestamp = new Date(startedAt).getTime()
  const completedTimestamp = new Date(completedAt).getTime()
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(completedTimestamp) || startTimestamp > completedTimestamp) {
    throw new SessionBackupError('Invalid Syllogimous session times')
  }

  const correctCount = integerNumber(syllogimous.correctCount, 'Syllogimous correct count', { min: 0, max: MAX_COUNT })
  const totalAnswers = integerNumber(syllogimous.totalAnswers, 'Syllogimous answer count', { min: 1, max: MAX_COUNT })
  if (correctCount > totalAnswers) throw new SessionBackupError('Invalid Syllogimous answer counts')

  return {
    sessionId: requiredString(syllogimous.sessionId, 'Syllogimous session ID'),
    startedAt,
    completedAt,
    durationSec: finiteNumber(syllogimous.durationSec, 'Syllogimous duration', { min: 0, max: MAX_DURATION_SECONDS }),
    mode: requiredString(syllogimous.mode, 'Syllogimous mode', 100),
    correctCount,
    totalAnswers,
    averageResponseTimeMs: finiteNumber(syllogimous.averageResponseTimeMs, 'Syllogimous response time', { min: 0, max: MAX_INTERVAL_MS }),
    averagePremises: finiteNumber(syllogimous.averagePremises, 'Syllogimous premise count', { min: 0, max: MAX_COUNT }),
    categoryCounts: sanitizeCategoryCounts(syllogimous.categoryCounts, totalAnswers),
  }
}

export function toPortableSession(game) {
  if (!isPlainObject(game)) throw new SessionBackupError('Invalid session record')
  if (game.status !== 'completed') throw new SessionBackupError('Only completed sessions can be imported')

  const source = game.source ?? 'quad-box'
  if (!sessionSources.has(source)) throw new SessionBackupError('Invalid session source')
  const title = requiredString(game.title, 'session title')
  const mode = requiredString(game.mode ?? title, 'session mode')
  const variant = requiredString(game.variant ?? title, 'session variant')
  const tags = Array.isArray(game.tags)
    ? [...new Set(game.tags.map((tag) => requiredString(tag, 'session tag', 100)))]
    : []

  const tallyMode = mode === 'tally'
  const timestamp = integerNumber(game.timestamp, 'session timestamp', {
    min: MIN_SESSION_TIMESTAMP,
    max: MAX_SESSION_TIMESTAMP,
  })
  const sanitized = {
    source,
    timestamp,
    status: 'completed',
    title,
    mode,
    variant,
    tags,
    scores: sanitizeScores(game.scores, tallyMode),
    completedTrials: integerNumber(game.completedTrials, 'completed trials', { min: 0, max: MAX_COUNT }),
  }

  if (source !== 'syllogimous' || game.nBack !== undefined) {
    sanitized.nBack = finiteNumber(game.nBack, 'n-back level', { min: 0, max: 100 })
  }

  const sessionId = optionalString(game.sessionId, 'session ID')
  const sourceSessionId = optionalString(game.sourceSessionId, 'source session ID')
  if (sessionId) sanitized.sessionId = sessionId
  if (sourceSessionId) sanitized.sourceSessionId = sourceSessionId
  if (game.trialTime !== undefined) {
    sanitized.trialTime = finiteNumber(game.trialTime, 'trial time', { min: 1, max: MAX_INTERVAL_MS })
  }
  if (game.start !== undefined) {
    sanitized.start = integerNumber(game.start, 'session start', {
      min: MIN_SESSION_TIMESTAMP,
      max: timestamp,
    })
  }
  if (sanitized.trialTime === undefined && sanitized.start === undefined) {
    throw new SessionBackupError('Session requires trial time or start time')
  }
  if (tallyMode) {
    if (sanitized.start === undefined || sanitized.completedTrials <= 0) {
      throw new SessionBackupError('Tally session requires start time and completed trials')
    }
    if (sanitized.scores.tally.possible > sanitized.completedTrials) {
      throw new SessionBackupError('Invalid tally scores')
    }
  } else if (Object.hasOwn(sanitized.scores, 'tally')) {
    throw new SessionBackupError('Invalid tally scores')
  }

  const docct = sanitizeDocct(game.docct)
  if (docct) {
    if (new Date(docct.completedAt).getTime() !== timestamp) {
      throw new SessionBackupError('DocCT completion time does not match session timestamp')
    }
    sanitized.docct = docct
  }
  const syllogimous = sanitizeSyllogimous(game.syllogimous)
  if (syllogimous) {
    if (source !== 'syllogimous' || new Date(syllogimous.completedAt).getTime() !== timestamp) {
      throw new SessionBackupError('Syllogimous completion time does not match session timestamp')
    }
    if (new Date(syllogimous.startedAt).getTime() !== sanitized.start) {
      throw new SessionBackupError('Syllogimous start time does not match session start')
    }
    sanitized.syllogimous = syllogimous
  } else if (source === 'syllogimous') {
    throw new SessionBackupError('Syllogimous session data is required')
  }
  return sanitized
}

const validateExportedAt = (exportedAt) => {
  if (typeof exportedAt !== 'string' || !Number.isFinite(new Date(exportedAt).getTime())) {
    throw new SessionBackupError('Invalid backup export time')
  }
  return exportedAt
}

export function createSessionBackup(games, exportedAt = new Date().toISOString()) {
  if (!Array.isArray(games)) throw new SessionBackupError('Backup sessions must be an array')
  if (games.length > MAX_BACKUP_SESSIONS) throw new SessionBackupError('Backup contains too many sessions')

  const portableGames = games.map(toPortableSession)
  const identities = new Set()
  for (const game of portableGames) {
    const keys = [
      game.sessionId ? `session:${game.sessionId}` : null,
      game.sourceSessionId ? `source:${game.source}:${game.sourceSessionId}` : null,
    ].filter(Boolean)
    for (const key of keys) {
      if (identities.has(key)) throw new SessionBackupError(`Duplicate session identity: ${key}`)
      identities.add(key)
    }
  }

  return {
    schemaVersion: SESSION_BACKUP_SCHEMA_VERSION,
    exportedAt: validateExportedAt(exportedAt),
    games: portableGames,
  }
}

export function serializeSessionBackup(games, exportedAt = new Date().toISOString()) {
  return JSON.stringify(createSessionBackup(games, exportedAt), null, 2)
}

export function parseSessionBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_CHARACTERS) {
    throw new SessionBackupError('Backup file is missing or too large')
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SessionBackupError('Backup file is not valid JSON')
  }

  if (!isPlainObject(parsed)) throw new SessionBackupError('Backup must be a JSON object')
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== SESSION_BACKUP_SCHEMA_VERSION) {
    throw new SessionBackupError(`Unsupported backup version: ${parsed.schemaVersion ?? 'missing'}`)
  }

  return createSessionBackup(parsed.games, parsed.exportedAt)
}

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  )
}

const canonicalSession = (game) => JSON.stringify(stableValue(game))

const sessionIdentities = (game) => {
  const identities = []
  if (game.sourceSessionId) identities.push(`source:${game.source}:${game.sourceSessionId}`)
  if (game.sessionId) identities.push(`session:${game.sessionId}`)
  if (identities.length === 0) identities.push(`legacy:${canonicalSession(game)}`)
  return identities
}

const comparableSession = (game) => {
  if (!game.sourceSessionId || !game.sessionId) return game
  const comparable = { ...game }
  delete comparable.sessionId
  return comparable
}

export function planSessionMerge(existingGames, importedGames) {
  if (!Array.isArray(existingGames) || !Array.isArray(importedGames)) {
    throw new SessionBackupError('Merge inputs must be session arrays')
  }

  const known = new Map()
  for (const game of existingGames.map(toPortableSession)) {
    const canonical = canonicalSession(comparableSession(game))
    for (const identity of sessionIdentities(game)) {
      const previous = known.get(identity)
      if (previous && previous !== canonical) {
        throw new SessionBackupError(`Conflicting existing session: ${identity}`)
      }
      known.set(identity, canonical)
    }
  }

  const additions = []
  let duplicates = 0
  for (const game of importedGames.map(toPortableSession)) {
    const identities = sessionIdentities(game)
    const canonical = canonicalSession(comparableSession(game))
    const knownIdentities = identities.filter((identity) => known.has(identity))
    if (knownIdentities.length > 0) {
      for (const identity of knownIdentities) {
        if (known.get(identity) !== canonical) {
          throw new SessionBackupError(`Conflicting imported session: ${identity}`)
        }
      }
      duplicates++
      for (const identity of identities) known.set(identity, canonical)
      continue
    }
    for (const identity of identities) known.set(identity, canonical)
    additions.push(game)
  }

  return { additions, duplicates }
}
