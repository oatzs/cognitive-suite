import { createSessionId } from '../sessionId.js';
import {
  DOCCT_HIGH_SCORES_KEY,
  DOCCT_HISTORY_KEY,
  DOCCT_SETTINGS_KEY,
  LEGACY_DOCCT_HIGH_SCORES_KEY,
  LEGACY_DOCCT_HISTORY_KEY,
  LEGACY_DOCCT_SETTINGS_KEY,
  readDocctValue,
  writeDocctValue,
} from './persistence.js';

export {
  DOCCT_HIGH_SCORES_KEY,
  DOCCT_HISTORY_KEY,
  DOCCT_SETTINGS_KEY,
} from './persistence.js';

// DOCCT Game Engine — Pure logic with Web Audio API
// Forensically matched to the original at docct.pages.dev

// ── Types ──────────────────────────────────────────────────────────────────

export interface GameSettings {
  timer: number;              // seconds (600 = 10 min)
  useVoice: boolean;
  useKeypad: boolean;
  keypadLayout: 'classic' | 'sequential';
  displayMode: 'standard' | 'focus';
  voicePack: 'rose' | 'rose_fast' | 'jenny';
  wrongSound: 'none' | 'beep' | 'fart'; // sound effect for wrong answers
  startingInterval: number;   // ms (3000)
  minimumInterval: number;    // ms (500)
  intervalMode: 'adaptive' | 'fixed';
  adaptationMode: 'responsive' | 'classic';
  adaptationStepMs: number;       // fixed step size in ms (default 100, range 50–500)
  onboardingCompleted: boolean;
  taskMode: '1-back' | '2-back' | 'variable';
}

export interface SessionResult {
  sessionId: string;
  completedAt: string;
  mode: string;
  intervalMode: 'adaptive' | 'fixed';
  adaptationMode: 'responsive' | 'classic';
  adaptationStepMs: number;
  durationSec: number;
  accuracy: number;           // 0-1
  fastestIntervalMs: number;
  endingIntervalMs: number;
  averageResponseTimeMs: number;
  correctCount: number;
  totalAnswers: number;
  streaks: number;
  useVoice: boolean;
  useKeypad: boolean;
}

export interface GameState {
  phase: 'onboarding' | 'setup' | 'active' | 'paused' | 'ending' | 'complete';
  currentDigit: number | null;
  canAnswer: boolean;
  isPlayingAudio: boolean;
  timeLeft: number;
  totalTime: number;
  accuracy: number;
  fastestInterval: number;
  currentInterval: number;
  correctStreak: number;
  wrongStreak: number;
  totalCorrect: number;
  totalAnswers: number;
  digitHistory: number[];
  digitGeneration: number;
  nBack: number;
  lastAnswerCorrect: boolean | null;
  sessionResults: SessionResult | null;
  history: SessionResult[];
  settings: GameSettings;
  voicePackPath: string;
}

export interface Engine {
  getState(): GameState;
  subscribe(fn: (state: GameState) => void): () => void;
  start(): void;
  pause(): void;
  resume(): void;
  quit(): void;
  restart(): void;
  submitAnswer(answer: number): void;
  completeOnboarding(): void;
  showOnboarding(): void;
  updateSettings(s: Partial<GameSettings>): boolean;
  loadHistory(): SessionResult[];
  dispose(): void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STREAK_THRESHOLD = 3; // correct/wrong streak needed to change interval

/**
 * Responsive adaptation scales with the current interval. Classic uses a
 * fixed-step adjustment chosen by the user (default 100 ms).
 */
function adaptationStep(current: number, mode: GameSettings['adaptationMode'], stepMs: number): number {
  return mode === 'classic' ? stepMs : Math.max(15, Math.round(current / 12));
}
const INITIAL_DELAY = 500; // ms before first digit (matches original)

export const DOCCT_SETTING_LIMITS = {
  timer: { min: 1, max: 86_400 },
  interval: { min: 500, max: 60_000 },
  adaptationStep: { min: 50, max: 500 },
} as const;

export const DEFAULT_SETTINGS: GameSettings = {
  timer: 600,
  useVoice: true,
  useKeypad: true,
  keypadLayout: 'classic',
  displayMode: 'standard',
  voicePack: 'rose',
  wrongSound: 'beep',
  startingInterval: 3000,
  minimumInterval: 500,
  intervalMode: 'adaptive',
  adaptationMode: 'responsive',
  adaptationStepMs: 100,
  onboardingCompleted: false,
  taskMode: '1-back',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function generateDigit(): number {
  return Math.floor(Math.random() * 9) + 1;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  { min, max }: { min: number; max: number },
  integer = false,
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  const bounded = Math.min(max, Math.max(min, number));
  return integer ? Math.round(bounded) : bounded;
}

export function normalizeGameSettings(
  candidate: Partial<GameSettings> = {},
  fallback: GameSettings = DEFAULT_SETTINGS,
): GameSettings {
  const startingInterval = boundedNumber(
    candidate.startingInterval,
    fallback.startingInterval,
    DOCCT_SETTING_LIMITS.interval,
  );
  const requestedMinimum = boundedNumber(
    candidate.minimumInterval,
    Math.min(fallback.minimumInterval, startingInterval),
    DOCCT_SETTING_LIMITS.interval,
  );

  return {
    timer: boundedNumber(candidate.timer, fallback.timer, DOCCT_SETTING_LIMITS.timer, true),
    useVoice: candidate.useVoice === undefined ? fallback.useVoice : Boolean(candidate.useVoice),
    useKeypad: candidate.useKeypad === undefined ? fallback.useKeypad : Boolean(candidate.useKeypad),
    keypadLayout: candidate.keypadLayout === 'sequential' ? 'sequential'
      : candidate.keypadLayout === 'classic' ? 'classic' : fallback.keypadLayout,
    displayMode: candidate.displayMode === 'focus' ? 'focus'
      : candidate.displayMode === 'standard' ? 'standard' : fallback.displayMode,
    voicePack: candidate.voicePack === 'rose_fast' || candidate.voicePack === 'jenny' || candidate.voicePack === 'rose'
      ? candidate.voicePack : fallback.voicePack,
    wrongSound: candidate.wrongSound === 'none' || candidate.wrongSound === 'fart' || candidate.wrongSound === 'beep'
      ? candidate.wrongSound : fallback.wrongSound,
    startingInterval,
    minimumInterval: Math.min(requestedMinimum, startingInterval),
    intervalMode: candidate.intervalMode === 'fixed' ? 'fixed'
      : candidate.intervalMode === 'adaptive' ? 'adaptive' : fallback.intervalMode,
    adaptationMode: candidate.adaptationMode === 'classic' ? 'classic'
      : candidate.adaptationMode === 'responsive' ? 'responsive' : fallback.adaptationMode,
    adaptationStepMs: boundedNumber(
      candidate.adaptationStepMs,
      fallback.adaptationStepMs,
      DOCCT_SETTING_LIMITS.adaptationStep,
    ),
    onboardingCompleted: candidate.onboardingCompleted === undefined
      ? fallback.onboardingCompleted : Boolean(candidate.onboardingCompleted),
    taskMode: candidate.taskMode === '2-back' || candidate.taskMode === 'variable' || candidate.taskMode === '1-back'
      ? candidate.taskMode : fallback.taskMode,
  };
}

function loadSettingsFromStorage(): GameSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = readDocctValue(DOCCT_SETTINGS_KEY, LEGACY_DOCCT_SETTINGS_KEY);
    if (raw) {
      return normalizeGameSettings(JSON.parse(raw));
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettingsToStorage(settings: GameSettings): void {
  if (typeof localStorage === 'undefined') return;
  try { writeDocctValue(DOCCT_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function validateSessionResult(entry: any): SessionResult | null {
  if (!entry || typeof entry !== 'object') return null;
  const mode = entry.mode === '2-back' || entry.mode === 'variable' ? entry.mode : '1-back';
  const completedAt = String(entry.completedAt || '');
  const durationSec = Number(entry.durationSec);
  const accuracy = Number(entry.accuracy);
  const fastestIntervalMs = Number(entry.fastestIntervalMs);
  const endingIntervalMs = Number(entry.endingIntervalMs);
  const streaks = Number(entry.streaks);
  if (!completedAt || !Number.isFinite(durationSec) || !Number.isFinite(accuracy) ||
      !Number.isFinite(fastestIntervalMs) || !Number.isFinite(endingIntervalMs) || !Number.isFinite(streaks)) {
    return null;
  }
  return {
    sessionId: typeof entry.sessionId === 'string' && entry.sessionId
      ? entry.sessionId
      : `docct:${completedAt}`,
    completedAt, mode,
    intervalMode: entry.intervalMode === 'fixed' ? 'fixed' : 'adaptive',
    adaptationMode: entry.adaptationMode === 'classic' ? 'classic' : 'responsive',
    adaptationStepMs: Number(entry.adaptationStepMs) > 0 ? Number(entry.adaptationStepMs) : 100,
    durationSec, accuracy, fastestIntervalMs, endingIntervalMs, streaks,
    useVoice: !!entry.useVoice, useKeypad: !!entry.useKeypad,
    averageResponseTimeMs: Number(entry.averageResponseTimeMs) || 0,
    correctCount: Number(entry.correctCount) || 0,
    totalAnswers: Number(entry.totalAnswers) || 0,
  };
}

function loadHistoryFromStorage(): SessionResult[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = readDocctValue(DOCCT_HISTORY_KEY, LEGACY_DOCCT_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(validateSessionResult).filter(Boolean) as SessionResult[];
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistoryToStorage(history: SessionResult[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    writeDocctValue(DOCCT_HISTORY_KEY, JSON.stringify(history));
  } catch (e: any) {
    // QuotaExceeded handling: drop oldest entries until write succeeds
    if (e?.name === 'QuotaExceededError') {
      const remaining = [...history];
      while (remaining.length > 0) {
        remaining.shift();
        try {
          writeDocctValue(DOCCT_HISTORY_KEY, JSON.stringify(remaining));
          return;
        } catch { /* keep trying */ }
      }
    }
  }
}

interface HighScores {
  fastest: number;
  mostStreaks: number;
  mostCorrect: number;
}

function loadHighScores(): Record<string, HighScores> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = readDocctValue(DOCCT_HIGH_SCORES_KEY, LEGACY_DOCCT_HIGH_SCORES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveHighScores(scores: Record<string, HighScores>): void {
  if (typeof localStorage === 'undefined') return;
  try { writeDocctValue(DOCCT_HIGH_SCORES_KEY, JSON.stringify(scores)); } catch { /* ignore */ }
}

function getBestForMode(mode: string): HighScores {
  const all = loadHighScores();
  return all[mode] || { fastest: 0, mostStreaks: 0, mostCorrect: 0 };
}

function updateBestScores(mode: string, session: { fastest: number; streaks: number; correctRatio: number }): HighScores {
  const best = getBestForMode(mode);
  const updated: HighScores = {
    fastest: best.fastest > 0 ? Math.min(session.fastest, best.fastest) : session.fastest,
    mostStreaks: Math.max(session.streaks, best.mostStreaks),
    mostCorrect: Math.max(session.correctRatio, best.mostCorrect),
  };
  const all = loadHighScores();
  all[mode] = updated;
  saveHighScores(all);
  return updated;
}

// ── Voice pack path map ───────────────────────────────────────────────────

const ASSET_ROOT = `${import.meta.env.BASE_URL || './'}docct`.replace(/\/$/, '');
const assetUrl = (path: string): string => `${ASSET_ROOT}/${path}`;

const VOICE_PACK_PATHS: Record<string, string> = {
  rose: assetUrl('rose'),
  rose_fast: assetUrl('rose_fast'),
  jenny: assetUrl('jenny'),
};

// ── Engine Factory ─────────────────────────────────────────────────────────

export function createEngine(
  overrides?: Partial<GameSettings>,
  onSessionComplete?: (session: SessionResult) => void,
): Engine {
  const subscribers: Array<(state: GameState) => void> = [];

  // Merge persisted settings with defaults, then apply any overrides
  const storedSettings = loadSettingsFromStorage();
  const settings: GameSettings = normalizeGameSettings({ ...storedSettings, ...overrides }, storedSettings);
  let sessionSettings: Readonly<GameSettings> | null = null;
  const activeSettings = (): Readonly<GameSettings> => sessionSettings ?? settings;

  // ── Internal mutable state ─────────────────────────────────────────────
  // These are the engine's private fields. They are NOT exposed directly —
  // buildState() snapshots them into a fresh GameState, and notify() pushes
  // that snapshot to all subscribers.
  let phase: GameState['phase'] = settings.onboardingCompleted ? 'setup' : 'onboarding';
  let currentDigit: number | null = null;  // digit currently shown to the player (1-9)
  let canAnswer = false;     // true once enough digits have been shown for an N-back match
  let isPlayingAudio = false; // true while a voice digit is playing (suppresses ring/text)
  let timeLeft = settings.timer; // seconds remaining in the session (counts down each second)
  let totalTime = settings.timer; // configured session length, refreshed before each session

  // ── Interval (difficulty speed) ────────────────────────────────────────
  // The interval is the gap between digits in ms. Starts at startingInterval
  // (default 3000ms), decreases on correct streaks, increases on wrong streaks.
  // The adaptationStep formula scales proportionally so high intervals drop
  // fast while low intervals slow down (asymptotic approach to the floor).
  let currentInterval = settings.startingInterval; // current gap between digits (ms)
  let fastestInterval = settings.startingInterval; // best (lowest) interval this session

  // ── Streak system ──────────────────────────────────────────────────────
  // Two parallel counter pairs track consecutive correct/wrong answers:
  //   *Counter: raw count toward the next threshold (resets on streak break)
  //   *Streak:  DISPLAY value for the UI bar (capped at STREAK_THRESHOLD)
  // When *Counter hits STREAK_THRESHOLD, the interval adapts and counter resets.
  // longestStreakCount tallies completed streaks (for high score tracking).
  let correctStreak = 0;      // display: consecutive correct (0..STREAK_THRESHOLD)
  let wrongStreak = 0;        // display: consecutive wrong   (0..STREAK_THRESHOLD)
  let longestStreakCount = 0; // how many streaks reached the threshold this session
  let totalCorrect = 0;       // lifetime correct answers this session
  let totalWrong = 0;         // lifetime wrong answers this session

  // ── Digit history ──────────────────────────────────────────────────────
  let digitHistory: number[] = []; // ring buffer of recent digits (for N-back matching)
  let digitGeneration = 0;  // monotonic counter — bumped on each new digit so the UI can
                             // trigger animations without re-running on every notify()
  let currentNBack = 1;      // N-back value for the current turn (1 or 2, or random)
  let lastAnswerCorrect: boolean | null = null; // result of the most recently checked answer
  let sessionResults: SessionResult | null = null; // populated when the session ends

  // ── Streak counters (raw, toward threshold) ───────────────────────────
  // These increment on each correct/wrong answer and reset when the streak
  // breaks (opposite answer) or the threshold is reached (interval adapts).
  // correctStreak/wrongStreak (above) are capped display copies of these.
  let correctStreakCounter = 0;
  let wrongStreakCounter = 0;

  // ── Response time tracking ─────────────────────────────────────────────
  // Measured from digit appearance (digitShownAt) to submitAnswer() call.
  // Only valid answers (not skipped) are included in the average.
  let digitShownAt = 0;       // performance.now() timestamp when digit appeared
  let totalResponseMs = 0;    // sum of all valid response times (ms)
  let responseCount = 0;      // number of valid responses (for averaging)
  let lastResponseTime = 0;   // response time for the current pending answer (ms)

  // ── Pending answer (deferred checking) ─────────────────────────────────
  // Answers are NOT checked on submit. They are stored as pendingAnswer
  // and validated on the NEXT digit (checkPendingAnswer). This matches
  // the original's deferred model: see digit → submit → answer checked
  // when the next digit appears (or at session end).
  let pendingAnswer: number | undefined = undefined; // player's submitted answer
  let expectedAnswer: number | undefined = undefined; // correct answer (digit + N-back digit)

  // ── Timers ─────────────────────────────────────────────────────────────
  let countdownTimer: ReturnType<typeof setInterval> | null = null; // 1-second session clock
  let digitTimer: ReturnType<typeof setTimeout> | null = null;     // next digit timer

  // ── Web Audio API ──────────────────────────────────────────────────────
  let audioContext: AudioContext | null = null;
  let voiceBuffers: (AudioBuffer | null)[] = new Array(9).fill(null);
  let beepBuffer: AudioBuffer | null = null;
  let fartBuffers: (AudioBuffer | null)[] = []; // 8 fart sound variations
  let loadedVoicePack: string = '';
  let audioPlayingId = 0;     // monotonic ID to track which audio is current
  let preloadVersion = 0;     // monotonic ID for voice pack preload race condition

  function getAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext();
      // iOS keepalive: GainNode + ConstantSource prevents AudioContext suspension
      try {
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        const constantSource = audioContext.createConstantSource();
        constantSource.connect(gainNode);
        gainNode.connect(audioContext.destination);
        constantSource.start();
      } catch { /* ignore */ }
    }
    // Resume if suspended (autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  async function preloadVoicePack(packName: string): Promise<void> {
    const ctx = getAudioContext();
    const basePath = VOICE_PACK_PATHS[packName] || VOICE_PACK_PATHS.rose;

    if (loadedVoicePack === packName && voiceBuffers.every(b => b !== null)) return;

    // Race condition guard: increment version, only apply if still current
    const myVersion = ++preloadVersion;

    const buffers: (AudioBuffer | null)[] = [];
    for (let i = 1; i <= 9; i++) {
      if (preloadVersion !== myVersion) return; // newer preload started, abort
      try {
        const response = await fetch(`${basePath}/${i}.wav`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffers.push(audioBuffer);
      } catch {
        buffers.push(null);
      }
    }
    // Only apply if no newer preload started
    if (preloadVersion === myVersion) {
      voiceBuffers = buffers;
      loadedVoicePack = packName;
    }
  }

  async function preloadBeep(): Promise<void> {
    if (beepBuffer) return;
    try {
      const ctx = getAudioContext();
      const response = await fetch(assetUrl('beep.wav'));
      const arrayBuffer = await response.arrayBuffer();
      beepBuffer = await ctx.decodeAudioData(arrayBuffer);
    } catch { /* ignore */ }
  }

  async function preloadFarts(): Promise<void> {
    if (fartBuffers.length > 0 && fartBuffers.every(b => b !== null)) return;
    const ctx = getAudioContext();
    const buffers: (AudioBuffer | null)[] = [];
    for (let i = 1; i <= 8; i++) {
      try {
        const response = await fetch(assetUrl(`farts/fart${i}.mp3`));
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffers.push(audioBuffer);
      } catch {
        buffers.push(null);
      }
    }
    fartBuffers = buffers;
  }

  function playDigitSound(digit: number): number {
    const ctx = getAudioContext();
    const buffer = voiceBuffers[digit - 1];
    if (!buffer) return 0;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return buffer.duration * 1000; // return duration in ms
  }

  function playBeepSound(): void {
    const ctx = getAudioContext();
    if (!beepBuffer) return;

    const source = ctx.createBufferSource();
    source.buffer = beepBuffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  function playWrongSound(): void {
    if (activeSettings().wrongSound === 'fart') {
      playFartSound();
    } else {
      playBeepSound();
    }
  }

  function playFartSound(): void {
    const ctx = getAudioContext();
    // Filter out null buffers and pick a random one
    const available = fartBuffers.filter((b): b is AudioBuffer => b !== null);
    if (available.length === 0) return;
    const buffer = available[Math.floor(Math.random() * available.length)];

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  // ── State builder ──────────────────────────────────────────────────────

  function buildState(): GameState {
    // Live accuracy: totalCorrect / (totalCorrect + totalWrong)
    // This matches the original: me() increments totalCorrect only, Ot() increments totalWrong only
    const totalTrials = totalCorrect + totalWrong;
    const liveAccuracy = totalTrials > 0 ? totalCorrect / totalTrials : 1;

    return {
      phase,
      currentDigit,
      canAnswer,
      isPlayingAudio,
      timeLeft,
      totalTime,
      accuracy: liveAccuracy,
      fastestInterval,
      currentInterval,
      correctStreak,
      wrongStreak,
      totalCorrect,
      totalAnswers: totalCorrect + totalWrong, // total trials (for display)
      digitHistory: [...digitHistory],
      digitGeneration,
      nBack: currentNBack,
      lastAnswerCorrect,
      sessionResults,
      history: loadHistoryFromStorage(),
      settings: { ...settings },
      voicePackPath: assetUrl(activeSettings().voicePack),
    };
  }

  function notify(): void {
    const state = buildState();
    for (const fn of subscribers) fn(state);
  }

  // ── N-Back determination ───────────────────────────────────────────────

  function determineNBack(): number {
    const config = activeSettings();
    if (config.taskMode === 'variable') return Math.random() < 0.5 ? 1 : 2;
    return config.taskMode === '2-back' ? 2 : 1;
  }

  // ── Streak reset check ─────────────────────────────────────────────────
  // After a streak hits the display threshold, reset it so the UI bar
  // starts filling from 0 for the next streak cycle.
  function checkStreakReset(): void {
    if (correctStreak === STREAK_THRESHOLD) correctStreak = 0;
    if (wrongStreak === STREAK_THRESHOLD) wrongStreak = 0;
  }

  // ── Answer checking (deferred to next digit) ───────────────────────────
  // This runs at the START of each new digit cycle (Phase 1), before the
  // new digit is shown. It validates pendingAnswer from the previous turn.
  // Three outcomes: no answer (skip → wrong), correct, or wrong.
  function checkPendingAnswer(): void {
    if (expectedAnswer === undefined) return;

    // Record response time if answer was submitted
    if (pendingAnswer !== undefined && lastResponseTime > 0) {
      totalResponseMs += lastResponseTime;
      responseCount++;
    }

    // If no answer submitted, it's wrong
    if (pendingAnswer === undefined) {
      lastAnswerCorrect = false;
      recordIncorrect();
      if (activeSettings().wrongSound !== 'none') playWrongSound();
      return;
    }

    // Check if answer matches expected
    if (Number(pendingAnswer) === expectedAnswer) {
      lastAnswerCorrect = true;
      recordCorrect();
      return;
    }

    // Wrong answer
    lastAnswerCorrect = false;
    recordIncorrect();
    if (activeSettings().wrongSound !== 'none') playWrongSound();
  }

  // ── Score recording ────────────────────────────────────────────────────
  // recordCorrect/increment the streak, and if the streak hits the
  // threshold, adapt the interval (speed up or slow down).

  function recordCorrect(): void {
    const config = activeSettings();
    totalCorrect++;                    // lifetime correct count
    correctStreakCounter++;            // count toward next speed-up
    wrongStreakCounter = 0;            // break any wrong streak
    wrongStreak = 0;                   // reset wrong display
    correctStreak = Math.min(correctStreakCounter, STREAK_THRESHOLD); // update display (capped)

    if (correctStreakCounter === STREAK_THRESHOLD) {
      longestStreakCount++;            // count completed streaks for high score
      if (config.intervalMode === 'adaptive') {
        // Player hit the streak target — speed up!
        const step = adaptationStep(currentInterval, config.adaptationMode, config.adaptationStepMs);
        currentInterval = Math.max(config.minimumInterval, currentInterval - step);
        fastestInterval = Math.min(fastestInterval, currentInterval);
      }
      correctStreakCounter = 0;        // reset for next streak cycle
    }
  }

  function recordIncorrect(): void {
    const config = activeSettings();
    totalWrong++;                      // lifetime wrong count
    wrongStreakCounter++;              // count toward next slow-down
    correctStreakCounter = 0;          // break any correct streak
    correctStreak = 0;                 // reset correct display
    wrongStreak = Math.min(wrongStreakCounter, STREAK_THRESHOLD); // update display (capped)

    if (wrongStreakCounter === STREAK_THRESHOLD) {
      if (config.intervalMode === 'adaptive') {
        // Player hit the wrong-streak target — slow down!
        const nextInterval = currentInterval + adaptationStep(currentInterval, config.adaptationMode, config.adaptationStepMs);
        // Preserve Responsive's existing unbounded slow-down. Classic stays
        // within the user's configured starting/minimum range.
        currentInterval = config.adaptationMode === 'classic'
          ? Math.min(config.startingInterval, nextInterval)
          : nextInterval;
      }
      wrongStreakCounter = 0;          // reset for next streak cycle
    }
  }

  // ── Timer cleanup ──────────────────────────────────────────────────────

  function stopTimers(): void {
    if (countdownTimer !== null) { clearInterval(countdownTimer); countdownTimer = null; }
    if (digitTimer !== null) { clearTimeout(digitTimer); digitTimer = null; }
  }

  // ── Digit loop ─────────────────────────────────────────────────────────
  // The core game loop. Each call schedules the next digit after `delay` ms.
  // Inside the timeout, the engine runs through 4 phases:
  //   1. Validate the previous turn's answer (deferred checking)
  //   2. Generate a new random digit and update history
  //   3. Compute the expected answer for the NEXT turn (current + N-back)
  //   4. Play audio (if voice mode) and schedule the next digit

  function scheduleNextDigit(delayMs?: number): void {
    if (phase !== 'active') return;
    const delay = delayMs !== undefined ? delayMs : currentInterval;

    digitTimer = setTimeout(() => {
      if (phase !== 'active') return;

      // ── Phase 1: Validate previous turn ──────────────────────────────
      checkStreakReset();   // cap display streaks at threshold
      checkPendingAnswer(); // evaluate the player's answer from the last turn
      pendingAnswer = undefined;
      lastResponseTime = 0;

      // ── Phase 2: Generate new digit ──────────────────────────────────
      const digit = generateDigit();              // random 1-9
      const newHistory = [...digitHistory, digit]; // append to ring buffer
      const nBackValue = determineNBack();         // 1 or 2 (or random for variable mode)

      // Trim history: keep only nBackValue + 1 entries (current + what we compare against)
      while (newHistory.length > nBackValue + 1) newHistory.shift();

      digitHistory = newHistory;
      currentDigit = digit;     // update the displayed digit
      digitGeneration++;        // bump counter so UI animations re-trigger
      currentNBack = nBackValue;

      // ── Phase 3: Compute expected answer ─────────────────────────────
      // Answer = current digit + the digit from nBackValue positions ago.
      // If we don't have enough history yet, expectedAnswer = undefined (can't answer).
      expectedAnswer = newHistory.length > nBackValue
        ? digit + newHistory[newHistory.length - 1 - nBackValue]
        : undefined;

      canAnswer = expectedAnswer !== undefined; // enable/disable answer submission
      digitShownAt = performance.now(); // stamp for response time measurement

      // ── Phase 4: Play audio (if voice mode) ──────────────────────────
      let audioDurationMs = 0;
      audioPlayingId++; // bump monotonic ID so stale audio callbacks are ignored
      if (activeSettings().useVoice) {
        audioDurationMs = playDigitSound(digit); // returns duration in ms
        isPlayingAudio = true;
        notify(); // push state so UI shows playing indicator

        // Two safety timeouts clear isPlayingAudio after the audio duration.
        // The monotonic audioPlayingId ensures only the latest audio's
        // callbacks fire — stale callbacks from previous digits are no-ops.
        const currentId = audioPlayingId;
        setTimeout(() => {
          if (audioPlayingId === currentId && isPlayingAudio) {
            isPlayingAudio = false;
            notify();
          }
        }, audioDurationMs + 200); // +200ms buffer for decode latency

        getAudioContext();
        clearTimeout(digitTimer as any); // clear any stale timer
        setTimeout(() => {
          if (audioPlayingId === currentId) {
            isPlayingAudio = false;
            notify();
          }
        }, audioDurationMs + 100); // second safety net
      } else {
        isPlayingAudio = false;
        notify();
      }

      notify(); // final state push for this digit cycle

      // The interval is onset-to-onset, matching the value shown in the UI.
      // Voice clips are shorter than the supported 500ms minimum interval, so
      // scheduling by currentInterval neither overlaps clips nor adds hidden delay.
      scheduleNextDigit(currentInterval);
    }, delay);
  }

  // ── Countdown timer ────────────────────────────────────────────────────

  function startCountdown(): void {
    countdownTimer = setInterval(() => {
      if (phase !== 'active') return;
      // Original checks timeLeft <= 1 BEFORE decrementing
      if (timeLeft <= 1) {
        timeLeft = 0;
        completeSession();
        return;
      }
      timeLeft--;
      notify();
    }, 1000);
  }

  // ── Session completion ─────────────────────────────────────────────────

  function completeSession(): void {
    if (phase !== 'active' && phase !== 'paused') return;
    phase = 'ending';
    stopTimers();
    audioPlayingId++;
    const config = activeSettings();

    try {
      // Check any pending answer before completing.
      checkStreakReset();
      checkPendingAnswer();
      pendingAnswer = undefined;

      const durationSec = totalTime - timeLeft;
      const totalTrials = totalCorrect + totalWrong;
      const accuracy = totalTrials > 0 ? totalCorrect / totalTrials : 0;
      const averageResponseMs = responseCount > 0 ? totalResponseMs / responseCount : 0;

      sessionResults = {
        sessionId: createSessionId(),
        completedAt: new Date().toISOString(),
        mode: config.taskMode,
        intervalMode: config.intervalMode,
        adaptationMode: config.adaptationMode,
        adaptationStepMs: config.adaptationStepMs,
        durationSec,
        accuracy,
        fastestIntervalMs: fastestInterval,
        endingIntervalMs: currentInterval,
        averageResponseTimeMs: averageResponseMs,
        correctCount: totalCorrect,
        totalAnswers: totalTrials,
        streaks: longestStreakCount,
        useVoice: config.useVoice,
        useKeypad: config.useKeypad,
      };

      const history = loadHistoryFromStorage();
      history.push(sessionResults);
      saveHistoryToStorage(history);
      onSessionComplete?.({ ...sessionResults });

      // Keep fixed-pacing records separate from adaptive records. In fixed mode,
      // the interval is chosen rather than earned through adaptation.
      const highScoreMode = config.intervalMode === 'fixed'
        ? `${config.taskMode}:fixed`
        : config.taskMode;
      updateBestScores(highScoreMode, {
        fastest: fastestInterval,
        streaks: longestStreakCount,
        correctRatio: accuracy,
      });
    } finally {
      phase = 'complete';
      currentDigit = null;
      canAnswer = false;
      isPlayingAudio = false;
      notify();
    }
  }

  function quitSession(): void {
    if (phase !== 'active' && phase !== 'paused') return;
    stopTimers();
    audioPlayingId++;
    sessionSettings = null;
    phase = 'setup';
    timeLeft = settings.timer;
    totalTime = settings.timer;
    currentDigit = null;
    canAnswer = false;
    isPlayingAudio = false;
    pendingAnswer = undefined;
    expectedAnswer = undefined;
    digitHistory = [];
    sessionResults = null;
    notify();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    getState: () => buildState(),

    subscribe(fn) {
      subscribers.push(fn);
      fn(buildState()); // immediate notification
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },

    start() {
      if (phase !== 'setup') return;
      sessionSettings = Object.freeze({ ...settings });
      const config = activeSettings();
      // Reset session state from the latest setup values
      timeLeft = config.timer;
      totalTime = config.timer;
      currentInterval = config.startingInterval;
      fastestInterval = config.startingInterval;
      correctStreak = 0;
      wrongStreak = 0;
      correctStreakCounter = 0;
      wrongStreakCounter = 0;
      longestStreakCount = 0;
      totalCorrect = 0;
      totalWrong = 0;
      digitHistory = [];
      digitGeneration = 0;
      currentNBack = 1;
      lastAnswerCorrect = null;
      sessionResults = null;
      currentDigit = null;
      canAnswer = false;
      isPlayingAudio = false;
      totalResponseMs = 0;
      responseCount = 0;
      lastResponseTime = 0;
      pendingAnswer = undefined;
      expectedAnswer = undefined;

      phase = 'active';
      notify();
      startCountdown();

      // Preload voice pack and beep, then start with initial delay
      Promise.all([
        preloadVoicePack(config.voicePack),
        preloadBeep(),
        preloadFarts(),
      ]).then(() => {
        if (phase === 'active') {
          // Set navigator.audioSession for mobile
          const audioNavigator = typeof navigator === 'undefined'
            ? undefined
            : navigator as Navigator & { audioSession?: { type: string } };
          if (audioNavigator?.audioSession) {
            audioNavigator.audioSession.type = 'playback';
          }
          // Original starts first digit after 500ms (hardcoded initial delay)
          scheduleNextDigit(INITIAL_DELAY);
        }
      });
    },

    pause() {
      if (phase !== 'active') return;
      stopTimers();
      phase = 'paused';
      notify();
    },

    resume() {
      if (phase !== 'paused') return;

      // A paused turn is interrupted, not skipped. Discard its pending answer
      // state and rebuild the N-back window from fresh post-resume digits so
      // resuming cannot immediately record a wrong answer.
      digitHistory = [];
      currentDigit = null;
      canAnswer = false;
      pendingAnswer = undefined;
      expectedAnswer = undefined;
      lastResponseTime = 0;
      digitShownAt = 0;
      digitGeneration++;

      phase = 'active';
      notify();
      startCountdown();
      // Resume with the first fresh digit immediately; normal N-back warm-up
      // then determines when answering becomes available again.
      scheduleNextDigit(0);
    },

    quit() {
      quitSession();
    },

    restart() {
      if (phase !== 'complete') return;
      sessionSettings = null;
      phase = 'setup';
      timeLeft = settings.timer;
      totalTime = settings.timer;
      sessionResults = null;
      notify();
    },

    submitAnswer(answer) {
      if (phase !== 'active' || !canAnswer) return;

      // In the original, answer submission just records the answer
      // The actual checking happens when the next digit arrives
      pendingAnswer = answer;

      // Record response time
      if (digitShownAt > 0) {
        lastResponseTime = performance.now() - digitShownAt;
      }

      lastAnswerCorrect = null; // will be determined on next digit
      notify();
    },

    completeOnboarding() {
      if (phase !== 'onboarding') return;
      settings.onboardingCompleted = true;
      saveSettingsToStorage(settings);
      phase = 'setup';
      notify();
    },
    showOnboarding() {
      if (phase !== 'setup' && phase !== 'complete') return;
      phase = 'onboarding';
      notify();
    },

    updateSettings(s) {
      if (phase === 'active' || phase === 'paused' || phase === 'ending') return false;
      Object.assign(settings, normalizeGameSettings({ ...settings, ...s }, settings));
      if (s.timer !== undefined && (phase === 'setup' || phase === 'onboarding')) {
        timeLeft = settings.timer;
        totalTime = settings.timer;
      }
      saveSettingsToStorage(settings);
      notify();
      return true;
    },

    loadHistory() {
      return loadHistoryFromStorage();
    },

    dispose() {
      stopTimers();
      audioPlayingId++;
      subscribers.length = 0;
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
    },
  };
}
