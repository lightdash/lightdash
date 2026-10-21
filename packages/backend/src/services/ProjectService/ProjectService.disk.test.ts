import {
    DbtProjectType,
    DbtVersionOptionLatest,
    EMPTY_WAREHOUSE_LOCATION,
    SupportedDbtVersions,
    type DbtManifest,
    type ProjectDbtSource,
} from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DBT_SOURCE_FETCH_DISK_RESERVE_BYTES } from '../../config/dbtSourceFetchConcurrency';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DbtCliClient } from '../../dbt/dbtCliClient';
import * as baseline from '../../dbt/dbtPartialParseBaseline';
import { type CompilableDbtSource } from '../../projectAdapters/CompileGroup';
import { DbtBaseProjectAdapter } from '../../projectAdapters/dbtBaseProjectAdapter';
import { DbtGitProjectAdapter } from '../../projectAdapters/dbtGitProjectAdapter';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import { measureDbtSourceDiskBytes } from '../../projectAdapters/DbtSourceDiskPool';
import { type ProjectAdapter } from '../../types';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { MultiConnectionCompiler } from '../MultiConnectionCompiler/MultiConnectionCompiler';
import { type ScopedWarehouseConnection } from '../WarehouseClientFactory/WarehouseClientFactory';
import { ProjectService } from './ProjectService';

const manifest = (name: string): DbtManifest =>
    ({
        metadata: {
            project_name: name,
            generated_at: '2026-01-01T00:00:00Z',
            adapter_type: 'postgres',
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v11.json',
        },
        nodes: {
            [`model.${name}.item_${name}`]: {
                unique_id: `model.${name}.item_${name}`,
                name: `item_${name}`,
                package_name: name,
                resource_type: 'model',
                path: `models/item_${name}.sql`,
                original_file_path: `models/item_${name}.sql`,
                database: 'synthetic',
                schema: 'public',
                alias: `item_${name}`,
                config: { materialized: 'table' },
                columns: {},
                depends_on: { nodes: [] },
            },
        },
        metrics: {},
        docs: {},
    }) as unknown as DbtManifest;

const createGitAdapter = (root: string, name: string) => {
    const directory = path.join(root, name);
    const refresh = vi.fn(async () => {
        await fs.mkdir(path.join(directory, 'models'), { recursive: true });
        await fs.writeFile(
            path.join(directory, 'dbt_project.yml'),
            `name: ${name}\n`,
        );
        await fs.writeFile(
            path.join(directory, 'models', `item_${name}.sql`),
            'select 1',
        );
    });
    const installDeps = vi.fn(async () => {
        await fs.mkdir(path.join(directory, 'dbt_packages'), {
            recursive: true,
        });
    });
    const fetch = vi.fn(async () => ({ manifest: manifest(name) }));
    const adapter = new DbtBaseProjectAdapter(
        {
            test: vi.fn(),
            getSelector: () => undefined,
            installDeps,
            getDbtManifest: fetch,
        } as unknown as DbtBaseProjectAdapter['dbtClient'],
        warehouseClientMock,
        { warehouseCatalog: {}, onWarehouseCatalogChange: vi.fn() },
        SupportedDbtVersions.V1_7,
        directory,
    );
    Object.setPrototypeOf(adapter, DbtGitProjectAdapter.prototype);
    Object.defineProperty(adapter, '_refreshRepo', { value: refresh });
    Object.assign(adapter, { localRepositoryDir: directory });
    return {
        adapter: adapter as DbtGitProjectAdapter,
        refresh,
        installDeps,
        fetch,
    };
};

const connection = {
    connectionCredentials: warehouseClientMock.credentials,
    deriveClient: () => warehouseClientMock,
} as unknown as ScopedWarehouseConnection;

const primaryInput = (adapter: ProjectAdapter) => ({
    adapter,
    connection,
    warehouseCredentials: warehouseClientMock.credentials,
    cachedWarehouse: {
        warehouseCatalog: {},
        onWarehouseCatalogChange: vi.fn(),
    },
    dbtVersionOption: DbtVersionOptionLatest.LATEST,
    dbtPartialParse: false,
    dbtTargetPolicy: { explicitCredentials: false },
});

type CompileArgs = {
    projectUuid: string;
    organizationUuid: string;
    userUuid: string;
    primary: ReturnType<typeof primaryInput>;
    manifestFetchAdapters: ProjectAdapter[];
};

type ServiceInternals = {
    buildMergedManifestAdapter: (
        args: CompileArgs & { sources: ProjectDbtSource[] },
    ) => Promise<{ adapter: ProjectAdapter }>;
    compileMultiConnectionProject: (
        args: CompileArgs & { trackingParams: undefined },
    ) => ReturnType<MultiConnectionCompiler['compile']>;
    logDbtSourceDiskUsage: (
        projectUuid: string,
        sourceUuid: string | null,
        adapter: ProjectAdapter,
    ) => Promise<void>;
};

const source = (index: number): CompilableDbtSource => ({
    projectDbtSourceUuid: `leaf_${index}`,
    projectUuid: 'synthetic_project',
    name: `leaf_${index}`,
    isPrimary: false,
    precedence: index + 1,
    dbtConnection: { type: DbtProjectType.NONE },
    warehouseLocation: EMPTY_WAREHOUSE_LOCATION,
    warehouseConnectionUuid: null,
    hasCredentialError: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
});

const createService = () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const projectModel = {
        getDbtSourceIdentity: vi.fn(async () => ({
            dbtSourceUuid: 'primary_a',
            dbtSourceName: 'primary_a',
        })),
    };
    const catalogModel = {
        get: vi.fn(async () => []),
        upsertProvisional: vi.fn(async () => 'synthetic_digest'),
    };
    const service = Object.assign(Object.create(ProjectService.prototype), {
        logger,
        projectModel,
        dbtSourceRefCatalogModel: catalogModel,
        lightdashConfig: {
            ...lightdashConfigMock,
            dbt: {
                ...lightdashConfigMock.dbt,
                sourceFetchConcurrency: 1,
                sourceFetchDiskBudgetBytes:
                    DBT_SOURCE_FETCH_DISK_RESERVE_BYTES + 4 * 1024 ** 2,
                sourceFetchDiskPerSourceBytes: 1024 ** 2,
            },
        },
        featureFlagModel: { get: vi.fn(async () => ({ enabled: true })) },
        stageMergedManifest: vi.fn(async () => undefined),
    }) as ServiceInternals;
    return { service, logger, projectModel, catalogModel };
};

describe('ProjectService source disk reuse', () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'synthetic-source-disk-'),
        );
        vi.spyOn(baseline, 'getDbtPartialParseBaselineSize').mockReturnValue(0);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(root, { recursive: true, force: true });
    });

    it.each([
        { mode: 'merged', sourceCount: 4 },
        { mode: 'multi-connection', sourceCount: 4 },
        { mode: 'merged', sourceCount: 6 },
        { mode: 'multi-connection', sourceCount: 6 },
    ])(
        'reuses resident scans with $sourceCount sources in the $mode path',
        async ({ mode, sourceCount }) => {
            const { service, logger, projectModel, catalogModel } =
                createService();
            const primary = createGitAdapter(root, 'primary_a');
            const capacity = 4;
            const initialScanEvictions = sourceCount - capacity;
            const leaves = Array.from({ length: sourceCount }, (_, index) =>
                createGitAdapter(root, `leaf_${index}`),
            );
            const sources = leaves.map((_, index) => source(index));
            let nextAdapter = 0;
            const buildSourceAdapter = vi.fn(async () => {
                const leaf = leaves[nextAdapter];
                nextAdapter += 1;
                return leaf.adapter;
            });
            Object.assign(service, { buildSourceAdapter });
            const args: CompileArgs = {
                projectUuid: 'synthetic_project',
                organizationUuid: 'synthetic_org',
                userUuid: 'synthetic_user',
                primary: primaryInput(primary.adapter),
                manifestFetchAdapters: [],
            };
            if (mode === 'merged') {
                await service.buildMergedManifestAdapter({ ...args, sources });
            } else {
                const compiler = new MultiConnectionCompiler({
                    projectModel,
                    dbtSourceRefCatalogModel: catalogModel,
                } as unknown as ConstructorParameters<
                    typeof MultiConnectionCompiler
                >[0]);
                vi.spyOn(compiler, 'planGroups').mockResolvedValue([
                    {
                        warehouseConnectionUuid: null,
                        connectionName: 'synthetic_connection',
                        listedDatabases: {
                            listAllDatabases: false,
                            additionalDatabases: [],
                        },
                        sources,
                    },
                ]);
                vi.spyOn(
                    DbtManifestProjectAdapter.prototype,
                    'prepareExploreStream',
                ).mockImplementation(async () =>
                    (async function* emptyExplores() {
                        yield* [];
                    })(),
                );
                const compile = vi.spyOn(compiler, 'compile');
                Object.assign(service, { multiConnectionCompiler: compiler });
                await service.compileMultiConnectionProject({
                    ...args,
                    trackingParams: undefined,
                });
                expect(compile.mock.calls[0][0].diskStats).toEqual({
                    diskEvictions: expect.any(Number),
                    diskRecreations: initialScanEvictions,
                });
            }
            expect(buildSourceAdapter).toHaveBeenCalledTimes(sourceCount);
            expect(primary.refresh).toHaveBeenCalledOnce();
            expect(primary.installDeps).toHaveBeenCalledOnce();
            expect(primary.fetch).toHaveBeenCalledOnce();
            leaves.forEach((entry, index) => {
                const preparations = index < initialScanEvictions ? 2 : 1;
                expect(entry.refresh).toHaveBeenCalledTimes(preparations);
                expect(entry.installDeps).toHaveBeenCalledTimes(preparations);
                expect(entry.fetch).toHaveBeenCalledOnce();
            });
            expect(
                leaves.reduce(
                    (sum, entry) => sum + entry.refresh.mock.calls.length,
                    0,
                ),
            ).toBeLessThanOrEqual(sourceCount + initialScanEvictions);
            expect(await fs.readdir(root)).toEqual(['primary_a']);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('diskCapacity=4'),
                expect.objectContaining({ diskCapacity: 4, concurrency: 1 }),
            );
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('sourceDiskUsage'),
                expect.objectContaining({
                    sourceUuid: 'leaf_0',
                    checkoutBytes: expect.any(Number),
                    targetBytes: 0,
                    diskBytes: expect.any(Number),
                }),
            );
        },
    );

    it('measures a separate target without following symlinks or creating a target', async () => {
        const { service, logger } = createService();
        const entry = createGitAdapter(root, 'leaf_a');
        await entry.adapter.prepareDbtSource();
        const targetDirectory = path.join(root, 'target_a');
        await fs.mkdir(targetDirectory);
        await fs.writeFile(
            path.join(targetDirectory, 'manifest.json'),
            'synthetic target',
        );
        await fs.symlink(
            targetDirectory,
            path.join(entry.adapter.localRepositoryDir, 'linked_target'),
        );
        const client = Object.create(DbtCliClient.prototype) as DbtCliClient;
        client.targetDirectory = targetDirectory;
        entry.adapter.dbtClient = client;
        const checkoutBytes = await measureDbtSourceDiskBytes(
            entry.adapter.localRepositoryDir,
        );
        const targetBytes = await measureDbtSourceDiskBytes(targetDirectory);
        await service.logDbtSourceDiskUsage(
            'synthetic_project',
            'leaf_a',
            entry.adapter,
        );
        expect(checkoutBytes).not.toBeNull();
        expect(targetBytes).toBeGreaterThan(0);
        expect(logger.info).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({
                checkoutBytes,
                targetBytes,
                diskBytes: checkoutBytes! + targetBytes!,
            }),
        );
        client.targetDirectory = undefined;
        await service.logDbtSourceDiskUsage(
            'synthetic_project',
            'leaf_a',
            entry.adapter,
        );
        expect(client.targetDirectory).toBeUndefined();
        expect(logger.info).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({ targetBytes: 0 }),
        );
    });

    it('keeps logging failures out of the compile path', async () => {
        const { service, logger } = createService();
        logger.info.mockImplementation(() => {
            throw new Error('synthetic logger failure');
        });
        await expect(
            service.logDbtSourceDiskUsage(
                'synthetic_project',
                'leaf_a',
                createGitAdapter(root, 'leaf_a').adapter,
            ),
        ).resolves.toBeUndefined();
    });
});
