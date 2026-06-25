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
const bundlePath = resolve(__dirname, '../sdk/dist/sdk.es.js');

let code;
try {
    code = readFileSync(bundlePath, 'utf-8');
} catch {
    console.error(
        `SDK bundle not found at ${bundlePath}.\n` +
            'Build it first: pnpm -F frontend build-sdk',
    );
    process.exit(1);
}

const count = (needle) => code.split(needle).length - 1;

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
    {
        label: "ECharts GeoJSON dead-code fallback (new Function('return ('...))",
        needle: "new Function('return (' + source",
        fix: 'The rollup patch-echarts-csp-geojson transform should rewrite this — check rollup.config.mjs.',
    },
];

// Coarse backstop. Update consciously (and explain why) if a dependency
// legitimately changes the count — never to paper over a real new eval source.
const BASELINE = 10;

const regressions = FORBIDDEN_SIGNATURES.map((s) => ({
    ...s,
    found: count(s.needle),
})).filter((s) => s.found > 0);

const evalCount = count('eval(');
const newFunctionCount = count('new Function');
const total = evalCount + newFunctionCount;

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
        `\n✗ SDK bundle eval()/new Function() count is ${total} (baseline ${BASELINE}).`,
    );
    console.error(
        '  A new runtime code-generator may have entered the bundle. Identify the new source\n' +
            '  (grep sdk.es.js for "eval(" / "new Function"). If it is genuinely dormant and CSP-safe,\n' +
            '  bump BASELINE in packages/frontend/scripts/check-sdk-csp.mjs with a note explaining why.',
    );
}

if (failed) {
    process.exit(1);
}

console.log(
    `✓ SDK CSP check passed: 0 forbidden signatures; ` +
        `${total}/${BASELINE} eval()+new Function() (eval=${evalCount}, new Function=${newFunctionCount}).`,
);
