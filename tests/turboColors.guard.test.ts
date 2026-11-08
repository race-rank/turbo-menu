import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard: every `turbo-*` colour class must name a colour defined in
 * tailwind.config.ts. Tailwind silently emits nothing for an unknown one, and
 * tailwind-merge still lets it override the component's own background - so
 * `bg-turbo-bg` on an Input left the browser's white behind light text in the
 * hookah-of-the-day promo field.
 */
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const USE = /\b(?:bg|text|border|ring|ring-offset|from|via|to|fill|stroke|outline|divide|placeholder|shadow|decoration|accent|caret)-turbo-([a-z]+)\b/g;

function definedTurboColors(): Set<string> {
  const config = readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8');
  return new Set([...config.matchAll(/'turbo-([a-z]+)'\s*:/g)].map((m) => m[1]));
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(tsx?|css)$/.test(p)) out.push(p);
  }
  return out;
}

function undefinedUses(text: string, defined: Set<string>): string[] {
  return [...text.matchAll(USE)].filter((m) => !defined.has(m[1])).map((m) => m[0]);
}

describe('turbo colour classes', () => {
  const defined = definedTurboColors();

  it('reads the palette from the config', () => {
    expect([...defined]).toEqual(expect.arrayContaining(['dark', 'card', 'text', 'muted', 'teal']));
  });

  it('flags a colour the config does not define', () => {
    expect(undefinedUses('className="bg-turbo-bg hover:text-turbo-muted/80"', defined)).toEqual([
      'bg-turbo-bg',
    ]);
  });

  it('uses only defined colours in src', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      undefinedUses(readFileSync(file, 'utf8'), defined).map(
        (use) => `${path.relative(ROOT, file)}: ${use}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
