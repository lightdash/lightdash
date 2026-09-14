/**
 * Guards the React peer ranges declared by the published SDK packages.
 *
 * @lightdash/sdk keeps react and react-dom external (see rollup.config.mjs)
 * and inlines everything else, Mantine included. A dependency upgrade can
 * therefore start using a React API newer than the peer floor the SDK
 * declares, and nothing in our build notices: the bundle links, typecheck is
 * green, and the consumer's app fails at install or first render. Mantine 9
 * did exactly that with `use`, `useEffectEvent` and `Activity`.
 *
 * @lightdash/query-sdk is headless and unbundled, so its sources are checked
 * the same way against its own peer floor.
 *
 * Run AFTER building the SDK:
 *   pnpm sdk-build && pnpm -F frontend check:sdk-react-peer
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Named exports that do not exist in React 18, with the release that added
// them. Anything not listed is assumed to exist on every 18.x host.
const INTRODUCED_IN = {
    react: {
        use: '19.0.0',
        useActionState: '19.0.0',
        useOptimistic: '19.0.0',
        cache: '19.0.0',
        act: '19.0.0',
        captureOwnerStack: '19.1.0',
        cacheSignal: '19.2.0',
        Activity: '19.2.0',
        useEffectEvent: '19.2.0',
        ViewTransition: '19.3.0',
        addTransitionType: '19.3.0',
    },
    'react-dom': {
        useFormStatus: '19.0.0',
        useFormState: '19.0.0',
        requestFormReset: '19.0.0',
        preconnect: '19.0.0',
        prefetchDNS: '19.0.0',
        preinit: '19.0.0',
        preinitModule: '19.0.0',
        preload: '19.0.0',
        preloadModule: '19.0.0',
        browser: '19.3.0',
    },
};

const parseVersion = (v) => v.split('.').map(Number);
const compareVersions = (a, b) => {
    const [x, y] = [parseVersion(a), parseVersion(b)];
    for (let i = 0; i < 3; i += 1) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    }
    return 0;
};

// Lowest version a semver range admits, e.g. "^18.x || ^19.x" -> 18.0.0.
const rangeFloor = (range) =>
    [...range.matchAll(/(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?/g)]
        .map(
            (m) =>
                `${m[1]}.${m[2] === 'x' ? 0 : (m[2] ?? 0)}.${m[3] === 'x' ? 0 : (m[3] ?? 0)}`,
        )
        .sort(compareVersions)[0];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

const installed = {
    react: {
        module: require('react'),
        version: require('react/package.json').version,
    },
    'react-dom': {
        module: require('react-dom'),
        version: require('react-dom/package.json').version,
    },
};

const errors = [];

// The table is hand-maintained; make sure it still matches the React we build
// against so a typo cannot silently stop guarding anything.
for (const [pkg, table] of Object.entries(INTRODUCED_IN)) {
    for (const [name, since] of Object.entries(table)) {
        const shouldExist = compareVersions(since, installed[pkg].version) <= 0;
        if (shouldExist && typeof installed[pkg].module[name] === 'undefined') {
            errors.push(
                `INTRODUCED_IN lists ${pkg}.${name} as added in ${since}, but ${pkg}@${installed[pkg].version} does not export it. Fix the table.`,
            );
        }
    }
}

const splitNames = (list) =>
    list
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && !/^type\s/.test(part))
        .map((part) => part.split(/\s+as\s+/)[0].trim());

// Named React usage in source or bundle text, keyed by package. Covers ESM
// named imports, ESM namespace access (`React.use`) and CJS module access
// (`var React = require('react'); React.use`).
const collectUsage = (code, { namespaceOnlyTableNames }) => {
    const usage = { react: new Set(), 'react-dom': new Set() };
    for (const m of code.matchAll(
        /^import\s+(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"](react|react-dom)['"]/gm,
    )) {
        for (const name of splitNames(m[1])) usage[m[2]].add(name);
    }
    const namespaces = { react: new Set(), 'react-dom': new Set() };
    for (const m of code.matchAll(
        /^import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s+from\s*['"](react|react-dom)['"]/gm,
    )) {
        namespaces[m[2]].add(m[1]);
    }
    for (const m of code.matchAll(
        /^(?:const|var|let)\s+([A-Za-z0-9_$]+)\s*=\s*require\(['"](react|react-dom)['"]\)/gm,
    )) {
        namespaces[m[2]].add(m[1]);
    }
    for (const pkg of Object.keys(namespaces)) {
        for (const ns of namespaces[pkg]) {
            // Only code-shaped access: a call, argument, statement end or
            // member chain. Skips the same text inside warning strings.
            const nsRe = new RegExp(
                `(typeof\\s+)?\\b${ns.replace(/\$/g, '\\$')}\\.([A-Za-z0-9_$]+)\\b(?=\\s*[(,;)\\]}.?:=])`,
                'g',
            );
            for (const m of code.matchAll(nsRe)) {
                // `typeof React.x` is a feature probe, not a requirement. Plain
                // namespace access is only checked against the table because
                // bundled deps also probe removed APIs such as findDOMNode.
                if (m[1]) continue;
                if (!namespaceOnlyTableNames || m[2] in INTRODUCED_IN[pkg])
                    usage[pkg].add(m[2]);
            }
        }
    }
    return usage;
};

const checkAgainstPeers = ({ label, usage, peers, verifyExists }) => {
    for (const pkg of ['react', 'react-dom']) {
        const range = peers[pkg];
        if (!range) continue;
        const floor = rangeFloor(range);
        const tooNew = [...usage[pkg]]
            .filter((name) => name in INTRODUCED_IN[pkg])
            .filter(
                (name) => compareVersions(INTRODUCED_IN[pkg][name], floor) > 0,
            )
            .map((name) => `${name} (added in ${INTRODUCED_IN[pkg][name]})`);
        if (tooNew.length > 0) {
            errors.push(
                `${label} declares "${pkg}": "${range}" (floor ${floor}) but uses ${pkg} APIs newer than that: ${tooNew.join(', ')}. ` +
                    `Either stop using them or raise the peer floor.`,
            );
        }
        if (verifyExists) {
            const missing = [...usage[pkg]].filter(
                (name) => typeof installed[pkg].module[name] === 'undefined',
            );
            if (missing.length > 0) {
                errors.push(
                    `${label} imports ${pkg} APIs that ${pkg}@${installed[pkg].version} does not export: ${missing.join(', ')}.`,
                );
            }
        }
    }
};

// 1. The embed SDK bundles, both entry points.
const sdkDir = resolve(__dirname, '../sdk');
const sdkPeers = readJson(join(sdkDir, 'package.json')).peerDependencies ?? {};
for (const bundle of ['sdk.es.js', 'sdk.cjs.js']) {
    const path = join(sdkDir, 'dist', bundle);
    let code;
    try {
        code = readFileSync(path, 'utf-8');
    } catch {
        console.error(
            `SDK bundle not found at ${path}.\nBuild it first: pnpm sdk-build`,
        );
        process.exit(1);
    }
    const usage = collectUsage(code, { namespaceOnlyTableNames: true });
    if (usage.react.size === 0) {
        errors.push(
            `Found no React usage in ${bundle}. The bundle format likely changed; update this check.`,
        );
        continue;
    }
    checkAgainstPeers({
        label: `@lightdash/sdk (${bundle})`,
        usage,
        peers: sdkPeers,
        verifyExists: bundle === 'sdk.es.js',
    });
}

// 2. query-sdk sources: react is a peer and never bundled.
const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)
            ? [path]
            : [];
    });
const querySdkDir = resolve(__dirname, '../../query-sdk');
const querySdkPeers =
    readJson(join(querySdkDir, 'package.json')).peerDependencies ?? {};
const querySdkUsage = { react: new Set(), 'react-dom': new Set() };
for (const file of walk(join(querySdkDir, 'src'))) {
    const usage = collectUsage(readFileSync(file, 'utf-8'), {
        namespaceOnlyTableNames: true,
    });
    for (const pkg of Object.keys(usage))
        usage[pkg].forEach((n) => querySdkUsage[pkg].add(n));
}
checkAgainstPeers({
    label: '@lightdash/query-sdk',
    usage: querySdkUsage,
    peers: querySdkPeers,
    verifyExists: true,
});

if (errors.length > 0) {
    console.error('SDK react peer check failed:\n');
    for (const e of errors) console.error(`  - ${e}\n`);
    process.exit(1);
}

console.log(
    `SDK react peer check passed against react@${installed.react.version}: ` +
        `@lightdash/sdk floor ${rangeFloor(sdkPeers.react)}, @lightdash/query-sdk floor ${rangeFloor(querySdkPeers.react)}.`,
);
