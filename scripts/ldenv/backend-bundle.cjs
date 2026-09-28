const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const { getTsconfig } = require('get-tsconfig');

async function createBackendBuilder({
    root,
    outDir,
    role = 'api',
    entry,
    onBuildStart = () => {},
    onBuild = () => {},
}) {
    root = fs.realpathSync(root);
    outDir = path.resolve(outDir);
    if (!['api', 'scheduler'].includes(role))
        throw new Error('Role must be api or scheduler');
    const backend = path.join(root, 'packages/backend');
    const tsxRequire = createRequire(
        fs.realpathSync(path.join(root, 'node_modules/tsx/package.json')),
    );
    const esbuild = tsxRequire('esbuild');
    const tsconfigPath = path.join(backend, 'tsconfig.json');
    let tsconfig = getTsconfig(backend);
    let configFingerprint = JSON.stringify(tsconfig?.config);
    if (!tsconfig) throw new Error('Backend tsconfig not found');
    fs.mkdirSync(outDir, { recursive: true });
    const dependencies = path.join(outDir, 'node_modules');
    const dependencyTarget = path.join(backend, 'node_modules');
    if (fs.existsSync(dependencies)) {
        if (
            !fs.lstatSync(dependencies).isSymbolicLink() ||
            fs.realpathSync(dependencies) !== fs.realpathSync(dependencyTarget)
        ) {
            throw new Error('Output node_modules must point to this backend');
        }
    } else {
        fs.symlinkSync(dependencyTarget, dependencies, 'dir');
    }
    const outfile = path.join(outDir, role + '.cjs');
    const transformed = new Map();
    let began = 0;
    let generation = 0;
    let revision = 0;
    let lastBuild = null;
    const context = await esbuild.context({
        absWorkingDir: root,
        entryPoints: [
            entry
                ? path.resolve(entry)
                : path.join(
                      backend,
                      'src',
                      role === 'api' ? 'index.ts' : 'scheduler.ts',
                  ),
        ],
        outfile,
        bundle: true,
        packages: 'external',
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        tsconfig: tsconfigPath,
        keepNames: true,
        sourcemap: 'linked',
        sourcesContent: false,
        write: false,
        metafile: true,
        logLevel: 'silent',
        plugins: [
            {
                name: 'ldenv-backend-paths-and-publish',
                setup(build) {
                    build.onStart(async () => {
                        began = performance.now();
                        await onBuildStart();
                        const nextConfig = getTsconfig(backend);
                        if (!nextConfig)
                            throw new Error('Backend tsconfig not found');
                        const nextFingerprint = JSON.stringify(
                            nextConfig.config,
                        );
                        if (nextFingerprint !== configFingerprint)
                            transformed.clear();
                        tsconfig = nextConfig;
                        configFingerprint = nextFingerprint;
                    });
                    build.onLoad(
                        { filter: /\.[cm]?tsx?$/ },
                        async ({ path: filename }) => {
                            const source = await fs.promises.readFile(
                                filename,
                                'utf8',
                            );
                            const cached = transformed.get(filename);
                            if (cached?.source === source) return cached.result;
                            const loader = filename.endsWith('.tsx')
                                ? 'tsx'
                                : 'ts';
                            const output = await esbuild.transform(source, {
                                loader,
                                target: 'node24',
                                sourcefile: filename,
                                tsconfigRaw: tsconfig.config,
                                keepNames: true,
                                sourcemap: 'inline',
                                sourcesContent: false,
                                define: {
                                    __dirname: JSON.stringify(
                                        path.dirname(filename),
                                    ),
                                    __filename: JSON.stringify(filename),
                                },
                            });
                            const result = {
                                contents: output.code,
                                loader: 'js',
                                resolveDir: path.dirname(filename),
                                watchFiles: [filename],
                            };
                            transformed.set(filename, { source, result });
                            return result;
                        },
                    );
                    build.onEnd(async (result) => {
                        if (result.errors.length) {
                            const failure = {
                                ok: false,
                                errors: await esbuild.formatMessages(
                                    result.errors,
                                    { kind: 'error', color: false },
                                ),
                            };
                            lastBuild = failure;
                            await onBuild(failure);
                            return;
                        }
                        let changed = false;
                        const ordered = [...result.outputFiles].sort(
                            (a, b) =>
                                Number(a.path === outfile) -
                                Number(b.path === outfile),
                        );
                        for (const file of ordered) {
                            const contents = Buffer.from(file.contents);
                            const old = await fs.promises
                                .readFile(file.path)
                                .catch(() => null);
                            if (old?.equals(contents)) continue;
                            const temporary = file.path + '.tmp-' + process.pid;
                            await fs.promises.writeFile(temporary, contents);
                            await fs.promises.rename(temporary, file.path);
                            if (file.path === outfile) changed = true;
                        }
                        lastBuild = {
                            ok: true,
                            generation: ++generation,
                            revision: changed ? ++revision : revision,
                            seconds: (performance.now() - began) / 1000,
                            changed,
                            outfile,
                            inputs: Object.keys(result.metafile.inputs).length,
                            esbuildVersion: esbuild.version,
                        };
                        await fs.promises.writeFile(
                            path.join(outDir, role + '-build.json'),
                            JSON.stringify(
                                {
                                    ...lastBuild,
                                    root,
                                    builtAt: new Date().toISOString(),
                                },
                                null,
                                2,
                            ),
                        );
                        await onBuild(lastBuild);
                    });
                },
            },
        ],
    });
    return {
        outfile,
        async rebuild() {
            await context.rebuild();
            return lastBuild;
        },
        async watch() {
            await context.watch();
        },
        async dispose() {
            await context.dispose();
        },
    };
}

module.exports = { createBackendBuilder };

if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        const values = {};
        let watch = false;
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--watch') {
                watch = true;
                continue;
            }
            if (
                !['--root', '--out-dir', '--role'].includes(args[i]) ||
                !args[i + 1]
            )
                throw new Error(
                    'Usage: node backend-bundle.cjs --root PATH --out-dir PATH [--role api|scheduler] [--watch]',
                );
            values[args[i].slice(2)] = args[++i];
        }
        if (!values.root || !values['out-dir'])
            throw new Error('--root and --out-dir are required');
        const builder = await createBackendBuilder({
            root: values.root,
            outDir: values['out-dir'],
            role: values.role,
            onBuild: (event) =>
                process.stdout.write(JSON.stringify(event) + '\n'),
        });
        try {
            await builder.rebuild();
            if (!watch) {
                await builder.dispose();
                return;
            }
            await builder.watch();
            let closing = false;
            const close = async () => {
                if (closing) return;
                closing = true;
                await builder.dispose();
                process.exit(0);
            };
            process.once('SIGINT', close);
            process.once('SIGTERM', close);
        } catch (error) {
            await builder.dispose();
            throw error;
        }
    })().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
