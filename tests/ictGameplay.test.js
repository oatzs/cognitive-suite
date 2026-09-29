import { readFileSync } from 'node:fs'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const root = new URL('../public/ict/', import.meta.url)
const variants = ['color', 'shape', 'letter', 'number', 'image', 'set', 'mixed', 'switch']
let dom
let evaluate

beforeEach(() => {
  dom = new JSDOM(readFileSync(new URL('index.html', root), 'utf8'), {
    url: 'https://suite.test/ict/', runScripts: 'outside-only',
  })
  const context = dom.getInternalVMContext()
  evaluate = (code) => runInContext(code, context, { timeout: 10000 })
  for (const script of dom.window.document.querySelectorAll('script[src]')) {
    runInContext(readFileSync(new URL(script.getAttribute('src'), root), 'utf8'), context)
  }
  evaluate(`
    ICT.home();
    window.messages = [];
    ICT.notifySuite = (type, detail) => messages.push({type, ...detail});
    window.setTimeout = () => 1;
    window.clearTimeout = () => {};
    window.clock = Date.UTC(2026, 8, 29, 12);
    Date.now = () => clock;
  `)
})

afterEach(() => dom.window.close())

const document = () => dom.window.document
const select = (variant) => document().querySelector(`[data-variant="${variant}"]`).click()
const input = (selector, value) => {
  const field = document().querySelector(selector)
  field.value = String(value)
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}
const adaptiveOn = () => {
  const checkbox = document().querySelector('[data-adaptive]')
  checkbox.checked = true
  checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}
const start = () => {
  document().querySelector('[data-practice]').checked = false
  document().querySelector('[data-start]').click()
}
const records = () => dom.window.messages.filter(message => message.type === 'session-complete')

function scoreTrials(correct = true, isPractice = false) {
  evaluate(`ICT.GNG._finishTrial({isNoGo: false, isPractice: ${isPractice}, correct: ${correct}, response: true, rt: 150, choice: 'go'});`)
}

describe('ICT adaptive settings', () => {
  it.each(variants)('offers editable starting/minimum windows in %s mode', variant => {
    select(variant)
    expect(document().querySelector('[data-adaptstart]').disabled).toBe(true)
    adaptiveOn()
    expect(document().querySelector('[data-adaptstart]').disabled).toBe(false)
    expect(document().querySelector('[data-adaptmin]').disabled).toBe(false)
    input('[data-adaptstart]', 750)
    input('[data-adaptmin]', 125)
    start()
    expect(evaluate('ICT.GNG.cfg')).toMatchObject({variant, adaptive: true, adaptStartMs: 750, adaptMin: 125})
    expect(evaluate('ICT.GNG.stimMs')).toBe(750)
  })

  it('remembers independent mode settings when returning and migrates the last legacy mode only', () => {
    evaluate(`ICT.save('ict', {variant: 'color', adaptive: true, stimMs: 900, adaptMin: 250});`)
    select('color')
    expect(document().querySelector('[data-adaptstart]').value).toBe('900')
    expect(document().querySelector('[data-adaptmin]').value).toBe('250')
    input('[data-adaptstart]', 650)
    input('[data-adaptmin]', 150)
    start()
    evaluate('ICT.GNG.destroy(); ICT.home();')
    select('shape')
    expect(document().querySelector('[data-adaptive]').checked).toBe(false)
    expect(document().querySelector('[data-adaptstart]').value).toBe('1000')
    adaptiveOn()
    input('[data-adaptstart]', 1200)
    input('[data-adaptmin]', 450)
    start()
    evaluate('ICT.GNG.destroy(); ICT.home();')
    select('color')
    expect(document().querySelector('[data-adaptstart]').value).toBe('650')
    expect(document().querySelector('[data-adaptmin]').value).toBe('150')
    expect(evaluate("ICT.load('modes').shape.adaptStartMs")).toBe(1200)
  })

  it('blocks blank/out-of-range windows and a minimum greater than the starting value', () => {
    select('color')
    adaptiveOn()
    for (const [starting, minimum] of [['', 100], [750, ''], ['', ''], [49, 50], [10001, 100], [500, 501]]) {
      input('[data-adaptstart]', starting)
      input('[data-adaptmin]', minimum)
      start()
      expect(document().querySelector('[data-start]')).not.toBeNull()
      expect(document().querySelector('[data-suite-exit]')).toBeNull()
      expect(evaluate('ICT.GNG._sessionStartedAt')).toBeNull()
    }
    input('[data-adaptstart]', 200)
    input('[data-adaptmin]', 50)
    start()
    expect(evaluate('ICT.GNG.stimMs')).toBe(200)
  })

  it('respects the chosen adaptive floor and keeps an upper bound above a large starting window', () => {
    select('color')
    adaptiveOn()
    input('[data-adaptstart]', 2500)
    input('[data-adaptmin]', 2400)
    start()
    scoreTrials(false)
    expect(evaluate('ICT.GNG.stimMs')).toBe(2500)
    for (let i = 0; i < 10; i++) scoreTrials(true)
    expect(evaluate('ICT.GNG.stimMs')).toBe(2400)
    expect(evaluate('ICT.GNG.minStimMs')).toBe(2400)
    scoreTrials(false)
    expect(evaluate('ICT.GNG.stimMs')).toBe(2430)
  })
})

describe('ICT training time recording', () => {
  it('records a finished real run once, excludes practice, and preserves summary data', () => {
    select('color')
    document().querySelector('[data-start]').click()
    expect(records()).toHaveLength(0)
    evaluate('clock += 60000; ICT.GNG._runTrials([], () => {}, true);')
    scoreTrials(true, true)
    evaluate('clock += 60000; ICT.GNG._runSession();')
    scoreTrials(true)
    scoreTrials(false)
    evaluate('clock += 30000; ICT.GNG._results(); ICT.GNG.destroy(); ICT.GNG.destroy();')
    expect(records()).toHaveLength(1)
    expect(records()[0].session).toMatchObject({
      mode: 'color', durationSec: 30, correctCount: 1, totalAnswers: 2,
      averageResponseTimeMs: 150, endedEarly: false, adaptive: false,
      startingWindowMs: 1000,
    })
    expect(records()[0].session.sessionId).toBeTruthy()
  })

  it('saves explicitly ended real runs after a scored trial, but skips empty/practice runs', () => {
    select('image')
    start()
    evaluate('clock += 1000; ICT.GNG.destroy(); ICT.home();')
    expect(records()).toHaveLength(0)
    select('letter')
    document().querySelector('[data-start]').click()
    evaluate('ICT.GNG._runTrials([], () => {}, true);')
    scoreTrials(true, true)
    evaluate('clock += 20000; ICT.GNG.destroy(); ICT.home();')
    expect(records()).toHaveLength(0)
    select('set')
    start()
    scoreTrials(true)
    evaluate('clock += 10000; ICT.GNG.destroy(); ICT.GNG.destroy();')
    expect(records()).toHaveLength(1)
    expect(records()[0].session).toMatchObject({mode: 'set', endedEarly: true, totalAnswers: 1, durationSec: 10})
  })

  it('starts Switch training time after the response-key instructions and assigns unique run IDs', () => {
    select('switch')
    start()
    evaluate('clock += 120000;')
    document().querySelector('[data-go]').click()
    scoreTrials(true)
    evaluate('clock += 5000; ICT.GNG._results(); ICT.GNG.destroy(); ICT.home();')
    expect(records()[0].session.durationSec).toBe(5)
    select('switch')
    start()
    document().querySelector('[data-go]').click()
    scoreTrials(true)
    evaluate('clock += 5000; ICT.GNG._results();')
    expect(records()).toHaveLength(2)
    expect(records()[0].session.sessionId).not.toBe(records()[1].session.sessionId)
  })
})
