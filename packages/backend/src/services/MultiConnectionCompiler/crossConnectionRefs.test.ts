import {
    DbtError,
    DbtProjectType,
    DimensionType,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DbtRawModelNode,
    type WarehouseClient,
} from '@lightdash/common';
import { type ExploreNaming } from '../../models/ProjectModel/exploreNameAllocation';
import {
    type BoundExplore,
    type MultiConnectionCarry,
    type StagedExploreWriteCheck,
} from '../../models/ProjectModel/ProjectModel';
import {
    type CompilableDbtSource,
    type CompileGroupPlan,
} from '../../projectAdapters/CompileGroup';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import {
    type ScopedWarehouseConnection,
    type WarehouseClientFactory,
} from '../WarehouseClientFactory/WarehouseClientFactory';
import {
    MultiConnectionCompiler,
    type FetchSourceManifest,
} from './MultiConnectionCompiler';

const postgres: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'postgres',
    port: 5432,
    dbname: 'warehouse',
    schema: 'public',
    user: 'user',
    password: 'password',
};
const trino: CreateWarehouseCredentials = {
    ...postgres,
    type: WarehouseTypes.TRINO,
    port: 8080,
    http_scheme: 'http',
};
const model = (
    project: string,
    name: string,
): DbtRawModelNode & DbtManifest['nodes'][string] => ({
    unique_id: `model.${project}.${name}`,
    resource_type: 'model',
    raw_code: 'select 1 as id',
    compiled: true,
    config: { materialized: 'table', snowflake_warehouse: '' },
    name,
    package_name: project,
    path: `${name}.sql`,
    original_file_path: `models/${name}.sql`,
    alias: name,
    relation_name: `"warehouse"."public"."${name}"`,
    schema: 'public',
    database: 'warehouse',
    columns: { id: { name: 'id', description: '', meta: {} } },
    meta: {},
    fqn: [project, name],
    checksum: { name: 'sha256', checksum: 'test' },
    description: '',
    tags: [],
});
const manifest = (
    project: string,
    name: string,
    adapter: SupportedDbtAdapter,
): DbtManifest => {
    const node = model(project, name);
    return {
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v11.json',
            generated_at: '2026-10-17T00:00:00Z',
            adapter_type: adapter,
        },
        nodes: { [node.unique_id]: node },
        metrics: {},
        docs: {},
    };
};
const source = (name: string, precedence: number): CompilableDbtSource => ({
    name,
    precedence,
    projectDbtSourceUuid: `${name}-uuid`,
    projectUuid: 'project',
    isPrimary: false,
    createdAt: new Date('2026-10-17'),
    updatedAt: new Date('2026-10-17'),
    warehouseConnectionUuid: null,
    warehouseLocation: { database: null, schema: null },
    hasCredentialError: false,
    dbtConnection: { type: DbtProjectType.NONE },
});
const collect = async <T>(stream: AsyncIterable<T>): Promise<T[]> => {
    const items: T[] = [];
    for await (const item of stream) items.push(item);
    return items;
};
const missing = (project = 'shared_dimensions') =>
    new DbtError(
        `depends on a node named 'calendar' in package or project '${project}' which was not found`,
    );

const harness = ({
    mixed = true,
    extraCredentials = trino,
    providerGroup = 'original',
    referencedProject = 'shared_dimensions',
}: {
    mixed?: boolean;
    extraCredentials?: CreateWarehouseCredentials;
    providerGroup?: 'original' | 'extra' | 'later';
    referencedProject?: string;
} = {}) => {
    const shared = source('shared', 1);
    const analytics = source('analytics', 2);
    const plans: CompileGroupPlan[] = [
        {
            warehouseConnectionUuid: null,
            connectionName: 'Postgres (jaffle)',
            listedDatabases: {
                listAllDatabases: false,
                additionalDatabases: [],
            },
            sources: providerGroup === 'original' ? [shared] : [],
        },
        {
            warehouseConnectionUuid: 'extra',
            connectionName:
                extraCredentials.type === WarehouseTypes.TRINO
                    ? 'Trino (tpch)'
                    : 'Postgres (extra)',
            listedDatabases: {
                listAllDatabases: false,
                additionalDatabases: [],
            },
            sources:
                providerGroup === 'extra' ? [analytics, shared] : [analytics],
        },
    ];
    if (providerGroup === 'later') {
        plans.push({
            ...plans[0],
            warehouseConnectionUuid: 'later',
            sources: [shared],
        });
    }
    const makeConnection = (
        credentials: CreateWarehouseCredentials,
    ): ScopedWarehouseConnection => {
        const adapter =
            credentials.type === WarehouseTypes.TRINO
                ? SupportedDbtAdapter.TRINO
                : SupportedDbtAdapter.POSTGRES;
        const client: WarehouseClient = {
            ...warehouseClientMock,
            credentials,
            getAdapterType: () => adapter,
            getCatalog: vi.fn(async () => ({
                warehouse: {
                    public: {
                        primary_orders: { id: DimensionType.NUMBER },
                        calendar: { id: DimensionType.NUMBER },
                        orders: { id: DimensionType.NUMBER },
                    },
                },
            })),
        };
        return {
            warehouseClient: client,
            connectionCredentials: credentials,
            warehouseCredentials: credentials,
            deriveClient: () => client,
            aiPlan: null,
            warehouseConnectionUuid: null,
            connectionRoute: null,
            credentialKind: WarehouseCredentialKind.COMPILE,
            tunnelConnectMs: null,
        };
    };
    const withWarehouseClient = vi.fn(
        async (
            request: Parameters<
                WarehouseClientFactory['withWarehouseClient']
            >[0],
            _context: Parameters<
                WarehouseClientFactory['withWarehouseClient']
            >[1],
            callback: Parameters<
                WarehouseClientFactory['withWarehouseClient']
            >[2],
        ) => {
            if (request.kind !== 'compile')
                throw new Error('Expected compile request');
            return callback(makeConnection(request.credentials));
        },
    );
    const saved: BoundExplore[] = [];
    const saveMultiConnectionExplores = vi.fn(
        async (
            _projectUuid: string,
            explores: AsyncIterable<BoundExplore>,
            _carry: MultiConnectionCarry,
            _beforeWrite?: StagedExploreWriteCheck,
            _naming?: ExploreNaming,
        ) => {
            saved.push(...(await collect(explores)));
            return {
                cachedExploreUuids: saved.map(({ explore }) => explore.name),
            };
        },
    );
    const projectModel = {
        countCachedExploresForDbtSource: vi.fn(async () => 2),
        getDbtSourceIdentity: vi.fn(async () => ({
            dbtSourceUuid: 'primary-uuid',
            dbtSourceName: 'primary',
        })),
        saveMultiConnectionExplores,
        upsertMergedManifest: vi.fn(),
        deleteMergedManifest: vi.fn(),
    };
    const saveCompileArtifacts = vi.fn();
    const compiler = new MultiConnectionCompiler({
        projectModel,
        warehouseClientFactory: {
            withWarehouseClient,
        },
        projectDbtSourcesModel: {},
        warehouseConnectionCompileModel: {
            getCatalogCache: vi.fn(async () => undefined),
            saveCompileArtifacts,
        },
    } as unknown as ConstructorParameters<typeof MultiConnectionCompiler>[0]);
    vi.spyOn(compiler, 'planGroups').mockResolvedValue(plans);
    const timings = { gitRefreshMs: null, depsMs: null, manifestMs: 0 };
    const fetchSourceManifest = vi.fn<FetchSourceManifest>(
        async (dbtSource, credentials) => {
            const adapter =
                credentials.type === WarehouseTypes.TRINO
                    ? SupportedDbtAdapter.TRINO
                    : SupportedDbtAdapter.POSTGRES;
            if (dbtSource.name === 'shared') {
                return {
                    manifest: manifest(
                        'shared_dimensions',
                        'calendar',
                        adapter,
                    ),
                    timings,
                };
            }
            throw missing(referencedProject);
        },
    );
    const input: Parameters<typeof compiler.compile>[0] = {
        projectUuid: 'project',
        context: connectionContextFromUser(
            { userUuid: 'user' },
            { organizationUuid: 'org', queryContext: null, purpose: 'compile' },
        ),
        primary: {
            fetchManifest: async () => ({
                manifest: manifest(
                    'primary_project',
                    'primary_orders',
                    SupportedDbtAdapter.POSTGRES,
                ),
                timings,
            }),
            connection: makeConnection(postgres),
            warehouseCredentials: postgres,
            cachedWarehouse: {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: vi.fn(),
            },
            dbtProjectDir: undefined,
        },
        dbtVersion: SupportedDbtVersions.V1_8,
        mixedWarehouseConnectionsEnabled: mixed,
        concurrency: 2,
        fetchSourceManifest,
        loadExtraCredentials: vi.fn(async (uuid) =>
            uuid === 'later' ? postgres : extraCredentials,
        ),
    };
    return {
        compiler,
        input,
        plans,
        fetchSourceManifest,
        saveMultiConnectionExplores,
        saved,
        withWarehouseClient,
        projectModel,
        saveCompileArtifacts,
    };
};

describe('dbt source failures', () => {
    afterEach(() => vi.restoreAllMocks());

    it('carries a source with an unresolved dbt ref', async () => {
        const h = harness();
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toContainEqual(
            expect.stringContaining('Source "analytics" failed'),
        );
        expect(compilation.carry).toMatchObject({
            dbtSourceUuids: ['analytics-uuid'],
        });
    });
});

describe('multi-connection source disk lifecycle', () => {
    afterEach(() => vi.restoreAllMocks());
    it('releases each source immediately after its manifest fetch', async () => {
        const h = harness({ providerGroup: 'extra' });
        const events: string[] = [];
        h.input.concurrency = 1;
        h.fetchSourceManifest.mockImplementation(async (dbtSource) => {
            events.push(`fetch ${dbtSource.name}`);
            return {
                manifest: manifest(
                    dbtSource.name,
                    dbtSource.name,
                    SupportedDbtAdapter.POSTGRES,
                ),
                timings: {
                    gitRefreshMs: null,
                    depsMs: null,
                    manifestMs: 1,
                },
            };
        });
        const primaryRelease = vi.fn(async () => {
            events.push('primary release');
        });
        h.input.primary.releaseDisk = primaryRelease;
        h.input.releaseSourceDisk = vi.fn(async (dbtSource) => {
            events.push(`release ${dbtSource.name}`);
        });
        await h.compiler.compile(h.input);
        expect(events).toEqual([
            'primary release',
            'fetch analytics',
            'release analytics',
            'fetch shared',
            'release shared',
        ]);
        expect(primaryRelease).toHaveBeenCalledOnce();
    });
});
