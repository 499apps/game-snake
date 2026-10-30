// Patterns for the secrets / private-data scan. Pure, unit tested.
// Each regex is written so that its own source text does not match itself.

export const SECRET_PATTERNS = [
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github-token', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g },
  { name: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'openai-style-key', re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { name: 'stripe-key', re: /\b[sr]k_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    name: 'generic-secret-assignment',
    re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*["'][^"'\s]{12,}["']/gi,
  },
];

export const PATH_PATTERNS = [
  { name: 'windows-user-path', re: /\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>]+/g },
  { name: 'mac-user-path', re: /(?<![\w-])\/Users\/[A-Za-z0-9._-]+\//g },
  { name: 'linux-home-path', re: /(?<![\w-])\/home\/[A-Za-z0-9._-]+\//g },
];

export const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Addresses that are fine in an open-source repo. */
export function isAllowedEmail(email) {
  const e = email.toLowerCase();
  if (e.includes('noreply') || e.includes('no-reply')) return true;
  if (e.endsWith('@example.com') || e.endsWith('@example.org')) return true;
  return false;
}

/**
 * Scan text. Returns findings: { name, line, snippet }.
 * @param {string} text
 */
export function findSecrets(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const check = (name, re, line, index) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      findings.push({ name, line: index + 1, snippet: mask(m[0]) });
      if (m[0].length === 0) re.lastIndex++;
    }
  };
  lines.forEach((line, index) => {
    for (const p of SECRET_PATTERNS) check(p.name, p.re, line, index);
    for (const p of PATH_PATTERNS) check(p.name, p.re, line, index);
    EMAIL_PATTERN.lastIndex = 0;
    let m;
    while ((m = EMAIL_PATTERN.exec(line)) !== null) {
      if (!isAllowedEmail(m[0])) findings.push({ name: 'email-address', line: index + 1, snippet: mask(m[0]) });
    }
  });
  return findings;
}

export function mask(value) {
  if (value.length <= 8) return value.replace(/./g, '*');
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(12, value.length - 6))}${value.slice(-2)}`;
}
