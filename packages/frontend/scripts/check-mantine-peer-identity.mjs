import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(frontendRoot, '../..');

const packageJson = JSON.parse(
    readFileSync(join(frontendRoot, 'package.json'), 'utf8'),
);
const expectedDatesAlias = 'npm:@mantine/dates@8.0.0';

if (
    packageJson.dependencies['@mantine-8/dates'] !== expectedDatesAlias ||
    packageJson.dependencies['@mantine/dates']
) {
    throw new Error(
        `Expected only @mantine-8/dates=${expectedDatesAlias} in frontend dependencies`,
    );
}

const pnpmfile = readFileSync(join(repositoryRoot, '.pnpmfile.cjs'), 'utf8');
const remapBlocks = [
    ...pnpmfile.matchAll(
        /\{[^{}]*package:\s*['"]@mantine\/dates['"][^{}]*\}/gs,
    ),
].map(([block]) => block);

if (
    remapBlocks.length !== 2 ||
    !['@mantine/core', '@mantine/hooks'].every((peer) =>
        remapBlocks.some(
            (block) =>
                block.includes(`packageVersion: '8.0.0'`) &&
                block.includes(`peerDependency: '${peer}'`) &&
                block.includes(`newVersion: '8.0.0'`),
        ),
    )
) {
    throw new Error(
        'Expected exactly two Dates 8.0.0 peer remaps to Core/Hooks 8.0.0',
    );
}

const sourceFiles = readdirSync(join(frontendRoot, 'src'), {
    recursive: true,
    withFileTypes: true,
})
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
const forbiddenSourceMatches = sourceFiles.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const violations = [];
    if (/from\s+['"]@mantine\/dates['"]/.test(source)) {
        violations.push('canonical @mantine/dates import');
    }
    if (source.includes('timeInputProps')) {
        violations.push('removed DateTimePicker timeInputProps prop');
    }
    return violations.map((violation) => `${file}: ${violation}`);
});

if (forbiddenSourceMatches.length > 0) {
    throw new Error(forbiddenSourceMatches.join('\n'));
}

for (const entryFile of [
    join(frontendRoot, 'src/index.tsx'),
    join(frontendRoot, '.storybook/preview.tsx'),
]) {
    const source = readFileSync(entryFile, 'utf8');
    const coreStyle = "import '@mantine-8/core/styles.css';";
    const datesStyle = "import '@mantine-8/dates/styles.css';";

    if (
        source.split(datesStyle).length !== 2 ||
        source.indexOf(datesStyle) !==
            source.indexOf(coreStyle) + coreStyle.length + 1
    ) {
        throw new Error(
            `${entryFile} must import Dates styles exactly once, immediately after Core styles`,
        );
    }
}

const resolveRealPath = (specifier, fromRequire = require) =>
    realpathSync(fromRequire.resolve(specifier));

const readResolvedVersion = (entryPath) => {
    let directory = dirname(entryPath);

    while (directory !== dirname(directory)) {
        try {
            return JSON.parse(
                readFileSync(join(directory, 'package.json'), 'utf8'),
            ).version;
        } catch {
            directory = dirname(directory);
        }
    }

    throw new Error(`Could not find package.json for ${entryPath}`);
};

const appCore = resolveRealPath('@mantine-8/core');
const appHooks = resolveRealPath('@mantine-8/hooks');
const datesEntry = resolveRealPath('@mantine-8/dates');
const datesRequire = createRequire(datesEntry);
const datesCore = resolveRealPath('@mantine/core', datesRequire);
const datesHooks = resolveRealPath('@mantine/hooks', datesRequire);

const checks = [
    ['Dates', datesEntry, '8.0.0'],
    ['application Core', appCore, '8.0.0'],
    ['application Hooks', appHooks, '8.0.0'],
    ['Dates Core', datesCore, '8.0.0'],
    ['Dates Hooks', datesHooks, '8.0.0'],
];

for (const [label, entryPath, expectedVersion] of checks) {
    const actualVersion = readResolvedVersion(entryPath);
    if (actualVersion !== expectedVersion) {
        throw new Error(
            `${label} resolved to ${actualVersion}, expected ${expectedVersion}`,
        );
    }
}

if (datesCore !== appCore || datesHooks !== appHooks) {
    throw new Error(
        [
            'Mantine Dates does not share application Core/Hooks modules:',
            `app Core: ${appCore}`,
            `Dates Core: ${datesCore}`,
            `app Hooks: ${appHooks}`,
            `Dates Hooks: ${datesHooks}`,
        ].join('\n'),
    );
}

await import('@mantine-8/dates');

console.log('Mantine Dates module loaded with shared Core/Hooks 8.0.0');
