import {
    buildDataAppExploreIndexFromModelFiles,
    type DataAppCode,
    type DataAppManifest,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeBundleToDir } from './appCodeFiles';
import {
    buildAppsValidationReport,
    renderAppsValidationHuman,
    validateLocalDataApp,
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
            loadLiveIndex,
        });

        expect(result.valid).toBe(true);
        expect(loadLiveIndex).toHaveBeenCalledWith('project-uuid');
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
});

describe('renderAppsValidationHuman', () => {
    it('makes partial green coverage explicit', () => {
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
                },
            ],
            false,
        );

        const output = renderAppsValidationHuman(report);

        expect(output).toContain(
            "3 of 14 data-reference call site(s) couldn't be fully analyzed",
        );
        expect(output).toContain('unresolved values were skipped');
        expect(output).toContain('Validation passed');
        expect(output).toContain('Offline snapshots may be stale');
    });
});
