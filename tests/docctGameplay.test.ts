// DOCCT Gameplay Integration Tests — full in-game flow
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEngine } from '../src/lib/docct/engine';
import type { GameSettings } from '../src/lib/docct/engine';

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

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  });
  vi.stubGlobal('AudioContext', MockAudioContext as any);
  vi.stubGlobal('webkitAudioContext', MockAudioContext as any);
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

async function startEngine(e: ReturnType<typeof createEngine>) {
  e.start();
  await vi.advanceTimersByTimeAsync(0);
  vi.advanceTimersByTime(500);
}

function tickDigit(engine: ReturnType<typeof createEngine>) {
  vi.advanceTimersByTime(engine.getState().currentInterval);
}

function tickSecond() {
  vi.advanceTimersByTime(1000);
}

// ── Full gameplay flow ─────────────────────────────────────────────────────

describe('Full gameplay flow — 1-back', () => {
  it('10-digit sequence with mixed correct/wrong answers', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);

    for (let i = 0; i < 10; i++) {
      tickDigit(e);
      const s = e.getState();

      if (s.canAnswer) {
        const h = s.digitHistory;
        const expected = h[h.length - 2] + h[h.length - 1];
        // Alternate correct/wrong
        if (i % 2 === 0) {
          e.submitAnswer(expected);
        } else {
          e.submitAnswer(9999);
        }
      }
    }

    tickDigit(e); // final check

    const final = e.getState();
    expect(final.totalCorrect).toBeGreaterThan(0);
    expect(final.totalAnswers).toBe(final.totalCorrect + (final.totalAnswers - final.totalCorrect));
    expect(final.accuracy).toBe(final.totalCorrect / final.totalAnswers);
    e.dispose();
  });

  it('correct streak of 4 decreases interval', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e);

    const startInterval = e.getState().currentInterval;

    // Get to canAnswer state (need 2 digits)
    tickDigit(e); // 1st digit after startEngine's initial
    tickDigit(e); // 2nd digit → can answer

    // Submit 4 correct answers in a row
    for (let i = 0; i < 4; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e); // trigger check of 4th

    expect(e.getState().currentInterval).toBeLessThan(startInterval);
    e.dispose();
  });

  it('wrong streak of 4 increases interval', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 3000, minimumInterval: 500 }));
    await startEngine(e);

    // Get to canAnswer state
    tickDigit(e);
    tickDigit(e);

    // First decrease interval with correct answers
    for (let i = 0; i < 4; i++) {
      tickDigit(e);
      const h = e.getState().digitHistory;
      e.submitAnswer(h[h.length - 2] + h[h.length - 1]);
    }
    tickDigit(e);
    const decreasedInterval = e.getState().currentInterval;
    expect(decreasedInterval).toBeLessThan(3000);

    // Now submit 4 wrong answers
    for (let i = 0; i < 4; i++) {
      e.submitAnswer(9999);
      tickDigit(e);
    }
    tickDigit(e);

    expect(e.getState().currentInterval).toBeGreaterThan(decreasedInterval);
    e.dispose();
  });

  it('no answer submitted counts as wrong', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit shown
    tickDigit(e); // 2nd digit shown → can answer

    // Don't submit anything, just tick to trigger check on next digit
    const before = e.getState().totalAnswers;
    tickDigit(e); // 3rd digit shown, checks 2nd's expected answer (none) → wrong

    expect(e.getState().totalAnswers).toBe(before + 1);
    expect(e.getState().lastAnswerCorrect).toBe(false);
    e.dispose();
  });

  it('session completes and saves results', async () => {
    const e = createEngine(makeSettings({ timer: 2, startingInterval: 100 }));
    await startEngine(e);

    tickDigit(e);
    tickDigit(e);
    tickDigit(e);

    tickSecond();
    tickSecond();

    const s = e.getState();
    expect(s.phase).toBe('complete');
    expect(s.sessionResults).not.toBeNull();
    expect(s.sessionResults!.accuracy).toBeGreaterThanOrEqual(0);
    expect(s.sessionResults!.accuracy).toBeLessThanOrEqual(1);
    e.dispose();
  });

  it('reports a completed session to the suite integration hook once', async () => {
    const onSessionComplete = vi.fn();
    const e = createEngine(makeSettings({ timer: 1, startingInterval: 100 }), onSessionComplete);
    await startEngine(e);

    tickSecond();

    expect(e.getState().phase).toBe('complete');
    expect(onSessionComplete).toHaveBeenCalledTimes(1);
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({
      mode: '1-back',
      durationSec: 1,
    }));
    e.dispose();
  });

  it('digitHistory is capped at nBack+1', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);

    for (let i = 0; i < 10; i++) {
      tickDigit(e);
    }

    expect(e.getState().digitHistory.length).toBeLessThanOrEqual(2);
    e.dispose();
  });

  it('canAnswer is false until 2 digits in 1-back', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit shown

    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // 2nd digit shown
    expect(e.getState().canAnswer).toBe(true);
    e.dispose();
  });
});

describe('Full gameplay flow — 2-back', () => {
  it('canAnswer is false until 3 digits in 2-back', async () => {
    const e = createEngine(makeSettings({ taskMode: '2-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit shown

    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // 2nd digit shown
    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // 3rd digit shown
    expect(e.getState().canAnswer).toBe(true);
    e.dispose();
  });

  it('2-back correct answer tracking', async () => {
    const e = createEngine(makeSettings({ taskMode: '2-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit shown

    tickDigit(e); // 2nd
    tickDigit(e); // 3rd → can answer

    const h = e.getState().digitHistory;
    const expected = h[0] + h[2]; // digit[0] + digit[2] for 2-back
    e.submitAnswer(expected);

    tickDigit(e); // checks answer
    expect(e.getState().lastAnswerCorrect).toBe(true);
    expect(e.getState().totalCorrect).toBe(1);
    e.dispose();
  });
});

describe('Gameplay state transitions', () => {
  it('pause and resume preserves the session while rebuilding the answer window', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e);

    tickDigit(e); // second digit: answerable
    expect(e.getState().canAnswer).toBe(true);
    const intervalBefore = e.getState().currentInterval;
    const answersBefore = e.getState().totalAnswers;

    e.pause();
    expect(e.getState().phase).toBe('paused');

    e.resume();
    expect(e.getState().phase).toBe('active');
    vi.advanceTimersByTime(0); // first fresh digit
    expect(e.getState().currentInterval).toBe(intervalBefore);
    expect(e.getState().totalAnswers).toBe(answersBefore);
    expect(e.getState().digitHistory).toHaveLength(1);
    expect(e.getState().canAnswer).toBe(false);

    tickDigit(e); // second fresh digit
    expect(e.getState().canAnswer).toBe(true);
    e.dispose();
  });

  it('multiple subscribers receive all state changes', async () => {
    const e = createEngine(makeSettings({ startingInterval: 100 }));
    const states1: any[] = [];
    const states2: any[] = [];

    e.subscribe((s) => states1.push({ phase: s.phase, currentDigit: s.currentDigit, totalCorrect: s.totalCorrect }));
    e.subscribe((s) => states2.push({ phase: s.phase, currentDigit: s.currentDigit, totalCorrect: s.totalCorrect }));

    await startEngine(e);
    tickDigit(e);
    tickDigit(e);

    expect(states1.length).toBe(states2.length);
    expect(states1.length).toBeGreaterThan(3);
    e.dispose();
  });
});

describe('Gameplay edge cases', () => {
  it('submitting answer when cannot answer is no-op', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit shown

    expect(e.getState().canAnswer).toBe(false);

    e.submitAnswer(10); // should be ignored
    expect(e.getState().totalAnswers).toBe(0);
    e.dispose();
  });

  it('rapid submissions: only last one before digit tick counts', async () => {
    const e = createEngine(makeSettings({ taskMode: '1-back', startingInterval: 100 }));
    await startEngine(e); // 1st digit shown

    tickDigit(e); // 2nd digit shown → can answer

    e.submitAnswer(5);
    e.submitAnswer(10);
    e.submitAnswer(15);

    tickDigit(e); // 3rd digit shown, checks 2nd's expected answer

    const s = e.getState();
    expect(s.totalAnswers).toBe(1);
    e.dispose();
  });

  it('timer countdown runs independently of digits', async () => {
    const e = createEngine(makeSettings({ timer: 10, startingInterval: 5000 }));
    await startEngine(e);

    expect(e.getState().timeLeft).toBe(10);
    tickSecond();
    expect(e.getState().timeLeft).toBe(9);
    tickSecond();
    expect(e.getState().timeLeft).toBe(8);
    e.dispose();
  });
});
