import { describe, expect, it } from 'vitest';
import { findSecrets, isAllowedEmail, mask } from './scripts/lib/secret-patterns.mjs';

// Test strings are assembled at runtime so this file never contains a secret-looking literal.
const join = (...parts: string[]) => parts.join('');

describe('findSecrets', () => {
  it('finds common token shapes', () => {
    const aws = join('AKIA', 'ABCDEFGHIJKLMNOP');
    const gh = join('ghp_', 'a'.repeat(36));
    const pem = join('-----BEGIN ', 'RSA PRIVATE KEY-----');
    const text = `x\n${aws}\n${gh}\n${pem}\n`;
    const names = findSecrets(text).map((f) => f.name);
    expect(names).toContain('aws-access-key');
    expect(names).toContain('github-token');
    expect(names).toContain('private-key-block');
  });

  it('finds generic secret assignments but not harmless config words', () => {
    const bad = join('api_key', ' = "', 'x'.repeat(20), '"');
    expect(findSecrets(bad).map((f) => f.name)).toContain('generic-secret-assignment');
    expect(findSecrets('const password = readPassword();')).toEqual([]);
    expect(findSecrets('token: process.env.TOKEN')).toEqual([]);
  });

  it('finds absolute user paths on every platform', () => {
    const win = join('C:', '\\Users', '\\someone', '\\project');
    const mac = join('/Users', '/someone', '/project/');
    const lin = join('/home', '/someone', '/project/');
    expect(findSecrets(win).map((f) => f.name)).toEqual(['windows-user-path']);
    expect(findSecrets(mac).map((f) => f.name)).toEqual(['mac-user-path']);
    expect(findSecrets(lin).map((f) => f.name)).toEqual(['linux-home-path']);
    expect(findSecrets('/games/snake/ and /users/ are fine')).toEqual([]);
  });

  it('flags personal e-mail addresses but allows noreply and example addresses', () => {
    const personal = join('someone', '@', 'example-mail.net');
    expect(findSecrets(`contact ${personal}`).map((f) => f.name)).toEqual(['email-address']);
    expect(findSecrets('123+bot@users.noreply.github.com')).toEqual([]);
    expect(findSecrets('import x from "@types/three"; three@0.170.0')).toEqual([]);
    expect(isAllowedEmail('a@example.org')).toBe(true);
    expect(isAllowedEmail(join('b', '@', 'mail.example-corp.net'))).toBe(false);
  });

  it('reports line numbers and masks snippets', () => {
    const aws = join('AKIA', 'ABCDEFGHIJKLMNOP');
    const found = findSecrets(`line1\nline2 ${aws}\n`);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
    expect(found[0]?.snippet).not.toContain('GHIJKL');
    expect(mask('short')).toBe('*****');
  });
});
