export const SESSION_BACKUP_SCHEMA_VERSION = 1
export const MAX_BACKUP_SESSIONS = 100_000
export const MAX_BACKUP_CHARACTERS = 25 * 1024 * 1024

export class SessionBackupError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SessionBackupError'
  }
}

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'
const unsafeObjectKeys = new Set(['__proto__', 'constructor', 'prototype'])

const finiteNumber = (value, field, { min = -Infinity, max = Infinity } = {}) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new SessionBackupError(`Invalid ${field}`)
  }
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

const sanitizeScores = (scores) => {
  if (!isPlainObject(scores)) throw new SessionBackupError('Invalid scores')
  const sanitized = {}

  for (const [key, score] of Object.entries(scores)) {
    if (!key || key.length > 100 || unsafeObjectKeys.has(key)) {
      throw new SessionBackupError('Invalid score key')
    }
    if (!isPlainObject(score)) {
      throw new SessionBackupError('Invalid score entry')
    }
    sanitized[key] = {
      hits: finiteNumber(score.hits, `${key} hits`, { min: 0 }),
      misses: finiteNumber(score.misses ?? 0, `${key} misses`, { min: 0 }),
    }
    if (score.possible !== undefined) {
      sanitized[key].possible = finiteNumber(score.possible, `${key} possible`, { min: 0 })
    }
  }

  return sanitized
}

const sanitizeDocct = (docct) => {
  if (docct === undefined || docct === null) return undefined
  if (!isPlainObject(docct)) throw new SessionBackupError('Invalid DocCT session data')

  const sanitized = {
    completedAt: requiredString(docct.completedAt, 'DocCT completion time'),
    mode: requiredString(docct.mode, 'DocCT mode', 50),
    intervalMode: requiredString(docct.intervalMode, 'DocCT interval mode', 50),
    adaptationMode: requiredString(docct.adaptationMode, 'DocCT adaptation mode', 50),
    adaptationStepMs: finiteNumber(docct.adaptationStepMs, 'DocCT adaptation step', { min: 0 }),
    durationSec: finiteNumber(docct.durationSec, 'DocCT duration', { min: 0 }),
    accuracy: finiteNumber(docct.accuracy, 'DocCT accuracy', { min: 0, max: 1 }),
    fastestIntervalMs: finiteNumber(docct.fastestIntervalMs, 'DocCT fastest interval', { min: 0 }),
    endingIntervalMs: finiteNumber(docct.endingIntervalMs, 'DocCT ending interval', { min: 0 }),
    averageResponseTimeMs: finiteNumber(docct.averageResponseTimeMs, 'DocCT response time', { min: 0 }),
    correctCount: finiteNumber(docct.correctCount, 'DocCT correct count', { min: 0 }),
    totalAnswers: finiteNumber(docct.totalAnswers, 'DocCT answer count', { min: 0 }),
    streaks: finiteNumber(docct.streaks, 'DocCT streak count', { min: 0 }),
    useVoice: Boolean(docct.useVoice),
    useKeypad: Boolean(docct.useKeypad),
  }

  const sessionId = optionalString(docct.sessionId, 'DocCT session ID')
  if (sessionId) sanitized.sessionId = sessionId
  return sanitized
}

export function toPortableSession(game) {
  if (!isPlainObject(game)) throw new SessionBackupError('Invalid session record')
  if (game.status !== 'completed') throw new SessionBackupError('Only completed sessions can be imported')

  const source = game.source === 'docct' ? 'docct' : 'quad-box'
  const title = requiredString(game.title, 'session title')
  const mode = requiredString(game.mode ?? title, 'session mode')
  const variant = requiredString(game.variant ?? title, 'session variant')
  const tags = Array.isArray(game.tags)
    ? [...new Set(game.tags.map((tag) => requiredString(tag, 'session tag', 100)))]
    : []

  const sanitized = {
    source,
    timestamp: finiteNumber(game.timestamp, 'session timestamp', { min: 1 }),
    status: 'completed',
    title,
    mode,
    variant,
    nBack: finiteNumber(game.nBack, 'n-back level', { min: 0, max: 100 }),
    tags,
    scores: sanitizeScores(game.scores),
    completedTrials: finiteNumber(game.completedTrials, 'completed trials', { min: 0 }),
    trialTime: finiteNumber(game.trialTime, 'trial time', { min: 0 }),
  }

  const sessionId = optionalString(game.sessionId, 'session ID')
  const sourceSessionId = optionalString(game.sourceSessionId, 'source session ID')
  if (sessionId) sanitized.sessionId = sessionId
  if (sourceSessionId) sanitized.sourceSessionId = sourceSessionId
  if (game.start !== undefined) {
    sanitized.start = finiteNumber(game.start, 'session start', { min: 1 })
  }

  const docct = sanitizeDocct(game.docct)
  if (docct) sanitized.docct = docct
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

  return {
    schemaVersion: SESSION_BACKUP_SCHEMA_VERSION,
    exportedAt: validateExportedAt(exportedAt),
    games: games.map(toPortableSession),
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
  if (parsed.schemaVersion !== SESSION_BACKUP_SCHEMA_VERSION) {
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

const sessionIdentity = (game) => {
  if (game.sourceSessionId) return `source:${game.source}:${game.sourceSessionId}`
  if (game.sessionId) return `session:${game.sessionId}`
  return `legacy:${canonicalSession(game)}`
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
    const identity = sessionIdentity(game)
    const canonical = canonicalSession(comparableSession(game))
    const previous = known.get(identity)
    if (previous && previous !== canonical) {
      throw new SessionBackupError(`Conflicting existing session: ${identity}`)
    }
    known.set(identity, canonical)
  }

  const additions = []
  let duplicates = 0
  for (const game of importedGames.map(toPortableSession)) {
    const identity = sessionIdentity(game)
    const canonical = canonicalSession(comparableSession(game))
    const previous = known.get(identity)
    if (previous !== undefined) {
      if (previous !== canonical) {
        throw new SessionBackupError(`Conflicting imported session: ${identity}`)
      }
      duplicates++
      continue
    }
    known.set(identity, canonical)
    additions.push(game)
  }

  return { additions, duplicates }
}
