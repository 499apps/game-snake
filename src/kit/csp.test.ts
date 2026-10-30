import { describe, expect, it } from 'vitest';
import { CSP_CONTENT, CSP_META } from './csp';

describe('Content-Security-Policy', () => {
  it('keeps every required directive', () => {
    for (const d of [
      "default-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ]) {
      expect(CSP_CONTENT).toContain(d);
    }
    expect(CSP_CONTENT).not.toContain('unsafe-eval');
  });

  it('leaves out frame-ancestors on purpose (meta tags ignore it; Chromium logs a console error)', () => {
    // See games/docs/PLAN.md section 4. Framing protection needs an HTTP header.
    expect(CSP_CONTENT).not.toContain('frame-ancestors');
    expect(CSP_META).not.toContain('frame-ancestors');
  });
});
