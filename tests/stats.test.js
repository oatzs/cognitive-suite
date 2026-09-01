import { describe, expect, it } from 'vitest'
import {
  chooseInitialProgressMode,
  filterSessions,
  getBestThresholdScores,
  getMetricExplanation,
  getProgressModeOptions,
  getModalityRollups,
  getStreaks,
  groupDaily,
  metricValue,
  normalizeGame,
  resolveProgressMode,
  sessionsToCsv,
  summarizeSessions,
} from '../src/lib/statistics/stats.js'

const session = (overrides = {}) => ({
  source: 'quad-box',
  sourceLabel: 'Quad Box',
  timestamp: new Date(2026, 0, 5, 12).getTime(),
  completedAt: new Date(2026, 0, 5, 12),
  day: '2026-01-05',
  modeKey: 'quad-box:dual',
  modeLabel: 'Dual',
  nLevel: 2,
  accuracy: 0.8,
  durationSec: 60,
  hits: 8,
  possible: 10,
  modalities: [],
  fastestIntervalMs: null,
  responseTimeMs: null,
  ...overrides,
})

describe('Brain Workshop score metrics', () => {
  it('maps fallback to N and advance to N+1', () => {
    expect(metricValue(session({ accuracy: 0.5 }), 'adjusted')).toBe(2)
    expect(metricValue(session({ accuracy: 0.8 }), 'adjusted')).toBe(3)
    expect(metricValue(session({ accuracy: 1 }), 'adjusted')).toBeCloseTo(3.6666667)
  })

  it('implements the remaining four formulas', () => {
    const value = session({ nLevel: 3, accuracy: 0.75 })
    expect(metricValue(value, 'n')).toBe(3)
    expect(metricValue(value, 'accuracy')).toBe(75)
    expect(metricValue(value, 'nAccuracy')).toBe(3.75)
    expect(metricValue(value, 'weightedAccuracy')).toBe(3.5)
  })

  it('explains every available measure', () => {
    for (const key of [
      'sessions',
      'adjusted',
      'n',
      'accuracy',
      'nAccuracy',
      'weightedAccuracy',
      'fastestInterval',
      'responseTime',
    ]) {
      expect(getMetricExplanation(key).summary).toBeTruthy()
    }
  })

  it('builds threshold-score examples from the configured thresholds', () => {
    expect(getMetricExplanation('adjusted', { fallback: 50, advance: 80 }))
      .toMatchObject({
        formula: 'N + (accuracy − fallback threshold) ÷ (advance threshold − fallback threshold)',
        examples: ['50% → 2.00', '65% → 2.50', '80% → 3.00'],
      })

    expect(getMetricExplanation('adjusted', { fallback: 60, advance: 90 }).examples)
      .toEqual(['60% → 2.00', '75% → 2.50', '90% → 3.00'])
  })
})

describe('session normalization and game days', () => {
  it('uses the previous training day before 4 AM', () => {
    const timestamp = new Date(2026, 0, 6, 3, 59).getTime()
    const normalized = normalizeGame({
      timestamp,
      status: 'completed',
      title: 'dual',
      nBack: 2,
      tags: ['position'],
      scores: { position: { hits: 8, misses: 2, possible: 10, percent: 0.8 } },
      total: { hits: 8, possible: 10, percent: 0.8 },
      elapsedSeconds: 60,
    })
    expect(normalized.day).toBe('2026-01-05')
  })

  it('normalizes DocCT-specific speed metrics', () => {
    const normalized = normalizeGame({
      source: 'docct',
      timestamp: new Date(2026, 0, 6, 12).getTime(),
      status: 'completed',
      variant: '2-back',
      nBack: 2,
      tags: ['answer'],
      scores: { answer: { hits: 9, misses: 1, possible: 10 } },
      total: { hits: 9, possible: 10, percent: 0.9 },
      elapsedSeconds: 120,
      docct: { fastestIntervalMs: 850, averageResponseTimeMs: 410 },
    })
    expect(normalized.modeKey).toBe('docct:2-back')
    expect(metricValue(normalized, 'fastestInterval')).toBe(0.85)
    expect(metricValue(normalized, 'responseTime')).toBe(410)
  })

  it('normalizes Syllogimous accuracy, timing, and reasoning metadata', () => {
    const completedAt = new Date(2026, 0, 6, 12).getTime()
    const normalized = normalizeGame({
      source: 'syllogimous',
      timestamp: completedAt,
      status: 'completed',
      variant: 'syllogism',
      tags: ['answer'],
      scores: { answer: { hits: 7, misses: 3, possible: 10 } },
      elapsedSeconds: 150,
      syllogimous: {
        mode: 'syllogism',
        correctCount: 7,
        totalAnswers: 10,
        durationSec: 150,
        averageResponseTimeMs: 1250,
        averagePremises: 3.4,
      },
    })

    expect(normalized).toMatchObject({
      source: 'syllogimous',
      sourceLabel: 'Syllogimous',
      modeKey: 'syllogimous:syllogism',
      modeLabel: 'Syllogism',
      nLevel: null,
      accuracy: 0.7,
      durationSec: 150,
      hits: 7,
      possible: 10,
      responseTimeMs: 1250,
      averagePremises: 3.4,
    })
  })

  it('groups generated tri configurations under Custom N-back', () => {
    const normalized = normalizeGame({
      timestamp: new Date(2026, 0, 6, 12).getTime(),
      status: 'completed',
      title: 'tri',
      nBack: 2,
      tags: ['position', 'audio', 'color'],
      scores: {},
      total: { hits: 0, possible: 0, percent: 0 },
      elapsedSeconds: 60,
    })

    expect(normalized.variant).toBe('custom')
    expect(normalized.modeKey).toBe('quad-box:custom')
    expect(normalized.modeLabel).toBe('Custom')
  })
})

describe('statistics aggregation', () => {
  it('keeps separate best threshold scores for Dual and Quad N-back', () => {
    const scores = getBestThresholdScores([
      session({ modeKey: 'quad-box:dual', variant: 'dual', nLevel: 2, accuracy: 0.8 }),
      session({ modeKey: 'quad-box:dual', variant: 'dual', nLevel: 2, accuracy: 0.9 }),
      session({ modeKey: 'quad-box:quad', variant: 'quad', nLevel: 3, accuracy: 0.5 }),
      session({ modeKey: 'quad-box:quad', variant: 'quad', nLevel: 3, accuracy: 0.8 }),
      session({ source: 'docct', modeKey: 'docct:2-back', variant: '2-back', nLevel: 2, accuracy: 1 }),
    ])

    expect(scores.dual).toBeCloseTo(3.3333333)
    expect(scores.quad).toBe(4)
  })

  it('keeps Dual and Quad N-back as separate progress modes', () => {
    const options = getProgressModeOptions([
      session({ modeKey: 'quad-box:dual', modeLabel: 'Dual', variant: 'dual' }),
      session({ modeKey: 'quad-box:quad', modeLabel: 'Quad', variant: 'quad' }),
    ], 'all')

    expect(options.slice(0, 2)).toEqual([
      { key: 'quad-box:dual', label: 'Dual N-back', source: 'quad-box' },
      { key: 'quad-box:quad', label: 'Quad N-back', source: 'quad-box' },
    ])
    expect(options).toContainEqual({ key: 'quad-box:custom', label: 'Custom N-back', source: 'quad-box' })
  })

  it('includes other completed n-back configurations but excludes tally modes', () => {
    const options = getProgressModeOptions([
      session({ modeKey: 'quad-box:experimental', modeLabel: 'Experimental', variant: 'experimental' }),
      session({ modeKey: 'quad-box:tally-dual', modeLabel: 'Tally Dual', variant: 'tally dual' }),
    ], 'quad-box')

    expect(options).toContainEqual({ key: 'quad-box:experimental', label: 'Experimental N-back', source: 'quad-box' })
    expect(options.some((option) => option.key === 'quad-box:tally-dual')).toBe(false)
  })

  it('offers only recorded Syllogimous modes as progress options', () => {
    const options = getProgressModeOptions([
      session({
        source: 'syllogimous',
        sourceLabel: 'Syllogimous',
        modeKey: 'syllogimous:syllogism',
        modeLabel: 'Syllogism',
        variant: 'syllogism',
        nLevel: null,
      }),
      session({
        source: 'syllogimous',
        sourceLabel: 'Syllogimous',
        modeKey: 'syllogimous:mixed',
        modeLabel: 'Mixed',
        variant: 'mixed',
        nLevel: null,
      }),
      session({ modeKey: 'quad-box:quad', modeLabel: 'Quad', variant: 'quad' }),
    ], 'syllogimous')

    expect(options).toEqual([
      { key: 'syllogimous:mixed', label: 'Mixed', source: 'syllogimous' },
      { key: 'syllogimous:syllogism', label: 'Syllogism', source: 'syllogimous' },
    ])
  })

  it('uses accuracy and response-time metrics without inventing an n-back score for Syllogimous', () => {
    const result = session({
      source: 'syllogimous',
      sourceLabel: 'Syllogimous',
      modeKey: 'syllogimous:mixed',
      modeLabel: 'Mixed',
      nLevel: null,
      accuracy: 0.75,
      responseTimeMs: 1425,
    })

    expect(metricValue(result, 'accuracy')).toBe(75)
    expect(metricValue(result, 'responseTime')).toBe(1425)
    expect(metricValue(result, 'sessions')).toBe(1)
    expect(metricValue(result, 'adjusted')).toBeNull()
    expect(metricValue(result, 'n')).toBeNull()
  })

  it('initially selects Quad when only Quad has progress data', () => {
    const sessions = [
      session({ modeKey: 'quad-box:quad', modeLabel: 'Quad', variant: 'quad' }),
    ]
    const options = getProgressModeOptions(sessions, 'all')

    expect(chooseInitialProgressMode(options, sessions)).toBe('quad-box:quad')
  })

  it('moves an automatic empty selection to newly imported data', () => {
    const sessions = [
      session({ modeKey: 'quad-box:quad', modeLabel: 'Quad', variant: 'quad' }),
    ]
    const options = getProgressModeOptions(sessions, 'all')

    expect(resolveProgressMode(options, sessions, 'quad-box:dual', false))
      .toBe('quad-box:quad')
    expect(resolveProgressMode(options, sessions, 'quad-box:dual', true))
      .toBe('quad-box:dual')
  })

  it('groups daily average and best values', () => {
    const points = groupDaily([
      session({ accuracy: 0.5 }),
      session({ accuracy: 0.9 }),
      session({ day: '2026-01-06', accuracy: 0.7 }),
    ], 'accuracy')
    expect(points).toEqual([
      { day: '2026-01-05', average: 70, best: 90, count: 2 },
      { day: '2026-01-06', average: 70, best: 70, count: 1 },
    ])
  })

  it('counts completed sessions per training day', () => {
    const points = groupDaily([
      session(),
      session(),
      session({ day: '2026-01-06' }),
    ], 'sessions')

    expect(points).toEqual([
      { day: '2026-01-05', average: 2, best: 2, count: 2 },
      { day: '2026-01-06', average: 1, best: 1, count: 1 },
    ])
  })

  it('uses the lowest value as best for interval metrics', () => {
    const points = groupDaily([
      session({ fastestIntervalMs: 1000 }),
      session({ fastestIntervalMs: 750 }),
    ], 'fastestInterval')
    expect(points[0].average).toBe(0.875)
    expect(points[0].best).toBe(0.75)
  })

  it('isolates trainer, mode, and date range', () => {
    const now = new Date(2026, 0, 30, 12).getTime()
    const filtered = filterSessions([
      session({ timestamp: now - 2 * 86400000 }),
      session({ source: 'docct', modeKey: 'docct:1-back', timestamp: now - 2 * 86400000 }),
      session({ timestamp: now - 40 * 86400000 }),
    ], { source: 'quad-box', mode: 'quad-box:dual', range: '30', now })
    expect(filtered).toHaveLength(1)
  })

  it('calculates current and longest calendar-day streaks', () => {
    const base = [
      session({ day: '2026-01-01' }),
      session({ day: '2026-01-02' }),
      session({ day: '2026-01-04' }),
      session({ day: '2026-01-05' }),
      session({ day: '2026-01-06' }),
    ]
    expect(getStreaks(base).longest).toBe(3)
  })

  it('summarizes session counts, duration, and accuracy', () => {
    const now = new Date(2026, 0, 5, 14).getTime()
    const result = summarizeSessions([
      session({ timestamp: now, day: '2026-01-05', accuracy: 0.8 }),
      session({ timestamp: now - 3600000, day: '2026-01-05', accuracy: 0.6, durationSec: 120 }),
    ], now)
    expect(result.todaySessions).toBe(2)
    expect(result.rollingDurationSec).toBe(180)
    expect(result.averageAccuracy).toBeCloseTo(0.7)
  })

  it('rolls up the latest 50 modality results', () => {
    const result = getModalityRollups([
      session({ modalities: [{ key: 'audio', label: 'Audio', hits: 8, possible: 10 }] }),
      session({ modalities: [{ key: 'audio', label: 'Audio', hits: 6, possible: 10 }] }),
    ])
    expect(result[0]).toMatchObject({ label: 'Audio', hits: 14, possible: 20, accuracy: 0.7 })
  })
})

describe('CSV export', () => {
  it('quotes trainer-provided labels safely', () => {
    const csv = sessionsToCsv([session({ modeLabel: 'Dual, custom' })])
    expect(csv).toContain('"Dual, custom"')
    expect(csv.split('\n')).toHaveLength(2)
  })
})
