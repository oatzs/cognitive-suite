// @vitest-environment jsdom
import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/gamedb', () => ({
  addImportedGames: vi.fn(),
  getAllCompletedGames: vi.fn().mockResolvedValue([
    {
      id: 1,
      status: 'completed',
      timestamp: new Date(2026, 0, 4, 12).getTime(),
      variant: 'dual',
      nBack: 2,
      elapsedSeconds: 60,
      total: { hits: 7, possible: 10, percent: 0.7 },
      scores: {},
    },
  ]),
}))

import StatisticsPage from '../src/lib/statistics/StatisticsPage.svelte'

describe('Statistics page defaults', () => {
  let component
  let target

  afterEach(async () => {
    if (component) await unmount(component)
    target?.remove()
    vi.clearAllMocks()
  })

  it('opens on Quad Box, Quad, All time, Quad N-back, and threshold score', async () => {
    target = document.createElement('div')
    document.body.append(target)
    component = mount(StatisticsPage, { target })

    await vi.waitFor(() => {
      const filters = [...target.querySelectorAll('.stats-control select')]
      expect(filters.map((select) => select.value)).toEqual([
        'quad-box',
        'quad-box:quad',
        'all',
      ])
    })

    const selectedProgressMode = target.querySelector('[aria-label="Progress mode"] [aria-pressed="true"]')
    expect(selectedProgressMode?.textContent).toBe('Quad N-back')
    expect(target.textContent).toContain('Quad N-back sessions only.')
    const measureTrigger = target.querySelector('[data-measure-trigger]')
    expect(measureTrigger?.textContent).toContain('Threshold score')

    measureTrigger.click()
    await tick()
    expect(target.querySelector('[data-measure-option="brainWorkshop"]')?.textContent).toContain('Brain Workshop')
    expect(target.querySelector('[data-measure-option="accuracy"]')).toBeNull()
  })

  it('shows trainer-specific lifetime cards and all four cards for all trainers', async () => {
    target = document.createElement('div')
    document.body.append(target)
    component = mount(StatisticsPage, { target })

    await vi.waitFor(() => expect(target.querySelector('[aria-label="Lifetime totals"]')).not.toBeNull())

    const lifetime = () => target.querySelector('[aria-label="Lifetime totals"]')
    expect(lifetime().textContent).toContain('Quad N-back')
    expect(lifetime().textContent).toContain('Dual N-back')
    expect(lifetime().textContent).not.toContain('DocCT')
    expect(lifetime().querySelectorAll('[data-lifetime-card]')).toHaveLength(2)

    const trainer = target.querySelector('.stats-control select')
    trainer.value = 'all'
    trainer.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()

    expect(lifetime().textContent).toContain('DocCT')
    expect(lifetime().textContent).toContain('RRT')
    expect(lifetime().textContent).toContain('Quad N-back')
    expect(lifetime().textContent).toContain('Dual N-back')
    expect(lifetime().querySelectorAll('[data-lifetime-card]')).toHaveLength(4)
  })
})
