import { getGameDay } from '../utils'

export const DEFAULT_THRESHOLDS = { advance: 80, fallback: 50 }

export const METRICS = {
  adjusted: { label: 'Threshold score', shortLabel: 'Score', unit: 'score', precision: 2 },
  n: { label: 'N level', shortLabel: 'N', unit: 'score', precision: 2 },
  accuracy: { label: 'Accuracy', shortLabel: 'Accuracy', unit: 'percent', precision: 0 },
  nAccuracy: { label: 'N + accuracy', shortLabel: 'N + accuracy', unit: 'score', precision: 2 },
  weightedAccuracy: { label: 'Weighted N + accuracy', shortLabel: 'Weighted score', unit: 'score', precision: 2 },
  fastestInterval: { label: 'Fastest interval', shortLabel: 'Fastest', unit: 'seconds', precision: 2, lowerIsBetter: true },
  responseTime: { label: 'Response time', shortLabel: 'Response', unit: 'milliseconds', precision: 0, lowerIsBetter: true },
}

const numberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const titleCase = (value) => String(value || '')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

export function normalizeGame(game) {
  const source = game.source === 'docct' ? 'docct' : 'quad-box'
  const timestamp = numberOrNull(game.timestamp) ?? Date.now()
  const accuracy = numberOrNull(game.total?.percent) ?? numberOrNull(game.docct?.accuracy) ?? 0
  const hits = numberOrNull(game.total?.hits) ?? numberOrNull(game.docct?.correctCount) ?? 0
  const possible = numberOrNull(game.total?.possible) ?? numberOrNull(game.docct?.totalAnswers) ?? 0
  const variant = source === 'docct'
    ? game.variant || game.docct?.mode || '1-back'
    : game.variant || game.title || game.mode || 'custom'

  const modalities = Object.entries(game.scores || {})
    .filter(([key]) => key !== 'tally' || source === 'quad-box')
    .map(([key, score]) => {
      const modalityHits = Number(score?.hits) || 0
      const modalityPossible = Number(score?.possible) || modalityHits + (Number(score?.misses) || 0)
      return {
        key,
        label: key === 'answer' ? 'Answers' : titleCase(key === 'shapeColor' ? 'image' : key),
        hits: modalityHits,
        possible: modalityPossible,
        accuracy: modalityPossible > 0 ? modalityHits / modalityPossible : 0,
      }
    })

  return {
    id: game.id,
    source,
    sourceLabel: source === 'docct' ? 'DocCT' : 'Quad Box',
    timestamp,
    completedAt: new Date(timestamp),
    day: getGameDay(timestamp),
    status: game.status || 'completed',
    variant,
    modeKey: `${source}:${variant}`,
    modeLabel: source === 'docct' ? titleCase(variant) : titleCase(variant),
    nLevel: numberOrNull(game.nBack),
    accuracy,
    durationSec: Math.max(0, numberOrNull(game.elapsedSeconds) ?? numberOrNull(game.docct?.durationSec) ?? 0),
    hits,
    possible,
    modalities,
    fastestIntervalMs: numberOrNull(game.docct?.fastestIntervalMs),
    endingIntervalMs: numberOrNull(game.docct?.endingIntervalMs),
    responseTimeMs: numberOrNull(game.docct?.averageResponseTimeMs),
    streaks: numberOrNull(game.docct?.streaks),
    raw: game,
  }
}

export const normalizeGames = (games) => games
  .filter((game) => game.status === 'completed')
  .map(normalizeGame)
  .sort((a, b) => b.timestamp - a.timestamp)

export function metricValue(session, metric, thresholds = DEFAULT_THRESHOLDS) {
  const accuracy = session.accuracy
  const n = session.nLevel

  switch (metric) {
    case 'adjusted': {
      if (!Number.isFinite(n) || thresholds.advance === thresholds.fallback) return null
      return n + ((accuracy * 100) - thresholds.fallback) / (thresholds.advance - thresholds.fallback)
    }
    case 'n':
      return Number.isFinite(n) ? n : null
    case 'accuracy':
      return accuracy * 100
    case 'nAccuracy':
      return Number.isFinite(n) ? n + accuracy : null
    case 'weightedAccuracy':
      return Number.isFinite(n) ? n - 1 + (2 * accuracy) : null
    case 'fastestInterval':
      return Number.isFinite(session.fastestIntervalMs) ? session.fastestIntervalMs / 1000 : null
    case 'responseTime':
      return Number.isFinite(session.responseTimeMs) && session.responseTimeMs > 0 ? session.responseTimeMs : null
    default:
      return null
  }
}

export function filterSessions(sessions, { source = 'all', mode = 'all', range = 'all', now = Date.now() } = {}) {
  const days = range === 'all' ? null : Number(range)
  const cutoff = days ? now - days * 24 * 60 * 60 * 1000 : -Infinity

  return sessions.filter((session) => (
    (source === 'all' || session.source === source) &&
    (mode === 'all' || session.modeKey === mode) &&
    session.timestamp >= cutoff
  ))
}

export function groupDaily(sessions, metric, thresholds = DEFAULT_THRESHOLDS) {
  const grouped = new Map()
  for (const session of sessions) {
    const value = metricValue(session, metric, thresholds)
    if (!Number.isFinite(value)) continue
    if (!grouped.has(session.day)) grouped.set(session.day, [])
    grouped.get(session.day).push(value)
  }

  const lowerIsBetter = Boolean(METRICS[metric]?.lowerIsBetter)
  return [...grouped.entries()]
    .map(([day, values]) => ({
      day,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      best: lowerIsBetter ? Math.min(...values) : Math.max(...values),
      count: values.length,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

const calendarOrdinal = (day) => {
  const [year, month, date] = day.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, date) / 86400000)
}

export function getStreaks(sessions, now = Date.now()) {
  const ordinals = [...new Set(sessions.map((session) => calendarOrdinal(session.day)))].sort((a, b) => a - b)
  if (ordinals.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let running = 1
  for (let index = 1; index < ordinals.length; index++) {
    running = ordinals[index] === ordinals[index - 1] + 1 ? running + 1 : 1
    longest = Math.max(longest, running)
  }

  const today = calendarOrdinal(getGameDay(now))
  const last = ordinals[ordinals.length - 1]
  if (last < today - 1) return { current: 0, longest }

  let current = 1
  for (let index = ordinals.length - 1; index > 0; index--) {
    if (ordinals[index] !== ordinals[index - 1] + 1) break
    current++
  }
  return { current, longest }
}

export function summarizeSessions(sessions, now = Date.now()) {
  const today = getGameDay(now)
  const daySessions = sessions.filter((session) => session.day === today)
  const rollingSessions = sessions.filter((session) => session.timestamp >= now - 24 * 60 * 60 * 1000)
  const duration = (items) => items.reduce((sum, session) => sum + session.durationSec, 0)
  const averageAccuracy = sessions.length
    ? sessions.reduce((sum, session) => sum + session.accuracy, 0) / sessions.length
    : 0

  return {
    todaySessions: daySessions.length,
    todayDurationSec: duration(daySessions),
    rollingSessions: rollingSessions.length,
    rollingDurationSec: duration(rollingSessions),
    totalSessions: sessions.length,
    totalDurationSec: duration(sessions),
    averageAccuracy,
    activeDays: new Set(sessions.map((session) => session.day)).size,
    ...getStreaks(sessions, now),
  }
}

export function getModalityRollups(sessions, limit = 50) {
  const grouped = new Map()
  for (const session of sessions.slice(0, limit)) {
    for (const modality of session.modalities) {
      const key = `${session.source}:${modality.key}`
      if (!grouped.has(key)) {
        grouped.set(key, { source: session.source, label: modality.label, hits: 0, possible: 0 })
      }
      const entry = grouped.get(key)
      entry.hits += modality.hits
      entry.possible += modality.possible
    }
  }

  return [...grouped.values()]
    .map((entry) => ({ ...entry, accuracy: entry.possible > 0 ? entry.hits / entry.possible : 0 }))
    .sort((a, b) => a.source.localeCompare(b.source) || a.label.localeCompare(b.label))
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function sessionsToCsv(sessions) {
  const columns = [
    'trainer', 'completed_at', 'game_day', 'mode', 'n_level', 'accuracy_percent',
    'duration_seconds', 'correct', 'possible', 'fastest_interval_ms',
    'ending_interval_ms', 'average_response_ms', 'streaks',
  ]
  const rows = sessions.map((session) => [
    session.sourceLabel,
    session.completedAt.toISOString(),
    session.day,
    session.modeLabel,
    session.nLevel,
    (session.accuracy * 100).toFixed(2),
    session.durationSec.toFixed(2),
    session.hits,
    session.possible,
    session.fastestIntervalMs,
    session.endingIntervalMs,
    session.responseTimeMs,
    session.streaks,
  ])
  return [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function formatMetric(value, metric) {
  if (!Number.isFinite(value)) return '—'
  const config = METRICS[metric] || METRICS.adjusted
  if (config.unit === 'percent') return `${value.toFixed(config.precision)}%`
  if (config.unit === 'seconds') return `${value.toFixed(config.precision)}s`
  if (config.unit === 'milliseconds') return `${value.toFixed(config.precision)}ms`
  return value.toFixed(config.precision)
}
