import { describe, expect, it } from 'vitest';
import { hardwareGlArgs, kitPlaywrightConfig, parseWorkers } from './smoke/projects';

describe('e2e config', () => {
  it('parses E2E_WORKERS as Playwright expects', () => {
    expect(parseWorkers(undefined)).toBe('25%');
    expect(parseWorkers('')).toBe('25%');
    expect(parseWorkers('4')).toBe(4);
    expect(parseWorkers(' 50% ')).toBe('50%');
    expect(parseWorkers('zero')).toBe('25%');
    expect(parseWorkers('0')).toBe('25%');
    expect(parseWorkers('1.5')).toBe('25%');
  });

  it('gives each shard its own output folder', () => {
    const base = { testDir: './e2e', port: 4174, serverCommand: null, readyPath: '/games/' };
    expect(kitPlaywrightConfig(base, {}).outputDir).toBe('test-results');
    expect(kitPlaywrightConfig(base, { E2E_SHARD: '2' }).outputDir).toBe('test-results/shard-2');
    expect(kitPlaywrightConfig(base, { E2E_WORKERS: '3' }).workers).toBe(3);
    expect(kitPlaywrightConfig(base, {}).updateSnapshots).toBe('none');
  });

  it('picks a hardware ANGLE backend per platform', () => {
    expect(hardwareGlArgs('win32')).toContain('--use-angle=d3d11');
    expect(hardwareGlArgs('darwin')).toContain('--use-angle=metal');
    expect(hardwareGlArgs('linux')).toContain('--use-angle=gl');
  });
});
