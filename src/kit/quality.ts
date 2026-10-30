/**
 * Adaptive quality: tiers chosen from a quick startup probe and adjusted by a frame-time
 * monitor. Pure logic, unit tested; the renderer applies the settings.
 */

export type Tier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: Tier;
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  particleScale: number;
  antialias: boolean;
}

export const TIERS: Readonly<Record<Tier, QualitySettings>> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 512,
    bloom: false,
    particleScale: 0.35,
    antialias: false,
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    particleScale: 0.7,
    antialias: true,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    particleScale: 1,
    antialias: true,
  },
};

export const TIER_ORDER: readonly Tier[] = ['low', 'medium', 'high'];

export function lowerTier(t: Tier): Tier {
  return t === 'high' ? 'medium' : 'low';
}

export function higherTier(t: Tier): Tier {
  return t === 'low' ? 'medium' : 'high';
}

export function isTier(v: unknown): v is Tier {
  return v === 'low' || v === 'medium' || v === 'high';
}

export interface DeviceInfo {
  cores?: number;
  memoryGb?: number;
  dpr: number;
  isMobile: boolean;
  width: number;
  height: number;
  reducedData?: boolean;
}

/** Pick a starting tier from cheap device facts. */
export function probeTier(info: DeviceInfo): Tier {
  const cores = info.cores ?? 4;
  const mem = info.memoryGb ?? 4;
  const pixels = info.width * info.height * Math.min(info.dpr, 2);
  if (info.reducedData) return 'low';
  if (cores <= 2 || mem <= 2) return 'low';
  if (info.isMobile) {
    if (cores >= 8 && mem >= 6 && pixels <= 2_600_000) return 'high';
    return 'medium';
  }
  if (cores >= 6 && pixels <= 6_000_000) return 'high';
  return 'medium';
}

/** Renderer strings of software rasterisers (headless browsers, VMs, CI hosts without a GPU). */
export const SOFTWARE_GPU_PATTERN = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i;

/** Renderer strings of integrated GPUs that should not start on the high tier. */
export const INTEGRATED_GPU_PATTERN = /intel\(r\)? (uhd|hd|iris)|intel.*(uhd|hd graphics|iris)/i;

/** True when the WebGL renderer string names a software rasteriser. */
export function isSoftwareGpu(name: string | null | undefined): boolean {
  return typeof name === 'string' && SOFTWARE_GPU_PATTERN.test(name);
}

export interface StartTierInput {
  /** ?tier= from the URL; always wins. */
  override: Tier | null;
  /** Frozen test clock: a fixed tier keeps screenshots stable on one host. */
  frozen: boolean;
  /** WebGL renderer string from probeGpu(). */
  gpuName: string;
  device: DeviceInfo;
}

/**
 * Pick the first tier. Software GL starts at 'low' (no bloom, no shadows, pixel ratio 1)
 * because every pass runs on the CPU there.
 */
export function pickStartTier(i: StartTierInput): Tier {
  if (i.override) return i.override;
  if (isSoftwareGpu(i.gpuName)) return 'low';
  if (i.frozen) return 'medium';
  const start = probeTier(i.device);
  // Integrated Intel GPUs sit right at 16.7 ms with 2048 shadows and DPR 2; start them one
  // tier down so the first seconds hold 60 fps before the frame monitor has a full window.
  if (start === 'high' && INTEGRATED_GPU_PATTERN.test(i.gpuName)) return 'medium';
  return start;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export interface FrameMonitorOptions {
  /** Frames per evaluation window. */
  window?: number;
  /** Median frame time (ms) above which the tier drops. */
  lowerAbove?: number;
  /** Median frame time (ms) below which the tier may rise. */
  raiseBelow?: number;
  /** Windows to wait after a change before another change. */
  cooldownWindows?: number;
  /** Windows that must stay fast before raising (more patient than lowering). */
  raisePatience?: number;
  /** Frame times above this are ignored (tab switch, GC). */
  outlierMs?: number;
}

/**
 * Collects frame times and suggests tier changes. Deterministic: same input, same output.
 */
export class FrameMonitor {
  private readonly size: number;
  private readonly lowerAbove: number;
  private readonly raiseBelow: number;
  private readonly cooldownWindows: number;
  private readonly raisePatience: number;
  private readonly outlierMs: number;
  private buffer: number[] = [];
  private cooldown = 0;
  private fastWindows = 0;
  private lastMedian = 0;
  private windowsSeen = 0;

  constructor(opts: FrameMonitorOptions = {}) {
    this.size = Math.max(4, opts.window ?? 60);
    this.lowerAbove = opts.lowerAbove ?? 20;
    this.raiseBelow = opts.raiseBelow ?? 12;
    this.cooldownWindows = opts.cooldownWindows ?? 2;
    this.raisePatience = opts.raisePatience ?? 4;
    this.outlierMs = opts.outlierMs ?? 250;
  }

  /** Median of the last evaluated window (ms). */
  get medianMs(): number {
    return this.lastMedian;
  }

  get windows(): number {
    return this.windowsSeen;
  }

  /**
   * Push one frame time. Returns a new tier when a change is advised, otherwise null.
   */
  push(dtMs: number, current: Tier): Tier | null {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > this.outlierMs) return null;
    this.buffer.push(dtMs);
    if (this.buffer.length < this.size) return null;
    const med = median(this.buffer);
    this.buffer = [];
    this.lastMedian = med;
    this.windowsSeen++;

    if (this.cooldown > 0) {
      this.cooldown--;
      return null;
    }
    if (med > this.lowerAbove) {
      this.fastWindows = 0;
      if (current === 'low') return null;
      this.cooldown = this.cooldownWindows;
      return lowerTier(current);
    }
    if (med < this.raiseBelow) {
      this.fastWindows++;
      if (current !== 'high' && this.fastWindows >= this.raisePatience) {
        this.fastWindows = 0;
        this.cooldown = this.cooldownWindows;
        return higherTier(current);
      }
      return null;
    }
    this.fastWindows = 0;
    return null;
  }

  reset(): void {
    this.buffer = [];
    this.cooldown = 0;
    this.fastWindows = 0;
  }
}
