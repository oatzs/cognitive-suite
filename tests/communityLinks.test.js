// @vitest-environment jsdom
import { mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CommunityLinks from '../src/lib/CommunityLinks.svelte'

describe('community Discord links', () => {
  let component
  let target

  beforeEach(() => {
    target = document.createElement('div')
    document.body.append(target)
    component = mount(CommunityLinks, { target })
  })

  afterEach(async () => {
    if (component) await unmount(component)
    target.remove()
  })

  it('links the small Discord icon to its named community', () => {
    const links = [...target.querySelectorAll('a')]
    expect(links).toHaveLength(1)
    expect(links.map((link) => link.href)).toEqual([
      'https://discord.gg/brain',
    ])
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Mindbuilding Discord: discord.gg/brain',
    ])
    expect(links.every((link) => link.target === '_blank' && link.querySelector('svg'))).toBe(true)
  })
})
