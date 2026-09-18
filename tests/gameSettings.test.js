// @vitest-environment jsdom
import { mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import GameSettings from '../src/lib/GameSettings.svelte'

describe('N-back game settings', () => {
  let component
  let target

  beforeEach(() => {
    target = document.createElement('div')
    document.body.append(target)
  })

  afterEach(async () => {
    if (component) await unmount(component)
    target?.remove()
  })

  it('allows 100ms trials without changing the 2500ms default', () => {
    component = mount(GameSettings, { target })

    const input = target.querySelector('#trial-time-range')
    expect(input?.min).toBe('100')
    expect(input?.max).toBe('5000')
    expect(input?.step).toBe('100')
    expect(input?.value).toBe('2500')
  })
})
