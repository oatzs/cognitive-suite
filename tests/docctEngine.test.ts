// DOCCT Engine Tests — vitest
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEngine,
  DOCCT_SETTING_LIMITS,
  normalizeGameSettings,
} from '../src/lib/docct/engine';
import type { GameSettings } from '../src/lib/docct/engine';

// ── Mock AudioContext (Node has no browser APIs) ────────────────────────────

class MockAudioBufferSourceNode {
  buffer: any = null;
  connect() { return this; }
  start() {}
  stop() {}
}
class MockGainNode {
  gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} };
  connect() { return this; }
}
class MockConstantSourceNode {
  offset = { value: 0 };
  connect() { return this; }
  start() {}
  stop() {}
}
class MockAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  createBufferSource() { return new MockAudioBufferSourceNode(); }
  createGain() { return new MockGainNode(); }
  createConstantSource() { return new MockConstantSourceNode(); }
  decodeAudioData() { return Promise.resolve({ getChannelData: () => new Float32Array(0), duration: 0.1, numberOfChannels: 1, sampleRate: 44100 }); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

// ── Mock localStorage ──────────────────────────────────────────────────────

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  });
  // Mock AudioContext
  vi.stubGlobal('AudioContext', MockAudioContext as any);
  vi.stubGlobal('webkitAudioContext', MockAudioContext as any);
  // Mock fetch (for audio file loading)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  }));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSettings(overrides?: Partial<GameSettings>): GameSettings {
  return {
    timer: 600,
    useVoice: false,
    useKeypad: true,
    keypadLayout: 'classic',
    displayMode: 'standard',
    voicePack: 'rose',
    wrongSound: 'none',
    startingInterval: 3000,
    minimumInterval: 500,
    intervalMode: 'adaptive',
    adaptationMode: 'responsive',
    adaptationStepMs: 100,
    onboardingCompleted: true,
    taskMode: '1-back',
    ...overrides,
  };
}

/**
 * Start engine and flush the async preload path (Promise.all → then → scheduleNextDigit).
 * Must be called BEFORE any timer advances.
 * Also advances past INITIAL_DELAY (500ms) so the first digit fires.
 */
async function startEngine(e: ReturnType<typeof createEngine>) {
  e.start();
  // Flush microtasks: Promise.all().then() in start()
  await vi.advanceTimersByTimeAsync(0);
  // Advance exactly INITIAL_DELAY (500ms) so the first digit fires, but no more
  vi.advanceTimersByTime(500);
}

/**
 * Advance fake timers by exactly one digit interval.
 * After the first digit (fired in startEngine), digits fire every `currentInterval` ms.
 */
function tickDigit(engine: ReturnType<typeof createEngine>) {
  vi.advanceTimersByTime(engine.getState().currentInterval);
}

/** Tick countdown by 1 second. */
function tickSecond() {
  vi.advanceTimersByTime(1000);
}

// ── Digit generation ───────────────────────────────────────────────────────

describe('Digit generation', () => {
  it('generates a digit 1-9 on start', async () => {
    const e = createEngine(makeSettings({ startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // advance one interval → first digit generated

    const d = e.getState().currentDigit;
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThanOrEqual(1);
    expect(d!).toBeLessThanOrEqual(9);
    e.dispose();
  });

  it('digit appears in digitHistory', async () => {
    const e = createEngine(makeSettings({ startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e);

    const s = e.getState();
    expect(s.digitHistory.length).toBeGreaterThanOrEqual(1);
    expect(s.digitHistory[s.digitHistory.length - 1]).toBe(s.currentDigit);
    e.dispose();
  });

  it('voice digit onsets follow the displayed interval rather than adding clip duration', async () => {
    const e = createEngine(makeSettings({
      useVoice: true,
      intervalMode: 'fixed',
      startingInterval: 500,
      minimumInterval: 500,
    }));
    await startEngine(e);

    const firstGeneration = e.getState().digitGeneration;
    expect(firstGeneration).toBe(1);

    // The mock voice clip lasts 100ms. A displayed 500ms interval must still
    // produce the next onset at 500ms, not 500 + 100ms.
    vi.advanceTimersByTime(499);
    expect(e.getState().digitGeneration).toBe(firstGeneration);
    vi.advanceTimersByTime(1);
    expect(e.getState().digitGeneration).toBe(firstGeneration + 1);
    e.dispose();
  });

  it('generates multiple digits over time', async () => {
    let generatedDigit = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => ((generatedDigit++ % 9) + 0.1) / 9);
    const e = createEngine(makeSettings({ startingInterval: 100 }));
    await startEngine(e);

    // History is capped at nBack+1 (2 for 1-back), so check digit changed
    const seen = new Set<number>();
    seen.add(e.getState().currentDigit!);
    for (let i = 0; i < 4; i++) {
      tickDigit(e);
      seen.add(e.getState().currentDigit!);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3); // at least 3 distinct digits
    e.dispose();
  });
});

// ── 1-back answer checking ─────────────────────────────────────────────────
// NOTE: submitAnswer is DEFERRED — correctness checked on next digit tick.

describe('Answer checking — 1-back', () => {
  it('cannot answer until 2 digits exist', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit fires

    expect(e.getState().currentDigit).not.toBeNull();
    expect(e.getState().canAnswer).toBe(false); // need 2 digits for 1-back
    e.dispose();
  });

  it('can answer after 2 digits', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // 1st
    tickDigit(e); // 2nd

    expect(e.getState().canAnswer).toBe(true);
    expect(e.getState().digitHistory.length).toBeGreaterThanOrEqual(2);
    e.dispose();
  });

  it('correct answer accepted (digit[n-2] + digit[n-1])', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // 1st
    tickDigit(e); // 2nd

    const h = e.getState().digitHistory;
    const expected = h[h.length - 2] + h[h.length - 1];
    e.submitAnswer(expected);

    // Answer is deferred — need next tick to check
    tickDigit(e);
    expect(e.getState().lastAnswerCorrect).toBe(true);
    e.dispose();
  });

  it('wrong answer rejected', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // 1st
    tickDigit(e); // 2nd

    e.submitAnswer(9999);
    tickDigit(e); // triggers check
    expect(e.getState().lastAnswerCorrect).toBe(false);
    e.dispose();
  });

  it('tracks multiple correct answers', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // 1st
    tickDigit(e); // 2nd → can answer

    let h = e.getState().digitHistory;
    e.submitAnswer(h[h.length - 2] + h[h.length - 1]); // correct
    tickDigit(e); // 3rd → checks #1

    h = e.getState().digitHistory;
    e.submitAnswer(h[h.length - 2] + h[h.length - 1]); // correct
    tickDigit(e); // 4th → checks #2

    expect(e.getState().totalCorrect).toBe(2);
    e.dispose();
  });

  it('accepts correct answers when wrongSound is fart', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100, wrongSound: 'fart' }));
    await startEngine(e); // 1st digit
    tickDigit(e); // 2nd → can answer

    const h = e.getState().digitHistory;
    e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    tickDigit(e); // triggers check

    expect(e.getState().lastAnswerCorrect).toBe(true);
    expect(e.getState().totalCorrect).toBe(1);
    expect(e.getState().totalAnswers).toBe(1);
    e.dispose();
  });

  it('accepts correct answers with default voice timing and wrongSound=fart', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', useVoice: true, startingInterval: 100, wrongSound: 'fart' }));
    await startEngine(e); // 1st digit
    vi.advanceTimersByTime(e.getState().currentInterval); // 2nd digit at displayed interval

    const h = e.getState().digitHistory;
    e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    vi.advanceTimersByTime(e.getState().currentInterval); // triggers check at displayed interval

    expect(e.getState().lastAnswerCorrect).toBe(true);
    expect(e.getState().totalCorrect).toBe(1);
    expect(e.getState().totalAnswers).toBe(1);
    e.dispose();
  });
});

// ── 2-back answer checking ─────────────────────────────────────────────────

describe('Answer checking — 2-back', () => {
  it('cannot answer until 3 digits', async () => {
    const e = createEngine(makeSettings({ taskMode: '2-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit fires
    tickDigit(e); // 2nd digit fires

    expect(e.getState().canAnswer).toBe(false); // need 3 for 2-back
    e.dispose();
  });

  it('can answer after 3 digits', async () => {
    const e = createEngine(makeSettings({ taskMode: '2-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e);
    tickDigit(e);
    tickDigit(e);

    expect(e.getState().canAnswer).toBe(true);
    expect(e.getState().digitHistory.length).toBeGreaterThanOrEqual(3);
    e.dispose();
  });

  it('correct answer: currentDigit + digit 2 steps ago', async () => {
    const e = createEngine(makeSettings({ taskMode: '2-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e);
    tickDigit(e);
    tickDigit(e);

    const h = e.getState().digitHistory;
    // 2-back: expected = digit[length-3] + digit[length-1]
    const expected = h[h.length - 3] + h[h.length - 1];
    e.submitAnswer(expected);

    tickDigit(e); // checks answer
    expect(e.getState().lastAnswerCorrect).toBe(true);
    e.dispose();
  });

  it('wrong answer rejected in 2-back', async () => {
    const e = createEngine(makeSettings({ taskMode: '2-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e);
    tickDigit(e);
    tickDigit(e);

    e.submitAnswer(9999);
    tickDigit(e);
    expect(e.getState().lastAnswerCorrect).toBe(false);
    e.dispose();
  });
});

// ── Variable mode ──────────────────────────────────────────────────────────

describe('Answer checking — variable mode', () => {
  it('produces both nBack values (1 and 2)', async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const e = createEngine(makeSettings({ taskMode: 'variable', startingInterval: 100 }));
      await startEngine(e);
      tickDigit(e);
      seen.add(e.getState().nBack);
      e.dispose();
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });
});

// ── Interval adaptation ────────────────────────────────────────────────────

describe('Interval adaptation', () => {
  it('decreases after 3 correct answers (STREAK_THRESHOLD=3)', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e); // 1st digit fires

    // Need 3 correct answers to trigger interval decrease
    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e); // check last answer

    const s = e.getState();
    expect(s.currentInterval).toBe(2750); // 3000 - 250 (step at 3.0s = round(3000/12))
    e.dispose();
  });

  it('uses a fixed 100ms speed-up in Classic adaptation', async () => {
    const e = createEngine(makeSettings({
      taskMode: '1-back',
      startingInterval: 3000,
      minimumInterval: 500,
      adaptationMode: 'classic',
    }));
    await startEngine(e);

    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);

    expect(e.getState().currentInterval).toBe(2900);
    e.dispose();
  });

  it('uses a fixed 100ms slow-down in Classic adaptation', async () => {
    const e = createEngine(makeSettings({
      taskMode: '1-back',
      startingInterval: 3000,
      minimumInterval: 500,
      adaptationMode: 'classic',
    }));
    await startEngine(e);

    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);
    expect(e.getState().currentInterval).toBe(2900);

    for (let i = 0; i < 3; i++) {
      e.submitAnswer(9999);
      tickDigit(e);
    }

    expect(e.getState().currentInterval).toBe(3000);
    e.dispose();
  });

  it('clamps Classic adaptation between minimum and starting interval', async () => {
    const e = createEngine(makeSettings({
      taskMode: '1-back',
      startingInterval: 550,
      minimumInterval: 500,
      adaptationMode: 'classic',
    }));
    await startEngine(e);

    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);
    expect(e.getState().currentInterval).toBe(500);

    for (let i = 0; i < 6; i++) {
      e.submitAnswer(9999);
      tickDigit(e);
    }
    expect(e.getState().currentInterval).toBe(550);
    e.dispose();
  });

  it('uses a custom 50ms step in Classic adaptation', async () => {
    const e = createEngine(makeSettings({
      taskMode: '1-back',
      startingInterval: 3000,
      minimumInterval: 500,
      adaptationMode: 'classic',
      adaptationStepMs: 50,
    }));
    await startEngine(e);

    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);
    expect(e.getState().currentInterval).toBe(2950); // 3000 - 50
    e.dispose();
  });

  it('uses a custom 50ms slow-down in Classic adaptation', async () => {
    const e = createEngine(makeSettings({
      taskMode: '1-back',
      startingInterval: 3000,
      minimumInterval: 500,
      adaptationMode: 'classic',
      adaptationStepMs: 50,
    }));
    await startEngine(e);

    // Get to 2950 first
    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);
    expect(e.getState().currentInterval).toBe(2950);

    for (let i = 0; i < 3; i++) {
      e.submitAnswer(9999);
      tickDigit(e);
    }
    expect(e.getState().currentInterval).toBe(3000); // 2950 + 50, capped at starting
    e.dispose();
  });

  it('persists a custom adaptation step', async () => {
    const e = createEngine(makeSettings());
    e.updateSettings({ adaptationMode: 'classic', adaptationStepMs: 50 });

    expect(e.getState().settings.adaptationStepMs).toBe(50);
    expect(JSON.parse(localStorage.getItem('docct:settings:v1')!).adaptationStepMs).toBe(50);
    e.dispose();

    const restored = createEngine();
    expect(restored.getState().settings.adaptationStepMs).toBe(50);
    restored.dispose();
  });

  it('interval increases after 3 wrong answers (STREAK_THRESHOLD)', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e);

    // Decrease interval by getting 3 correct (STREAK_THRESHOLD=3)
    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e); // trigger check of 3rd answer
    expect(e.getState().currentInterval).toBe(2750); // 3000 - 250

    // Submit 3 wrong answers to trigger interval increase
    for (let i = 0; i < 3; i++) {
      e.submitAnswer(9999);
      tickDigit(e); // trigger check
    }
    // One more tick for checkStreakReset to clear wrongStreak
    tickDigit(e);

    const s = e.getState();
    // 2750 + round(2750/12) = 2750 + 229 = 2979
    expect(s.currentInterval).toBe(2979);
    e.dispose();
  });

  it('capped at startingInterval on wrong answer at starting level', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e);
    tickDigit(e);
    tickDigit(e);

    // Submit wrong — interval can't go above startingInterval
    e.submitAnswer(9999);
    tickDigit(e); // trigger check
    expect(e.getState().currentInterval).toBe(3000);
    e.dispose();
  });

  it('cannot go below minimumInterval', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 700, minimumInterval: 500 }));
    await startEngine(e); // 1st

    // Step at 700 = max(10, round(700/25)) = 28ms. Need ~8 streaks = 32 correct.
    for (let i = 0; i < 40; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e); // trigger check
    expect(e.getState().currentInterval).toBe(500); // clamped at minimum
    e.dispose();
  });

  it('correct answer resets wrongStreak', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e); // 1st digit
    tickDigit(e); // 2nd digit → can answer

    // Submit wrong
    e.submitAnswer(9999);
    tickDigit(e); // trigger check → wrongStreak++
    expect(e.getState().wrongStreak).toBe(1);

    // Submit correct next
    tickDigit(e);
    const h = e.getState().digitHistory;
    e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    tickDigit(e); // trigger check → correct, wrongStreak reset
    expect(e.getState().wrongStreak).toBe(0);
    e.dispose();
  });

  it('keeps a fixed interval after a correct streak', async () => {
    const e = createEngine(makeSettings({
      taskMode: '1-back',
      intervalMode: 'fixed',
      adaptationMode: 'classic',
      startingInterval: 500,
      minimumInterval: 500,
    }));
    await startEngine(e);

    for (let i = 0; i < 3; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);

    expect(e.getState().totalCorrect).toBe(3);
    expect(e.getState().currentInterval).toBe(500);
    e.dispose();
  });

  it('keeps a fixed interval after a wrong streak', async () => {
    const e = createEngine(makeSettings({
      timer: 5,
      taskMode: '1-back',
      intervalMode: 'fixed',
      adaptationMode: 'classic',
      startingInterval: 500,
      minimumInterval: 500,
    }));
    await startEngine(e);
    tickDigit(e); // enough history to answer

    for (let i = 0; i < 3; i++) {
      e.submitAnswer(9999);
      tickDigit(e);
    }

    expect(e.getState().wrongStreak).toBe(3);
    expect(e.getState().currentInterval).toBe(500);

    vi.advanceTimersByTime(e.getState().timeLeft * 1000);
    expect(e.getState().phase).toBe('complete');
    expect(e.getState().sessionResults?.intervalMode).toBe('fixed');
    const highScores = JSON.parse(localStorage.getItem('docct:high-scores:v1')!);
    expect(highScores['1-back:fixed']).toBeDefined();
    expect(highScores['1-back']).toBeUndefined();
    e.dispose();
  });
});

// ── Timer countdown ────────────────────────────────────────────────────────

describe('Timer countdown', () => {
  it('counts down each second', async () => {
    const e = createEngine(makeSettings({ timer: 600, startingInterval: 100 }));
    await startEngine(e);

    expect(e.getState().timeLeft).toBe(600);
    tickSecond();
    expect(e.getState().timeLeft).toBe(599);
    tickSecond();
    expect(e.getState().timeLeft).toBe(598);
    e.dispose();
  });

  it('completes when timer reaches 0', async () => {
    const e = createEngine(makeSettings({ timer: 3, startingInterval: 100 }));
    await startEngine(e);

    for (let i = 0; i < 3; i++) tickSecond();

    const s = e.getState();
    expect(s.phase).toBe('complete');
    expect(s.timeLeft).toBe(0);
    expect(s.sessionResults).not.toBeNull();
    e.dispose();
  });
});

// ── State machine transitions ──────────────────────────────────────────────

describe('State machine transitions', () => {
  it('starts in setup if onboarding completed', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    expect(e.getState().phase).toBe('setup');
    e.dispose();
  });

  it('starts in onboarding if not completed', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: false }));
    expect(e.getState().phase).toBe('onboarding');
    e.dispose();
  });

  it('onboarding → setup via completeOnboarding()', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: false }));
    expect(e.getState().phase).toBe('onboarding');
    e.completeOnboarding();
    expect(e.getState().phase).toBe('setup');
    expect(e.getState().settings.onboardingCompleted).toBe(true);
    e.dispose();
  });

  it('setup → active via start()', async () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    await startEngine(e);
    expect(e.getState().phase).toBe('active');
    e.dispose();
  });

  it('active → paused via pause()', async () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    await startEngine(e);
    e.pause();
    expect(e.getState().phase).toBe('paused');
    e.dispose();
  });

  it('paused → active via resume()', async () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    await startEngine(e);
    e.pause();
    e.resume();
    expect(e.getState().phase).toBe('active');
    e.dispose();
  });

  it('resume discards the interrupted 1-back turn and rebuilds the digit window', async () => {
    const e = createEngine(makeSettings({
      onboardingCompleted: true,
      taskMode: '1-back',
      startingInterval: 100,
    }));
    await startEngine(e); // first digit
    tickDigit(e); // second digit: answerable
    expect(e.getState().canAnswer).toBe(true);

    const answersBeforePause = e.getState().totalAnswers;
    e.pause();
    e.resume();
    vi.advanceTimersByTime(0); // immediate first post-resume digit

    expect(e.getState().totalAnswers).toBe(answersBeforePause);
    expect(e.getState().digitHistory).toHaveLength(1);
    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // second fresh digit: 1-back becomes answerable again
    expect(e.getState().totalAnswers).toBe(answersBeforePause);
    expect(e.getState().canAnswer).toBe(true);
    e.dispose();
  });

  it('resume requires three fresh digits before 2-back can be answered', async () => {
    const e = createEngine(makeSettings({
      onboardingCompleted: true,
      taskMode: '2-back',
      startingInterval: 100,
    }));
    await startEngine(e); // first digit
    tickDigit(e); // second digit
    tickDigit(e); // third digit: answerable
    expect(e.getState().canAnswer).toBe(true);

    const answersBeforePause = e.getState().totalAnswers;
    e.pause();
    e.resume();
    vi.advanceTimersByTime(0); // first fresh digit
    expect(e.getState().totalAnswers).toBe(answersBeforePause);
    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // second fresh digit
    expect(e.getState().canAnswer).toBe(false);
    tickDigit(e); // third fresh digit
    expect(e.getState().totalAnswers).toBe(answersBeforePause);
    expect(e.getState().canAnswer).toBe(true);
    e.dispose();
  });

  it('resume rebuilds the window for Variable mode according to its current n-back', async () => {
    // Math.random >= 0.5 forces determineNBack() to choose 2-back.
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const e = createEngine(makeSettings({
      onboardingCompleted: true,
      taskMode: 'variable',
      startingInterval: 100,
    }));
    await startEngine(e);
    tickDigit(e);
    tickDigit(e); // enough digits for forced 2-back
    expect(e.getState().nBack).toBe(2);
    expect(e.getState().canAnswer).toBe(true);

    const answersBeforePause = e.getState().totalAnswers;
    e.pause();
    e.resume();
    vi.advanceTimersByTime(0); // first fresh digit
    expect(e.getState().nBack).toBe(2);
    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // second fresh digit
    expect(e.getState().canAnswer).toBe(false);
    tickDigit(e); // third fresh digit
    expect(e.getState().totalAnswers).toBe(answersBeforePause);
    expect(e.getState().canAnswer).toBe(true);
    e.dispose();
  });

  it('quitting an active session returns to setup without recording time or a session', async () => {
    const onSessionComplete = vi.fn();
    const e = createEngine(makeSettings({ onboardingCompleted: true }), onSessionComplete);
    await startEngine(e);
    vi.advanceTimersByTime(2000);
    e.quit();

    expect(e.getState().phase).toBe('setup');
    expect(e.getState().sessionResults).toBeNull();
    expect(e.loadHistory()).toHaveLength(0);
    expect(onSessionComplete).not.toHaveBeenCalled();
    e.dispose();
  });

  it('does not record a session when quit is requested repeatedly', async () => {
    const onSessionComplete = vi.fn();
    const e = createEngine(makeSettings({ onboardingCompleted: true }), onSessionComplete);
    await startEngine(e);

    e.quit();
    e.quit();
    e.quit();

    expect(e.getState().phase).toBe('setup');
    expect(e.getState().sessionResults).toBeNull();
    expect(e.loadHistory()).toHaveLength(0);
    expect(onSessionComplete).not.toHaveBeenCalled();
    e.dispose();
  });

  it('enters the complete phase even when the completion callback fails', async () => {
    const failure = new Error('canonical persistence failed');
    const onSessionComplete = vi.fn(() => { throw failure; });
    const e = createEngine(makeSettings({ onboardingCompleted: true, timer: 1 }), onSessionComplete);
    await startEngine(e);

    expect(() => tickSecond()).toThrow(failure);
    expect(e.getState()).toEqual(expect.objectContaining({
      phase: 'complete',
      currentDigit: null,
      canAnswer: false,
      isPlayingAudio: false,
    }));
    expect(onSessionComplete).toHaveBeenCalledTimes(1);
    e.dispose();
  });

  it('keeps active session settings immutable and blocks onboarding escape', async () => {
    const e = createEngine(makeSettings({
      onboardingCompleted: true,
      taskMode: '1-back',
      intervalMode: 'fixed',
      startingInterval: 1000,
      minimumInterval: 500,
    }));
    await startEngine(e);

    e.updateSettings({
      taskMode: '2-back',
      intervalMode: 'adaptive',
      startingInterval: 5000,
      minimumInterval: 2000,
    });
    e.showOnboarding();

    expect(e.getState().phase).toBe('active');
    expect(e.getState().settings).toEqual(expect.objectContaining({
      taskMode: '1-back',
      intervalMode: 'fixed',
      startingInterval: 1000,
      minimumInterval: 500,
    }));

    e.quit();
    expect(e.getState().phase).toBe('setup');
    expect(e.getState().sessionResults).toBeNull();
    e.dispose();
  });

  it('pause() is no-op when not active', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    e.pause();
    expect(e.getState().phase).toBe('setup');
    e.dispose();
  });

  it('resume() is no-op when not paused', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    e.resume();
    expect(e.getState().phase).toBe('setup');
    e.dispose();
  });
});

// ── Settings persistence ───────────────────────────────────────────────────

describe('Settings persistence', () => {
  it('normalizes every numeric setting to finite positive bounds', () => {
    const normalized = normalizeGameSettings({
      ...makeSettings(),
      timer: Number.NaN,
      startingInterval: 0,
      minimumInterval: 1e300,
      adaptationStepMs: -1,
    });

    expect(normalized.timer).toBeGreaterThanOrEqual(DOCCT_SETTING_LIMITS.timer.min);
    expect(normalized.timer).toBeLessThanOrEqual(DOCCT_SETTING_LIMITS.timer.max);
    expect(normalized.startingInterval).toBeGreaterThanOrEqual(DOCCT_SETTING_LIMITS.interval.min);
    expect(normalized.startingInterval).toBeLessThanOrEqual(DOCCT_SETTING_LIMITS.interval.max);
    expect(normalized.minimumInterval).toBeGreaterThanOrEqual(DOCCT_SETTING_LIMITS.interval.min);
    expect(normalized.minimumInterval).toBeLessThanOrEqual(normalized.startingInterval);
    expect(normalized.adaptationStepMs).toBeGreaterThanOrEqual(DOCCT_SETTING_LIMITS.adaptationStep.min);
    expect(normalized.adaptationStepMs).toBeLessThanOrEqual(DOCCT_SETTING_LIMITS.adaptationStep.max);
    expect(Object.values(normalized).filter((value) => typeof value === 'number').every(Number.isFinite)).toBe(true);
  });

  it('normalizes interval pairs atomically when the minimum exceeds the start', () => {
    const e = createEngine(makeSettings({ startingInterval: 3000, minimumInterval: 500 }));

    e.updateSettings({ startingInterval: 800, minimumInterval: 5000 });

    expect(e.getState().settings.startingInterval).toBe(800);
    expect(e.getState().settings.minimumInterval).toBe(800);
    expect(JSON.parse(localStorage.getItem('docct:settings:v1')!)).toEqual(e.getState().settings);
    e.dispose();
  });
  it('saves to localStorage on completeOnboarding', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: false }));
    e.completeOnboarding();
    const raw = JSON.parse(localStorage.getItem('docct:settings:v1')!);
    expect(raw.onboardingCompleted).toBe(true);
    e.dispose();
  });

  it('loads from localStorage on creation', () => {
    localStorage.setItem('settings', JSON.stringify({
      timer: 300, taskMode: '2-back', voicePack: 'jenny',
      startingInterval: 5000, minimumInterval: 300, onboardingCompleted: true,
    }));
    const e = createEngine();
    const s = e.getState().settings;
    expect(s.timer).toBe(300);
    expect(s.taskMode).toBe('2-back');
    expect(s.voicePack).toBe('jenny');
    expect(s.startingInterval).toBe(5000);
    expect(s.minimumInterval).toBe(DOCCT_SETTING_LIMITS.interval.min);
    expect(s.onboardingCompleted).toBe(true);
    expect(s.intervalMode).toBe('adaptive');
    expect(s.adaptationMode).toBe('responsive');
    expect(s.keypadLayout).toBe('classic');
    expect(s.displayMode).toBe('standard');
    e.dispose();
  });

  it('persists focus display mode', () => {
    const e = createEngine(makeSettings());
    e.updateSettings({ displayMode: 'focus' });

    expect(e.getState().settings.displayMode).toBe('focus');
    expect(JSON.parse(localStorage.getItem('docct:settings:v1')!).displayMode).toBe('focus');
    e.dispose();

    const restored = createEngine();
    expect(restored.getState().settings.displayMode).toBe('focus');
    restored.dispose();
  });

  it('persists the sequential keypad layout', () => {
    const e = createEngine(makeSettings());
    e.updateSettings({ keypadLayout: 'sequential' });

    expect(e.getState().settings.keypadLayout).toBe('sequential');
    expect(JSON.parse(localStorage.getItem('docct:settings:v1')!).keypadLayout).toBe('sequential');
    e.dispose();

    const restored = createEngine();
    expect(restored.getState().settings.keypadLayout).toBe('sequential');
    restored.dispose();
  });

  it('persists Classic adaptation', () => {
    const e = createEngine(makeSettings());
    e.updateSettings({ adaptationMode: 'classic' });

    expect(e.getState().settings.adaptationMode).toBe('classic');
    expect(JSON.parse(localStorage.getItem('docct:settings:v1')!).adaptationMode).toBe('classic');
    e.dispose();

    const restored = createEngine();
    expect(restored.getState().settings.adaptationMode).toBe('classic');
    restored.dispose();
  });

  it('persists fixed interval pacing', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    e.updateSettings({ intervalMode: 'fixed', startingInterval: 500 });

    const raw = JSON.parse(localStorage.getItem('docct:settings:v1')!);
    expect(raw.intervalMode).toBe('fixed');
    expect(raw.startingInterval).toBe(500);
    e.dispose();
  });

  it('updateSettings persists', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    e.updateSettings({ timer: 900, taskMode: 'variable' });
    const raw = JSON.parse(localStorage.getItem('docct:settings:v1')!);
    expect(raw.timer).toBe(900);
    expect(raw.taskMode).toBe('variable');
    e.dispose();
  });

  it('updates the setup clock when duration changes', () => {
    const e = createEngine(makeSettings({ timer: 600, onboardingCompleted: true }));
    expect(e.getState().timeLeft).toBe(600);

    e.updateSettings({ timer: 300 });

    expect(e.getState().settings.timer).toBe(300);
    expect(e.getState().timeLeft).toBe(300);
    expect(e.getState().totalTime).toBe(300);
    e.dispose();
  });

  it('uses an edited duration when a session completes and after restart', async () => {
    const e = createEngine(makeSettings({ timer: 600, onboardingCompleted: true }));
    e.updateSettings({ timer: 2 });
    await startEngine(e);
    tickSecond();
    tickSecond();

    expect(e.getState().sessionResults?.durationSec).toBe(2);
    e.restart();
    expect(e.getState().timeLeft).toBe(2);
    expect(e.getState().totalTime).toBe(2);
    e.dispose();
  });

  it('overrides take priority over localStorage', () => {
    localStorage.setItem('settings', JSON.stringify({ timer: 100, onboardingCompleted: true }));
    const e = createEngine({ timer: 999 });
    expect(e.getState().settings.timer).toBe(999);
    e.dispose();
  });
});

// ── Score calculation ──────────────────────────────────────────────────────

describe('Score calculation', () => {
  it('accuracy = totalCorrect / totalAnswers', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // 1st
    tickDigit(e); // 2nd → can answer

    // Submit correct
    const h = e.getState().digitHistory;
    e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    tickDigit(e); // checks

    // Submit wrong
    e.submitAnswer(9999);
    tickDigit(e); // checks

    const s = e.getState();
    expect(s.accuracy).toBe(s.totalCorrect / s.totalAnswers);
    e.dispose();
  });

  it('fastestInterval tracks minimum', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e);
    expect(e.getState().fastestInterval).toBe(3000);
    e.dispose();
  });

  it('session results saved on completion', async () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true, timer: 2, startingInterval: 100 }));
    await startEngine(e);

    // Generate some digits
    tickDigit(e);
    tickDigit(e);
    tickDigit(e);

    // Complete
    tickSecond();
    tickSecond();

    const s = e.getState();
    expect(s.phase).toBe('complete');
    expect(s.sessionResults).not.toBeNull();
    expect(s.sessionResults!.mode).toBe('1-back');
    expect(s.sessionResults!.completedAt).toBeTruthy();
    expect(s.sessionResults!.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    const history = e.loadHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.at(-1)!.sessionId).toBe(s.sessionResults!.sessionId);
    e.dispose();
  });
});

// ── Subscribe pattern ──────────────────────────────────────────────────────

describe('Subscribe pattern', () => {
  it('notifies on state change', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    const states: any[] = [];
    const unsub = e.subscribe((s) => states.push(s));

    // subscribe immediately called once
    expect(states.length).toBe(1);
    unsub();
    e.dispose();
  });

  it('unsubscribe stops notifications', async () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    let count = 0;
    const unsub = e.subscribe(() => count++);
    const before = count;
    unsub();
    await startEngine(e);
    expect(count).toBe(before);
    e.dispose();
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('cannot submit answer when not active', () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    e.submitAnswer(10);
    expect(e.getState().lastAnswerCorrect).toBeNull();
    expect(e.getState().totalAnswers).toBe(0);
    e.dispose();
  });

  it('cannot submit answer before enough history', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e); // 1 digit, can't answer

    e.submitAnswer(10);
    // lastAnswerCorrect remains null because submitAnswer is a no-op
    expect(e.getState().totalAnswers).toBe(0);
    e.dispose();
  });

  it('dispose cleans up timers', async () => {
    const e = createEngine(makeSettings({ onboardingCompleted: true }));
    await startEngine(e);
    e.dispose();
    // No errors or leaks
  });

  it('nBack reported in state for variable mode', async () => {
    const e = createEngine(makeSettings({ taskMode: 'variable', startingInterval: 100 }));
    await startEngine(e);
    tickDigit(e);
    const n = e.getState().nBack;
    expect(n === 1 || n === 2).toBe(true);
    e.dispose();
  });
});
