import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Static guard: an element must not mix static text with an interpolated value
 * (`Strength: {n}`, `{total} Lei`, `{a} · {b}`). Google Translate detaches the
 * separate text nodes React renders, freezing the visible value. Use a single
 * template string instead: {`Strength: ${n}`}. See translateSafeText.dom.test.tsx.
 *
 * Rule: after dropping whitespace-only text and empty `{/* *\/}` expressions, flag
 * an element with >= 1 non-JSX expression child when it also has another text
 * or non-JSX expression child. Expressions containing JSX (`{c && <X/>}`,
 * `{items.map(...)}`) are treated as elements and ignored.
 */
const SRC = path.resolve(__dirname, '../src');

// shadcn/ui primitives only forward `{children}`; never mix text.
const EXEMPT_DIRS = [path.join(SRC, 'components', 'ui') + path.sep];
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function findOffenders(file: string, text = readFileSync(file, 'utf8')): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const isJsx = (c: ts.JsxChild) =>
    ts.isJsxElement(c) ||
    ts.isJsxSelfClosingElement(c) ||
    ts.isJsxFragment(c) ||
    (ts.isJsxExpression(c) && !!c.expression && /<[A-Za-z>]/.test(c.expression.getText()));
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      const kids = n.children.filter(
        (c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces) && !(ts.isJsxExpression(c) && !c.expression),
      );
      const jsx = kids.filter(isJsx).length;
      const text = kids.filter((c) => ts.isJsxText(c)).length;
      const exprs = kids.length - text - jsx;
      if (exprs >= 1 && text + exprs >= 2) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
        found.push(`${path.relative(SRC, file)}:${line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('translate-safe text guard', () => {
  it('no element mixes static text with an interpolated value', () => {
    const files = tsxFiles(SRC).filter(
      (f) => !EXEMPT_DIRS.some((d) => f.startsWith(d)),
    );
    const offenders = files.flatMap((f) => findOffenders(f));
    expect(offenders, `Use a single template string, e.g. {\`Total: \${n} Lei\`}:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('detector flags mixed text/expression and accepts the single-string form', () => {
    expect(findOffenders('/x.tsx', '<span>Strength: {n}</span>')).toHaveLength(1);
    expect(findOffenders('/x.tsx', '<span>{n} Lei</span>')).toHaveLength(1);
    expect(findOffenders('/x.tsx', '<p>{a} · {b}</p>')).toHaveLength(1);
    expect(findOffenders('/x.tsx', '<span>{`Strength: ${n}`}</span>')).toHaveLength(0);
    expect(findOffenders('/x.tsx', '<div>{c && <b>x</b>}{items.map((i) => <i key={i}/>)}</div>')).toHaveLength(0);
  });
});
