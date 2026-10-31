const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

if (process.env.MULTI_REPO_SIM_DISABLE_SCHEDULER === '1') {
    process.env.SCHEDULER_ENABLED = 'false';
}

function readJson(filename) {
    try {
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch {
        throw new Error('Cannot read package metadata');
    }
}

function requireAt(directory) {
    return createRequire(path.join(fs.realpathSync(directory), 'package.json'));
}

function inside(filename, directory) {
    const relative = path.relative(directory, fs.realpathSync(filename));
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    );
}

function lexicalInside(filename, directory) {
    const relative = path.relative(directory, filename);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    );
}

const packageNames = ['backend', 'common', 'formula', 'warehouses'];
const workspaceNames = new Set(
    packageNames.slice(1).map((name) => `@lightdash/${name}`),
);

function linkModule(destination, source) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (
        fs.existsSync(destination) ||
        fs.lstatSync(path.dirname(destination)).isSymbolicLink()
    ) {
        throw new Error('Dependency destination is occupied');
    }
    fs.symlinkSync(source, destination, 'dir');
}

function installedCandidates(checkout, directory, name, archive) {
    const candidates = [
        path.join(directory, 'node_modules', name),
        path.join(checkout, 'node_modules', name),
    ];
    const store = path.join(checkout, 'node_modules/.pnpm');
    const external = archive && path.join(archive, '.external/node_modules');
    if (external && fs.existsSync(external)) {
        for (const alias of fs.readdirSync(external)) {
            if (alias.startsWith('.')) continue;
            const candidate = path.join(external, alias);
            if (
                fs.existsSync(path.join(candidate, 'package.json')) &&
                readJson(path.join(candidate, 'package.json')).name === name
            )
                candidates.push(candidate);
        }
    }
    for (const candidate of candidates.slice()) {
        if (!fs.existsSync(candidate)) continue;
        const resolved = fs.realpathSync(candidate);
        const boundary = resolved.indexOf('/links/');
        if (boundary < 0) continue;
        const versions = path.join(resolved.slice(0, boundary + 7), name);
        if (!fs.existsSync(versions)) continue;
        for (const version of fs.readdirSync(versions).sort()) {
            const hashes = path.join(versions, version);
            if (!fs.statSync(hashes).isDirectory()) continue;
            for (const hash of fs.readdirSync(hashes).sort()) {
                candidates.push(path.join(hashes, hash, 'node_modules', name));
            }
        }
    }
    if (fs.existsSync(store)) {
        const prefix = `${name.replace('/', '+')}@`;
        for (const item of fs.readdirSync(store).sort()) {
            if (item.startsWith(prefix))
                candidates.push(path.join(store, item, 'node_modules', name));
        }
    }
    return [
        ...new Set(
            candidates
                .filter((item) =>
                    fs.existsSync(path.join(item, 'package.json')),
                )
                .map((item) => fs.realpathSync(item)),
        ),
    ];
}

function prepareDependencies(checkout, archive) {
    const semver = requireAt(path.join(checkout, 'node_modules/pm2'))('semver');
    const dependencies = {};
    for (const relative of [
        '',
        ...packageNames.map((name) => 'packages/' + name),
    ]) {
        const manifest = readJson(path.join(archive, relative, 'package.json'));
        for (const [name, specifier] of Object.entries(
            manifest.dependencies || {},
        )) {
            if (workspaceNames.has(name)) continue;
            if (!semver.validRange(specifier))
                throw new Error('Unsupported dependency constraint: ' + name);
            const candidate = installedCandidates(
                checkout,
                path.join(checkout, relative),
                name,
                archive,
            ).find((directory) =>
                semver.satisfies(
                    readJson(path.join(directory, 'package.json')).version,
                    specifier,
                ),
            );
            if (!candidate) {
                const alias =
                    'pin_' +
                    (name + '_' + specifier)
                        .replace(/[^a-zA-Z0-9_]/g, '_')
                        .toLowerCase();
                dependencies[alias] = 'npm:' + name + '@' + specifier;
            }
        }
    }
    if (Object.keys(dependencies).length) {
        const directory = path.join(archive, '.external');
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
            path.join(directory, 'package.json'),
            JSON.stringify({ private: true, dependencies }, null, 2) + '\n',
        );
        fs.writeFileSync(
            path.join(directory, 'pnpm-workspace.yaml'),
            'packages: ["."]\n',
        );
    }
}

function linkDependencies(checkout, archive) {
    const semver = requireAt(path.join(checkout, 'node_modules/pm2'))('semver');
    const records = [];
    for (const relative of [
        '',
        ...packageNames.map((name) => `packages/${name}`),
    ]) {
        const source = path.join(checkout, relative);
        const target = path.join(archive, relative);
        const modules = path.join(target, 'node_modules');
        fs.mkdirSync(modules);
        const manifest = readJson(path.join(target, 'package.json'));
        const installed = path.join(source, 'node_modules');
        if (!fs.existsSync(installed))
            throw new Error('Checkout package dependencies are unavailable');
        for (const item of fs
            .readdirSync(installed)
            .filter((entry) => entry !== '.pnpm')) {
            if (item.startsWith('@')) {
                const scope = path.join(installed, item);
                for (const child of fs
                    .readdirSync(scope)
                    .filter(
                        (entry) =>
                            fs.existsSync(path.join(scope, entry)) &&
                            !workspaceNames.has(`${item}/${entry}`),
                    )) {
                    const name = `${item}/${child}`;
                    const original = path.join(scope, child);
                    if (inside(original, path.join(checkout, 'packages'))) {
                        throw new Error(
                            'An unsupported checkout workspace dependency was found',
                        );
                    }
                    linkModule(
                        path.join(modules, name),
                        fs.realpathSync(original),
                    );
                }
            } else if (fs.existsSync(path.join(installed, item))) {
                const original = fs.realpathSync(path.join(installed, item));
                if (
                    inside(original, path.join(checkout, 'packages')) &&
                    item !== '.bin'
                ) {
                    throw new Error(
                        'An unsupported checkout workspace dependency was found',
                    );
                }
                linkModule(path.join(modules, item), original);
            }
        }
        for (const name of workspaceNames) {
            linkModule(
                path.join(modules, name),
                path.join(archive, 'packages', name.split('/')[1]),
            );
        }
        const optional = manifest.optionalDependencies || {};
        const dependencies = {
            ...manifest.dependencies,
            ...optional,
            ...(relative === 'packages/formula'
                ? { peggy: manifest.devDependencies.peggy }
                : {}),
        };
        Object.entries(dependencies).forEach(([name, specifier]) => {
            if (workspaceNames.has(name)) return;
            if (!semver.validRange(specifier)) {
                throw new Error(`Unsupported dependency constraint: ${name}`);
            }
            const candidate = installedCandidates(
                checkout,
                source,
                name,
                archive,
            ).find((directory) => {
                const metadata = readJson(path.join(directory, 'package.json'));
                return (
                    metadata.name === name &&
                    semver.satisfies(metadata.version, specifier)
                );
            });
            if (!candidate) {
                if (Object.hasOwn(optional, name)) {
                    const destination = path.join(modules, name);
                    if (fs.existsSync(destination)) fs.unlinkSync(destination);
                    records.push({
                        package: relative || '.',
                        name,
                        requested: specifier,
                        optional: true,
                        installed: null,
                    });
                    return;
                }
                throw new Error(
                    `Compatible installed dependency is unavailable: ${name}`,
                );
            }
            const destination = path.join(modules, name);
            if (fs.existsSync(destination)) fs.unlinkSync(destination);
            linkModule(destination, candidate);
            records.push({
                package: relative || '.',
                name,
                requested: specifier,
                installed: readJson(path.join(candidate, 'package.json'))
                    .version,
                path: candidate,
            });
        });
        if (!fs.existsSync(path.join(modules, '.bin'))) {
            linkModule(
                path.join(modules, '.bin'),
                path.join(checkout, 'node_modules/.bin'),
            );
        }
    }
    fs.writeFileSync(
        path.join(archive, 'dependencies.json'),
        `${JSON.stringify(records, null, 2)}\n`,
    );
}

function exportTargets(manifest) {
    const targets = new Set([manifest.main, manifest.module].filter(Boolean));
    const visit = (value) => {
        if (typeof value === 'string') {
            if (
                !value.includes('*') &&
                /\.[cm]?js$/.test(value) &&
                value.includes('dist/')
            )
                targets.add(value);
        } else if (value && typeof value === 'object') {
            for (const child of Object.values(value)) visit(child);
        }
    };
    visit(manifest.exports);
    return [...targets];
}

function entrySource(directory, output) {
    const relative = output
        .replace(/^\.\//, '')
        .replace(/^dist\/(?:cjs\/|esm\/)?/, '')
        .replace(/\.[cm]?js$/, '');
    for (const extension of ['.ts', '.tsx', '.js', '.mjs', '.cts', '.mts']) {
        const source = path.join(directory, 'src', relative + extension);
        if (fs.existsSync(source)) return source;
    }
    throw new Error('Package export has no archived source');
}

function archivedPathsPlugin(esbuild, root) {
    return {
        name: 'archived-package-paths',
        setup(build) {
            build.onLoad(
                { filter: /\.[cm]?[jt]sx?$/ },
                async ({ path: filename }) => {
                    if (
                        !inside(filename, root) ||
                        filename.includes(`${path.sep}node_modules${path.sep}`)
                    ) {
                        throw new Error('Workspace source escaped the archive');
                    }
                    let loader = 'js';
                    if (filename.endsWith('.tsx')) loader = 'tsx';
                    else if (/\.[cm]?ts$/.test(filename)) loader = 'ts';
                    const result = await esbuild.transform(
                        await fs.promises.readFile(filename, 'utf8'),
                        {
                            loader,
                            target: 'node24',
                            sourcefile: filename,
                            sourcemap: 'inline',
                            keepNames: true,
                            define: {
                                __dirname: JSON.stringify(
                                    path.dirname(filename),
                                ),
                                __filename: JSON.stringify(filename),
                            },
                        },
                    );
                    return {
                        contents: result.code,
                        loader: 'js',
                        resolveDir: path.dirname(filename),
                    };
                },
            );
        },
    };
}

async function buildPackages(checkout, archive) {
    const esbuild = requireAt(
        fs.realpathSync(path.join(checkout, 'node_modules/tsx')),
    )('esbuild');
    const records = [];
    const formula = path.join(archive, 'packages/formula');
    const peggy = requireAt(formula)('peggy');
    const grammar = path.join(formula, 'src/grammar/formula.pegjs');
    fs.writeFileSync(
        path.join(formula, 'src/grammar/parser.js'),
        peggy.generate(fs.readFileSync(grammar, 'utf8'), {
            cache: true,
            format: 'es',
            output: 'source',
            grammarSource: grammar,
        }),
    );
    const entries = ['common', 'formula', 'warehouses'].flatMap((name) => {
        const directory = path.join(archive, 'packages', name);
        const manifest = readJson(path.join(directory, 'package.json'));
        return exportTargets(manifest).map((output) => ({
            name,
            directory,
            manifest,
            output,
        }));
    });
    await entries.reduce(
        async (previous, { name, directory, manifest, output }) => {
            await previous;
            const outfile = path.join(directory, output);
            if (!lexicalInside(outfile, path.join(directory, 'dist')))
                throw new Error('Package output escaped its dist directory');
            const format =
                output.includes('/esm/') ||
                output.endsWith('.mjs') ||
                manifest.type === 'module'
                    ? 'esm'
                    : 'cjs';
            const source = entrySource(directory, output);
            const result = await esbuild.build({
                absWorkingDir: archive,
                entryPoints: [source],
                outfile,
                bundle: true,
                packages: 'external',
                platform: 'node',
                target: 'node24',
                format,
                keepNames: true,
                sourcemap: 'linked',
                metafile: true,
                logLevel: 'silent',
                plugins: [archivedPathsPlugin(esbuild, archive)],
            });
            for (const input of Object.keys(result.metafile.inputs)) {
                if (!inside(path.resolve(archive, input), archive))
                    throw new Error('Package build included checkout sources');
            }
            records.push({
                package: name,
                entry: source,
                outfile,
                format,
                inputs: Object.keys(result.metafile.inputs).length,
            });
        },
        Promise.resolve(),
    );
    for (const name of ['common', 'formula', 'warehouses']) {
        const directory = path.join(archive, 'packages', name);
        for (const file of fs.readdirSync(path.join(directory, 'src'), {
            recursive: true,
        })) {
            if (/\.(?:crt|pem|json)$/.test(file)) {
                for (const destination of name === 'common'
                    ? ['dist/cjs', 'dist/esm']
                    : ['dist']) {
                    const target = path.join(directory, destination, file);
                    fs.mkdirSync(path.dirname(target), { recursive: true });
                    fs.copyFileSync(path.join(directory, 'src', file), target);
                }
            }
        }
    }
    const outDir = path.join(archive, '.runtime');
    const { createBackendBuilder } = requireAt(checkout)(
        './scripts/ldenv/backend-bundle.cjs',
    );
    const builder = await createBackendBuilder({ root: archive, outDir });
    try {
        const result = await builder.rebuild();
        if (!result?.ok) throw new Error('Archived backend build failed');
    } finally {
        await builder.dispose();
    }
    fs.writeFileSync(
        path.join(outDir, 'packages-build.json'),
        `${JSON.stringify(
            {
                esbuild: esbuild.version,
                peggy: peggy.VERSION,
                packages: records,
                dependencies: readJson(path.join(archive, 'dependencies.json')),
            },
            null,
            2,
        )}\n`,
    );
}

async function main() {
    const [action, checkoutArgument, archiveArgument] = process.argv.slice(2);
    if (action === 'smoke') {
        if (
            process.env.MULTI_REPO_SIM_DISABLE_SCHEDULER !== '1' ||
            process.env.SCHEDULER_ENABLED !== 'false'
        )
            throw new Error('Scheduler preload guard failed');
        return;
    }
    if (
        !['dependencies', 'link', 'build'].includes(action) ||
        !checkoutArgument ||
        !archiveArgument
    )
        throw new Error('Invalid archive helper arguments');
    const checkout = fs.realpathSync(checkoutArgument);
    const archive = fs.realpathSync(archiveArgument);
    if (
        !inside(
            archive,
            path.join(
                checkout,
                'examples/multi-repo-dbt-sim/.work/large-org/builds',
            ),
        )
    )
        throw new Error('Archive must belong to this fixture');
    if (!/^[0-9a-f]{40}$/.test(path.basename(archive)))
        throw new Error('Archive directory must be a commit SHA');
    if (action === 'dependencies') prepareDependencies(checkout, archive);
    else if (action === 'link') linkDependencies(checkout, archive);
    else await buildPackages(checkout, archive);
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { linkDependencies, exportTargets, entrySource };
