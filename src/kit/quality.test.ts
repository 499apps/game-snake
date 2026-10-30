import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  FrameMonitor,
  TIERS,
  TIER_ORDER,
  higherTier,
  isSoftwareGpu,
  isTier,
  lowerTier,
  median,
  pickStartTier,
  probeTier,
  type DeviceInfo,
} from './quality';

describe('tiers', () => {
  it('orders low < medium < high and caps pixel ratio at 2', () => {
    expect(TIER_ORDER).toEqual(['low', 'medium', 'high']);
    for (const t of TIER_ORDER) expect(TIERS[t].pixelRatioCap).toBeLessThanOrEqual(2);
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBe('low');
    expect(higherTier('low')).toBe('medium');
    expect(higherTier('high')).toBe('high');
    expect(isTier('medium')).toBe(true);
    expect(isTier('ultra')).toBe(false);
  });

  it('probeTier returns a valid tier for any device', () => {
    fc.assert(
      fc.property(
        fc.record({
          cores: fc.option(fc.integer({ min: 1, max: 64 }), { nil: undefined }),
          memoryGb: fc.option(fc.integer({ min: 1, max: 64 }), { nil: undefined }),
          dpr: fc.double({ min: 0.5, max: 4, noNaN: true }),
          isMobile: fc.boolean(),
          width: fc.integer({ min: 200, max: 5000 }),
          height: fc.integer({ min: 200, max: 5000 }),
          reducedData: fc.option(fc.boolean(), { nil: undefined }),
        }),
        (info) => {
          expect(isTier(probeTier(info))).toBe(true);
        },
      ),
    );
  });

  it('weak devices start low, strong desktops start high', () => {
    expect(probeTier({ cores: 2, memoryGb: 2, dpr: 2, isMobile: true, width: 390, height: 844 })).toBe('low');
    expect(probeTier({ cores: 8, memoryGb: 8, dpr: 1, isMobile: false, width: 1920, height: 1080 })).toBe('high');
    expect(probeTier({ cores: 8, memoryGb: 8, dpr: 3, isMobile: true, width: 390, height: 844 })).toBe('high');
    expect(probeTier({ cores: 4, memoryGb: 4, dpr: 2, isMobile: true, width: 390, height: 844 })).toBe('medium');
  });
});

describe('software GPU detection', () => {
  const software = [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'Google SwiftShader',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Mesa/X.org llvmpipe',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Software Rasterizer',
    'lavapipe',
  ];
  const hardware = [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Apple GPU',
    'Mali-G78',
    'Adreno (TM) 740',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'WebKit WebGL',
    '',
  ];

  it('spots software rasterisers', () => {
    for (const name of software) expect(isSoftwareGpu(name), name).toBe(true);
    for (const name of hardware) expect(isSoftwareGpu(name), name).toBe(false);
    expect(isSoftwareGpu(null)).toBe(false);
    expect(isSoftwareGpu(undefined)).toBe(false);
  });

  const strongDesktop: DeviceInfo = { cores: 16, memoryGb: 16, dpr: 1, isMobile: false, width: 1920, height: 1080 };

  it('starts software GL at low, unless ?tier= overrides', () => {
    for (const name of software) {
      expect(pickStartTier({ override: null, frozen: false, gpuName: name, device: strongDesktop })).toBe('low');
      expect(pickStartTier({ override: null, frozen: true, gpuName: name, device: strongDesktop })).toBe('low');
      expect(pickStartTier({ override: 'high', frozen: true, gpuName: name, device: strongDesktop })).toBe('high');
    }
  });

  it('keeps the old choice on a real GPU', () => {
    const gpu = hardware[0] as string;
    expect(pickStartTier({ override: null, frozen: true, gpuName: gpu, device: strongDesktop })).toBe('medium');
    expect(pickStartTier({ override: null, frozen: false, gpuName: gpu, device: strongDesktop })).toBe(
      probeTier(strongDesktop),
    );
    expect(pickStartTier({ override: 'low', frozen: false, gpuName: gpu, device: strongDesktop })).toBe('low');
  });

  it('always returns a valid tier', () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom<'low' | 'medium' | 'high'>('low', 'medium', 'high'), { nil: null }),
        fc.boolean(),
        fc.string(),
        (override, frozen, gpuName) => {
          const t = pickStartTier({ override, frozen, gpuName, device: strongDesktop });
          expect(isTier(t)).toBe(true);
          if (override) expect(t).toBe(override);
        },
      ),
    );
  });
});

describe('median', () => {
  it('matches a sorted-middle definition', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: 1 }), (xs) => {
        const sorted = xs.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const expected =
          sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
        expect(median(xs)).toBe(expected);
      }),
    );
    expect(median([])).toBe(0);
  });
});

describe('FrameMonitor', () => {
  const feed = (m: FrameMonitor, ms: number, frames: number, tier: 'low' | 'medium' | 'high') => {
    let suggestion: ReturnType<FrameMonitor['push']> = null;
    for (let i = 0; i < frames; i++) {
      const s = m.push(ms, tier);
      if (s) suggestion = s;
    }
    return suggestion;
  };

  it('lowers the tier when frames are slow', () => {
    const m = new FrameMonitor({ window: 10 });
    expect(feed(m, 30, 10, 'high')).toBe('medium');
  });

  it('does not lower below low', () => {
    const m = new FrameMonitor({ window: 10 });
    expect(feed(m, 40, 10, 'low')).toBeNull();
  });

  it('raises only after sustained fast frames', () => {
    const m = new FrameMonitor({ window: 10, raisePatience: 3, cooldownWindows: 0 });
    expect(feed(m, 8, 10, 'medium')).toBeNull();
    expect(feed(m, 8, 10, 'medium')).toBeNull();
    expect(feed(m, 8, 10, 'medium')).toBe('high');
  });

  it('respects cooldown after a change', () => {
    const m = new FrameMonitor({ window: 10, cooldownWindows: 2 });
    expect(feed(m, 30, 10, 'high')).toBe('medium');
    expect(feed(m, 30, 10, 'medium')).toBeNull();
    expect(feed(m, 30, 10, 'medium')).toBeNull();
    expect(feed(m, 30, 10, 'medium')).toBe('low');
  });

  it('ignores outliers and bad values', () => {
    const m = new FrameMonitor({ window: 5 });
    expect(m.push(1000, 'high')).toBeNull();
    expect(m.push(Number.NaN, 'high')).toBeNull();
    expect(m.push(-1, 'high')).toBeNull();
    expect(feed(m, 16, 5, 'high')).toBeNull();
    expect(m.medianMs).toBe(16);
  });

  it('is deterministic for any frame sequence', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 1, max: 100, noNaN: true }), { minLength: 1, maxLength: 300 }), (frames) => {
        const run = () => {
          const m = new FrameMonitor({ window: 20 });
          let tier: 'low' | 'medium' | 'high' = 'high';
          const log: string[] = [];
          for (const f of frames) {
            const s = m.push(f, tier);
            if (s) {
              tier = s;
              log.push(s);
            }
          }
          return log;
        };
        expect(run()).toEqual(run());
      }),
    );
  });
});
