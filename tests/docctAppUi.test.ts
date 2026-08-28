// @vitest-environment jsdom
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocctApp from '../src/lib/docct/DocctApp.svelte';
import { DEFAULT_SETTINGS, DOCCT_SETTINGS_KEY } from '../src/lib/docct/engine';

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  createBufferSource() {
    return { buffer: null, connect() { return this; }, start() {}, stop() {} };
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() { return this; },
    };
  }
  createConstantSource() {
    return { offset: { value: 0 }, connect() { return this; }, start() {}, stop() {} };
  }
  decodeAudioData() {
    return Promise.resolve({
      getChannelData: () => new Float32Array(0),
      duration: 0.1,
      numberOfChannels: 1,
      sampleRate: 44100,
    });
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

const findButton = (target: HTMLElement, label: string) => [...target.querySelectorAll('button')]
  .find((button) => button.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe('DocCT setup and session UI', () => {
  let component: ReturnType<typeof mount> | undefined;
  let target: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    localStorage.setItem(DOCCT_SETTINGS_KEY, JSON.stringify({
      ...DEFAULT_SETTINGS,
      onboardingCompleted: true,
      displayMode: 'standard',
      useVoice: false,
    }));
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }));
    target = document.createElement('div');
    document.body.append(target);
    component = mount(DocctApp, { target });
  });

  afterEach(async () => {
    if (component) await unmount(component);
    target?.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps the countdown visible during a Standard-mode session at every viewport size', async () => {
    findButton(target, 'Start session')?.click();
    await tick();

    const timer = target.querySelector('[data-session-timer]');
    expect(timer).not.toBeNull();
    expect(timer?.classList.contains('hidden')).toBe(false);
  });

  it('offers the requested starting and minimum interval presets', () => {
    expect(findButton(target, '1.5')?.getAttribute('aria-label')).toBe('Set interval to 1.5 seconds');
    for (const preset of [0.6, 0.7, 0.8, 0.9]) {
      expect(findButton(target, String(preset))?.getAttribute('aria-label'))
        .toBe(`Set minimum interval to ${preset} seconds`);
    }
  });
});
