// @vitest-environment jsdom
import { mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MeasurePicker from '../src/lib/statistics/MeasurePicker.svelte'

describe('statistics measure picker', () => {
  let component
  let target

  beforeEach(() => {
    target = document.createElement('div')
    document.body.append(target)
  })

  afterEach(async () => {
    if (component) await unmount(component)
    target.remove()
  })

  it('shows formulas and examples while measures are browsed', async () => {
    const onChange = vi.fn()
    component = mount(MeasurePicker, {
      target,
      props: {
        options: ['adjusted', 'nAccuracy'],
        value: 'adjusted',
        thresholds: { fallback: 50, advance: 80 },
        onChange,
      },
    })

    target.querySelector('[data-measure-trigger]').click()
    await tick()

    const details = target.querySelector('[data-measure-details]')
    expect(details.textContent).toContain('N + (accuracy − fallback threshold)')
    expect(details.textContent).toContain('At 2-back with 50%/80% thresholds:')
    expect(details.textContent).toContain('50% → 2.00')
    expect(details.textContent).toContain('65% → 2.50')
    expect(details.textContent).toContain('80% → 3.00')

    const nAccuracy = target.querySelector('[data-measure-option="nAccuracy"]')
    nAccuracy.dispatchEvent(new MouseEvent('mouseenter'))
    await tick()
    expect(details.textContent).toContain('N + accuracy')
    expect(details.textContent).toContain('2-back at 80% → 2.80')

    nAccuracy.click()
    await tick()
    expect(onChange).toHaveBeenCalledWith('nAccuracy')
    expect(target.querySelector('[data-measure-menu]')).toBeNull()
  })
})
