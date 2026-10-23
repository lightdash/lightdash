import {
    FeatureFlags,
    type DbtSourceManifest,
    type ExploreError,
} from '@lightdash/common';
import { ProjectService } from './ProjectService';

const manifest: DbtSourceManifest = {
    projectName: 'provider',
    dbtVersion: '1.12.0',
    nodes: [
        {
            name: 'measure',
            package_name: 'provider',
            identifier: 'measure_v3',
            schema: 'seeded',
            database: 'warehouse',
            relation_name: 'warehouse.seeded.measure_v3',
            version: 3,
            latest_version: 3,
            access: 'protected',
            depends_on_nodes: [],
        },
    ],
    referencedProjects: [],
};
const setup = (route: 'single' | 'multi' = 'single', enabled = true) => {
    const replaceConfirmed = vi.fn(async () => undefined);
    const publish = vi.fn(async () => 'index-job');
    const service = Object.assign(Object.create(ProjectService.prototype), {
        projectModel: {
            getConnectionRoute: vi.fn(async () => route),
            getSummary: vi.fn(async () => ({ organizationUuid: 'org' })),
            hasExploreNameAllocations: vi.fn(async () => false),
            getDbtSourceIdentity: vi.fn(async () => ({
                dbtSourceUuid: 'primary',
                dbtSourceName: 'Primary',
            })),
        },
        projectDbtSourcesModel: { hasSources: vi.fn(async () => false) },
        dbtSourceRefCatalogModel: { replaceConfirmed },
        featureFlagModel: { get: vi.fn(async () => ({ enabled })) },
        saveExploresToCacheAndIndexCatalogWithRefreshCheck: publish,
        saveExploresAndIndexCatalog: vi.fn(async () => {
            await publish();
            return { indexCatalogJobUuid: 'index-job' };
        }),
        getConnectionStagedWriteChecks: vi.fn(() => []),
        multiConnectionCompiler: {
            prepareSourceDeploy: vi.fn(async () => ({})),
        },
    }) as ProjectService;
    const deploy = (extra = {}) =>
        service.saveDeployExplores({
            userUuid: 'user',
            projectUuid: 'project',
            compilationSource: 'cli_deploy',
            explores: [],
            complete: true,
            cliDeploy: { sourceUuid: null, target: null },
            dbtSourceManifest: manifest,
            ...extra,
        });
    return { service, deploy, replaceConfirmed, publish };
};

it.each(['single', 'multi'] as const)(
    'publishes a source snapshot only after the %s deploy saves explores',
    async (route) => {
        const { service, deploy, replaceConfirmed, publish } = setup(route);
        await deploy();
        expect(replaceConfirmed).toHaveBeenCalledExactlyOnceWith({
            projectUuid: 'project',
            connectionGroup: 'original',
            dbtVersion: '1.12.0',
            compileJobUuid: null,
            entries: [
                {
                    dbtSourceUuid: 'primary',
                    projectName: 'provider',
                    nodes: manifest.nodes,
                    referencedProjects: [],
                },
            ],
        });
        expect(publish.mock.invocationCallOrder[0]).toBeLessThan(
            replaceConfirmed.mock.invocationCallOrder[0],
        );
        expect(
            (
                service as never as {
                    featureFlagModel: { get: ReturnType<typeof vi.fn> };
                }
            ).featureFlagModel.get,
        ).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.CrossSourceDbtRefs,
            user: { userUuid: 'user', organizationUuid: 'org' },
        });
    },
);

it.each(['single', 'multi'] as const)(
    'retains last-good state when the %s deploy fails',
    async (route) => {
        const { deploy, publish, replaceConfirmed } = setup(route);
        publish.mockRejectedValue(new Error('publication failed'));
        await expect(deploy()).rejects.toThrow('publication failed');
        expect(replaceConfirmed).not.toHaveBeenCalled();
    },
);

it.each([
    { dbtSourceManifest: undefined },
    { explores: [{ errors: [{ message: 'compile failed' }] } as ExploreError] },
])('does not seed an absent manifest or failed compile: %j', async (extra) => {
    const { deploy, replaceConfirmed } = setup();
    await deploy(extra);
    expect(replaceConfirmed).not.toHaveBeenCalled();
});

it('seeds the complete parsed manifest after a selective deploy publishes', async () => {
    const { deploy, replaceConfirmed, publish } = setup();
    await deploy({ complete: false });
    expect(replaceConfirmed).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            entries: [expect.objectContaining({ nodes: manifest.nodes })],
        }),
    );
    expect(publish.mock.invocationCallOrder[0]).toBeLessThan(
        replaceConfirmed.mock.invocationCallOrder[0],
    );
});

it('retains the snapshot when a selective deploy fails to publish', async () => {
    const { deploy, replaceConfirmed, publish } = setup();
    publish.mockRejectedValue(new Error('publication failed'));
    await expect(deploy({ complete: false })).rejects.toThrow(
        'publication failed',
    );
    expect(replaceConfirmed).not.toHaveBeenCalled();
});

it('keeps the existing complete-deploy requirement for multiple connections', async () => {
    const { deploy, replaceConfirmed, publish } = setup('multi');
    await expect(deploy({ complete: false })).rejects.toThrow(
        'must send every explore of its dbt source',
    );
    expect(publish).not.toHaveBeenCalled();
    expect(replaceConfirmed).not.toHaveBeenCalled();
});

it('does not seed with the cross-source flag off', async () => {
    const { deploy, replaceConfirmed } = setup('single', false);
    await deploy();
    expect(replaceConfirmed).not.toHaveBeenCalled();
});

it('retains the snapshot when a server compile publishes error explores', async () => {
    const confirm = vi.fn(async () => undefined);
    const staged = Buffer.from('manifest');
    const upsertMergedManifest = vi.fn(async () => undefined);
    const service = Object.assign(Object.create(ProjectService.prototype), {
        projectModel: { upsertMergedManifest },
        sourceRefCatalogConfirmations: new WeakMap([[staged, { confirm }]]),
    }) as {
        persistMergedManifest: (
            projectUuid: string,
            manifest: Buffer,
            successfulCompile: boolean,
        ) => Promise<void>;
    };
    await service.persistMergedManifest('project', staged, false);
    expect(upsertMergedManifest).toHaveBeenCalledWith('project', staged);
    expect(confirm).not.toHaveBeenCalled();
});

it('stores an additional source under its warehouse connection', async () => {
    const { service, deploy, replaceConfirmed } = setup('multi');
    Object.assign(
        (service as unknown as { projectDbtSourcesModel: object })
            .projectDbtSourcesModel,
        {
            getSourcesWithBindings: vi.fn(async () => [
                {
                    projectDbtSourceUuid: 'extra-source',
                    warehouseConnectionUuid: 'extra-connection',
                    warehouseLocation: {},
                },
            ]),
        },
    );
    await deploy({ cliDeploy: { sourceUuid: 'extra-source', target: null } });
    expect(replaceConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({
            connectionGroup: 'extra-connection',
            entries: [
                expect.objectContaining({
                    dbtSourceUuid: 'extra-source',
                    nodes: manifest.nodes,
                }),
            ],
        }),
    );
});

it('rejects a source outside this project before publishing or seeding', async () => {
    const { service, deploy, replaceConfirmed, publish } = setup();
    Object.assign(
        (service as unknown as { projectDbtSourcesModel: object })
            .projectDbtSourcesModel,
        { getSourcesWithBindings: vi.fn(async () => []) },
    );
    await expect(
        deploy({ cliDeploy: { sourceUuid: 'foreign-source', target: null } }),
    ).rejects.toThrow('does not belong to this project');
    expect(publish).not.toHaveBeenCalled();
    expect(replaceConfirmed).not.toHaveBeenCalled();
});

it.each([false, true])(
    'routes a primary-only server compile through snapshot staging only with cross-source refs: %s',
    async (enabled) => {
        const buildMergedManifestAdapter = vi.fn(async () => ({
            adapter: 'merged',
        }));
        const primaryAdapter = { name: 'primary' };
        const service = Object.assign(Object.create(ProjectService.prototype), {
            featureFlagModel: {
                get: vi.fn(async ({ featureFlagId }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.MultiDbtSources ||
                        enabled,
                })),
            },
            projectDbtSourcesModel: { getSources: vi.fn(async () => []) },
            projectModel: {
                hasExploreNameAllocations: vi.fn(async () => false),
            },
            deleteMergedManifestBestEffort: vi.fn(async () => undefined),
            buildMergedManifestAdapter,
        }) as {
            resolveCompileAdapter: (
                args: unknown,
            ) => Promise<{ adapter: unknown }>;
        };
        const result = await service.resolveCompileAdapter({
            projectUuid: 'project',
            userUuid: 'user',
            organizationUuid: 'org',
            primary: { adapter: primaryAdapter },
            manifestFetchAdapters: [],
        });
        expect(result.adapter).toBe(enabled ? 'merged' : primaryAdapter);
        expect(buildMergedManifestAdapter).toHaveBeenCalledTimes(
            enabled ? 1 : 0,
        );
    },
);
