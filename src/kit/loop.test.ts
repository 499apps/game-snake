import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createClock } from './lifecycle';
import { createLoop, type LoopTarget } from './loop';
import type { Tier } from './quality';

/** A fake requestAnimationFrame: callbacks run only when the test calls flush(). */
function fakeRaf() {
  let next = 1;
  let now = 0;
  const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = next++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id);
  });
  return {
    get pending() {
      return queue.size;
    },
    /** Run one animation frame (every callback queued before it), 16 ms later. */
    flush() {
      now += 16;
      const due = Array.from(queue.values());
      queue.clear();
      for (const cb of due) cb(now);
    },
  };
}

function fakeKit(tier: Tier = 'medium') {
  let scheduler: (() => void) | null = null;
  const kit = {
    renders: 0,
    settings: { tier },
    setTier: vi.fn(),
    render() {
      kit.renders++;
    },
    setRenderScheduler(fn: (() => void) | null) {
      scheduler = fn;
    },
    /** What KitRenderer.requestRender() does. */
    requestRender() {
      scheduler?.();
    },
  };
  return kit satisfies LoopTarget;
}

describe('createLoop', () => {
  let raf: ReturnType<typeof fakeRaf>;
  beforeEach(() => {
    raf = fakeRaf();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('frozen clock: renders once at start, then only on demand', () => {
    const kit = fakeKit();
    const clock = createClock({ frozen: true });
    const update = vi.fn();
    const loop = createLoop({ kit, clock, update });
    expect(loop.onDemand).toBe(true);

    loop.start();
    expect(raf.pending).toBe(1);
    raf.flush();
    expect(kit.renders).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(0, 0);

    // Nothing asked for a frame: no rAF is queued and idle frames cost nothing.
    expect(raf.pending).toBe(0);
    for (let i = 0; i < 10; i++) raf.flush();
    expect(kit.renders).toBe(1);
  });

  it('frozen clock: step(n) runs n fixed updates and renders once', () => {
    const kit = fakeKit();
    const clock = createClock({ frozen: true });
    const dts: number[] = [];
    const loop = createLoop({ kit, clock, update: (dt) => dts.push(dt) });
    loop.start();
    raf.flush();
    dts.length = 0;

    clock.step(5);
    loop.requestRender();
    raf.flush();
    expect(dts).toEqual([1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 60]);
    expect(clock.elapsed).toBeCloseTo(5 / 60, 10);
    expect(clock.pending).toBe(0);
    expect(kit.renders).toBe(2);
    expect(raf.pending).toBe(0);
  });

  it('coalesces many requests into one frame', () => {
    const kit = fakeKit();
    const loop = createLoop({ kit, clock: createClock({ frozen: true }), update: () => undefined });
    loop.start();
    raf.flush();
    loop.requestRender();
    loop.requestRender();
    kit.requestRender();
    expect(raf.pending).toBe(1);
    raf.flush();
    expect(kit.renders).toBe(2);
  });

  it('kit.requestRender() wakes the loop only while it runs', () => {
    const kit = fakeKit();
    const loop = createLoop({ kit, clock: createClock({ frozen: true }), update: () => undefined });
    kit.requestRender();
    expect(raf.pending).toBe(0);
    loop.start();
    raf.flush();
    kit.requestRender();
    raf.flush();
    expect(kit.renders).toBe(2);
    loop.stop();
    kit.requestRender();
    expect(raf.pending).toBe(0);
  });

  it('a request from inside update() does not cause a second frame', () => {
    const kit = fakeKit();
    const loop = createLoop({
      kit,
      clock: createClock({ frozen: true }),
      update: () => kit.requestRender(),
    });
    loop.start();
    raf.flush();
    expect(kit.renders).toBe(1);
    expect(raf.pending).toBe(0);
  });

  it('pause stops on-demand frames and resume draws again', () => {
    const kit = fakeKit();
    const loop = createLoop({ kit, clock: createClock({ frozen: true }), update: () => undefined });
    loop.start();
    raf.flush();
    loop.pause();
    loop.requestRender();
    expect(raf.pending).toBe(0);
    loop.resume();
    raf.flush();
    expect(kit.renders).toBe(2);
  });

  it('idle() resolves after the queued steps are drawn', async () => {
    const kit = fakeKit();
    const clock = createClock({ frozen: true });
    const loop = createLoop({ kit, clock, update: () => undefined });
    loop.start();
    let done = false;
    const idle = loop.idle().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    raf.flush();
    await idle;
    expect(done).toBe(true);
    // Nothing queued: resolves at once.
    await expect(loop.idle()).resolves.toBeUndefined();
  });

  it('live clock: updates and renders on every frame', () => {
    const kit = fakeKit();
    const loop = createLoop({ kit, clock: createClock({ frozen: false }), update: () => undefined });
    expect(loop.onDemand).toBe(false);
    loop.start();
    for (let i = 0; i < 5; i++) raf.flush();
    expect(kit.renders).toBe(5);
    expect(raf.pending).toBe(1);
    expect(loop.frameTimes.length).toBe(4);
    loop.stop();
    expect(raf.pending).toBe(0);
  });

  it('step() is deterministic: one batch equals the same steps one at a time', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 12 }), (batches) => {
        const run = (split: boolean) => {
          const kit = fakeKit();
          const clock = createClock({ frozen: true });
          const log: number[] = [];
          const loop = createLoop({ kit, clock, update: (dt, elapsed) => dt > 0 && log.push(elapsed) });
          loop.start();
          raf.flush();
          for (const n of batches) {
            if (split) {
              for (let i = 0; i < n; i++) {
                clock.step(1);
                loop.requestRender();
                raf.flush();
              }
            } else {
              clock.step(n);
              loop.requestRender();
              raf.flush();
            }
          }
          loop.stop();
          return log;
        };
        expect(run(false)).toEqual(run(true));
      }),
    );
  });
});

describe('createClock', () => {
  it('ignores step() when live', () => {
    const clock = createClock({ frozen: false });
    clock.step(10);
    expect(clock.pending).toBe(0);
  });
});
