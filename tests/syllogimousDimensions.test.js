import { readFileSync } from 'node:fs'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const root = new URL('../public/syllogimous/', import.meta.url)
const html = readFileSync(new URL('index.html', root), 'utf8')
let dom
let evaluate

beforeEach(() => {
  dom = new JSDOM(html, { url: 'https://suite.test/syllogimous/', runScripts: 'outside-only' })
  Object.assign(dom.window, { structuredClone, indexedDB: new IDBFactory(), IDBKeyRange })
  const context = dom.getInternalVMContext()
  evaluate = code => runInContext(code, context, { timeout: 10000 })
  evaluate('let seed = 123456; Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);')
  for (const script of dom.window.document.querySelectorAll('script[src]')) {
    const path = script.getAttribute('src')
    if (!path.startsWith('js/lib/')) {
      runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path, timeout: 10000 })
    }
  }
})

afterEach(() => dom.window.close())

function readRelation(question) {
  const holder = dom.window.document.createElement('div')
  holder.innerHTML = question.conclusion
  const [start, end] = [...holder.querySelectorAll('.subject')].map(node => node.textContent)
  const relation = holder.querySelector('.relation').textContent
  const sign = (positive, negative) => relation.includes(positive) ? 1 : relation.includes(negative) ? -1 : 0
  const stated = [sign('East', 'West'), sign('North', 'South'), sign('Above', 'Below'), sign('will be', 'was')]
  for (const axis of ['W', 'V', 'U'].slice(0, question.wordCoordMap[start].length - 4)) {
    stated.push(sign(`positive ${axis}`, `negative ${axis}`))
  }
  const actual = question.wordCoordMap[start].map((value, i) => Math.sign(value - question.wordCoordMap[end][i]))
  return stated.every((value, i) => value === actual[i])
}

describe('RRT dimensions through 7D', () => {
  it('defaults new profiles to Voronoi emoji with no premise scrambling', () => {
    expect(evaluate('defaultSavedata.useJunkEmoji')).toBe(true)
    expect(evaluate('defaultSavedata.scrambleFactor')).toBe(0)
    expect(evaluate('savedata.useJunkEmoji')).toBe(true)
    expect(evaluate('savedata.scrambleFactor')).toBe(0)
    expect(dom.window.document.getElementById('p-28').checked).toBe(true)
    expect(dom.window.document.getElementById('p-31').value).toBe('0')
  })

  it.each([5, 6, 7])('selects %iD alone, generates questions, and reloads its profile', dimensions => {
    evaluate(`Object.keys(savedata).filter(key => key.startsWith('enable')).forEach(key => savedata[key] = false); populateSettings();`)
    const checkbox = dom.window.document.getElementById(`p-direction-${dimensions}d`)
    checkbox.checked = true
    checkbox.dispatchEvent(new dom.window.Event('input'))
    expect(evaluate('question.category')).toBe(`Space ${dimensions}D`)
    for (const [suffix, value] of [['premises', '5'], ['time', '45'], ['weight', '125'], ['transforms', '2']]) {
      const input = dom.window.document.getElementById(`p-direction-${dimensions}d-${suffix}`)
      input.value = value
      input.dispatchEvent(new dom.window.Event('input'))
    }
    evaluate('PROFILE_STORE.loadProfiles()')
    expect(evaluate('question.countdown')).toBe(45)
    expect(evaluate('question.premises.length')).toBe(5)
    expect(evaluate('question.operations.length')).toBe(2)
    expect(evaluate(`savedata.overrideDirection${dimensions}DWeight`)).toBe(125)
    expect(evaluate(`savedata.enableDirection${dimensions}D`)).toBe(true)
    expect(evaluate('question.type')).toBe(`space-${dimensions}d`)
  })

  it.each([5, 6, 7])('validates %iD conclusions against all coordinates, including transforms', dimensions => {
    for (const [level, interleave] of [[0, false], [2, false], [2, true]]) {
      evaluate(`savedata.space${dimensions}DHardModeLevel = ${level}; savedata.enableTransformInterleave = ${interleave};`)
      const answers = new Set()
      for (let i = 0; i < 20; i++) {
        const question = evaluate(`new DirectionQuestion(new DirectionND(${dimensions})).create(5)`)
        expect(question.isValid).toBe(readRelation(question))
        expect(question.conclusion).not.toMatch(/undefined|NaN/)
        expect(Object.values(question.wordCoordMap).every(coord => coord.length === dimensions && coord.every(Number.isFinite))).toBe(true)
        answers.add(question.isValid)
      }
      expect(answers.size).toBe(2)
    }
  })

  it('expresses every 7D direction distinctly in normal and minimal mode', () => {
    const counts = evaluate(`(() => {
      const generator = new DirectionND(7);
      const normal = new Set();
      const minimal = new Set();
      let reverseMatches = true;
      for (let n = 0; n < 3 ** 7; n++) {
        let value = n;
        const coord = Array.from({length: 7}, () => { const digit = value % 3 - 1; value = Math.floor(value / 3); return digit; });
        if (coord.slice(0, 3).every(value => value === 0)) continue;
        const statement = generator.createDirectionStatement('A', 'B', coord);
        const reversed = generator.createDirectionStatement('B', 'A', inverse(coord));
        normal.add(statement.relation);
        minimal.add(statement.relationMinimal);
        reverseMatches &&= statement.reverse === reversed.relation && statement.reverseMinimal === reversed.relationMinimal;
      }
      return [normal.size, minimal.size, reverseMatches];
    })()`)
    expect([...counts]).toEqual([26 * 3 ** 4, 26 * 3 ** 4, true])
  })

  it('keeps higher-dimensional explanations sparse and includes every axis', () => {
    const explanation = evaluate(`createExplanation({wordCoordMap: {A: [0,0,0,0,0,0,0], B: [100,100,100,100,100,100,100]}})`)
    const holder = dom.window.document.createElement('div')
    holder.innerHTML = explanation
    expect([...holder.querySelectorAll('thead th')].map(node => node.textContent)).toEqual(['Object', 'X', 'Y', 'Z', 'T', 'W', 'V', 'U'])
    expect(holder.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(holder.querySelectorAll('tbody td')).toHaveLength(14)
    expect(explanation.length).toBeLessThan(2000)
  })

  it('preserves new settings in shared profiles and defaults them off in old profiles', () => {
    const settings = evaluate(`(() => {
      savedata.enableDirection7D = true;
      savedata.overrideDirection7DTime = 42;
      savedata.space7DHardModeLevel = 3;
      const shared = JSON.parse(new URL(PROFILE_STORE.generateUrl()).searchParams.get('savedata'));
      PROFILE_STORE.uncompressSavedata(shared);
      const old = {version: 3, enableDirection3D: true};
      new SettingsMigration().update(old);
      return {shared, old};
    })()`)
    expect(settings.shared.enableDirection7D).toBe(true)
    expect(settings.shared.overrideDirection7DTime).toBe(42)
    expect(settings.shared.space7DHardModeLevel).toBe(3)
    expect(settings.old.enableDirection3D).toBe(true)
    for (const dimensions of [5, 6, 7]) {
      expect(settings.old[`enableDirection${dimensions}D`]).toBe(false)
      expect(settings.old[`space${dimensions}DHardModeLevel`]).toBe(0)
    }
  })

  it.each([5, 6, 7])('tracks and advances %iD independently', dimensions => {
    const result = evaluate(`(() => {
      const question = new DirectionQuestion(new DirectionND(${dimensions})).create(4);
      question.answeredAt = question.startedAt + 1000;
      const progress = PROGRESS_STORE.convertForDatabase(question);
      PROGRESS_STORE.success(progress, [], Array(4).fill({timeElapsed: 1000}), progress.type);
      return {key: progress.key, premises: savedata.overrideDirection${dimensions}DPremises, time: savedata.overrideDirection${dimensions}DTime, old: savedata.overrideDirection4DTime};
    })()`)
    expect(result.key).toBe(`space-${dimensions}d-4-30`)
    expect(result.premises).toBe(5)
    expect(result.time).toBe(25)
    expect(result.old).toBeNull()
  })

  it.each([5, 6, 7])('supports %iD analogies and binary questions', dimensions => {
    evaluate(`Object.keys(savedata).filter(key => key.startsWith('enable')).forEach(key => savedata[key] = false); savedata.enableDirection${dimensions}D = true;`)
    const analogy = evaluate('new AnalogyQuestion().create(3)')
    expect(analogy.category).toBe(`Analogy: Space ${dimensions}D`)
    expect(analogy.premises).toHaveLength(3)
    const holder = dom.window.document.createElement('div')
    holder.innerHTML = analogy.conclusion
    const [a, b, c, d] = [...holder.querySelectorAll('.subject')].map(node => analogy.wordCoordMap[node.textContent])
    const same = a.every((value, i) => Math.sign(b[i] - value) === Math.sign(d[i] - c[i]))
    expect(analogy.isValid).toBe(holder.textContent.includes('has the same relation') ? same : !same)
    evaluate('savedata.enableDirection4D = true')
    const binary = evaluate('new BinaryQuestion().create(4)')
    expect(binary.subresults.some(question => question.type === `space-${dimensions}d`)).toBe(true)
    expect(binary.premises).toHaveLength(4)
  })
})
