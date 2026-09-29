// @vitest-environment jsdom
import { mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IctApp from '../src/lib/ict/IctApp.svelte'

let component
let target
let frame
let onActiveChange
let onSessionComplete

beforeEach(() => {
  target = document.createElement('div')
  document.body.append(target)
  onActiveChange = vi.fn()
  onSessionComplete = vi.fn()
  component = mount(IctApp, {target, props: {onActiveChange, onSessionComplete}})
  frame = target.querySelector('iframe')
})

afterEach(async () => {
  await unmount(component)
  target.remove()
})

function message(type, detail = {}, overrides = {}) {
  window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    origin: window.location.origin,
    data: {source: 'cognitive-suite:ict', type, ...detail},
    ...overrides,
  }))
}

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await tick()
}

describe('ICT suite session bridge', () => {
  it('waits for persistence before unlocking navigation after a run', async () => {
    let finishSave
    onSessionComplete.mockReturnValue(new Promise(resolve => { finishSave = resolve }))
    message('active-change', {active: true})
    const session = {sessionId: 'ict-session', mode: 'color'}
    message('session-complete', {session})
    message('active-change', {active: false})
    await settle()
    expect(onSessionComplete).toHaveBeenCalledExactlyOnceWith(session)
    expect(onActiveChange.mock.calls).toEqual([[true]])
    finishSave()
    await settle()
    expect(onActiveChange.mock.calls).toEqual([[true], [false]])
  })

  it('ignores messages from unrelated frames or origins', async () => {
    message('active-change', {active: true}, {source: window})
    message('session-complete', {session: {sessionId: 'other'}}, {origin: 'https://other.test'})
    message('active-change', {active: true}, {data: {source: 'another-game', type: 'active-change', active: true}})
    await settle()
    expect(onActiveChange).not.toHaveBeenCalled()
    expect(onSessionComplete).not.toHaveBeenCalled()
  })

  it('does not unlock a new run when an earlier save finishes', async () => {
    let finishSave
    onSessionComplete.mockReturnValue(new Promise(resolve => { finishSave = resolve }))
    message('session-complete', {session: {sessionId: 'old'}})
    message('active-change', {active: false})
    message('active-change', {active: true})
    await settle()
    finishSave()
    await settle()
    expect(onActiveChange.mock.calls).toEqual([[true]])
  })
})
