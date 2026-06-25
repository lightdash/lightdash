/**
 * Guards the published @lightdash/sdk bundle against re-introducing runtime
 * code-generation (`eval` / `new Function`) that breaks consumers running a
 * strict Content-Security-Policy (`script-src` without `'unsafe-eval'`).
 *
 * See issue #21276. Run AFTER building the SDK:
 *   pnpm -F frontend build-sdk && pnpm -F frontend check:sdk-csp
 *
 * Two checks:
 *  1. FORBIDDEN_SIGNATURES — specific runtime code-generators we deliberately
 *     removed. These must stay at zero; a non-zero count is a hard regression.
 *  2. BASELINE ceiling — a coarse backstop on the total `eval(`/`new Function`
 *     count. Most remaining hits are dormant (off the dashboard render path) or
 *     false positives (regex text, methods named `eval`). The ceiling exists so
 *     a NEW runtime code-generator can't slip in unnoticed.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Both published entry points must be checked — consumers using `import` get
// sdk.es.js and consumers using `require` get sdk.cjs.js.
const BUNDLES = ['sdk.es.js', 'sdk.cjs.js'];

const code = Object.fromEntries(
    BUNDLES.map((name) => {
        const path = resolve(__dirname, '../sdk/dist', name);
        try {
            return [name, readFileSync(path, 'utf-8')];
        } catch {
            console.error(
                `SDK bundle not found at ${path}.\n` +
                    'Build it first: pnpm -F frontend build-sdk',
            );
            return process.exit(1);
        }
    }),
);

// Highest count across both bundles, so a regression in either one is caught.
const count = (needle) =>
    Math.max(...BUNDLES.map((name) => code[name].split(needle).length - 1));
const countRe = (re) =>
    Math.max(...BUNDLES.map((name) => (code[name].match(re) || []).length));

// Runtime code-generators removed in #21276 — these must never reappear.
const FORBIDDEN_SIGNATURES = [
    {
        label: 'PEG.js runtime parser eval (eval(ast.code))',
        needle: 'eval(ast.code)',
        fix: 'Filter grammar must use the precompiled parser (filterGrammar.parser.ts), not peg.generate().',
    },
    {
        label: 'PEG.js codegen eval (eval(ast.consts))',
        needle: 'eval(ast.consts',
        fix: 'Regenerate the precompiled parser: pnpm -F common generate:filter-grammar-parser',
    },
];

// Coarse backstop. Update consciously (and explain why) if a dependency
// legitimately changes the count — never to paper over a real new eval source.
//
// The total counts `eval(`, `new Function(`, AND bare `Function(` — CSP blocks
// all three. (Vega's expression compiler uses the bare `Function(...)` form, so
// a `new Function`-only count was blind to the most CSP-relevant codegen in the
// bundle.) The current dormant occurrences, none reached on a dashboard render:
//   Function() codegen: ajv validator codegen, ECharts GeoJSON fallback
//     (unreachable dead branch — guarded by `typeof JSON.parse`), html2canvas
//     calc() colour parser, source-map, lodash/webpack `Function('return this')`
//     global-this probes (try/catch-guarded), and Vega's expression compiler —
//     now bypassed at render by the `ast: true` interpreter (CustomVisualization).
//   eval(: highlight.js keyword regex text, vega-dataflow `.eval()` method.
// A fresh build is the canonical count; a stale local Vite/rollup cache only ever
// lowers it, so this exact ceiling never false-fails — only a genuinely new
// code-generator pushes the total above it.
const BASELINE = 31;

const regressions = FORBIDDEN_SIGNATURES.map((s) => ({
    ...s,
    found: count(s.needle),
})).filter((s) => s.found > 0);

const evalCount = count('eval(');
// Counts BOTH `new Function(...)` and bare `Function(...)` (the negated class
// excludes member access like `isFunction(` / `.Function(`). CSP blocks both.
const functionCtorCount = countRe(/[^\w$.]Function\s*\(/g);
const total = evalCount + functionCtorCount;

let failed = false;

if (regressions.length > 0) {
    failed = true;
    console.error(
        '\n✗ CSP regression: forbidden runtime code-generation is back in the SDK bundle:',
    );
    for (const r of regressions) {
        console.error(`  • ${r.label} — ${r.found}x`);
        console.error(`    ↳ ${r.fix}`);
    }
}

if (total > BASELINE) {
    failed = true;
    console.error(
        `\n✗ SDK bundle eval()/Function() count is ${total} (baseline ${BASELINE}).`,
    );
    console.error(
        '  A new runtime code-generator may have entered the bundle. Identify the new source\n' +
            '  (grep sdk.es.js for "eval(" and /[^\\w$.]Function\\(/). If it is genuinely dormant and\n' +
            '  CSP-safe, bump BASELINE in packages/frontend/scripts/check-sdk-csp.mjs with a note explaining why.',
    );
}

if (failed) {
    process.exit(1);
}

console.log(
    `✓ SDK CSP check passed: 0 forbidden signatures; ` +
        `${total}/${BASELINE} eval()+Function() (eval=${evalCount}, Function-ctor=${functionCtorCount}).`,
);
