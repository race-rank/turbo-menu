// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { FavoritesList } from '../src/components/ComboLists';
import type { FavoriteCombo } from '../src/services/favoritesService';

afterEach(cleanup);

const mine: FavoriteCombo = { comboId: 'mix:a', label: 'Turbo Mix', kind: 'mix', mixId: 'a' };
const theirs: FavoriteCombo = { comboId: 'custom:b', label: 'Darkblend · Lime, Mint', kind: 'custom' };

describe('FavoritesList on a friend profile', () => {
  it('orders and saves the tapped favourite', () => {
    const onReorder = vi.fn();
    const onSave = vi.fn();
    render(
      <FavoritesList
        favorites={[theirs]} heading="Favourites" emptyText="-"
        onReorder={onReorder} reorderLabel="Order" onSave={onSave} savedIds={new Set()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to mine' }));
    expect(onReorder).toHaveBeenCalledWith(theirs);
    expect(onSave).toHaveBeenCalledWith(theirs);
  });

  it('shows a disabled "Saved" for a combo the viewer already has', () => {
    const onSave = vi.fn();
    render(
      <FavoritesList
        favorites={[mine, theirs]} heading="Favourites" emptyText="-"
        onSave={onSave} savedIds={new Set([mine.comboId])}
      />,
    );
    const saved = screen.getByRole('button', { name: 'Saved' });
    expect((saved as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Save to mine' })).toHaveLength(1);
  });

  it('disables Order and Save while one is in flight', () => {
    render(
      <FavoritesList
        favorites={[theirs]} heading="Favourites" emptyText="-"
        onReorder={() => {}} reorderLabel="Order" onSave={() => {}} busy
      />,
    );
    expect((screen.getByRole('button', { name: 'Order' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Save to mine' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps "Order again" and no save control on the customer\'s own list', () => {
    render(<FavoritesList favorites={[mine]} heading="Favourites" emptyText="-" onReorder={() => {}} />);
    expect(screen.getByRole('button', { name: 'Order again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});
