import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createSaveStore } from './save';

interface Save {
  best: number;
  sound: boolean;
}

const defaults: Save = { best: 0, sound: true };

describe('save store', () => {
  it('returns defaults when empty', () => {
    const store = createSaveStore('t', defaults, createMemoryStorage());
    expect(store.get()).toEqual(defaults);
  });

  it('persists patches and resets', () => {
    const storage = createMemoryStorage();
    const store = createSaveStore('t', defaults, storage);
    store.set({ best: 7 });
    expect(createSaveStore('t', defaults, storage).get()).toEqual({ best: 7, sound: true });
    store.reset();
    expect(store.get()).toEqual(defaults);
  });

  it('survives corrupt data and drops unknown keys', () => {
    const storage = createMemoryStorage();
    storage.setItem('t', '{not json');
    expect(createSaveStore('t', defaults, storage).get()).toEqual(defaults);
    storage.setItem('t', JSON.stringify({ best: 3, legacy: 1 }));
    expect(createSaveStore('t', defaults, storage).get()).toEqual({ best: 3, sound: true });
  });
});
