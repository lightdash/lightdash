// Packs @lightdash/visualization and @lightdash/common the way `pnpm publish`
// would, installs both into a throwaway project outside the monorepo, and
// consumes them the ways a user can: Node ESM `import`, Node CommonJS
// `require`, and TypeScript under node16 (ESM and CommonJS) and bundler
// resolution. The consumer is `smoke-pack/consumer.ts`.
//
// Run after building common and visualization: `pnpm -F visualization test:pack`.
/* oxlint-disable no-console -- a command-line check reports on stdout */
import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const commonDir = join(packageDir, '..', 'common');
const consumerSource = join(packageDir, 'scripts', 'smoke-pack', 'consumer.ts');
const tsc = join(packageDir, 'node_modules', '.bin', 'tsc');
const keep = process.argv.includes('--keep');

const run = (command, args, cwd) =>
    execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

const writeJson = (path, value) =>
    writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`);

const results = [];
const check = (name, fn) => {
    try {
        const output = fn();
        results.push({ name, ok: true });
        console.log(`PASS ${name}${output ? `: ${output.trim()}` : ''}`);
    } catch (error) {
        results.push({ name, ok: false });
        const detail = [error.stdout, error.stderr, error.message]
            .filter(Boolean)
            .join('\n');
        console.log(`FAIL ${name}\n${detail}`);
    }
};

const root = mkdtempSync(join(tmpdir(), 'lightdash-visualization-pack-'));
console.log(`Consumer project: ${root}`);

try {
    const tarballsDir = join(root, 'tarballs');
    mkdirSync(tarballsDir);
    const pack = (dir) => {
        run('pnpm', ['pack', '--pack-destination', tarballsDir], dir);
    };
    pack(commonDir);
    pack(packageDir);
    const tarballs = readdirSync(tarballsDir);
    const tarball = (prefix) => {
        const found = tarballs.find((file) => file.startsWith(prefix));
        if (!found) throw new Error(`No ${prefix} tarball in ${tarballsDir}`);
        return join(tarballsDir, found);
    };
    const visualizationTarball = tarball('lightdash-visualization-');
    const commonTarball = tarball('lightdash-common-');

    check('tarball ships only dist/esm and dist/cjs code', () => {
        const unexpected = run('tar', ['-tzf', visualizationTarball], root)
            .split('\n')
            .filter(Boolean)
            .map((file) => file.replace(/^package\//, ''))
            .filter(
                (file) =>
                    !['package.json', 'README.md', 'LICENSE'].includes(file) &&
                    !/^dist\/(esm|cjs)\/.+\.(js|d\.ts)$/.test(file),
            );
        if (unexpected.length > 0) {
            throw new Error(`Unexpected files:\n${unexpected.join('\n')}`);
        }
        return '';
    });

    // The packed manifest pins @lightdash/common to the matching version,
    // which a consumer would install from npm; point it at the local tarball.
    writeJson(join(root, 'package.json'), {
        name: 'visualization-pack-consumer',
        private: true,
        dependencies: {
            '@lightdash/common': `file:${commonTarball}`,
            '@lightdash/visualization': `file:${visualizationTarball}`,
            echarts: '5.6.0',
        },
    });
    writeFileSync(
        join(root, 'pnpm-workspace.yaml'),
        `overrides:\n  '@lightdash/common': 'file:${commonTarball}'\n`,
    );
    run('pnpm', ['install', '--prefer-offline', '--ignore-scripts'], root);

    const compilerOptions = {
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        strict: true,
        skipLibCheck: true,
        types: [],
    };
    const variants = [
        {
            name: 'node16 ESM',
            type: 'module',
            options: { module: 'node16', moduleResolution: 'node16' },
            run: true,
        },
        {
            name: 'node16 CommonJS',
            type: 'commonjs',
            options: { module: 'node16', moduleResolution: 'node16' },
            run: true,
        },
        {
            name: 'bundler',
            type: 'module',
            options: {
                module: 'esnext',
                moduleResolution: 'bundler',
                noEmit: true,
            },
        },
        {
            name: 'bundler, module condition',
            type: 'module',
            options: {
                module: 'esnext',
                moduleResolution: 'bundler',
                customConditions: ['module'],
                noEmit: true,
            },
        },
    ];

    for (const variant of variants) {
        const dir = join(root, variant.name.replace(/\W+/g, '-'));
        mkdirSync(dir);
        writeJson(join(dir, 'package.json'), { type: variant.type });
        writeJson(join(dir, 'tsconfig.json'), {
            compilerOptions: {
                ...compilerOptions,
                ...variant.options,
                outDir: 'out',
            },
            files: ['consumer.ts'],
        });
        copyFileSync(consumerSource, join(dir, 'consumer.ts'));

        check(`tsc (${variant.name})`, () => run(tsc, ['-p', '.'], dir));
        if (variant.run) {
            const modules = variant.type === 'module' ? 'import' : 'require';
            check(`node ${modules} (${variant.name})`, () =>
                run('node', ['out/consumer.js'], dir),
            );
        }
    }
} finally {
    if (keep) console.log(`Kept ${root}`);
    else rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length > 0) process.exit(1);
