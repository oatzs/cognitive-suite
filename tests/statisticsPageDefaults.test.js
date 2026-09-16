// @vitest-environment jsdom
import { mount, unmount } from 'svelte'
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
    vi.restoreAllMocks()
  })

  it('opens on Quad Box, Quad, All time, Quad N-back, and average percentage', async () => {
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
    expect(target.querySelector('[data-measure-trigger]')?.textContent).toContain('Average percentage')
  })
})
