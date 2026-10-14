import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Publishing is strict, the guest fallback is tolerant. Firestore is mocked
 * at the module boundary: getDoc serves the snapshot and the featured
 * pointer, getDocs serves every collection query, keyed by collection name.
 */
const state = vi.hoisted(() => ({
  failing: new Set<string>(),
  snapshotExists: false,
  written: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/lib/firebase', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (...path: string[]) => ({ path: path.slice(1) });
  const docsFor = (name: string) => {
    if (state.failing.has(name)) return Promise.reject(new Error(`${name} unavailable`));
    const docs = name === 'communityMixes'
      ? [{ id: 'm1', data: () => ({ name: 'Lemon Storm', creatorName: 'Alice', flavorIds: ['mint:virginia'] }) }]
      : [];
    return Promise.resolve({ docs });
  };
  return {
    collection: ref, doc: ref,
    query: (c: { path: string[] }) => c, where: () => undefined, orderBy: () => undefined,
    getDocs: (q: { path: string[] }) => docsFor(q.path[0]),
    getDoc: (d: { path: string[] }) => {
      const key = d.path.join('/');
      if (state.failing.has(key)) return Promise.reject(new Error(`${key} unavailable`));
      if (key === 'menu/featured') return Promise.resolve({ exists: () => true, data: () => ({ hookahId: 'h1' }) });
      return Promise.resolve({ exists: () => state.snapshotExists, data: () => ({}) });
    },
    setDoc: (_d: unknown, data: Record<string, unknown>) => { state.written = data; return Promise.resolve(); },
    serverTimestamp: () => 'SERVER_TIME',
    addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), writeBatch: vi.fn(),
  };
});

const { getMenuData, publishMenuSnapshot } = await import('../src/services/menuService');

beforeEach(() => {
  state.failing.clear();
  state.snapshotExists = false;
  state.written = undefined;
});

describe('publishMenuSnapshot', () => {
  test('publishes the community mixes and the featured hookah', async () => {
    await publishMenuSnapshot();
    expect(state.written?.communityMixes).toHaveLength(1);
    expect(state.written?.hookahOfTheDay).toEqual({ hookahId: 'h1', promoText: undefined });
  });

  test('a failed community-mixes read fails the publish instead of wiping them', async () => {
    state.failing.add('communityMixes');
    await expect(publishMenuSnapshot()).rejects.toThrow();
    expect(state.written).toBeUndefined();
  });

  test('a failed featured-hookah read fails the publish too', async () => {
    state.failing.add('menu/featured');
    await expect(publishMenuSnapshot()).rejects.toThrow();
    expect(state.written).toBeUndefined();
  });
});

describe('getMenuData without a snapshot', () => {
  test('the optional extras degrade to nothing', async () => {
    state.failing.add('communityMixes');
    state.failing.add('menu/featured');
    const menu = await getMenuData();
    expect(menu.communityMixes).toEqual([]);
    expect(menu.hookahOfTheDay).toBeUndefined();
    expect(menu.hookahs).toEqual([]);
  });

  test('a core collection still fails the whole read', async () => {
    state.failing.add('hookahs');
    await expect(getMenuData()).rejects.toThrow();
  });
});
