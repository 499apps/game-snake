import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUTE_KEY, Synth, createSynth } from './audio';
import { createMemoryStorage, createStorage, fullKey } from './storage';

class FakeParam {
  value = 1;
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = 'sine';
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

/** Stand-in for AudioContext. Options make parts of it fail like a broken audio device. */
function fakeAudioContextClass(o: { throwOnCreate?: boolean; throwOnTone?: boolean; suspended?: boolean } = {}) {
  return class FakeAudioContext {
    static created = 0;
    state: string = o.suspended ? 'suspended' : 'running';
    currentTime = 0;
    destination = {};
    onstatechange: (() => void) | null = null;
    constructor() {
      if (o.throwOnCreate) throw new Error('no audio device');
      FakeAudioContext.created++;
    }
    createGain() {
      return new FakeNode();
    }
    createOscillator() {
      if (o.throwOnTone) throw new Error('renderer error');
      return new FakeNode();
    }
    resume() {
      return Promise.reject(new Error('device busy'));
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    addEventListener() {
      /* no events in the fake */
    }
  };
}

function freshStore() {
  const backend = createMemoryStorage();
  return { backend, store: createStorage(backend) };
}

describe('Synth', () => {
  // Audio trouble must never reach console.error (the smoke suite treats it as fatal).
  let consoleErrors: unknown[][] = [];
  beforeEach(() => {
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    expect(consoleErrors).toEqual([]);
  });

  it('silent mode never creates an AudioContext', () => {
    const Ctx = fakeAudioContextClass();
    vi.stubGlobal('window', { AudioContext: Ctx });
    const synth = createSynth(freshStore().store, { silent: true });
    synth.unlock();
    synth.pop();
    synth.success();
    synth.whoosh();
    expect(Ctx.created).toBe(0);
    expect(synth.silent).toBe(true);
    expect(synth.ready).toBe(false);
  });

  it('normal mode creates the context on the first gesture', () => {
    const Ctx = fakeAudioContextClass();
    vi.stubGlobal('window', { AudioContext: Ctx });
    const synth = createSynth(freshStore().store);
    expect(Ctx.created).toBe(0);
    synth.unlock();
    expect(Ctx.created).toBe(1);
    expect(synth.ready).toBe(true);
    expect(() => synth.pop()).not.toThrow();
    expect(synth.silent).toBe(false);
  });

  for (const silent of [true, false]) {
    it(`mute state and g499:mute persist the same way (silent: ${silent})`, () => {
      vi.stubGlobal('window', { AudioContext: fakeAudioContextClass() });
      const { backend, store } = freshStore();
      const synth = new Synth(store, { silent });
      synth.unlock();
      const seen: boolean[] = [];
      synth.onMuteChange((m) => seen.push(m));
      expect(synth.muted).toBe(false);

      synth.setMuted(true);
      expect(synth.muted).toBe(true);
      expect(backend.getItem(fullKey(MUTE_KEY))).toBe('true');
      expect(synth.toggleMuted()).toBe(false);
      expect(backend.getItem('g499:mute')).toBe('false');
      synth.setMuted(true);

      // A new page reads the stored flag.
      expect(new Synth(store, { silent }).muted).toBe(true);

      // "Clear my data" wipes the key; reload() follows it without writing.
      store.clearAll();
      synth.reload();
      expect(synth.muted).toBe(false);
      expect(backend.getItem('g499:mute')).toBeNull();
      expect(seen).toEqual([true, false, true, false]);
    });
  }

  it('a missing audio device degrades to silence', () => {
    vi.stubGlobal('window', { AudioContext: fakeAudioContextClass({ throwOnCreate: true }) });
    const synth = createSynth(freshStore().store);
    expect(() => synth.unlock()).not.toThrow();
    expect(() => synth.success()).not.toThrow();
    expect(synth.silent).toBe(true);
    expect(() => synth.setMuted(true)).not.toThrow();
  });

  it('a renderer error while playing degrades to silence', () => {
    const Ctx = fakeAudioContextClass({ throwOnTone: true });
    vi.stubGlobal('window', { AudioContext: Ctx });
    const synth = createSynth(freshStore().store);
    synth.unlock();
    expect(synth.ready).toBe(true);
    expect(() => synth.pop()).not.toThrow();
    expect(synth.silent).toBe(true);
    expect(synth.ready).toBe(false);
    // No new context after a failure.
    synth.unlock();
    expect(Ctx.created).toBe(1);
  });

  it('a rejected resume() is swallowed', async () => {
    vi.stubGlobal('window', { AudioContext: fakeAudioContextClass({ suspended: true }) });
    const synth = createSynth(freshStore().store);
    expect(() => synth.unlock()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => synth.dispose()).not.toThrow();
  });
});
