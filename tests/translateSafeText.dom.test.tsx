// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React, { useState } from 'react';

/**
 * Chrome's built-in Google Translate replaces every text node it translates
 * with a <font> element. React keeps a reference to the ORIGINAL text node, so
 * when an element has several text-node children (`Strength: {n}` renders
 * "Strength: " and "1"), React keeps updating a node that is no longer in the
 * document and the visible value freezes.
 *
 * An element whose only child is a single string is safe: React updates its
 * textContent, which discards Translate's <font> wrapper.
 */
function simulateGoogleTranslate(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (!node.nodeValue?.trim()) continue;
    const font = document.createElement('font');
    font.textContent = `[ro] ${node.nodeValue}`;
    node.parentNode!.replaceChild(font, node);
  }
}

function Broken({ n }: { n: number }) {
  return <span data-testid="label">Strength: {n}</span>;
}
function Safe({ n }: { n: number }) {
  return <span data-testid="label">{`Strength: ${n}`}</span>;
}

describe('translate-safe dynamic text', () => {
  afterEach(cleanup);

  it('sanity: the mixed pattern freezes after Translate rewrites the DOM', () => {
    const { getByTestId, rerender } = render(<Broken n={1} />);
    simulateGoogleTranslate(getByTestId('label'));
    rerender(<Broken n={5} />);
    expect(getByTestId('label').textContent).not.toContain('5');
  });

  it('single-string pattern keeps updating after Translate rewrites the DOM', () => {
    const { getByTestId, rerender } = render(<Safe n={1} />);
    simulateGoogleTranslate(getByTestId('label'));
    expect(getByTestId('label').textContent).toContain('[ro]');
    rerender(<Safe n={5} />);
    expect(getByTestId('label').textContent).toContain('5');
    expect(getByTestId('label').textContent).not.toContain('1');
  });

  it('keeps updating across state changes (slider-like)', () => {
    let set!: (n: number) => void;
    function Slider() {
      const [n, setN] = useState(1);
      set = setN;
      return <span data-testid="label">{`Strength: ${n}`}</span>;
    }
    const { getByTestId } = render(<Slider />);
    simulateGoogleTranslate(getByTestId('label'));
    act(() => set(4));
    expect(getByTestId('label').textContent).toContain('4');
  });
});
