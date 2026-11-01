import {
    DbtError,
    DbtProjectType,
    DimensionType,
    getDeferredExploreName,
    InlineErrorType,
    isExploreError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtExploreIdentity,
    type DbtManifest,
    type DbtRawModelNode,
    type Explore,
    type ExploreError,
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
    access: 'public',
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
            project_name: project,
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
}: {
    mixed?: boolean;
    extraCredentials?: CreateWarehouseCredentials;
    providerGroup?: 'original' | 'extra' | 'later';
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
            throw missing();
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

const primaryOrdersIdentity: DbtExploreIdentity = {
    sourceUuid: 'primary-uuid',
    sourceName: 'primary',
    packageName: 'primary_project',
    uniqueId: 'model.primary_project.primary_orders',
    modelName: 'primary_orders',
};
const calendarIdentity: DbtExploreIdentity = {
    sourceUuid: 'shared-uuid',
    sourceName: 'shared',
    packageName: 'shared_dimensions',
    uniqueId: 'model.shared_dimensions.calendar',
    modelName: 'calendar',
};
const expectExploreIdentities = (
    explores: (Explore | ExploreError)[],
    identities: DbtExploreIdentity[],
) => {
    expect(explores).toHaveLength(identities.length);
    expect(explores.filter(isExploreError)).toEqual([]);
    expect(
        Object.fromEntries(
            explores.map((explore) => [explore.name, explore.dbtModelIdentity]),
        ),
    ).toEqual(
        Object.fromEntries(
            identities.map((identity) => [
                getDeferredExploreName({
                    unique_id: identity.uniqueId,
                    lightdash_source_uuid: identity.sourceUuid ?? undefined,
                }),
                identity,
            ]),
        ),
    );
};

describe('independent source compilation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps a failed source and publishes healthy original and extra sources', async () => {
        const h = harness();
        h.plans[1].sources.push(source('healthy', 3));
        h.fetchSourceManifest.mockImplementation(
            async (dbtSource, credentials) => {
                if (dbtSource.name === 'analytics') throw missing();
                return {
                    manifest: manifest(
                        dbtSource.name === 'shared'
                            ? 'shared_dimensions'
                            : 'healthy',
                        dbtSource.name === 'shared' ? 'calendar' : 'orders',
                        credentials.type === WarehouseTypes.TRINO
                            ? SupportedDbtAdapter.TRINO
                            : SupportedDbtAdapter.POSTGRES,
                    ),
                    timings: {
                        gitRefreshMs: null,
                        depsMs: null,
                        manifestMs: 0,
                    },
                };
            },
        );
        const compilation = await h.compiler.compile(h.input);
        const explores = await collect(compilation.exploreStream);
        expectExploreIdentities(explores, [
            primaryOrdersIdentity,
            calendarIdentity,
            {
                sourceUuid: 'healthy-uuid',
                sourceName: null,
                packageName: 'healthy',
                uniqueId: 'model.healthy.orders',
                modelName: 'orders',
            },
        ]);
        expect(compilation.carry).toEqual({
            kind: 'connections',
            warehouseConnectionUuids: [],
            dbtSourceUuids: ['analytics-uuid'],
        });
        expect(compilation.warnings).toEqual([
            'Source "analytics" failed: could not parse, list models, or validate the manifest; kept its 2 explores from the last successful refresh.',
        ]);
        expect(compilation.bindingOf(explores[2].name)).toBe('extra');
        expect(compilation.bindingOf(explores[0].name)).toBeNull();
        expect(h.fetchSourceManifest).toHaveBeenCalledTimes(3);
        await compilation.persistArtifacts();
        expect(h.projectModel.upsertMergedManifest).toHaveBeenCalledOnce();
        expect(h.saveCompileArtifacts).toHaveBeenCalledOnce();
    });

    it('keeps the whole failed connection and persists only successful artifacts', async () => {
        const h = harness();
        h.input.loadExtraCredentials = vi
            .fn()
            .mockRejectedValue(new Error('credentials unavailable'));
        const compilation = await h.compiler.compile(h.input);
        expectExploreIdentities(await collect(compilation.exploreStream), [
            primaryOrdersIdentity,
            calendarIdentity,
        ]);
        expect(compilation.carry).toEqual({
            kind: 'connections',
            warehouseConnectionUuids: ['extra'],
        });
        expect(compilation.warnings).toEqual([
            'Connection "Trino (tpch)" failed to compile, so its previous explores are kept: credentials unavailable',
        ]);
        await compilation.persistArtifacts();
        expect(h.projectModel.upsertMergedManifest).toHaveBeenCalledOnce();
        expect(h.saveCompileArtifacts).not.toHaveBeenCalled();
    });

    it('releases each source before fetching the next source at concurrency one', async () => {
        const h = harness({ providerGroup: 'extra' });
        h.input.concurrency = 1;
        const events: string[] = [];
        h.input.primary.releaseDisk = async () => {
            events.push('release primary');
        };
        h.input.releaseSourceDisk = async (dbtSource) => {
            events.push(`release ${dbtSource.name}`);
        };
        h.fetchSourceManifest.mockImplementation(async (dbtSource) => {
            events.push(`fetch ${dbtSource.name}`);
            return {
                manifest: manifest(
                    dbtSource.name,
                    dbtSource.name,
                    SupportedDbtAdapter.POSTGRES,
                ),
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            };
        });
        await h.compiler.compile(h.input);
        expect(events).toEqual([
            'release primary',
            'fetch analytics',
            'release analytics',
            'fetch shared',
            'release shared',
        ]);
    });

    it('rejects colliding manifests instead of carrying the extra connection', async () => {
        const h = harness({ providerGroup: 'extra' });
        const releaseAllSourceDisk = vi.fn(async () => {});
        h.input.releaseAllSourceDisk = releaseAllSourceDisk;
        h.fetchSourceManifest.mockResolvedValue({
            manifest: manifest(
                'duplicate',
                'orders',
                SupportedDbtAdapter.TRINO,
            ),
            timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
        });
        await expect(h.compiler.compile(h.input)).rejects.toThrow(
            'same dbt project name',
        );
        expect(releaseAllSourceDisk).toHaveBeenCalledOnce();
        expect(h.saveCompileArtifacts).not.toHaveBeenCalled();
    });
});

describe('joins after independent source compilation', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['meta', 'config'] as const)(
        'keeps same-source joins in base, inherited and explicit explores from %s',
        async (location) => {
            const h = harness();
            const orders = model('analytics', 'orders');
            const calendar = model('analytics', 'calendar');
            const joins = [
                {
                    join: 'calendar',
                    alias: 'order_calendar',
                    sql_on: '${orders.id} = ${order_calendar.id}',
                },
            ];
            const metadata = {
                joins,
                explores: {
                    inherited_orders: {},
                    explicit_orders: { joins },
                    unjoined_orders: { joins: [] },
                },
            };
            if (location === 'meta') orders.meta = metadata;
            else
                orders.config = {
                    materialized: 'table',
                    snowflake_warehouse: '',
                    meta: metadata,
                };
            h.fetchSourceManifest.mockImplementation(async (dbtSource) => ({
                manifest:
                    dbtSource.name === 'shared'
                        ? manifest(
                              'shared_dimensions',
                              'calendar',
                              SupportedDbtAdapter.POSTGRES,
                          )
                        : {
                              ...manifest(
                                  'analytics',
                                  'orders',
                                  SupportedDbtAdapter.TRINO,
                              ),
                              nodes: {
                                  [orders.unique_id]: orders,
                                  [calendar.unique_id]: calendar,
                              },
                          },
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            }));
            const compilation = await h.compiler.compile(h.input);
            const explores = await collect(compilation.exploreStream);
            expect(explores.filter(isExploreError)).toEqual([]);
            const orderExplores = explores.filter(
                (explore) =>
                    explore.dbtModelIdentity?.uniqueId === orders.unique_id,
            ) as Explore[];
            expect(orderExplores).toHaveLength(4);
            for (const explore of orderExplores) {
                expect(compilation.bindingOf(explore.name)).toBe('extra');
                expect(explore.warnings ?? []).toEqual([]);
                if (explore.name === 'unjoined_orders') {
                    expect(explore.joinedTables).toEqual([]);
                    expect(explore.tables.order_calendar).toBeUndefined();
                } else {
                    expect(explore.joinedTables).toHaveLength(1);
                    expect(explore.tables.order_calendar).toMatchObject({
                        dbtSourceUuid: 'analytics-uuid',
                        dbtPackageName: 'analytics',
                        dbtModelUniqueId: calendar.unique_id,
                    });
                }
            }
            expect(h.fetchSourceManifest).toHaveBeenCalledTimes(2);
            expect(compilation.carry).toEqual({
                kind: 'connections',
                warehouseConnectionUuids: [],
            });
        },
    );

    it.each([true, false])(
        'skips a bare join to another connection with mixed connections enabled=%s',
        async (mixed) => {
            const h = harness({ mixed });
            const orders = model('analytics', 'orders');
            const joins = [
                { join: 'calendar', sql_on: '${orders.id} = ${calendar.id}' },
            ];
            orders.meta = {
                joins,
                explores: { inherited_orders: {}, explicit_orders: { joins } },
            };
            h.fetchSourceManifest.mockImplementation(async (dbtSource) => ({
                manifest:
                    dbtSource.name === 'shared'
                        ? manifest(
                              'shared_dimensions',
                              'calendar',
                              SupportedDbtAdapter.POSTGRES,
                          )
                        : {
                              ...manifest(
                                  'analytics',
                                  'orders',
                                  SupportedDbtAdapter.TRINO,
                              ),
                              nodes: { [orders.unique_id]: orders },
                          },
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            }));
            const compilation = await h.compiler.compile(h.input);
            const explores = await collect(compilation.exploreStream);
            expect(explores.filter(isExploreError)).toEqual([]);
            const orderExplores = explores.filter(
                (explore) =>
                    explore.dbtModelIdentity?.uniqueId === orders.unique_id,
            ) as Explore[];
            expect(orderExplores).toHaveLength(3);
            for (const explore of orderExplores) {
                expect(explore.joinedTables).toEqual([]);
                expect(explore.tables.calendar).toBeUndefined();
                expect(explore.warnings).toEqual([
                    expect.objectContaining({
                        type: InlineErrorType.MISSING_TABLE,
                        message: expect.stringContaining(
                            mixed
                                ? 'Joins across connections are not supported'
                                : 'model is not available',
                        ),
                    }),
                ]);
            }
            expect(
                explores.some(
                    (explore) =>
                        explore.dbtModelIdentity?.uniqueId ===
                        calendarIdentity.uniqueId,
                ),
            ).toBe(true);
            expect(h.fetchSourceManifest).toHaveBeenCalledTimes(2);
        },
    );

    it.each(['disabled', 'uncompiled', 'selector-excluded', 'absent'] as const)(
        'resolves bare and qualified additional-explore joins with an own-source target that is %s',
        async (state) => {
            const h = harness();
            h.plans.splice(1);
            const orders = model('primary_project', 'primary_orders');
            const calendar = model('primary_project', 'calendar');
            const joins = [
                {
                    join: 'calendar',
                    sql_on: '${primary_orders.id} = ${calendar.id}',
                },
            ];
            orders.meta = {
                joins,
                explores: {
                    inherited_orders: {},
                    explicit_orders: { joins },
                    qualified_orders: {
                        joins: [
                            {
                                ...joins[0],
                                join: 'shared__calendar',
                                alias: 'calendar',
                            },
                        ],
                    },
                },
            };
            const primaryManifest = {
                ...manifest(
                    'primary_project',
                    'primary_orders',
                    SupportedDbtAdapter.POSTGRES,
                ),
                nodes: {
                    [orders.unique_id]: orders,
                    ...(state === 'disabled' || state === 'absent'
                        ? {}
                        : {
                              [calendar.unique_id]: {
                                  ...calendar,
                                  compiled: state !== 'uncompiled',
                              },
                          }),
                },
                disabled:
                    state === 'disabled'
                        ? {
                              [calendar.unique_id]: [
                                  {
                                      ...calendar,
                                      config: {
                                          ...calendar.config,
                                          enabled: false,
                                      },
                                  },
                              ],
                          }
                        : {},
            };
            h.input.primary.fetchManifest = async () => ({
                manifest: primaryManifest,
                ...(state === 'selector-excluded'
                    ? { selectedModelIds: [orders.unique_id] }
                    : {}),
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            });
            const compilation = await h.compiler.compile(h.input);
            const explores = await collect(compilation.exploreStream);
            expect(explores.filter(isExploreError)).toEqual([]);
            const orderExplores = explores.filter(
                (explore) =>
                    explore.dbtModelIdentity?.uniqueId === orders.unique_id,
            ) as Explore[];
            expect(orderExplores).toHaveLength(4);
            for (const explore of orderExplores) {
                if (explore.name === 'qualified_orders' || state === 'absent') {
                    expect(explore.joinedTables).toHaveLength(1);
                    expect(explore.tables.calendar).toMatchObject({
                        dbtSourceUuid: 'shared-uuid',
                        dbtModelUniqueId: calendarIdentity.uniqueId,
                    });
                    expect(explore.warnings ?? []).toEqual([]);
                } else {
                    expect(explore.joinedTables).toEqual([]);
                    expect(explore.tables.calendar).toBeUndefined();
                    expect(explore.warnings).toEqual([
                        expect.objectContaining({
                            type: InlineErrorType.MISSING_TABLE,
                            message: expect.stringContaining(
                                'own-source model is disabled or excluded',
                            ),
                        }),
                    ]);
                }
            }
        },
    );

    it.each([1, 2])(
        'resolves a qualified additional-explore join to declared latest version %s',
        async (latestVersion) => {
            const h = harness();
            h.plans.splice(1);
            const orders = model('primary_project', 'primary_orders');
            orders.meta = {
                explores: {
                    versioned_orders: {
                        joins: [
                            {
                                join: 'shared__calendar',
                                alias: 'calendar',
                                sql_on: '${primary_orders.id} = ${calendar.id}',
                            },
                        ],
                    },
                },
            };
            h.input.primary.fetchManifest = async () => ({
                manifest: {
                    ...manifest(
                        'primary_project',
                        'primary_orders',
                        SupportedDbtAdapter.POSTGRES,
                    ),
                    nodes: { [orders.unique_id]: orders },
                },
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            });
            const calendars = [2, 1].map((version) => ({
                ...model('shared_dimensions', 'calendar'),
                unique_id: `model.shared_dimensions.calendar.v${version}`,
                version,
                latest_version: latestVersion,
                relation_name: `"warehouse"."public"."calendar_v${version}"`,
            }));
            h.fetchSourceManifest.mockResolvedValue({
                manifest: {
                    ...manifest(
                        'shared_dimensions',
                        'calendar',
                        SupportedDbtAdapter.POSTGRES,
                    ),
                    nodes: Object.fromEntries(
                        calendars.map((calendar) => [
                            calendar.unique_id,
                            calendar,
                        ]),
                    ),
                },
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            });
            const compilation = await h.compiler.compile(h.input);
            const explores = await collect(compilation.exploreStream);
            expect(explores.filter(isExploreError)).toEqual([]);
            const explore = explores.find(
                (item) => item.name === 'versioned_orders',
            ) as Explore;
            expect(explore.joinedTables).toHaveLength(1);
            expect(explore.warnings ?? []).toEqual([]);
            expect(explore.tables.calendar).toMatchObject({
                dbtSourceUuid: 'shared-uuid',
                dbtModelUniqueId: `model.shared_dimensions.calendar.v${latestVersion}`,
                sqlTable: `"warehouse"."public"."calendar_v${latestVersion}"`,
            });
        },
    );
});

describe('external model stubs after independent source compilation', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ['analytics', 'shared'],
        ['shared', 'analytics'],
    ])(
        'keeps the real source model when %s compiles before %s',
        async (first, second) => {
            const h = harness();
            h.plans.splice(1);
            h.plans[0].sources = [source(first, 1), source(second, 2)];
            const calendar = model('shared_dimensions', 'calendar');
            const stub = {
                ...calendar,
                path: '',
                original_file_path: '',
                relation_name: 'stale_calendar',
            };
            const orders = model('analytics', 'orders');
            orders.meta = {
                joins: [
                    {
                        join: 'calendar',
                        sql_on: '${orders.id} = ${calendar.id}',
                    },
                ],
            };
            h.fetchSourceManifest.mockImplementation(async (dbtSource) => ({
                manifest:
                    dbtSource.name === 'shared'
                        ? manifest(
                              'shared_dimensions',
                              'calendar',
                              SupportedDbtAdapter.POSTGRES,
                          )
                        : {
                              ...manifest(
                                  'analytics',
                                  'orders',
                                  SupportedDbtAdapter.POSTGRES,
                              ),
                              nodes: {
                                  [orders.unique_id]: orders,
                                  [stub.unique_id]: stub,
                              },
                          },
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            }));
            const compilation = await h.compiler.compile(h.input);
            const explores = await collect(compilation.exploreStream);
            expect(explores.filter(isExploreError)).toEqual([]);
            const calendars = explores.filter(
                (explore) =>
                    explore.dbtModelIdentity?.uniqueId === calendar.unique_id,
            );
            expect(calendars).toHaveLength(1);
            expect(calendars[0].dbtModelIdentity?.sourceUuid).toBe(
                'shared-uuid',
            );
            const ordersExplore = explores.find(
                (explore) =>
                    explore.dbtModelIdentity?.uniqueId === orders.unique_id,
            ) as Explore;
            expect(ordersExplore.joinedTables).toHaveLength(1);
            expect(ordersExplore.tables.calendar).toMatchObject({
                dbtSourceUuid: 'shared-uuid',
                sqlTable: calendar.relation_name,
            });
            expect(compilation.warnings).toEqual([]);
        },
    );

    it('does not let selected external stubs select an excluded real model or create orphan explores', async () => {
        const h = harness();
        h.plans.splice(1);
        h.plans[0].sources.push(source('analytics', 2));
        const calendar = model('shared_dimensions', 'calendar');
        const stub = { ...calendar, path: '', original_file_path: '' };
        const orphan = {
            ...model('missing_source', 'orphan'),
            path: '',
            original_file_path: '',
        };
        const orders = model('analytics', 'orders');
        orders.meta = {
            joins: [
                { join: 'calendar', sql_on: '${orders.id} = ${calendar.id}' },
                { join: 'orphan', sql_on: '${orders.id} = ${orphan.id}' },
            ],
        };
        h.fetchSourceManifest.mockImplementation(async (dbtSource) => ({
            manifest:
                dbtSource.name === 'shared'
                    ? manifest(
                          'shared_dimensions',
                          'calendar',
                          SupportedDbtAdapter.POSTGRES,
                      )
                    : {
                          ...manifest(
                              'analytics',
                              'orders',
                              SupportedDbtAdapter.POSTGRES,
                          ),
                          nodes: {
                              [orders.unique_id]: orders,
                              [stub.unique_id]: stub,
                              [orphan.unique_id]: orphan,
                          },
                      },
            selectedModelIds:
                dbtSource.name === 'shared'
                    ? []
                    : [orders.unique_id, stub.unique_id, orphan.unique_id],
            timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
        }));
        const compilation = await h.compiler.compile(h.input);
        const explores = await collect(compilation.exploreStream);
        expect(explores.filter(isExploreError)).toEqual([]);
        expect(
            explores
                .map((explore) => explore.dbtModelIdentity?.uniqueId)
                .sort(),
        ).toEqual([orders.unique_id, primaryOrdersIdentity.uniqueId].sort());
        const ordersExplore = explores.find(
            (explore) =>
                explore.dbtModelIdentity?.uniqueId === orders.unique_id,
        ) as Explore;
        expect(ordersExplore.joinedTables).toEqual([]);
        expect(ordersExplore.tables.calendar).toBeUndefined();
        expect(ordersExplore.tables.orphan).toBeUndefined();
        expect(ordersExplore.warnings).toHaveLength(2);
        expect(ordersExplore.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: InlineErrorType.MISSING_TABLE,
                    message: expect.stringContaining('calendar'),
                }),
                expect.objectContaining({
                    type: InlineErrorType.MISSING_TABLE,
                    message: expect.stringContaining('orphan'),
                }),
            ]),
        );
    });
});
