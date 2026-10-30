import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  STORAGE_PREFIX,
  clearAllUserData,
  createMemoryStorage,
  createStorage,
  fullKey,
} from './storage';

describe('storage', () => {
  it('round-trips JSON values', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.jsonValue(), (key, value) => {
        const store = createStorage(createMemoryStorage());
        expect(store.set(key, value)).toBe(true);
        // JSON has no -0, so compare against the JSON-normalised value.
        expect(store.get(key, 'fallback')).toEqual(JSON.parse(JSON.stringify(value)));
      }),
    );
  });

  it('prefixes every key once', () => {
    expect(fullKey('mute')).toBe('g499:mute');
    expect(fullKey('g499:mute')).toBe('g499:mute');
    const backend = createMemoryStorage();
    const store = createStorage(backend);
    store.set('best', 7);
    expect(backend.getItem('g499:best')).toBe('7');
    expect(store.keys()).toEqual(['g499:best']);
  });

  it('returns the fallback for missing or corrupt values', () => {
    const backend = createMemoryStorage();
    const store = createStorage(backend);
    expect(store.get('nothing', 42)).toBe(42);
    backend.setItem(`${STORAGE_PREFIX}broken`, '{not json');
    expect(store.get('broken', 'fb')).toBe('fb');
  });

  it('clearAll removes only prefixed keys', () => {
    const backend = createMemoryStorage();
    backend.setItem('other:keep', '1');
    const store = createStorage(backend);
    store.set('a', 1);
    store.set('b', 2);
    expect(store.clearAll()).toBe(2);
    expect(store.keys()).toEqual([]);
    expect(backend.getItem('other:keep')).toBe('1');
  });

  it('falls back to memory when no backend is usable', () => {
    const store = createStorage(createMemoryStorage());
    expect(store.persistent).toBe(true);
    store.set('x', { y: 1 });
    expect(store.get('x', null)).toEqual({ y: 1 });
  });

  it('clearAllUserData reports removed keys', async () => {
    const store = createStorage(createMemoryStorage());
    store.set('one', 1);
    const result = await clearAllUserData(store);
    expect(result.keysRemoved).toBe(1);
    expect(result.cachesRemoved).toBe(0);
    expect(store.keys()).toEqual([]);
  });
});
