import {
    buildDataAppExploreIndexFromModelFiles,
    type DataAppCode,
    type DataAppManifest,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBundleFromDir, writeBundleToDir } from './appCodeFiles';
import {
    buildAppsValidationReport,
    renderAppsValidationHuman,
    renderAppsValidationJson,
    validateDataAppBuild,
    validateLocalDataApp,
    type RunDataAppBuildCommand,
} from './validate';

const semanticLayer = [
    'models:',
    '  - name: orders',
    '    meta:',
    '      metrics:',
    '        total_revenue:',
    '          type: sum',
    '    columns:',
    '      - name: status',
].join('\n');

const defaultManifest: DataAppManifest = {
    codeVersion: 1,
    projectUuid: 'project-uuid',
    slug: 'orders-app',
    version: 1,
    name: 'Orders app',
    description: '',
    template: null,
    downloadedAt: '2026-08-01T00:00:00.000Z',
    externalConnections: [{ alias: 'stripe', connectionSlug: 'stripe-api' }],
};

const validSource = `
    import { query } from '@lightdash/query-sdk';
    query('orders').dimensions(['status']).metrics(['total_revenue']);
    lightdash.externalFetch('stripe', { path: '/charges' });
`;

const makeApp = async (args?: {
    source?: string;
    manifest?: DataAppManifest;
    semanticLayout?: 'legacy' | 'sharded' | 'none';
    packageJson?: string;
    lockfile?: string;
}): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-validate-'));
    const code: DataAppCode = {
        manifest: args?.manifest ?? defaultManifest,
        files: [
            {
                path: 'src/App.tsx',
                contentBase64: Buffer.from(
                    args?.source ?? validSource,
                ).toString('base64'),
            },
        ],
    };
    await writeBundleToDir(dir, code);

    const layout = args?.semanticLayout ?? 'sharded';
    if (layout === 'legacy') {
        const contextDir = path.join(dir, '.lightdash', 'context');
        await fs.mkdir(contextDir, { recursive: true });
        await fs.writeFile(
            path.join(contextDir, 'semantic-layer.yml'),
            semanticLayer,
        );
    } else if (layout === 'sharded') {
        const modelsDir = path.join(dir, '.lightdash', 'context', 'models');
        await fs.mkdir(modelsDir, { recursive: true });
        await Promise.all([
            fs.writeFile(
                path.join(dir, '.lightdash', 'context', 'semantic-layer.yml'),
                '# See models/',
            ),
            fs.writeFile(path.join(modelsDir, 'orders.yml'), semanticLayer),
        ]);
    }

    if (args?.packageJson !== undefined) {
        await fs.writeFile(path.join(dir, 'package.json'), args.packageJson);
    }
    if (args?.lockfile !== undefined) {
        await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), args.lockfile);
    }
    return dir;
};

const unusedLiveLoader = (): never => {
    throw new Error('live semantic layer should not be loaded');
};

const liveIndex = buildDataAppExploreIndexFromModelFiles([
    { path: 'orders.yml', content: semanticLayer },
]);

describe('validateLocalDataApp', () => {
    it.each(['sharded', 'legacy'] as const)(
        'validates a correct app against a %s offline semantic layer',
        async (semanticLayout) => {
            const dir = await makeApp({ semanticLayout });

            const result = await validateLocalDataApp(dir, {
                live: false,
                loadLiveIndex: unusedLiveLoader,
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.coverage).toMatchObject({
                callSites: 2,
                fullyResolved: 2,
                unanalyzed: 0,
            });
        },
    );

    it('reports semantic errors and undeclared externalFetch aliases with source locations', async () => {
        const dir = await makeApp({
            source: `
                import { query } from '@lightdash/query-sdk';
                query('ordrs').dimensions(['missing_field']);
                client.externalFetch('salesforce', { path: '/accounts' });
            `,
        });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'semantic_reference',
                    message:
                        "Explore 'ordrs' does not exist — did you mean 'orders'?",
                    location: expect.objectContaining({ path: 'src/App.tsx' }),
                }),
                expect.objectContaining({
                    code: 'external_connection',
                    message: expect.stringContaining('salesforce'),
                    location: expect.objectContaining({ path: 'src/App.tsx' }),
                }),
            ]),
        );
    });

    it('counts dynamic query call sites as unanalyzed without failing', async () => {
        const dir = await makeApp({
            source: `
                import { query } from '@lightdash/query-sdk';
                function build(explore) {
                    return query(explore).dimensions(['status']);
                }
            `,
        });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.valid).toBe(true);
        expect(result.coverage).toMatchObject({
            callSites: 1,
            unresolved: 1,
            unanalyzed: 1,
        });
    });

    it('does not treat a dynamic externalFetch alias as an error', async () => {
        const dir = await makeApp({
            source: `
                function load(client, alias) {
                    return client.externalFetch(alias, { path: '/resource' });
                }
            `,
            semanticLayout: 'none',
        });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.coverage).toMatchObject({
            callSites: 1,
            unresolved: 1,
            unanalyzed: 1,
        });
    });

    it('uses the live semantic layer and does not require a local snapshot', async () => {
        const dir = await makeApp({ semanticLayout: 'none' });
        const loadLiveIndex = vi.fn().mockResolvedValue(liveIndex);

        const result = await validateLocalDataApp(dir, {
            live: true,
            liveProjectUuid: 'configured-project-uuid',
            loadLiveIndex,
        });

        expect(result.valid).toBe(true);
        expect(result.projectUuid).toBe('configured-project-uuid');
        expect(loadLiveIndex).toHaveBeenCalledWith('configured-project-uuid');
    });

    it('explains how to configure a project for live validation', async () => {
        const dir = await makeApp({ semanticLayout: 'none' });

        const result = await validateLocalDataApp(dir, {
            live: true,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.valid).toBe(false);
        expect(result.projectUuid).toBeNull();
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: 'semantic_layer',
                message: expect.stringContaining(
                    'lightdash config set-project',
                ),
            }),
        );
    });

    it('gives an upgrade path instead of crashing on a missing offline snapshot', async () => {
        const dir = await makeApp({ semanticLayout: 'none' });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: 'semantic_layer',
                message: expect.stringContaining('Re-download the app'),
            }),
        );
    });

    it('validates slug and vizSchema from the manifest', async () => {
        const manifest = {
            ...defaultManifest,
            slug: '../invalid',
            vizSchema: { fields: 'not-an-array' },
        } as unknown as DataAppManifest;
        const dir = await makeApp({ manifest });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'manifest',
                    message: expect.stringContaining('Invalid slug'),
                }),
                expect.objectContaining({
                    code: 'manifest',
                    message: expect.stringContaining('Invalid vizSchema'),
                }),
            ]),
        );
    });

    it('requires a pnpm lockfile for custom dependencies', async () => {
        const dir = await makeApp({
            packageJson: JSON.stringify({
                dependencies: { 'left-pad': '1.3.0' },
            }),
        });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: 'dependencies',
                message: expect.stringContaining('pnpm-lock.yaml'),
            }),
        );
    });

    it('surfaces parser failures as warnings rather than errors', async () => {
        const dir = await makeApp({
            source: 'const broken = ;',
            semanticLayout: 'none',
        });

        const result = await validateLocalDataApp(dir, {
            live: false,
            loadLiveIndex: unusedLiveLoader,
        });

        expect(result.valid).toBe(true);
        expect(result.warnings).toContainEqual(
            expect.objectContaining({ code: 'source_parse' }),
        );
    });

    it('includes Cloud-parity build failures when --build is enabled', async () => {
        const dir = await makeApp();
        const runBuild = vi.fn().mockResolvedValue([
            {
                code: 'build' as const,
                message: 'Vite build failed: broken import',
                location: null,
            },
        ]);

        const result = await validateLocalDataApp(dir, {
            build: true,
            live: false,
            loadLiveIndex: unusedLiveLoader,
            runBuild,
        });

        expect(runBuild).toHaveBeenCalledOnce();
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: 'build',
                message: expect.stringContaining('broken import'),
            }),
        );
    });
});

describe('validateDataAppBuild', () => {
    it('builds source in an isolated vendored scaffold with bare Vite', async () => {
        const dir = await makeApp();
        await fs.mkdir(path.join(dir, 'node_modules'));
        const bundle = await readBundleFromDir(dir);
        const runCommand: RunDataAppBuildCommand = vi.fn(async (command) => {
            expect(command).toMatchObject({
                command: 'vite',
                args: ['build'],
                preferLocal: true,
                timeoutMs: 60_000,
            });
            expect(command.args).not.toContain('tsc');
            await expect(
                fs.readFile(path.join(command.cwd, 'vite.config.js'), 'utf-8'),
            ).resolves.toContain('defineConfig');
            await expect(
                fs.readFile(path.join(command.cwd, 'src', 'App.tsx'), 'utf-8'),
            ).resolves.toContain("query('orders')");
            expect(
                (
                    await fs.lstat(path.join(command.cwd, 'node_modules'))
                ).isSymbolicLink(),
            ).toBe(true);
        });

        const issues = await validateDataAppBuild({
            appDir: dir,
            bundle,
            runCommand,
        });

        expect(issues).toEqual([]);
        expect(runCommand).toHaveBeenCalledOnce();
    });

    it('restores custom dependencies with a frozen lockfile before Vite', async () => {
        const dir = await makeApp({
            packageJson: JSON.stringify({
                name: 'custom-app',
                version: '1.0.0',
                dependencies: { 'left-pad': '1.3.0' },
                devDependencies: { malicious: '1.0.0' },
                scripts: { build: 'tsc --noEmit' },
            }),
            lockfile: [
                "lockfileVersion: '9.0'",
                'packages:',
                '  left-pad@1.3.0: {}',
            ].join('\n'),
        });
        const bundle = await readBundleFromDir(dir);
        const commands: Parameters<RunDataAppBuildCommand>[0][] = [];
        const runCommand: RunDataAppBuildCommand = vi.fn(async (command) => {
            commands.push(command);
            if (command.command === 'pnpm') {
                const packageJson = JSON.parse(
                    await fs.readFile(
                        path.join(command.cwd, 'package.json'),
                        'utf-8',
                    ),
                ) as {
                    dependencies: Record<string, string>;
                    devDependencies: Record<string, string>;
                    scripts: Record<string, string>;
                };
                expect(packageJson.dependencies).toEqual({
                    'left-pad': '1.3.0',
                });
                expect(packageJson.scripts).toEqual(
                    expect.objectContaining({ build: 'vite build' }),
                );
                expect(packageJson.devDependencies).not.toHaveProperty(
                    'malicious',
                );
            }
        });

        const issues = await validateDataAppBuild({
            appDir: dir,
            bundle,
            runCommand,
        });

        expect(issues).toEqual([]);
        expect(commands).toEqual([
            expect.objectContaining({
                command: 'pnpm',
                args: ['install', '--frozen-lockfile', '--ignore-scripts'],
                env: { CI: 'true' },
                timeoutMs: 120_000,
            }),
            expect.objectContaining({
                command: 'vite',
                args: ['build'],
                preferLocal: true,
            }),
        ]);
    });

    it('reports Vite output as a build validation error', async () => {
        const dir = await makeApp();
        await fs.mkdir(path.join(dir, 'node_modules'));
        const bundle = await readBundleFromDir(dir);
        const viteError = Object.assign(new Error('Command failed'), {
            stderr: 'src/App.tsx:7: Could not resolve "missing-package"',
            stdout: 'vite v8 building for production',
        });

        const issues = await validateDataAppBuild({
            appDir: dir,
            bundle,
            runCommand: vi.fn().mockRejectedValue(viteError),
        });

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'build',
                message: expect.stringContaining(
                    'Could not resolve "missing-package"',
                ),
            }),
        ]);
    });

    it('handles non-object command failures without masking them', async () => {
        const dir = await makeApp();
        await fs.mkdir(path.join(dir, 'node_modules'));
        const bundle = await readBundleFromDir(dir);

        const issues = await validateDataAppBuild({
            appDir: dir,
            bundle,
            runCommand: vi.fn().mockRejectedValue(null),
        });

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'build',
                message: expect.stringContaining('Unknown object error'),
            }),
        ]);
    });

    it('requires local template dependencies without installing them', async () => {
        const dir = await makeApp();
        const bundle = await readBundleFromDir(dir);
        const runCommand = vi.fn();

        const issues = await validateDataAppBuild({
            appDir: dir,
            bundle,
            runCommand,
        });

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'dependencies',
                message: expect.stringContaining("Run 'npm install'"),
            }),
        ]);
        expect(runCommand).not.toHaveBeenCalled();
    });
});

describe('renderAppsValidationHuman', () => {
    const report = buildAppsValidationReport(
        [
            {
                path: '/tmp/orders-app',
                name: 'Orders app',
                projectUuid: 'project-uuid',
                valid: true,
                errors: [],
                warnings: [],
                coverage: {
                    callSites: 14,
                    fullyResolved: 11,
                    partiallyResolved: 2,
                    unresolved: 1,
                    unanalyzed: 3,
                },
                unanalyzedReferences: [
                    {
                        kind: 'query',
                        unresolved: ['explore', 'dimensions'],
                        location: {
                            path: 'src/DynamicQuery.tsx',
                            line: 8,
                            column: 17,
                        },
                    },
                    {
                        kind: 'globalFilter',
                        unresolved: ['field'],
                        location: {
                            path: 'src/ResultsTable.tsx',
                            line: 42,
                            column: 21,
                        },
                    },
                    {
                        kind: 'externalFetch',
                        unresolved: ['alias'],
                        location: {
                            path: 'src/ExternalData.tsx',
                            line: 12,
                            column: 9,
                        },
                    },
                ],
            },
        ],
        false,
        true,
    );

    it('makes partial green coverage explicit', () => {
        const output = renderAppsValidationHuman(report);

        expect(output).toContain(
            "3 of 14 data-reference call site(s) couldn't be fully analyzed",
        );
        expect(output).toContain('unresolved values were skipped');
        expect(output).toContain('Validation passed');
        expect(output).toContain('Offline snapshots may be stale');
        expect(output).toContain('running Vite production builds');
        expect(output).not.toContain('Static analysis gaps');
    });

    it('lists unresolved call sites and parts in verbose output', () => {
        const output = renderAppsValidationHuman(report, true);

        expect(output).toContain('Static analysis gaps:');
        expect(output).toContain(
            'src/DynamicQuery.tsx:8:17 — query (unresolved: explore, dimensions)',
        );
        expect(output).toContain(
            'src/ResultsTable.tsx:42:21 — global filter (unresolved: field)',
        );
    });

    it('keeps verbose-only reference details out of JSON output', () => {
        const output = renderAppsValidationJson(report);

        expect(JSON.parse(output)).not.toHaveProperty(
            'apps.0.unanalyzedReferences',
        );
    });
});
