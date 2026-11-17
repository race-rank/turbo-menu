// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider, useCart } from '../src/contexts/CartContext';
import { OrderFooter, type BuildState } from '../src/components/layout/OrderFooter';

afterEach(cleanup);

// StickyFooter measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const build: BuildState = {
  hookahName: 'Darkblend', tobaccoLabel: 'Darkblend · Medium',
  flavors: [{ id: 'mint', name: 'Mint' }], flavorMax: 3, complete: true, onAdd: () => {},
};

/** Puts one item in the cart, so the cart summary would normally show. */
function WithCartItem({ children }: { children: React.ReactNode }) {
  const { addItem } = useCart();
  // Once: addItem is a new function on every render, so depending on it loops.
  useEffect(() => {
    addItem({ id: 'x', type: 'mix', name: 'Turbo Mix', price: 100, image: '', comboId: 'mix:x', table: '/table-1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

const renderFooter = (props: React.ComponentProps<typeof OrderFooter>) => render(
  <MemoryRouter>
    <CartProvider>
      <WithCartItem>
        <OrderFooter {...props} />
      </WithCartItem>
    </CartProvider>
  </MemoryRouter>,
);

describe('OrderFooter in save mode', () => {
  it('offers to save the build instead of adding it to the cart', () => {
    renderFooter({ build, saveMode: true });

    expect(screen.getByRole('button', { name: 'Save to favourites' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to Cart' })).toBeNull();
  });

  it('shows no cart summary while nothing is being built', () => {
    renderFooter({ build: { ...build, hookahName: null, tobaccoLabel: null, flavors: [] }, saveMode: true });

    expect(screen.queryByRole('button', { name: 'View Cart' })).toBeNull();
  });

  it('is unchanged outside save mode', () => {
    renderFooter({ build });

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeTruthy();
  });
});
