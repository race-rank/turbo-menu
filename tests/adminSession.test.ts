import { describe, expect, test } from 'vitest';
import { classifySessionError, diffNewOrders, errorCode } from '../src/services/adminSession';

describe('classifySessionError', () => {
  test.each([
    'auth/user-token-expired',
    'auth/invalid-user-token',
    'auth/user-disabled',
    'auth/user-not-found',
    'permission-denied',
    'unauthenticated',
  ])('%s means the session expired', (code) => {
    expect(classifySessionError(code)).toBe('expired');
  });

  test.each([
    'auth/network-request-failed',
    'auth/timeout',
    'unavailable',
    'deadline-exceeded',
  ])('%s means the connection was lost', (code) => {
    expect(classifySessionError(code)).toBe('offline');
  });

  test('a prefixed Firestore code classifies like the bare one', () => {
    expect(classifySessionError('firestore/permission-denied')).toBe('expired');
    expect(classifySessionError('firestore/unavailable')).toBe('offline');
  });

  test.each([
    'auth/too-many-requests',
    'auth/internal-error',
    'failed-precondition',
    'not-a-code',
    '',
    undefined,
    null,
  ])('%s is unknown', (code) => {
    expect(classifySessionError(code)).toBe('unknown');
  });
});

describe('errorCode', () => {
  test('reads the code off a Firebase-shaped error', () => {
    expect(errorCode({ code: 'permission-denied', message: 'nope' })).toBe('permission-denied');
  });

  test('is undefined for anything without a string code', () => {
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode({ code: 42 })).toBeUndefined();
    expect(errorCode('permission-denied')).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
  });
});

describe('diffNewOrders', () => {
  const order = (orderId: string) => ({ orderId });

  test('the first snapshot is a silent baseline', () => {
    const { fresh, known } = diffNewOrders(null, [order('a'), order('b')]);
    expect(fresh).toEqual([]);
    expect([...known].sort()).toEqual(['a', 'b']);
  });

  test('only orders not seen before are fresh', () => {
    const { fresh, known } = diffNewOrders(new Set(['a', 'b']), [order('c'), order('a'), order('b')]);
    expect(fresh).toEqual([order('c')]);
    expect([...known].sort()).toEqual(['a', 'b', 'c']);
  });

  test('resubscribing with the same orders announces nothing', () => {
    const { fresh } = diffNewOrders(new Set(['a', 'b']), [order('a'), order('b')]);
    expect(fresh).toEqual([]);
  });

  test('orders that arrived while the feed was down are announced on its return', () => {
    const before = diffNewOrders(null, [order('a')]).known;
    // Feed dies; d and c arrive meanwhile; the resubscribed feed's first snapshot:
    const { fresh } = diffNewOrders(before, [order('d'), order('c'), order('a')]);
    expect(fresh).toEqual([order('d'), order('c')]);
  });

  test('orders that fell out of the window are forgotten', () => {
    const { known } = diffNewOrders(new Set(['old', 'a']), [order('a')]);
    expect([...known]).toEqual(['a']);
  });
});
