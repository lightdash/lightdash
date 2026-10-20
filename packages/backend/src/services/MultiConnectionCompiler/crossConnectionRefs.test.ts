import {
    DbtError,
    DbtProjectType,
    DimensionType,
    isExploreError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DbtRawModelNode,
    type Explore,
    type ExploreError,
    type WarehouseClient,
} from '@lightdash/common';
import { type DbtProjectScan } from '../../dbt/dbtProjectScan';
import {
    type BoundExplore,
    type MultiConnectionCarry,
    type StagedExploreWriteCheck,
} from '../../models/ProjectModel/ProjectModel';
import {
    type CompilableDbtSource,
    type CompileGroupPlan,
} from '../../projectAdapters/CompileGroup';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import {
    CompileInterruptedError,
    compileShutdown,
    type CompileShutdownContext,
} from '../../scheduler/compileShutdown';
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
    type PrepareSourceManifest,
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
const scan = (
    projectName: string,
    referencedProjects: string[] = [],
): DbtProjectScan => ({
    projectName,
    referencedProjects,
    installedPackages: [],
    declaredUpstreams: [],
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
    crossSource = true,
    extraCredentials = trino,
    providerGroup = 'original',
    scanned = true,
    referencedProject = 'shared_dimensions',
}: {
    mixed?: boolean;
    crossSource?: boolean;
    extraCredentials?: CreateWarehouseCredentials;
    providerGroup?: 'original' | 'extra' | 'later';
    scanned?: boolean;
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
        ) => {
            saved.push(...(await collect(explores)));
            return {
                cachedExploreUuids: saved.map(({ explore }) => explore.name),
            };
        },
    );
    const projectModel = {
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
        async (dbtSource, credentials, _connection, options) => {
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
            const external = options.externalNodes.find(
                (node) =>
                    node.package_name === referencedProject &&
                    node.name === 'calendar',
            );
            if (!external) throw missing(referencedProject);
            const fetched = manifest('analytics_project', 'orders', adapter);
            const orders = fetched.nodes[
                'model.analytics_project.orders'
            ] as DbtRawModelNode;
            orders.refs = [
                { name: 'calendar', package: referencedProject, version: null },
            ];
            orders.depends_on = { nodes: ['model.shared_dimensions.calendar'] };
            const stub = {
                ...model('shared_dimensions', 'calendar'),
                path: '',
                original_file_path: '',
            };
            fetched.nodes[stub.unique_id] = stub;
            return { manifest: fetched, timings };
        },
    );
    const prepareSourceManifest = vi.fn<PrepareSourceManifest>(
        async (dbtSource) =>
            scanned
                ? scan(
                      dbtSource.name === 'shared'
                          ? 'shared_dimensions'
                          : 'analytics_project',
                      dbtSource.name === 'analytics' ? [referencedProject] : [],
                  )
                : null,
    );
    const input: Parameters<typeof compiler.compile>[0] = {
        projectUuid: 'project',
        context: connectionContextFromUser(
            { userUuid: 'user' },
            { organizationUuid: 'org', queryContext: null, purpose: 'compile' },
        ),
        primary: {
            prepare: async () => scan('primary_project'),
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
        includeUnboundSources: true,
        crossSourceRefsEnabled: crossSource,
        mixedWarehouseConnectionsEnabled: mixed,
        concurrency: 2,
        prepareSourceManifest,
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
        prepareSourceManifest,
        saveMultiConnectionExplores,
        saved,
        withWarehouseClient,
        projectModel,
        saveCompileArtifacts,
    };
};

const warning = (project = 'shared_dimensions') =>
    `Connection "Trino (tpch)" failed to compile, so its previous explores are kept: Cannot resolve dbt source "analytics": ref "${project}.calendar" was not found. No connected dbt source provides project "${project}".`;

const expectOriginalExplores = async (
    stream: AsyncIterable<Explore | ExploreError>,
) => {
    const explores = await collect(stream);
    expect(explores.map((explore) => explore.name).sort()).toEqual([
        'calendar',
        'primary_orders',
    ]);
    expect(explores.filter(isExploreError)).toEqual([]);
};

describe('cross-connection dbt ref diagnostics', () => {
    afterEach(() => vi.restoreAllMocks());

    it('names both connections and carries the failed Trino group', async () => {
        const h = harness();
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toEqual([
            expect.stringContaining(
                'Cross-source refs only work between dbt sources on the same warehouse connection.',
            ),
        ]);
        expect(compilation.carry).toEqual({
            kind: 'connections',
            warehouseConnectionUuids: ['extra'],
        });
        await h.compiler.save('project', compilation);
        expect(h.saveMultiConnectionExplores).toHaveBeenCalledWith(
            'project',
            expect.anything(),
            { kind: 'connections', warehouseConnectionUuids: ['extra'] },
        );
        expect(h.saved.map(({ explore }) => explore.name).sort()).toEqual([
            'calendar',
            'primary_orders',
        ]);
        expect(
            h.saved.map(
                ({ warehouseConnectionUuid }) => warehouseConnectionUuid,
            ),
        ).toEqual([null, null]);
        expect(
            h.saved.map(({ explore }) => explore).filter(isExploreError),
        ).toEqual([]);
        expect(h.fetchSourceManifest).toHaveBeenCalledTimes(2);
        expect(h.prepareSourceManifest).toHaveBeenCalledTimes(2);
        expect(h.withWarehouseClient).toHaveBeenCalledTimes(2);
    });

    it('keeps the exact existing warning when mixed warehouses are disabled', async () => {
        const h = harness({ mixed: false });
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toEqual([
            expect.stringContaining(
                'Cross-source refs only work between dbt sources on the same warehouse connection.',
            ),
        ]);
        await expectOriginalExplores(compilation.exploreStream);
    });

    it('keeps the exact existing warning for an unknown project', async () => {
        const h = harness({ referencedProject: 'not_connected' });
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toEqual([warning('not_connected')]);
        await expectOriginalExplores(compilation.exploreStream);
    });

    it.each([false, true])(
        'resolves refs within a Trino extra and binds both explores, scanned=%s',
        async (scanned) => {
            const h = harness({ providerGroup: 'extra', scanned });
            const compilation = await h.compiler.compile(h.input);
            const explores = await collect(compilation.exploreStream);
            expect(explores.map((explore) => explore.name).sort()).toEqual([
                'calendar',
                'orders',
                'primary_orders',
            ]);
            expect(explores.filter(isExploreError)).toEqual([]);
            for (const name of ['calendar', 'orders']) {
                expect(compilation.bindingOf(name)).toBe('extra');
                expect(
                    explores.find((explore) => explore.name === name)
                        ?.targetDatabase,
                ).toBe(SupportedDbtAdapter.TRINO);
            }
            expect(compilation.bindingOf('primary_orders')).toBeNull();
            expect(compilation.warnings).toEqual([]);
            const analyticsCalls = h.fetchSourceManifest.mock.calls.filter(
                ([dbtSource]) => dbtSource.name === 'analytics',
            );
            expect(analyticsCalls).toHaveLength(scanned ? 1 : 2);
            expect(analyticsCalls.at(-1)?.[3].externalNodes).toEqual([
                expect.objectContaining({
                    package_name: 'shared_dimensions',
                    name: 'calendar',
                }),
            ]);
        },
    );

    it('detects a provider in a later group before resolving refs', async () => {
        const h = harness({ providerGroup: 'later' });
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toEqual([
            expect.stringContaining(
                'Cross-source refs only work between dbt sources on the same warehouse connection.',
            ),
        ]);
        expect(compilation.bindingOf('calendar')).toBe('later');
        expect(
            h.prepareSourceManifest.mock.calls.map(
                ([dbtSource]) => dbtSource.name,
            ),
        ).toEqual(['analytics', 'shared']);
    });

    it('attributes a project from an earlier successful extra group', async () => {
        const h = harness({ providerGroup: 'later' });
        h.plans.splice(1, 2, h.plans[2], h.plans[1]);
        h.plans[1].connectionName = 'Earlier extra';
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toEqual([
            expect.stringContaining('Earlier extra'),
        ]);
        expect(compilation.bindingOf('calendar')).toBe('later');
    });

    it('keeps an original-group failure unchanged', async () => {
        const h = harness({ providerGroup: 'later' });
        h.plans[0].sources.push(h.plans[1].sources.pop()!);
        await expect(h.compiler.compile(h.input)).rejects.toThrow(
            'Cross-source refs only work between dbt sources on the same warehouse connection.',
        );
        expect(h.withWarehouseClient).toHaveBeenCalledTimes(2);
    });

    it('rejects declarations across connections before any group fetches', async () => {
        const h = harness({ providerGroup: 'later' });
        h.prepareSourceManifest.mockImplementation(async (dbtSource) =>
            dbtSource.name === 'shared'
                ? scan('shared_dimensions')
                : {
                      ...scan('analytics_project'),
                      declaredUpstreams: ['shared_dimensions'],
                  },
        );
        const fetchPrimary = vi.spyOn(h.input.primary, 'fetchManifest');
        const failure = h.compiler.compile(h.input);
        await Promise.all(
            ['analytics', 'shared', 'Trino (tpch)', 'Postgres (jaffle)'].map(
                (text) => expect(failure).rejects.toThrow(text),
            ),
        );
        expect(fetchPrimary).not.toHaveBeenCalled();
        expect(h.fetchSourceManifest).not.toHaveBeenCalled();
    });

    it('keeps the exact existing hint when cross-source refs are disabled', async () => {
        const h = harness({ crossSource: false });
        const compilation = await h.compiler.compile(h.input);
        expect(compilation.warnings).toEqual([
            `Connection "Trino (tpch)" failed to compile, so its previous explores are kept: Failed to load dbt source "analytics": ${missing().message} This model references a model in another dbt project. Connect that project as a dbt source and enable cross-source dbt refs for your organization.`,
        ]);
        expect(h.prepareSourceManifest).not.toHaveBeenCalled();
    });
});

describe('cross-source compile boundaries', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const shutdownContext = (): CompileShutdownContext => ({
        controller: new AbortController(),
        jobUuid: 'leaf_a',
        armed: false,
        isStopping: () => false,
        interrupt: vi.fn(),
    });

    it.each(['credentials', 'clone'])(
        'carries an extra group after a %s preparation failure',
        async (phase) => {
            const h = harness();
            const failure = new Error(`leaf_b ${phase} failed`);
            if (phase === 'credentials')
                h.input.loadExtraCredentials = vi
                    .fn()
                    .mockRejectedValue(failure);
            else
                h.prepareSourceManifest.mockImplementation(
                    async (dbtSource) => {
                        if (dbtSource.name === 'analytics') throw failure;
                        return scan('shared_dimensions');
                    },
                );
            const compilation = await h.compiler.compile(h.input);
            await expectOriginalExplores(compilation.exploreStream);
            expect(compilation.carry).toEqual({
                kind: 'connections',
                warehouseConnectionUuids: ['extra'],
            });
            expect(compilation.warnings).toEqual([
                `Connection "Trino (tpch)" failed to compile, so its previous explores are kept: ${failure.message}`,
            ]);
        },
    );

    it('settles cancelled preparations before releasing their warehouse scope', async () => {
        const h = harness({ providerGroup: 'extra' });
        let siblingStarted!: () => void;
        const started = new Promise<void>((done) => {
            siblingStarted = done;
        });
        let settleSibling!: () => void;
        let aborted = false;
        let released = false;
        h.prepareSourceManifest.mockImplementation(
            async (dbtSource, _credentials, _connection, options) => {
                if (dbtSource.name === 'analytics') {
                    await started;
                    throw new Error('leaf_a clone failed');
                }
                return new Promise((_resolve, reject) => {
                    options!.signal!.addEventListener(
                        'abort',
                        () => {
                            aborted = true;
                            settleSibling = () =>
                                reject(options!.signal!.reason);
                        },
                        { once: true },
                    );
                    siblingStarted();
                });
            },
        );
        const acquire = h.withWarehouseClient.getMockImplementation()!;
        h.withWarehouseClient.mockImplementation(async (...args) => {
            try {
                return await acquire(...args);
            } finally {
                released = true;
            }
        });
        const work = h.compiler.compile(h.input);
        await vi.waitFor(() => expect(aborted).toBe(true));
        expect(released).toBe(false);
        settleSibling();
        const compilation = await work;
        expect(released).toBe(true);
        expect(compilation.carry).toEqual({
            kind: 'connections',
            warehouseConnectionUuids: ['extra'],
        });
    });

    it.each(['prepare', 'ls'] as const)(
        'carries an extra group that times out during %s and names the source and phase',
        async (phase) => {
            vi.useFakeTimers();
            const h = harness();
            h.input.crossSourceTimeouts = {
                prepareMs: 10,
                lsMs: 10,
                resolutionMs: 1000,
            };
            const waitForAbort = (signal: AbortSignal | undefined) =>
                new Promise<never>((_resolve, reject) => {
                    signal!.addEventListener(
                        'abort',
                        () => reject(signal!.reason),
                        { once: true },
                    );
                });
            if (phase === 'prepare') {
                h.prepareSourceManifest.mockImplementation(
                    async (dbtSource, _credentials, _connection, options) =>
                        dbtSource.name === 'analytics'
                            ? waitForAbort(options?.signal)
                            : scan('shared_dimensions'),
                );
            } else {
                const fetch = h.fetchSourceManifest.getMockImplementation()!;
                h.fetchSourceManifest.mockImplementation(async (...args) =>
                    args[0].name === 'analytics'
                        ? waitForAbort(args[3].signal)
                        : fetch(...args),
                );
            }
            const work = h.compiler.compile(h.input);
            await vi.advanceTimersByTimeAsync(10);
            const compilation = await work;
            await expectOriginalExplores(compilation.exploreStream);
            expect(compilation.carry).toEqual({
                kind: 'connections',
                warehouseConnectionUuids: ['extra'],
            });
            expect(compilation.warnings).toEqual([
                expect.stringContaining(
                    `dbt source "analytics" timed out after 0.01 s while ${phase === 'prepare' ? 'cloning the repository and installing dbt packages' : 'running dbt ls'}`,
                ),
            ]);
        },
    );

    it('keeps preparation time in an extra group resolution deadline', async () => {
        vi.useFakeTimers();
        const h = harness();
        h.input.crossSourceTimeouts = {
            prepareMs: 100,
            lsMs: 100,
            resolutionMs: 10,
        };
        const prepare = h.prepareSourceManifest.getMockImplementation()!;
        h.prepareSourceManifest.mockImplementation(async (...args) => {
            if (args[0].name === 'analytics')
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 6);
                });
            return prepare(...args);
        });
        const fetch = h.fetchSourceManifest.getMockImplementation()!;
        h.fetchSourceManifest.mockImplementation(async (...args) => {
            if (args[0].name === 'analytics') {
                await new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(resolve, 6);
                    args[3].signal!.addEventListener(
                        'abort',
                        () => {
                            clearTimeout(timer);
                            reject(args[3].signal!.reason);
                        },
                        { once: true },
                    );
                });
            }
            return fetch(...args);
        });
        const work = h.compiler.compile(h.input);
        await vi.advanceTimersByTimeAsync(10);
        const compilation = await work;
        expect(compilation.carry).toEqual({
            kind: 'connections',
            warehouseConnectionUuids: ['extra'],
        });
        expect(compilation.warnings).toEqual([
            expect.stringContaining(
                'Cross-source dbt resolution timed out after 0.01 s. Sources still in progress: "analytics".',
            ),
        ]);
    });

    it('fails the compile on an original-group deadline', async () => {
        vi.useFakeTimers();
        const h = harness();
        h.input.crossSourceTimeouts = {
            prepareMs: 10,
            lsMs: 10,
            resolutionMs: 1000,
        };
        h.input.primary.fetchManifest = async (options) =>
            new Promise<never>((_resolve, reject) => {
                options.signal!.addEventListener(
                    'abort',
                    () => reject(options.signal!.reason),
                    { once: true },
                );
            });
        const work = h.compiler
            .compile(h.input)
            .catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(10);
        expect(await work).toEqual(
            expect.objectContaining({
                message: expect.stringContaining(
                    'dbt source "primary" timed out after 0.01 s while running dbt ls',
                ),
            }),
        );
        expect(h.saveMultiConnectionExplores).not.toHaveBeenCalled();
    });

    it('fences a shutdown after the last successful dbt ls before publication', async () => {
        const h = harness({ providerGroup: 'extra' });
        const context = shutdownContext();
        const reason = new CompileInterruptedError();
        const prepareExplores = vi
            .spyOn(DbtManifestProjectAdapter.prototype, 'prepareExploreStream')
            .mockImplementation(async () => {
                context.controller.abort(reason);
                return (async function* empty() {
                    yield* [];
                })();
            });
        await expect(
            compileShutdown.run(context, () => h.compiler.compile(h.input)),
        ).rejects.toBe(reason);
        expect(prepareExplores).toHaveBeenCalledOnce();
        expect(h.saveMultiConnectionExplores).not.toHaveBeenCalled();
        expect(h.projectModel.upsertMergedManifest).not.toHaveBeenCalled();
        expect(h.saveCompileArtifacts).not.toHaveBeenCalled();
    });

    it('checks shutdown after streaming explores and before the staged transaction writes', async () => {
        const h = harness({ providerGroup: 'extra' });
        const context = shutdownContext();
        const compilation = await compileShutdown.run(context, () =>
            h.compiler.compile(h.input),
        );
        h.saveMultiConnectionExplores.mockImplementation(
            async (_projectUuid, stream, _carry, beforeWrite) => {
                await collect(stream);
                context.controller.abort(new CompileInterruptedError());
                await beforeWrite!(
                    null as unknown as Parameters<StagedExploreWriteCheck>[0],
                    'leaf_b',
                );
                throw new Error('leaf_c write must not run');
            },
        );
        const error = await h.compiler
            .save('project', compilation)
            .catch((failure: unknown) => failure);
        expect(error).toBe(context.controller.signal.reason);
        expect(h.projectModel.upsertMergedManifest).not.toHaveBeenCalled();
        expect(h.saveCompileArtifacts).not.toHaveBeenCalled();
    });

    it('fences detached persistence callbacks and staged explore writes after shutdown', async () => {
        const h = harness({ providerGroup: 'extra' });
        const context = shutdownContext();
        const compilation = await compileShutdown.run(context, () =>
            h.compiler.compile(h.input),
        );
        context.controller.abort(new CompileInterruptedError());
        await expect(compilation.persistArtifacts()).rejects.toBe(
            context.controller.signal.reason,
        );
        await expect(h.compiler.save('project', compilation)).rejects.toBe(
            context.controller.signal.reason,
        );
        expect(h.saveMultiConnectionExplores).not.toHaveBeenCalled();
        expect(h.projectModel.upsertMergedManifest).not.toHaveBeenCalled();
        expect(h.saveCompileArtifacts).not.toHaveBeenCalled();
    });
});
