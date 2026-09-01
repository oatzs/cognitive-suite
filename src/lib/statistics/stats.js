import { getGameDay } from '../utils'

export const DEFAULT_THRESHOLDS = { advance: 80, fallback: 50 }

export const METRICS = {
  sessions: { label: 'Sessions per day', shortLabel: 'Sessions', unit: 'count', precision: 0 },
  adjusted: { label: 'Threshold score', shortLabel: 'Score', unit: 'score', precision: 2 },
  n: { label: 'N level', shortLabel: 'N', unit: 'score', precision: 2 },
  accuracy: { label: 'Accuracy', shortLabel: 'Accuracy', unit: 'percent', precision: 0 },
  nAccuracy: { label: 'N + accuracy', shortLabel: 'N + accuracy', unit: 'score', precision: 2 },
  weightedAccuracy: { label: 'Weighted N + accuracy', shortLabel: 'Weighted score', unit: 'score', precision: 2 },
  fastestInterval: { label: 'Fastest interval', shortLabel: 'Fastest', unit: 'seconds', precision: 2, lowerIsBetter: true },
  responseTime: { label: 'Response time', shortLabel: 'Response', unit: 'milliseconds', precision: 0, lowerIsBetter: true },
}

const metricExplanations = {
  sessions: {
    summary: 'Counts completed sessions on each training day.',
    detail: 'The graph shows the total sessions completed that day; the best value is the busiest day.',
  },
  n: {
    summary: 'Shows the N-back level used; accuracy does not change the value.',
    formula: 'N',
    examplesLabel: 'Example:',
    examples: ['A 2-back session → 2.00'],
  },
  accuracy: {
    summary: 'Shows the percentage of scored answers that were correct.',
    formula: 'correct answers ÷ possible answers × 100',
    examplesLabel: 'Example:',
    examples: ['8 correct out of 10 → 80%'],
  },
  nAccuracy: {
    summary: 'Adds accuracy as a 0–1 decimal to the N-back level.',
    formula: 'N + accuracy',
    examplesLabel: 'Example:',
    examples: ['2-back at 80% → 2.80'],
  },
  weightedAccuracy: {
    summary: 'Weights accuracy so 50% equals N and 100% equals N + 1.',
    formula: 'N − 1 + (2 × accuracy)',
    examplesLabel: 'At 2-back:',
    examples: ['50% → 2.00', '80% → 2.60', '100% → 3.00'],
  },
  fastestInterval: {
    summary: 'Shows the shortest stimulus interval reached during a DocCT session.',
    detail: 'Measured in seconds. A lower value means the session reached a faster pace.',
  },
  responseTime: {
    summary: 'Shows the average time between a prompt and the response.',
    detail: 'Measured in milliseconds. A lower value means responses were faster.',
  },
}

const formatExplanationPercent = (value) => Number.isInteger(value)
  ? `${value}%`
  : `${value.toFixed(1).replace(/\.0$/, '')}%`

export function getMetricExplanation(metric, thresholds = DEFAULT_THRESHOLDS) {
  if (metric !== 'adjusted') return metricExplanations[metric] ?? { summary: 'Shows this measure for each training day.' }

  const fallback = Number(thresholds.fallback)
  const advance = Number(thresholds.advance)
  const validThresholds = Number.isFinite(fallback) && Number.isFinite(advance) && advance !== fallback
  if (!validThresholds) {
    return {
      summary: 'Converts accuracy into an N-level-equivalent score using the fallback and advance thresholds.',
      detail: 'The fallback and advance thresholds must be different before this score can be calculated.',
      formula: 'N + (accuracy − fallback threshold) ÷ (advance threshold − fallback threshold)',
      examples: [],
    }
  }

  const midpoint = (fallback + advance) / 2
  return {
    summary: 'Converts accuracy into an N-level-equivalent score using the fallback and advance thresholds.',
    detail: 'At the fallback threshold the score equals N; at the advance threshold it equals N + 1.',
    formula: 'N + (accuracy − fallback threshold) ÷ (advance threshold − fallback threshold)',
    examplesLabel: `At 2-back with ${formatExplanationPercent(fallback)}/${formatExplanationPercent(advance)} thresholds:`,
    examples: [
      `${formatExplanationPercent(fallback)} → 2.00`,
      `${formatExplanationPercent(midpoint)} → 2.50`,
      `${formatExplanationPercent(advance)} → 3.00`,
    ],
  }
}

const numberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const titleCase = (value) => String(value || '')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

export function normalizeGame(game) {
  const source = game.source === 'docct'
    ? 'docct'
    : game.source === 'syllogimous'
      ? 'syllogimous'
      : 'quad-box'
  const timestamp = numberOrNull(game.timestamp) ?? Date.now()
  const hits = numberOrNull(game.total?.hits)
    ?? numberOrNull(game.docct?.correctCount)
    ?? numberOrNull(game.syllogimous?.correctCount)
    ?? 0
  const possible = numberOrNull(game.total?.possible)
    ?? numberOrNull(game.docct?.totalAnswers)
    ?? numberOrNull(game.syllogimous?.totalAnswers)
    ?? 0
  const accuracy = numberOrNull(game.total?.percent)
    ?? numberOrNull(game.docct?.accuracy)
    ?? (possible > 0 ? hits / possible : 0)
  const recordedVariant = source === 'docct'
    ? game.variant || game.docct?.mode || '1-back'
    : source === 'syllogimous'
      ? game.variant || game.syllogimous?.mode || 'mixed'
    : game.variant || game.title || game.mode || 'custom'
  const variant = source === 'quad-box' && (recordedVariant === 'tri' || String(recordedVariant).toLowerCase().startsWith('custom'))
    ? 'custom'
    : recordedVariant

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
    sourceLabel: source === 'docct' ? 'DocCT' : source === 'syllogimous' ? 'Syllogimous' : 'Quad Box',
    timestamp,
    completedAt: new Date(timestamp),
    day: getGameDay(timestamp),
    status: game.status || 'completed',
    variant,
    modeKey: `${source}:${variant}`,
    modeLabel: source === 'docct' ? titleCase(variant) : titleCase(variant),
    nLevel: numberOrNull(game.nBack),
    accuracy,
    durationSec: Math.max(0, numberOrNull(game.elapsedSeconds) ?? numberOrNull(game.docct?.durationSec) ?? numberOrNull(game.syllogimous?.durationSec) ?? 0),
    hits,
    possible,
    modalities,
    fastestIntervalMs: numberOrNull(game.docct?.fastestIntervalMs),
    endingIntervalMs: numberOrNull(game.docct?.endingIntervalMs),
    responseTimeMs: numberOrNull(game.docct?.averageResponseTimeMs) ?? numberOrNull(game.syllogimous?.averageResponseTimeMs),
    streaks: numberOrNull(game.docct?.streaks),
    averagePremises: numberOrNull(game.syllogimous?.averagePremises),
    raw: game,
  }
}

export const normalizeGames = (games) => games
  .filter((game) => game.status === 'completed')
  .map(normalizeGame)
  .sort((a, b) => b.timestamp - a.timestamp)

const primaryProgressModes = [
  { key: 'quad-box:dual', label: 'Dual N-back', source: 'quad-box' },
  { key: 'quad-box:quad', label: 'Quad N-back', source: 'quad-box' },
  { key: 'quad-box:custom', label: 'Custom N-back', source: 'quad-box' },
]

export function getProgressModeOptions(sessions, source = 'all') {
  if (source === 'docct' || source === 'syllogimous') {
    const options = new Map()
    for (const session of sessions) {
      if (session.source !== source || options.has(session.modeKey)) continue
      options.set(session.modeKey, {
        key: session.modeKey,
        label: session.modeLabel,
        source: session.source,
      })
    }
    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label))
  }

  const options = new Map(primaryProgressModes.map((option) => [option.key, { ...option }]))
  for (const session of sessions) {
    const isTally = session.raw?.mode === 'tally' || String(session.variant || '').startsWith('tally')
    if (session.source !== 'quad-box' || isTally || options.has(session.modeKey)) continue
    options.set(session.modeKey, {
      key: session.modeKey,
      label: `${session.modeLabel} N-back`,
      source: session.source,
    })
  }

  const primaryOrder = new Map(primaryProgressModes.map((option, index) => [option.key, index]))
  return [...options.values()].sort((a, b) => {
    const aOrder = primaryOrder.get(a.key)
    const bOrder = primaryOrder.get(b.key)
    if (aOrder !== undefined || bOrder !== undefined) {
      if (aOrder === undefined) return 1
      if (bOrder === undefined) return -1
      return aOrder - bOrder
    }
    return a.label.localeCompare(b.label)
  })
}

export function chooseInitialProgressMode(options, sessions) {
  const modesWithData = new Set(sessions.map((session) => session.modeKey))
  return options.find((option) => modesWithData.has(option.key))?.key
    ?? options[0]?.key
    ?? null
}

export function resolveProgressMode(options, sessions, currentMode, manuallySelected) {
  const valid = options.some((option) => option.key === currentMode)
  const hasData = sessions.some((session) => session.modeKey === currentMode)
  if (valid && (manuallySelected || hasData)) return currentMode
  return chooseInitialProgressMode(options, sessions)
}

export function metricValue(session, metric, thresholds = DEFAULT_THRESHOLDS) {
  const accuracy = session.accuracy
  const n = session.nLevel

  switch (metric) {
    case 'sessions':
      return 1
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
    .map(([day, values]) => {
      const count = values.length
      return {
        day,
        average: metric === 'sessions' ? count : values.reduce((sum, value) => sum + value, 0) / count,
        best: metric === 'sessions' ? count : lowerIsBetter ? Math.min(...values) : Math.max(...values),
        count,
      }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

const getBestThresholdScore = (sessions, thresholds) => {
  const values = sessions
    .map((session) => metricValue(session, 'adjusted', thresholds))
    .filter(Number.isFinite)
  return values.length ? Math.max(...values) : null
}

export function getBestThresholdScores(sessions, thresholds = DEFAULT_THRESHOLDS) {
  const bestForMode = (modeKey) => getBestThresholdScore(
    sessions.filter((session) => session.modeKey === modeKey),
    thresholds,
  )

  return {
    dual: bestForMode('quad-box:dual'),
    quad: bestForMode('quad-box:quad'),
  }
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
  if (config.unit === 'count') return value.toFixed(0)
  return value.toFixed(config.precision)
}
