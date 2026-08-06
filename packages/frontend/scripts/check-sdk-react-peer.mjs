/**
 * Guards the published @lightdash/sdk bundle against declaring a `react` peer
 * range it cannot actually run on.
 *
 * React and react-dom are external in the SDK build (see rollup.config.mjs),
 * so the consumer supplies them. Everything else, including Mantine, is
 * inlined. That means a Mantine upgrade can start importing newer React APIs
 * without anything in our build failing: the bundle links fine, typecheck is
 * green, and the break only surfaces in a consumer's app at install or first
 * render.
 *
 * Mantine 9 is exactly that case — it imports `use` and `useEffectEvent`,
 * which do not exist before React 19.2.
 *
 * Run AFTER building the SDK:
 *   pnpm -F frontend build-sdk && pnpm -F frontend check:sdk-react-peer
 *
 * Two checks:
 *  1. Every named React import in the bundle exists in the React we build
 *     against. Catches a dependency reaching for an API newer than our own.
 *  2. The declared peer floor is not older than the React we build against.
 *     Nothing verifies those older versions, and admitting them is how a
 *     consumer ends up installing a combination that cannot work.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const bundlePath = resolve(__dirname, '../sdk/dist/sdk.es.js');
let bundle;
try {
    bundle = readFileSync(bundlePath, 'utf-8');
} catch {
    console.error(
        `SDK bundle not found at ${bundlePath}.\n` +
            'Build it first: pnpm -F frontend build-sdk',
    );
    process.exit(1);
}

// Rollup emits one combined named-import statement per external module.
const importRe = /import\s+[A-Za-z0-9_$]+\s*,\s*\{([^}]*)\}\s*from\s*'react';/g;
const imported = new Set();
for (const match of bundle.matchAll(importRe)) {
    for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) imported.add(name);
    }
}

if (imported.size === 0) {
    console.error(
        'Found no named React imports in the SDK bundle.\n' +
            'The bundle format likely changed; update this check.',
    );
    process.exit(1);
}

const React = require('react');
const reactVersion = require('react/package.json').version;

const missing = [...imported].filter((name) => typeof React[name] === 'undefined');

const peerRange = JSON.parse(
    readFileSync(resolve(__dirname, '../sdk/package.json'), 'utf-8'),
).peerDependencies.react;

const parse = (v) => v.split('.').map(Number);
const compare = (a, b) => {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
};

// Lowest version the declared range admits.
const versions = [...peerRange.matchAll(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/g)].map(
    (m) => `${m[1]}.${m[2] ?? 0}.${m[3] ?? 0}`,
);
const peerFloor = versions.sort(compare)[0];

const errors = [];

if (missing.length > 0) {
    errors.push(
        `The SDK bundle imports React APIs that do not exist in the React it is built against ` +
            `(react@${reactVersion}): ${missing.join(', ')}.`,
    );
}

if (peerFloor && compare(peerFloor, reactVersion) < 0) {
    errors.push(
        `sdk/package.json declares "react": "${peerRange}", whose floor (${peerFloor}) is older than ` +
            `the react@${reactVersion} this bundle is built and verified against. ` +
            `Consumers on ${peerFloor} would install a combination nothing has checked.`,
    );
}

if (errors.length > 0) {
    console.error('SDK react peer check failed:\n');
    for (const e of errors) console.error(`  - ${e}\n`);
    console.error(
        'Fix by narrowing the peer range in packages/frontend/sdk/package.json to match, ' +
            'and release it as an SDK major.',
    );
    process.exit(1);
}

console.log(
    `SDK react peer check passed: ${imported.size} named React imports all present in ` +
        `react@${reactVersion}; declared peer floor ${peerFloor} is not below it.`,
);
