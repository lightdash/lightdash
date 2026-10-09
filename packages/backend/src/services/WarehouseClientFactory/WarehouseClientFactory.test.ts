import {
    AiAccessRefusalReason,
    AiAgentMarkerLevel,
    applyWarehouseLocation,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    BigqueryTokenError,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    QueryExecutionContext,
    QuerySurface,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    WarehouseTypes,
    type AiExecutionPlan,
    type CreateDuckdbDucklakeCredentials,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import {
    BigqueryWarehouseClient,
    checkSnowflakeAgentSessionWithToken,
    ListedDatabasesPostgresWarehouseClient,
    SshTunnel,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import refresh from 'passport-oauth2-refresh';
import { expectTypeOf } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { AiAccessService } from '../AiAccessService/AiAccessService';
import { SnowflakeAiCredentialProvider } from '../AiAccessService/providers/SnowflakeAiCredentialProvider';
import { createAnalyticsClient } from '../ProjectService/analyticsProject/analyticsProjectClient';
import {
    connectionContextFromUser,
    ConnectionSurface,
    WarehouseCredentialKind,
} from './ConnectionContext';
import { createCredentialResolverRegistry } from './credentialResolvers';
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';
import {
    WarehouseClientFactory,
    type WarehouseClientRef,
    type WarehouseConnectionLeaseRef,
} from './WarehouseClientFactory';
import type {
    WarehouseCredentialBase,
    WarehouseCredentialSource,
} from './WarehouseCredentialSource';

const { connect, disconnect } = vi.hoisted(() => ({
    connect:
        vi.fn<
            (
                credentials: CreateWarehouseCredentials,
            ) => Promise<CreateWarehouseCredentials>
        >(),
    disconnect: vi.fn<() => Promise<void>>(),
}));

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
    SshTunnel: vi.fn().mockImplementation(function MockSshTunnel(
        this: {
            overrideCredentials: CreateWarehouseCredentials;
            connect: () => Promise<CreateWarehouseCredentials>;
            disconnect: () => Promise<void>;
        },
        credentials: CreateWarehouseCredentials,
    ) {
        this.overrideCredentials = credentials;
        this.connect = async () => {
            this.overrideCredentials = await connect(credentials);
            return this.overrideCredentials;
        };
        this.disconnect = disconnect;
    }),
}));

vi.mock('../ProjectService/analyticsProject/analyticsProjectClient', () => ({
    createAnalyticsClient: vi.fn(),
}));

const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    user: 'warehouse-user',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const sshCredentials = [
    { ...credentials, useSshTunnel: true },
    {
        ...credentials,
        type: WarehouseTypes.REDSHIFT,
        authenticationType: RedshiftAuthenticationType.PASSWORD,
        port: 5439,
        useSshTunnel: true,
    },
] satisfies CreateWarehouseCredentials[];

const contextFor = (
    queryContext: QueryExecutionContext | null = QueryExecutionContext.EXPLORE,
    purpose: 'query' | 'compile' = 'query',
) =>
    connectionContextFromUser(
        { userUuid: 'user-uuid' },
        { organizationUuid: 'org-uuid', queryContext, purpose },
    );

const bindingRef: Extract<WarehouseClientRef, { kind: 'binding' }> = {
    kind: 'binding',
    projectUuid: 'project-uuid',
    binding: { kind: 'original' },
};

const plan: Extract<AiExecutionPlan, { identity: 'connected_person' }> = {
    identity: 'connected_person',
    identityUuid: 'ai-identity',
    credentials,
    assurances: [],
    audit: {
        actorKind: 'person',
        personUuid: 'user-uuid',
        principalRef: 'principal',
        queryTags: {},
    },
};

const markedPlan: Extract<AiExecutionPlan, { identity: 'marked_person' }> = {
    identity: 'marked_person',
    assurances: [
        { kind: 'agent_marker', level: AiAgentMarkerLevel.IDENTIFY_ONLY },
    ],
    audit: { ...plan.audit, userUuid: 'user-uuid' },
};

const buildFixture = (
    releaseSshTunnelOnScopeExit = true,
    resolveDbtCloudPreviewCredentials = true,
    resolveTimezonePreviewCredentials = true,
    resolveTestAndCompileCredentials = true,
) => {
    const projectModel = {
        getWarehouseClientFromCredentials: vi.fn<
            ProjectModel['getWarehouseClientFromCredentials']
        >((creds) => ({
            ...warehouseClientMock,
            credentials: creds,
        })),
        get: vi.fn<ProjectModel['get']>(),
        getSummary: vi.fn<ProjectModel['getSummary']>(),
        getWarehouseClientIdentityOptions:
            vi.fn<ProjectModel['getWarehouseClientIdentityOptions']>(),
    };
    const analytics = { track: vi.fn() };
    const trackingService = new AiAccessService({
        analytics,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const aiAccessService = {
        trackQueryRefusal: vi.fn<AiAccessService['trackQueryRefusal']>(
            trackingService.trackQueryRefusal.bind(trackingService),
        ),
        resolvePlan: vi
            .fn<AiAccessService['resolvePlan']>()
            .mockResolvedValue(null),
    };
    const base: WarehouseCredentialBase = {
        kind: 'original',
        projectUuid: 'project-uuid',
        credentials,
        organizationUuid: 'org-uuid',
        organizationWarehouseCredentialsUuid: null,
        warehouseConnectionUuid: null,
        connectionRoute: {
            route: 'single',
            originalWarehouseConnectionUuid: null,
        },
    };
    const credentialSource = {
        loadBase: vi
            .fn<WarehouseCredentialSource['loadBase']>()
            .mockResolvedValue(base),
        finish: vi.fn<WarehouseCredentialSource['finish']>().mockResolvedValue({
            ...credentials,
            userWarehouseCredentialsUuid: undefined,
        }),
    };
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const featureFlagModel = {} as FeatureFlagModel;
    const factory = new WarehouseClientFactory({
        credentialResolvers: createCredentialResolverRegistry({
            lightdashConfig: lightdashConfigMock,
            userOAuthGrantsModel: { getRefreshToken: vi.fn() },
        }),
        lightdashConfig: {
            ...lightdashConfigMock,
            warehouseClient: {
                ...lightdashConfigMock.warehouseClient,
                releaseSshTunnelOnScopeExit,
                resolveDbtCloudPreviewCredentials,
                resolveTimezonePreviewCredentials,
                resolveTestAndCompileCredentials,
            },
        },
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel,
        aiAccessService: aiAccessService as unknown as AiAccessService,
        credentialSource,
        logger: logger as unknown as typeof Logger,
    });
    return {
        analytics,
        factory,
        projectModel,
        aiAccessService,
        credentialSource,
        logger,
        base,
        featureFlagModel,
    };
};

const compileRef = (
    creds: CreateWarehouseCredentials = credentials,
): WarehouseClientRef => ({
    kind: 'compile',
    projectUuid: 'project-uuid',
    credentials: creds,
});

beforeEach(() => {
    vi.clearAllMocks();
    connect.mockReset().mockImplementation(async (creds) => creds);
    disconnect.mockReset().mockResolvedValue(undefined);
});

describe('WarehouseClientFactory', () => {
    const ducklakeCredentials: CreateDuckdbDucklakeCredentials = {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.DUCKLAKE,
        catalogAlias: 'lake',
        schema: 'public',
        catalog: {
            type: DucklakeCatalogType.POSTGRES,
            host: 'catalog.internal',
            port: 5432,
            database: 'catalog',
            user: 'catalog-user',
            password: 'catalog-password',
        },
        dataPath: {
            type: DucklakeDataPathType.S3,
            url: 's3://test-lake/data',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
        },
    };

    test('preserves DuckLake connection credentials before client normalisation', async () => {
        const { factory, projectModel } = buildFixture();
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            warehouseClientFromCredentials,
        );
        await factory.withWarehouseClient(
            compileRef(ducklakeCredentials),
            contextFor(null, 'compile'),
            async (connection) => {
                expect(connection.warehouseClient.credentials).toMatchObject({
                    connectionType: DuckdbConnectionType.MOTHERDUCK,
                    database: 'lake',
                    token: '',
                });
                expect(connection.connectionCredentials).toEqual(
                    ducklakeCredentials,
                );
            },
        );
    });

    test('derives a DuckLake source client from connection credentials without a MotherDuck token', async () => {
        const { factory, projectModel } = buildFixture();
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            warehouseClientFromCredentials,
        );
        await factory.withWarehouseClient(
            compileRef(ducklakeCredentials),
            contextFor(null, 'compile'),
            async (connection) => {
                const sourceCredentials = applyWarehouseLocation(
                    connection.connectionCredentials,
                    { database: null, schema: 'source_schema' },
                );
                const derived = connection.deriveClient(sourceCredentials);
                expect(derived.credentials).toMatchObject({
                    schema: 'source_schema',
                });
                expect(
                    projectModel.getWarehouseClientFromCredentials,
                ).toHaveBeenLastCalledWith(
                    { ...ducklakeCredentials, schema: 'source_schema' },
                    expect.any(Object),
                );
            },
        );
    });

    test('exposes the local tunnel endpoint in connection credentials', async () => {
        const { factory } = buildFixture();
        const original = { ...credentials, useSshTunnel: true };
        const tunneled = { ...original, host: '127.0.0.1', port: 43210 };
        connect.mockResolvedValueOnce(tunneled);
        await factory.withWarehouseClient(
            compileRef(original),
            contextFor(null, 'compile'),
            async (connection) => {
                expect(connection.warehouseCredentials).toEqual(original);
                expect(connection.connectionCredentials).toEqual(tunneled);
            },
        );
    });

    test.each([
        {
            aiPlan: null,
            personal: false,
            purpose: 'query' as const,
            kind: WarehouseCredentialKind.SHARED,
        },
        {
            aiPlan: null,
            personal: true,
            purpose: 'query' as const,
            kind: WarehouseCredentialKind.PERSONAL,
        },
        {
            aiPlan: plan,
            personal: false,
            purpose: 'query' as const,
            kind: WarehouseCredentialKind.AI_AGENT_SIGN_IN,
        },
        {
            aiPlan: markedPlan,
            personal: true,
            purpose: 'query' as const,
            kind: WarehouseCredentialKind.PERSONAL,
        },
        {
            aiPlan: null,
            personal: false,
            purpose: 'compile' as const,
            kind: WarehouseCredentialKind.COMPILE,
        },
    ])(
        'resolves $kind credentials without constructing and matches the binding scope',
        async ({ aiPlan, personal, purpose, kind }) => {
            const {
                factory,
                credentialSource,
                aiAccessService,
                projectModel,
                base,
            } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(aiPlan);
            credentialSource.finish.mockResolvedValue({
                ...credentials,
                userWarehouseCredentialsUuid: personal
                    ? 'personal-uuid'
                    : undefined,
            });
            const context = contextFor(
                aiPlan ? QueryExecutionContext.AI : null,
                purpose,
            );
            const resolution = await factory.resolveWarehouseCredentials(
                bindingRef,
                context,
            );
            expect(resolution).toStrictEqual({
                warehouseCredentials: {
                    ...credentials,
                    userWarehouseCredentialsUuid: personal
                        ? 'personal-uuid'
                        : undefined,
                },
                aiPlan,
                warehouseConnectionUuid: base.warehouseConnectionUuid,
                connectionRoute: base.connectionRoute,
                credentialKind: kind,
            });
            expect(credentialSource.loadBase).toHaveBeenCalledExactlyOnceWith(
                bindingRef,
                context,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).not.toHaveBeenCalled();
            expect(SshTunnel).not.toHaveBeenCalled();
            const scoped = await factory.withWarehouseClient(
                bindingRef,
                context,
                async ({
                    warehouseClient: _client,
                    connectionCredentials: _connectionCredentials,
                    tunnelConnectMs: _time,
                    deriveClient: _deriveClient,
                    ...resolved
                }) => resolved,
            );
            expect(scoped).toStrictEqual(resolution);
        },
    );

    test.each([QueryExecutionContext.AI, QueryExecutionContext.EXPLORE, null])(
        'a resolved ref carries the plan and derives agentSession for %s without resolving again',
        async (queryContext) => {
            const { factory, credentialSource, aiAccessService, projectModel } =
                buildFixture();
            const ref: Extract<WarehouseClientRef, { kind: 'resolved' }> = {
                kind: 'resolved',
                projectUuid: 'project-uuid',
                credentials: { ...credentials, dbname: 'listed-database' },
                aiPlan: plan,
                warehouseConnectionUuid: 'extra-uuid',
                connectionRoute: {
                    route: 'multi',
                    originalWarehouseConnectionUuid: 'original-uuid',
                },
            };
            const acquire = vi.spyOn(factory, 'acquireUnscoped');
            const agentSession = queryContext === QueryExecutionContext.AI;
            await expect(
                factory.withWarehouseClient(
                    ref,
                    contextFor(queryContext),
                    async (connection) => {
                        expect(connection).toMatchObject({
                            warehouseCredentials: ref.credentials,
                            aiPlan: plan,
                            warehouseConnectionUuid: 'extra-uuid',
                            connectionRoute: ref.connectionRoute,
                            credentialKind:
                                WarehouseCredentialKind.AI_AGENT_SIGN_IN,
                        });
                        expect(disconnect).not.toHaveBeenCalled();
                        return 'result';
                    },
                ),
            ).resolves.toBe('result');
            expect(credentialSource.loadBase).not.toHaveBeenCalled();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
            expect(acquire).toHaveBeenCalledExactlyOnceWith(
                'project-uuid',
                ref.credentials,
                { aiPlan: plan, agentSession },
                undefined,
                'org-uuid',
                {
                    cacheEnabled: true,
                    wrapConstructionErrors: false,
                    warehouseConnectionUuid: 'extra-uuid',
                    compileGroup: undefined,
                    clientOptions: undefined,
                    refusalScope: {
                        context: contextFor(queryContext),
                        warehouseConnectionUuid: 'extra-uuid',
                        refused: false,
                    },
                },
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledExactlyOnceWith(
                ref.credentials,
                expect.objectContaining({ agentSession }),
            );
            expect(Object.keys(factory.warehouseClients)).toEqual([
                JSON.stringify([
                    agentSession,
                    'project-uuid',
                    'extra-uuid',
                    null,
                    null,
                    'connected_person',
                    plan.identityUuid,
                ]),
            ]);
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test.each(['callback', 'construction'] as const)(
        'a resolved ref releases once after a %s failure',
        async (failure) => {
            const { factory, projectModel, credentialSource, aiAccessService } =
                buildFixture();
            const error = new Error('resolved query failed');
            if (failure === 'construction') {
                projectModel.getWarehouseClientFromCredentials.mockImplementationOnce(
                    () => {
                        throw error;
                    },
                );
            }
            await expect(
                factory.withWarehouseClient(
                    {
                        kind: 'resolved',
                        projectUuid: 'project-uuid',
                        credentials: sshCredentials[0],
                        aiPlan: null,
                        warehouseConnectionUuid: null,
                        connectionRoute: null,
                    },
                    contextFor(),
                    async () => {
                        throw error;
                    },
                ),
            ).rejects.toBe(error);
            expect(disconnect).toHaveBeenCalledOnce();
            expect(credentialSource.loadBase).not.toHaveBeenCalled();
            expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
        },
    );

    test.each([
        {
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'user',
                password: 'password',
                database: 'database',
                schema: 'public',
                warehouse: 'base-warehouse',
            },
            overrides: { snowflakeVirtualWarehouse: 'listed-warehouse' },
            expected: { warehouse: 'listed-warehouse' },
        },
        {
            credentials: {
                type: WarehouseTypes.DATABRICKS,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                serverHostName: 'warehouse.internal',
                httpPath: '/base',
                personalAccessToken: 'token',
                catalog: 'catalog',
                database: 'database',
                compute: [{ name: 'listed-compute', httpPath: '/listed' }],
            },
            overrides: { databricksCompute: 'listed-compute' },
            expected: { httpPath: '/listed' },
        },
    ] satisfies {
        credentials: CreateWarehouseCredentials;
        overrides: {
            snowflakeVirtualWarehouse?: string;
            databricksCompute?: string;
        };
        expected: { warehouse?: string; httpPath?: string };
    }[])(
        'a resolved ref honours $credentials.type overrides',
        async ({ credentials: creds, overrides, expected }) => {
            const { factory, projectModel } = buildFixture();
            await factory.withWarehouseClient(
                {
                    kind: 'resolved',
                    projectUuid: 'project-uuid',
                    credentials: creds,
                    aiPlan: null,
                    warehouseConnectionUuid: null,
                    connectionRoute: null,
                    overrides,
                },
                contextFor(),
                async () => undefined,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledExactlyOnceWith(
                { ...creds, ...expected },
                expect.objectContaining({ agentSession: false }),
            );
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test.each(sshCredentials)(
        'releases a $type tunnel after a successful callback',
        async (creds) => {
            const { factory } = buildFixture();
            connect.mockResolvedValue({
                ...creds,
                host: '127.0.0.1',
                port: 32000,
            });
            const callback = vi.fn(async () => {
                expect(disconnect).not.toHaveBeenCalled();
                return 'callback result';
            });
            await expect(
                factory.withWarehouseClient(
                    compileRef(creds),
                    contextFor(),
                    callback,
                ),
            ).resolves.toBe('callback result');
            expect(callback).toHaveBeenCalledOnce();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test('releases the tunnel and rethrows the callback error unchanged', async () => {
        const { factory } = buildFixture();
        const error = new Error('query failed');
        await expect(
            factory.withWarehouseClient(
                compileRef(sshCredentials[0]),
                contextFor(),
                async () => {
                    throw error;
                },
            ),
        ).rejects.toBe(error);
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test('releases a connected tunnel when construction fails', async () => {
        const { factory, projectModel } = buildFixture();
        const error = new Error('construction failed');
        projectModel.getWarehouseClientFromCredentials.mockImplementationOnce(
            () => {
                throw error;
            },
        );
        const callback = vi.fn();
        await expect(
            factory.withWarehouseClient(
                compileRef(sshCredentials[0]),
                contextFor(),
                callback,
            ),
        ).rejects.toBe(error);
        expect(connect).toHaveBeenCalledOnce();
        expect(disconnect).toHaveBeenCalledOnce();
        expect(callback).not.toHaveBeenCalled();
    });

    test('releases the tunnel when connection fails', async () => {
        const { factory } = buildFixture();
        const error = new Error('connection failed');
        connect.mockRejectedValueOnce(error);
        await expect(
            factory.withWarehouseClient(
                compileRef(sshCredentials[0]),
                contextFor(),
                async () => undefined,
            ),
        ).rejects.toBe(error);
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test('does not read or write the cache for tunneled clients', async () => {
        const { factory, projectModel } = buildFixture();
        const tunneledCredentials = {
            ...sshCredentials[0],
            host: '127.0.0.1',
            port: 32000,
        };
        connect.mockResolvedValue(tunneledCredentials);
        const cachedClient = {
            ...warehouseClientMock,
            credentials: tunneledCredentials,
        };
        factory.warehouseClients['project-uuid'] = cachedClient;
        const first = await factory.withWarehouseClient(
            compileRef(sshCredentials[0]),
            contextFor(),
            async (connection) => connection.warehouseClient,
        );
        const second = await factory.withWarehouseClient(
            compileRef(sshCredentials[0]),
            contextFor(),
            async (connection) => connection.warehouseClient,
        );
        expect(first).not.toBe(cachedClient);
        expect(second).not.toBe(first);
        expect(factory.warehouseClients).toEqual({
            'project-uuid': cachedClient,
        });
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
    });

    test('reuses identical non-tunneled credentials and replaces changed credentials', async () => {
        const { factory, projectModel } = buildFixture();
        const first = await factory.withWarehouseClient(
            {
                kind: 'resolved',
                projectUuid: 'project-uuid',
                credentials,
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
            },
            contextFor(),
            async (connection) => connection.warehouseClient,
        );
        const second = await factory.withWarehouseClient(
            {
                kind: 'resolved',
                projectUuid: 'project-uuid',
                credentials: { ...credentials },
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
            },
            contextFor(),
            async (connection) => connection.warehouseClient,
        );
        const third = await factory.withWarehouseClient(
            {
                kind: 'resolved',
                projectUuid: 'project-uuid',
                credentials: { ...credentials, password: 'rotated-password' },
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
            },
            contextFor(),
            async (connection) => connection.warehouseClient,
        );
        expect(second).toBe(first);
        expect(third).not.toBe(first);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
    });

    test('segregates the agent cache without an AI plan', async () => {
        const { factory, projectModel } = buildFixture();
        const first = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => connection.warehouseClient,
        );
        const second = await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async (connection) => connection.warehouseClient,
        );
        const again = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => connection.warehouseClient,
        );
        expect(first).not.toBe(second);
        expect(again).toBe(first);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenNthCalledWith(
            1,
            credentials,
            expect.objectContaining({ agentSession: true }),
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenNthCalledWith(
            2,
            credentials,
            expect.objectContaining({ agentSession: false }),
        );
    });

    test('segregates the AI identity cache and marks the agent session', async () => {
        const { factory, projectModel, aiAccessService } = buildFixture();
        aiAccessService.resolvePlan
            .mockResolvedValueOnce(plan)
            .mockResolvedValueOnce({ ...plan, identityUuid: 'ai-two' })
            .mockResolvedValueOnce(plan);
        const first = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => connection.warehouseClient,
        );
        const second = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => connection.warehouseClient,
        );
        const again = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => connection.warehouseClient,
        );
        expect(second).not.toBe(first);
        expect(again).toBe(first);
        expect(Object.keys(factory.warehouseClients)).toEqual([
            JSON.stringify([
                true,
                'project-uuid',
                null,
                null,
                null,
                'connected_person',
                plan.identityUuid,
            ]),
            JSON.stringify([
                true,
                'project-uuid',
                null,
                null,
                null,
                'connected_person',
                'ai-two',
            ]),
        ]);

        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            credentials,
            expect.objectContaining({ agentSession: true }),
        );
    });

    test('keeps the explicit transitional agentSession override and plan fallback', async () => {
        const { factory, projectModel } = buildFixture();
        await factory.acquireUnscoped('project-uuid', credentials, {
            aiPlan: plan,
            agentSession: false,
        });
        await factory.acquireUnscoped('project-uuid', credentials, {
            aiPlan: plan,
        });
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenNthCalledWith(
            1,
            credentials,
            expect.objectContaining({ agentSession: false }),
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenNthCalledWith(
            2,
            credentials,
            expect.objectContaining({ agentSession: true }),
        );
        expect(disconnect).not.toHaveBeenCalled();
    });

    test('builds the local analytics client without connecting the tunnel', async () => {
        const { factory, projectModel, featureFlagModel } = buildFixture();
        projectModel.get.mockResolvedValue({
            provisioningSource: 'analytics',
            organizationUuid: 'org-uuid',
        } as Awaited<ReturnType<ProjectModel['get']>>);
        vi.mocked(createAnalyticsClient).mockResolvedValue(
            warehouseClientMock as unknown as Awaited<
                ReturnType<typeof createAnalyticsClient>
            >,
        );
        const client = await factory.withWarehouseClient(
            compileRef({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.ANALYTICS,
                database: 'memory',
                schema: 'main',
            }),
            contextFor(),
            async (connection) => {
                expect(connection.tunnelConnectMs).toBeNull();
                expect(connection.connectionCredentials).toEqual({
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.ANALYTICS,
                    database: 'memory',
                    schema: 'main',
                });
                return connection.warehouseClient;
            },
        );
        expect(client).toBe(warehouseClientMock);
        expect(createAnalyticsClient).toHaveBeenCalledWith(
            'org-uuid',
            featureFlagModel,
        );
        expect(connect).not.toHaveBeenCalled();
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).not.toHaveBeenCalled();
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test('cleans up when the analytics project is invalid', async () => {
        const { factory, projectModel } = buildFixture();
        projectModel.get.mockResolvedValue({
            provisioningSource: 'training',
        } as Awaited<ReturnType<ProjectModel['get']>>);
        await expect(
            factory.withWarehouseClient(
                compileRef({
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.ANALYTICS,
                    database: 'memory',
                    schema: 'main',
                }),
                contextFor(),
                async () => undefined,
            ),
        ).rejects.toThrow('Invalid internal analytics project');
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test('the kill switch leaves the tunnel open and warns once', async () => {
        const { factory, logger } = buildFixture(false);
        await factory.withWarehouseClient(
            compileRef(sshCredentials[0]),
            contextFor(),
            async () => undefined,
        );
        await factory.withWarehouseClient(
            compileRef(sshCredentials[0]),
            contextFor(),
            async () => undefined,
        );
        expect(disconnect).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            'Scoped SSH tunnel release is disabled',
        );
    });

    test('the kill switch still cleans up a failed acquisition', async () => {
        const { factory, projectModel } = buildFixture(false);
        const error = new Error('construction failed');
        projectModel.getWarehouseClientFromCredentials.mockImplementationOnce(
            () => {
                throw error;
            },
        );
        await expect(
            factory.withWarehouseClient(
                compileRef(sshCredentials[0]),
                contextFor(),
                async () => undefined,
            ),
        ).rejects.toBe(error);
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test.each([QueryExecutionContext.EXPLORE, null])(
        'does not resolve an AI plan for %s',
        async (queryContext) => {
            const { factory, aiAccessService, credentialSource } =
                buildFixture();
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(queryContext),
                async (connection) => {
                    expect(connection.aiPlan).toBeNull();
                    expect(connection.credentialKind).toBe(
                        WarehouseCredentialKind.SHARED,
                    );
                },
            );
            expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
            expect(credentialSource.finish).toHaveBeenCalledOnce();
        },
    );

    test.each([
        [ConnectionSurface.IN_APP_AGENT, QuerySurface.APP],
        [ConnectionSurface.APP, QuerySurface.APP],
        [ConnectionSurface.DATA_APP, QuerySurface.APP],
        [ConnectionSurface.SCHEDULE, QuerySurface.APP],
        [ConnectionSurface.EMBED, QuerySurface.APP],
        [ConnectionSurface.SLACK_AGENT, QuerySurface.SLACK],
        [ConnectionSurface.MCP, QuerySurface.MCP],
        [ConnectionSurface.API, QuerySurface.API],
    ] as const)(
        'an enforced AI query maps %s to %s',
        async (surface, expected) => {
            const { factory, aiAccessService } = buildFixture();
            await factory.resolveWarehouseCredentials(
                bindingRef,
                connectionContextFromUser(
                    { userUuid: 'user-uuid' },
                    {
                        organizationUuid: 'org-uuid',
                        queryContext: QueryExecutionContext.AI,
                        surface,
                    },
                ),
            );
            expect(aiAccessService.resolvePlan).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    context: QueryExecutionContext.AI,
                    evaluation: { kind: 'query', surface: expected },
                }),
            );
        },
    );

    test.each([
        { purpose: 'compile', aiAccess: 'enforce' },
        { purpose: 'query', aiAccess: 'diagnostic' },
    ] as const)(
        '$purpose with $aiAccess uses diagnostic evaluation',
        async (options) => {
            const { factory, aiAccessService } = buildFixture();
            await factory.resolveWarehouseCredentials(
                bindingRef,
                connectionContextFromUser(
                    { userUuid: 'user-uuid' },
                    {
                        organizationUuid: 'org-uuid',
                        queryContext: QueryExecutionContext.AI,
                        ...options,
                    },
                ),
            );
            expect(aiAccessService.resolvePlan).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    evaluation: { kind: 'diagnostic' },
                }),
            );
        },
    );

    test('the connected-person plan short-circuits personal credentials and preserves the connection route', async () => {
        const { factory, aiAccessService, credentialSource, base } =
            buildFixture();
        const aiCredentials = { ...credentials, user: 'ai-user' };
        const aiPlan = { ...plan, credentials: aiCredentials };
        aiAccessService.resolvePlan.mockResolvedValue(aiPlan);
        const extraBase: WarehouseCredentialBase = {
            ...base,
            kind: 'extra',
            project: {
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                connectionMode: 'multi',
                originalWarehouseType: WarehouseTypes.POSTGRES,
            },
            warehouseConnectionUuid: 'extra-uuid',
            connectionRoute: {
                route: 'multi',
                originalWarehouseConnectionUuid: 'original-uuid',
            },
        };
        credentialSource.loadBase.mockResolvedValue(extraBase);
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => {
                expect(connection).toMatchObject({
                    warehouseCredentials: {
                        ...aiCredentials,
                        userWarehouseCredentialsUuid: undefined,
                    },
                    aiPlan,
                    credentialKind: WarehouseCredentialKind.AI_AGENT_SIGN_IN,
                    warehouseConnectionUuid: 'extra-uuid',
                    connectionRoute: extraBase.connectionRoute,
                });
            },
        );
        expect(credentialSource.finish).not.toHaveBeenCalled();
        expect(aiAccessService.resolvePlan).toHaveBeenCalledExactlyOnceWith({
            oauthClientId: null,
            serviceAccountUuid: null,
            evaluation: { kind: 'query', surface: QuerySurface.APP },
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            warehouseConnectionUuid: 'extra-uuid',
            connection: credentials,
            context: QueryExecutionContext.AI,
            userUuid: 'user-uuid',
            isRegisteredUser: true,
            isServiceAccount: false,
        });
    });

    test('a marked-person plan continues into finish and stays attached', async () => {
        const { factory, aiAccessService, credentialSource, base } =
            buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(markedPlan);
        credentialSource.finish.mockResolvedValue({
            ...credentials,
            user: 'personal-user',
            userWarehouseCredentialsUuid: 'personal-uuid',
        });
        const context = contextFor(QueryExecutionContext.AI);
        await factory.withWarehouseClient(
            bindingRef,
            context,
            async (connection) => {
                expect(connection.aiPlan).toEqual(markedPlan);
                expect(connection.warehouseCredentials).toMatchObject({
                    user: 'personal-user',
                });
                expect(connection.credentialKind).toBe(
                    WarehouseCredentialKind.PERSONAL,
                );
            },
        );
        expect(credentialSource.finish).toHaveBeenCalledExactlyOnceWith(
            base,
            context,
        );
        expect(
            credentialSource.loadBase.mock.invocationCallOrder[0],
        ).toBeLessThan(aiAccessService.resolvePlan.mock.invocationCallOrder[0]);
        expect(
            aiAccessService.resolvePlan.mock.invocationCallOrder[0],
        ).toBeLessThan(credentialSource.finish.mock.invocationCallOrder[0]);
    });

    test('final analytics credentials skip the AI and personal steps', async () => {
        const { factory, credentialSource, aiAccessService, base } =
            buildFixture();
        credentialSource.loadBase.mockResolvedValue({ ...base, kind: 'final' });
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => {
                expect(connection.aiPlan).toBeNull();
                expect(connection.credentialKind).toBe(
                    WarehouseCredentialKind.SHARED,
                );
            },
        );
        expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
        expect(credentialSource.finish).not.toHaveBeenCalled();
    });

    test('rejects timezone bypass before construction when resolution is enabled', async () => {
        const { factory, projectModel, credentialSource } = buildFixture();
        const callback = vi.fn();
        await expect(
            factory.withWarehouseClient(
                {
                    kind: 'bypass',
                    mode: 'timezone_preview',
                    projectUuid: null,
                    credentials,
                },
                contextFor(),
                callback,
            ),
        ).rejects.toThrow(
            'Timezone preview credential bypass requires credential resolution to be disabled',
        );
        expect(callback).not.toHaveBeenCalled();
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).not.toHaveBeenCalled();
        expect(SshTunnel).not.toHaveBeenCalled();
        expect(credentialSource.loadBase).not.toHaveBeenCalled();
    });

    test('warns once when timezone credential resolution is disabled', () => {
        const { logger } = buildFixture(true, true, false);
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            'Timezone preview credential resolution is disabled; using raw credentials without refresh',
        );
    });

    test.each([null, 'project-uuid'])(
        'resolved preview with project %s never reads or writes the query cache',
        async (projectUuid) => {
            const { factory, projectModel, credentialSource } = buildFixture();
            const cached = { ...warehouseClientMock, credentials };
            factory.warehouseClients[String(projectUuid)] = cached;
            const ref: Extract<WarehouseClientRef, { kind: 'resolved' }> = {
                kind: 'resolved',
                projectUuid,
                credentials,
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
                cachePolicy: 'disabled',
            };
            const first = await factory.withWarehouseClient(
                ref,
                contextFor(),
                async ({ warehouseClient }) => warehouseClient,
            );
            const second = await factory.withWarehouseClient(
                ref,
                contextFor(),
                async ({ warehouseClient }) => warehouseClient,
            );
            expect(first).not.toBe(cached);
            expect(second).not.toBe(first);
            expect(factory.warehouseClients).toEqual({
                [String(projectUuid)]: cached,
            });
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            expect(credentialSource.loadBase).not.toHaveBeenCalled();
            expect(disconnect).toHaveBeenCalledTimes(2);
        },
    );

    test.each(['scope', 'lease'] as const)(
        'rejects test-and-compile bypass before %s construction when resolution is enabled',
        async (entry) => {
            const { factory, projectModel } = buildFixture();
            const ref = {
                kind: 'bypass',
                mode: 'test_and_compile',
                projectUuid: null,
                credentials,
            } as const;
            const action =
                entry === 'scope'
                    ? factory.withWarehouseClient(
                          ref,
                          contextFor(null, 'compile'),
                          async () => undefined,
                      )
                    : factory.acquireWarehouseConnection(
                          ref,
                          contextFor(null, 'compile'),
                      );
            await expect(action).rejects.toThrow(UnexpectedServerError);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).not.toHaveBeenCalled();
            expect(SshTunnel).not.toHaveBeenCalled();
        },
    );

    test('warns once when test-and-compile credential resolution is disabled', async () => {
        const { factory, logger } = buildFixture(true, true, true, false);
        await Promise.all(
            [0, 1].map(async () => {
                const lease = await factory.acquireWarehouseConnection(
                    {
                        kind: 'bypass',
                        mode: 'test_and_compile',
                        projectUuid: null,
                        credentials,
                    },
                    contextFor(null, 'compile'),
                );
                await lease.release();
            }),
        );
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            'Test-and-compile credential resolution is disabled; using stored credentials without refresh',
        );
    });

    test.each([null, 'project-uuid'])(
        'compile lease for %s preserves tunnel probing without resolution or cache',
        async (projectUuid) => {
            const { factory, projectModel, credentialSource } = buildFixture();
            const tunnelOptions = { staticIp: '192.0.2.1', probeForward: true };
            const lease = await factory.acquireWarehouseConnection(
                { kind: 'compile', projectUuid, credentials, tunnelOptions },
                contextFor(null, 'compile'),
            );
            expect(SshTunnel).toHaveBeenCalledExactlyOnceWith(
                credentials,
                tunnelOptions,
            );
            expect(credentialSource.loadBase).not.toHaveBeenCalled();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                credentials,
                expect.objectContaining({ maxOpenConnections: undefined }),
            );
            expect(factory.warehouseClients).toEqual({});
            await lease.release();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test('rejects webhook bypass before construction when resolution is enabled', async () => {
        const { factory, projectModel, credentialSource } = buildFixture();
        const callback = vi.fn();
        await expect(
            factory.withWarehouseClient(
                {
                    kind: 'bypass',
                    mode: 'dbt_cloud_preview_webhook',
                    projectUuid: 'project-uuid',
                    credentials,
                },
                contextFor(),
                callback,
            ),
        ).rejects.toThrow(UnexpectedServerError);
        expect(callback).not.toHaveBeenCalled();
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).not.toHaveBeenCalled();
        expect(SshTunnel).not.toHaveBeenCalled();
        expect(credentialSource.loadBase).not.toHaveBeenCalled();
    });

    test.each([
        compileRef(),
        {
            kind: 'bypass',
            mode: 'dbt_cloud_preview_webhook',
            projectUuid: null,
            credentials,
        },
        {
            kind: 'bypass',
            mode: 'timezone_preview',
            projectUuid: 'project-uuid',
            credentials,
        },
        {
            kind: 'bypass',
            mode: 'connection_test',
            projectUuid: 'project-uuid',
            credentials,
        },
        {
            kind: 'bypass',
            mode: 'test_and_compile',
            projectUuid: null,
            credentials,
        },
        {
            kind: 'bypass',
            mode: 'connection_test',
            projectUuid: null,
            credentials,
        },
    ] satisfies WarehouseClientRef[])(
        '$kind refs skip credential resolution and AI planning',
        async (ref) => {
            const { factory, credentialSource, aiAccessService, logger } =
                buildFixture(true, false, false, false);
            await factory.withWarehouseClient(
                ref,
                contextFor(QueryExecutionContext.AI),
                async (connection) => {
                    expect(connection.aiPlan).toBeNull();
                    expect(connection.warehouseConnectionUuid).toBeNull();
                    expect(connection.connectionRoute).toBeNull();
                    expect(connection.credentialKind).toBe(
                        ref.kind === 'compile'
                            ? WarehouseCredentialKind.COMPILE
                            : WarehouseCredentialKind.SHARED,
                    );
                },
            );
            expect(credentialSource.loadBase).not.toHaveBeenCalled();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
            if (ref.kind === 'bypass')
                expect(logger.debug).toHaveBeenCalledWith(
                    `Warehouse client credential bypass: ${ref.mode}`,
                );
        },
    );

    test.each([
        'dbt_cloud_preview_webhook',
        'timezone_preview',
        'connection_test',
        'test_and_compile',
    ] as const)(
        '%s bypass calls build fresh clients without populating the cache',
        async (mode) => {
            const { factory, projectModel } = buildFixture(
                true,
                false,
                false,
                false,
            );
            const ref = {
                kind: 'bypass',
                mode,
                projectUuid: 'project-uuid',
                credentials,
            } satisfies WarehouseClientRef;
            const first = await factory.withWarehouseClient(
                ref,
                contextFor(),
                async ({ warehouseClient }) => warehouseClient,
            );
            const second = await factory.withWarehouseClient(
                ref,
                contextFor(),
                async ({ warehouseClient }) => warehouseClient,
            );
            expect(second).not.toBe(first);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            expect(factory.warehouseClients).toEqual({});
            expect(disconnect).toHaveBeenCalledTimes(2);
        },
    );

    test('bypass calls do not read or replace an existing query client', async () => {
        const { factory, projectModel } = buildFixture(true, true, false);
        const cached = await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async ({ warehouseClient }) => warehouseClient,
        );
        const bypass = await factory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'timezone_preview',
                projectUuid: 'project-uuid',
                credentials,
            },
            contextFor(),
            async ({ warehouseClient }) => warehouseClient,
        );
        expect(bypass).not.toBe(cached);
        expect(factory.warehouseClients).toEqual({
            [JSON.stringify([
                false,
                'project-uuid',
                null,
                null,
                null,
                null,
                null,
            ])]: cached,
        });
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
    });

    test('passes connection-test tunnel options through', async () => {
        const { factory } = buildFixture();
        const tunnelOptions = { staticIp: '192.0.2.1', probeForward: true };
        await factory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'connection_test',
                projectUuid: null,
                credentials: sshCredentials[0],
                tunnelOptions,
            },
            contextFor(),
            async () => undefined,
        );
        expect(SshTunnel).toHaveBeenCalledWith(
            sshCredentials[0],
            tunnelOptions,
        );
    });

    test.each([undefined, 'personal-uuid'])(
        'maps personal credential %s',
        async (userWarehouseCredentialsUuid) => {
            const { factory, credentialSource } = buildFixture();
            credentialSource.finish.mockResolvedValue({
                ...credentials,
                userWarehouseCredentialsUuid,
            });
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(),
                async (connection) => {
                    expect(connection.credentialKind).toBe(
                        userWarehouseCredentialsUuid
                            ? WarehouseCredentialKind.PERSONAL
                            : WarehouseCredentialKind.SHARED,
                    );
                },
            );
        },
    );

    test('compile purpose takes precedence over an AI credential kind', async () => {
        const { factory, aiAccessService } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(plan);
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI, 'compile'),
            async (connection) => {
                expect(connection.credentialKind).toBe(
                    WarehouseCredentialKind.COMPILE,
                );
            },
        );
    });
    test('uses the organization from context for a web-identity connection without a project', async () => {
        const { factory, projectModel } = buildFixture();
        const awsCredentials = async () => ({
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
        });
        projectModel.getWarehouseClientIdentityOptions.mockResolvedValue({
            awsCredentials,
        });
        const athenaCredentials: CreateWarehouseCredentials = {
            type: WarehouseTypes.ATHENA,
            authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
            region: 'us-east-1',
            database: 'analytics',
            schema: 'public',
            s3StagingDir: 's3://staging/',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/warehouse',
            webIdentityAudience: 'audience',
        };
        await factory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'connection_test',
                projectUuid: null,
                credentials: athenaCredentials,
            },
            contextFor(),
            async () => undefined,
        );
        expect(
            projectModel.getWarehouseClientIdentityOptions,
        ).toHaveBeenCalledExactlyOnceWith(athenaCredentials, 'org-uuid');
        expect(projectModel.getSummary).not.toHaveBeenCalled();
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            athenaCredentials,
            expect.objectContaining({ awsCredentials }),
        );
    });

    test('keeps the marked-person compile early return unchanged on extra connections', async () => {
        const { factory, aiAccessService, credentialSource, base } =
            buildFixture();
        const extraBase: WarehouseCredentialBase = {
            ...base,
            kind: 'extra',
            project: {
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                connectionMode: 'multi',
                originalWarehouseType: WarehouseTypes.POSTGRES,
            },
            warehouseConnectionUuid: 'extra-uuid',
        };
        aiAccessService.resolvePlan.mockResolvedValue(markedPlan);
        const resolved = await factory.resolveLoadedCredentials(
            extraBase,
            contextFor(QueryExecutionContext.AI, 'compile'),
        );
        expect(resolved).toStrictEqual({
            ...credentials,
            userWarehouseCredentialsUuid: undefined,
        });
        expect(credentialSource.finish).toHaveBeenCalledOnce();
    });
    const compileGroup = {
        listedDatabases: {
            listAllDatabases: false,
            additionalDatabases: ['extra'],
        },
        onSkippedDatabase: vi.fn(),
    };

    test('compile groups construct the Postgres wrapper with the tunneled credentials', async () => {
        const { factory, projectModel } = buildFixture();
        const tunneled = {
            ...credentials,
            host: '127.0.0.1',
            port: 43210,
            useSshTunnel: true,
        };
        connect.mockResolvedValueOnce(tunneled);
        await factory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: { ...credentials, useSshTunnel: true },
                compileGroup,
            },
            contextFor(null, 'compile'),
            async ({ warehouseClient }) => {
                expect(warehouseClient).toBeInstanceOf(
                    ListedDatabasesPostgresWarehouseClient,
                );
                expect(warehouseClient.credentials).toEqual(tunneled);
            },
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).not.toHaveBeenCalled();
        expect(factory.warehouseClients).toEqual({});
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test('other compile groups use the normal client with the prior connection limit', async () => {
        const { factory, projectModel } = buildFixture();
        const redshift = {
            ...credentials,
            type: WarehouseTypes.REDSHIFT,
            authenticationType: RedshiftAuthenticationType.PASSWORD,
        } as const;
        await factory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: redshift,
                compileGroup,
            },
            contextFor(null, 'compile'),
            async ({ warehouseClient }) => {
                expect(warehouseClient).not.toBeInstanceOf(
                    ListedDatabasesPostgresWarehouseClient,
                );
                expect(warehouseClient.credentials).toEqual(redshift);
            },
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            redshift,
            expect.objectContaining({
                maxOpenConnections: undefined,
                agentSession: false,
            }),
        );
    });

    test('derived clients share the tunnel and never enter the cache', async () => {
        const { factory, projectModel } = buildFixture();
        const tunneled = {
            ...credentials,
            host: '127.0.0.1',
            port: 43210,
            useSshTunnel: true,
        };
        connect.mockResolvedValueOnce(tunneled);
        await factory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: { ...credentials, useSshTunnel: true },
            },
            contextFor(null, 'compile'),
            async (connection) => {
                const derivedCredentials = {
                    ...tunneled,
                    schema: 'source_schema',
                };
                const first = connection.deriveClient(derivedCredentials);
                const second = connection.deriveClient(derivedCredentials);
                expect(first).not.toBe(second);
                expect(first.credentials).toEqual({
                    ...tunneled,
                    schema: 'source_schema',
                });
                expect(first.credentials).not.toBe(derivedCredentials);
                expect(
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[1][1],
                ).toEqual(
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[0][1],
                );
                expect(SshTunnel).toHaveBeenCalledOnce();
                expect(connect).toHaveBeenCalledOnce();
                expect(disconnect).not.toHaveBeenCalled();
            },
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(3);
        expect(factory.warehouseClients).toEqual({});
        expect(disconnect).toHaveBeenCalledOnce();
    });

    test.each([{ host: 'other-host' }, { port: 5433 }])(
        'derived clients reject a changed tunnel address %j',
        async (changed) => {
            const { factory, projectModel } = buildFixture();
            await factory.withWarehouseClient(
                {
                    kind: 'compile',
                    projectUuid: 'project-uuid',
                    credentials: { ...credentials, useSshTunnel: true },
                },
                contextFor(null, 'compile'),
                async (connection) => {
                    expect(() =>
                        connection.deriveClient({ ...credentials, ...changed }),
                    ).toThrow(UnexpectedServerError);
                    expect(
                        projectModel.getWarehouseClientFromCredentials,
                    ).toHaveBeenCalledOnce();
                },
            );
        },
    );

    test('derived clients reject another warehouse type and can wrap a compile group', async () => {
        const { factory } = buildFixture();
        await factory.withWarehouseClient(
            { kind: 'compile', projectUuid: 'project-uuid', credentials },
            contextFor(null, 'compile'),
            async (connection) => {
                expect(() =>
                    connection.deriveClient({
                        ...credentials,
                        type: WarehouseTypes.REDSHIFT,
                        authenticationType: RedshiftAuthenticationType.PASSWORD,
                    }),
                ).toThrow(UnexpectedServerError);
                expect(
                    connection.deriveClient(credentials, { compileGroup }),
                ).toBeInstanceOf(ListedDatabasesPostgresWarehouseClient);
            },
        );
    });

    test('derived clients retain AWS identity options without resolving again', async () => {
        const { factory, projectModel } = buildFixture(true, true, true, false);
        const awsCredentials = async () => ({
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
        });
        projectModel.getWarehouseClientIdentityOptions.mockResolvedValue({
            awsCredentials,
        });
        const athena: CreateWarehouseCredentials = {
            type: WarehouseTypes.ATHENA,
            authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
            region: 'us-east-1',
            database: 'analytics',
            schema: 'public',
            s3StagingDir: 's3://staging/',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/warehouse',
            webIdentityAudience: 'audience',
        };
        await factory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'test_and_compile',
                projectUuid: null,
                credentials: athena,
            },
            contextFor(null, 'compile'),
            async (connection) => {
                connection.deriveClient({ ...athena, schema: 'source_schema' });
                expect(
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[1][1],
                ).toEqual(
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[0][1],
                );
            },
        );
        expect(
            projectModel.getWarehouseClientIdentityOptions,
        ).toHaveBeenCalledExactlyOnceWith(athena, 'org-uuid');
    });

    test('derived clients retain the agent session from a cached scope', async () => {
        const { factory, projectModel } = buildFixture();
        const ref = {
            kind: 'resolved',
            projectUuid: 'project-uuid',
            credentials,
            aiPlan: null,
            warehouseConnectionUuid: null,
            connectionRoute: null,
        } as const;
        await factory.withWarehouseClient(
            ref,
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        const acquire = vi.spyOn(factory, 'acquireUnscoped');
        await factory.withWarehouseClient(
            ref,
            contextFor(QueryExecutionContext.AI),
            async (connection) => {
                const derived = connection.deriveClient(credentials);
                expect(derived).not.toBe(connection.warehouseClient);
            },
        );
        expect(acquire).toHaveBeenCalledOnce();
        expect(
            factory.warehouseClients[
                JSON.stringify([
                    true,
                    'project-uuid',
                    null,
                    null,
                    null,
                    null,
                    null,
                ])
            ],
        ).toBeDefined();
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[1][1],
        ).toEqual(
            projectModel.getWarehouseClientFromCredentials.mock.calls[0][1],
        );
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[1][1]
                ?.agentSession,
        ).toBe(true);
    });

    test.each([true, false])(
        'lease release is idempotent with scoped release %s',
        async (enabled) => {
            const { factory } = buildFixture(enabled, true, true, false);
            const lease = await factory.acquireWarehouseConnection(
                {
                    kind: 'bypass',
                    mode: 'test_and_compile',
                    projectUuid: null,
                    credentials,
                },
                contextFor(null, 'compile'),
            );
            expect(disconnect).not.toHaveBeenCalled();
            await Promise.all([lease.release(), lease.release()]);
            await lease.release();
            expect(disconnect).toHaveBeenCalledTimes(enabled ? 1 : 0);
        },
    );

    test.each([true, false])(
        'failed lease acquisition releases with scoped release %s',
        async (enabled) => {
            const { factory, projectModel } = buildFixture(enabled);
            projectModel.getWarehouseClientFromCredentials.mockImplementationOnce(
                () => {
                    throw new Error('construction failed');
                },
            );
            await expect(
                factory.acquireWarehouseConnection(
                    {
                        kind: 'compile',
                        projectUuid: 'project-uuid',
                        credentials,
                    },
                    contextFor(null, 'compile'),
                ),
            ).rejects.toThrow('construction failed');
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test('lease acquisition accepts only compile and test-and-compile refs', () => {
        type LeaseRef = Parameters<
            WarehouseClientFactory['acquireWarehouseConnection']
        >[0];
        expectTypeOf<LeaseRef>().toEqualTypeOf<WarehouseConnectionLeaseRef>();
        expectTypeOf<
            Extract<WarehouseClientRef, { kind: 'binding' }>
        >().not.toExtend<LeaseRef>();
        expectTypeOf<
            Extract<WarehouseClientRef, { kind: 'resolved' }>
        >().not.toExtend<LeaseRef>();
        expectTypeOf<
            Extract<WarehouseClientRef, { kind: 'bypass' }> & {
                mode: 'connection_test';
            }
        >().not.toExtend<LeaseRef>();
        expectTypeOf<
            Extract<WarehouseClientRef, { kind: 'compile' }>
        >().toExtend<LeaseRef>();
    });

    test('compile clients keep their default connection limit and skip the cache', async () => {
        const { factory, projectModel } = buildFixture();
        const query = await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async ({ warehouseClient }) => warehouseClient,
        );
        const compiled = await factory.withWarehouseClient(
            compileRef(),
            contextFor(null, 'compile'),
            async ({ warehouseClient }) => warehouseClient,
        );
        const compiledAgain = await factory.withWarehouseClient(
            compileRef(),
            contextFor(null, 'compile'),
            async ({ warehouseClient }) => warehouseClient,
        );
        expect(compiled).not.toBe(query);
        expect(compiledAgain).not.toBe(compiled);
        expect(factory.warehouseClients).toEqual({
            [JSON.stringify([
                false,
                'project-uuid',
                null,
                null,
                null,
                null,
                null,
            ])]: query,
        });
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[0][1],
        ).not.toHaveProperty('maxOpenConnections');
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[1][1],
        ).toHaveProperty('maxOpenConnections', undefined);
    });
    test.each([true, false])(
        'a failed lease tunnel connection releases with scoped release %s',
        async (enabled) => {
            const { factory } = buildFixture(enabled, true, true, false);
            connect.mockRejectedValueOnce(
                new Error('tunnel connection failed'),
            );
            await expect(
                factory.acquireWarehouseConnection(
                    {
                        kind: 'bypass',
                        mode: 'test_and_compile',
                        projectUuid: null,
                        credentials: { ...credentials, useSshTunnel: true },
                    },
                    contextFor(null, 'compile'),
                ),
            ).rejects.toThrow('tunnel connection failed');
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test('a failed lease release is not retried by another release call', async () => {
        const { factory } = buildFixture();
        const lease = await factory.acquireWarehouseConnection(
            { kind: 'compile', projectUuid: 'project-uuid', credentials },
            contextFor(null, 'compile'),
        );
        disconnect.mockRejectedValueOnce(new Error('release failed'));
        await expect(lease.release()).rejects.toThrow('release failed');
        await expect(lease.release()).rejects.toThrow('release failed');
        expect(disconnect).toHaveBeenCalledOnce();
    });
});

describe('AI service account factory scopes', () => {
    const slotPlan: Extract<
        AiExecutionPlan,
        { identity: 'ai_service_account' }
    > = {
        identity: 'ai_service_account',
        identityUuid: 'generation-a',
        credentialUuid: 'slot-row',
        credentials: {
            type: WarehouseTypes.BIGQUERY,
            project: 'warehouse-project',
            dataset: 'dataset',
            timeoutSeconds: 0,
            priority: 'interactive',
            retries: 0,
            location: 'EU',
            maximumBytesBilled: 0,
            keyfileContents: {
                type: 'service_account',
                private_key: 'saved-key',
                client_email: 'agent@example.com',
            },
        },
        assurances: [{ kind: 'result_cache_off' }],
        audit: {
            actorKind: 'person',
            personUuid: 'user-uuid',
            userUuid: 'user-uuid',
            principalRef: 'slot-row',
            queryTags: { agent: 'true' },
        },
    };

    test.each([null, markedPlan, slotPlan])(
        'sets BigQuery agent job controls only for a resolved plan: %j',
        async (aiPlan) => {
            const {
                factory,
                projectModel,
                credentialSource,
                aiAccessService,
                base,
            } = buildFixture();
            credentialSource.loadBase.mockResolvedValue({
                ...base,
                credentials: slotPlan.credentials,
            });
            credentialSource.finish.mockResolvedValue({
                ...slotPlan.credentials,
                userWarehouseCredentialsUuid: undefined,
            });
            aiAccessService.resolvePlan.mockResolvedValue(aiPlan);
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async () => undefined,
            );
            expect(aiAccessService.resolvePlan).toHaveBeenCalledOnce();
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.objectContaining(slotPlan.credentials),
                expect.objectContaining({
                    agentSession: true,
                    agentJobControls: aiPlan !== null,
                }),
            );
        },
    );

    test('uses slot credentials before finishing and identifies their kind', async () => {
        const { factory, credentialSource, aiAccessService } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
        credentialSource.finish.mockRejectedValue(
            new Error('must not refresh shared credentials'),
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (connection) => {
                expect(connection.warehouseCredentials).toEqual({
                    ...slotPlan.credentials,
                    userWarehouseCredentialsUuid: undefined,
                });
                expect(connection.credentialKind).toBe(
                    WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
                );
                expect(connection.aiPlan).toBe(slotPlan);
            },
        );
        expect(credentialSource.finish).not.toHaveBeenCalled();
    });

    test('separates ordinary, marked, agent sign-in, slot generations and connections even with equal credentials', async () => {
        const { factory, projectModel } = buildFixture();
        const identities = [
            null,
            {
                ...markedPlan,
                audit: {
                    ...markedPlan.audit,
                    personUuid: slotPlan.identityUuid,
                },
            },
            { ...plan, identityUuid: slotPlan.identityUuid },
            slotPlan,
            { ...slotPlan, identityUuid: 'generation-b' },
        ];
        const clients = await Promise.all(
            identities.map((aiPlan) => {
                const ref: Extract<WarehouseClientRef, { kind: 'resolved' }> = {
                    kind: 'resolved',
                    projectUuid: 'project-uuid',
                    credentials: slotPlan.credentials,
                    aiPlan,
                    warehouseConnectionUuid: null,
                    connectionRoute: null,
                };
                return factory.withWarehouseClient(
                    ref,
                    contextFor(QueryExecutionContext.AI),
                    async ({ warehouseClient }) => warehouseClient,
                );
            }),
        );
        expect(new Set(clients).size).toBe(5);
        const ref: Extract<WarehouseClientRef, { kind: 'resolved' }> = {
            kind: 'resolved',
            projectUuid: 'project-uuid',
            credentials: slotPlan.credentials,
            aiPlan: slotPlan,
            warehouseConnectionUuid: null,
            connectionRoute: null,
        };
        const again = await factory.withWarehouseClient(
            {
                ...ref,
                aiPlan: {
                    ...slotPlan,
                    audit: {
                        ...slotPlan.audit,
                        personUuid: 'other',
                        userUuid: 'other',
                    },
                },
            },
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => warehouseClient,
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(5);
        expect(again.credentials).toEqual(clients[3].credentials);
        await factory.withWarehouseClient(
            { ...ref, warehouseConnectionUuid: 'extra' },
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(6);
    });

    test.each([
        [ConnectionSurface.IN_APP_AGENT, QuerySurface.APP],
        [ConnectionSurface.MCP, QuerySurface.MCP],
    ] as const)(
        'runtime slot refusal on %s emits one event with main properties',
        async (surface, expectedSurface) => {
            const { factory, aiAccessService, projectModel, analytics } =
                buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi
                        .fn()
                        .mockRejectedValue(new Error('invalid_grant')),
                }),
            );
            const context = connectionContextFromUser(
                {
                    userUuid: 'user-uuid',
                    isRegisteredUser: true,
                    isServiceAccount: false,
                },
                {
                    organizationUuid: 'org-uuid',
                    queryContext: QueryExecutionContext.AI,
                    surface,
                },
            );
            await factory.withWarehouseClient(
                {
                    kind: 'resolved',
                    projectUuid: 'project-uuid',
                    credentials: slotPlan.credentials,
                    aiPlan: slotPlan,
                    warehouseConnectionUuid: 'extra',
                    connectionRoute: null,
                },
                context,
                async ({ warehouseClient, deriveClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                    await expect(
                        deriveClient(slotPlan.credentials).runQuery(
                            'SELECT 1',
                            {},
                        ),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                },
            );
            expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                event: 'query.refused',
                userId: 'user-uuid',
                properties: {
                    organizationId: 'org-uuid',
                    projectId: 'project-uuid',
                    userId: 'user-uuid',
                    warehouseConnectionId: 'extra',
                    surface: expectedSurface,
                    actor: {
                        surface,
                        clientId:
                            surface === ConnectionSurface.IN_APP_AGENT
                                ? 'lightdash-chat'
                                : null,
                    },
                    warehouseType: WarehouseTypes.BIGQUERY,
                    reason: 'ai_service_account_invalid',
                },
            });
        },
    );

    test.each(['compile', 'diagnostic'] as const)(
        'runtime slot refusal is silent for %s evaluation',
        async (kind) => {
            const { factory, aiAccessService, projectModel, analytics } =
                buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi
                        .fn()
                        .mockRejectedValue(new Error('invalid_grant')),
                }),
            );
            const context = {
                ...contextFor(QueryExecutionContext.AI),
                ...(kind === 'compile'
                    ? { purpose: 'compile' as const }
                    : { aiAccess: 'diagnostic' as const }),
            };
            await factory.withWarehouseClient(
                bindingRef,
                context,
                async ({ warehouseClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                },
            );
            expect(analytics.track).not.toHaveBeenCalled();
        },
    );

    test.each([
        new Error('invalid_grant'),
        new Error('Invalid JWT signature.'),
        Object.assign(new Error('unauthenticated'), { code: 401 }),
    ])(
        'attributes runtime authentication errors once per scope: %s',
        async (error) => {
            const { factory, aiAccessService, projectModel } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi.fn().mockRejectedValue(error),
                    streamQuery: vi.fn().mockRejectedValue(error),
                }),
            );
            const context = contextFor(QueryExecutionContext.AI);
            await factory.withWarehouseClient(
                bindingRef,
                context,
                async ({ warehouseClient, deriveClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toMatchObject({
                        refusal: {
                            reason: 'ai_service_account_invalid',
                            action: 'ask_admin',
                            settingsUrl: '/generalSettings/agentIdentity',
                            connectUrl: null,
                        },
                    });
                    await expect(
                        warehouseClient.streamQuery('SELECT 1', vi.fn(), {
                            tags: {},
                        }),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                    await expect(
                        deriveClient(slotPlan.credentials).runQuery(
                            'SELECT 1',
                            {},
                        ),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                },
            );
            expect(
                aiAccessService.trackQueryRefusal,
            ).toHaveBeenCalledExactlyOnceWith(
                {
                    agentActor: {
                        surface: 'in_app_agent',
                        clientId: 'lightdash-chat',
                    },
                    organizationUuid: 'org-uuid',
                    projectUuid: 'project-uuid',
                    userUuid: 'user-uuid',
                    warehouseConnectionUuid: null,
                    evaluation: { kind: 'query', surface: QuerySurface.APP },
                    isRegisteredUser: true,
                    isServiceAccount: false,
                    warehouseType: WarehouseTypes.BIGQUERY,
                },
                'ai_service_account_invalid',
            );
            expect(
                JSON.stringify(aiAccessService.trackQueryRefusal.mock.calls),
            ).not.toMatch(/saved-key|agent@example.com|keyfileContents|SELECT/);
            await factory.withWarehouseClient(
                bindingRef,
                context,
                async ({ warehouseClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                },
            );
            expect(aiAccessService.trackQueryRefusal).toHaveBeenCalledTimes(2);
        },
    );

    test.each([
        new Error('Permission denied on dataset'),
        Object.assign(new Error('Access denied'), { code: 403 }),
        new Error('ECONNRESET'),
        new Error('Syntax error: unexpected token'),
    ])(
        'preserves non-authentication failures without refusal analytics: %s',
        async (error) => {
            const { factory, aiAccessService, projectModel } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi.fn().mockRejectedValue(error),
                }),
            );
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toBe(error);
                },
            );
            expect(aiAccessService.trackQueryRefusal).not.toHaveBeenCalled();
        },
    );

    test('attributes the real BigQuery client invalid_grant translation', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
        const originalError = Object.assign(new Error('invalid_grant'), {
            response: {
                status: 400,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid JWT Signature.',
                },
            },
        });
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            (creds, options) => {
                if (creds.type !== WarehouseTypes.BIGQUERY)
                    throw new Error('Expected BigQuery');
                const client = new BigqueryWarehouseClient(creds, options);
                client.client.createQueryJob = vi
                    .fn()
                    .mockRejectedValue(originalError);
                return client;
            },
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => {
                await expect(
                    warehouseClient.runQuery('SELECT 1', {}),
                ).rejects.toMatchObject({
                    refusal: { reason: 'ai_service_account_invalid' },
                });
            },
        );
        expect(aiAccessService.trackQueryRefusal).toHaveBeenCalledOnce();
    });

    test('preserves real BigQuery SQL errors that mention an authentication phrase', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            (creds, options) => {
                if (creds.type !== WarehouseTypes.BIGQUERY)
                    throw new Error('Expected BigQuery');
                const client = new BigqueryWarehouseClient(creds, options);
                client.client.createQueryJob = vi.fn().mockRejectedValue({
                    errors: [
                        {
                            reason: 'invalidQuery',
                            location: 'query',
                            message:
                                'Syntax error: Unexpected identifier invalid JWT signature at [1:3]',
                        },
                    ],
                });
                return client;
            },
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => {
                await expect(
                    warehouseClient.runQuery('SELECT 1', {}),
                ).rejects.toThrow(
                    'Syntax error: Unexpected identifier invalid JWT signature',
                );
            },
        );
        expect(aiAccessService.trackQueryRefusal).not.toHaveBeenCalled();
    });

    test('attributes slot construction failures and never replays with ordinary credentials', async () => {
        const { factory, aiAccessService, projectModel, credentialSource } =
            buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            () => {
                throw new Error('Invalid JWT signature.');
            },
        );
        await expect(
            factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async () => undefined,
            ),
        ).rejects.toMatchObject({
            refusal: { reason: 'ai_service_account_invalid' },
        });
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledOnce();
        expect(credentialSource.finish).not.toHaveBeenCalled();
        expect(aiAccessService.trackQueryRefusal).toHaveBeenCalledOnce();
    });

    test.each([false, true])(
        'runtime refusal has a null analytics actor for serviceAccount=%s',
        async (isServiceAccount) => {
            const { factory, aiAccessService, projectModel } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi
                        .fn()
                        .mockRejectedValue(new Error('invalid_grant')),
                }),
            );
            const context = connectionContextFromUser(
                {
                    userUuid: 'external',
                    isServiceAccount,
                    isRegisteredUser: false,
                },
                {
                    organizationUuid: 'org-uuid',
                    queryContext: QueryExecutionContext.AI,
                },
            );
            await factory.withWarehouseClient(
                bindingRef,
                context,
                async ({ warehouseClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toMatchObject({
                        refusal: { reason: 'ai_service_account_invalid' },
                    });
                },
            );
            expect(
                aiAccessService.trackQueryRefusal.mock.calls[0][0],
            ).toMatchObject({
                userUuid: 'external',
                isRegisteredUser: false,
                isServiceAccount,
            });
        },
    );
});

describe('factory cache tuple and agent probes', () => {
    test('does not collide project and compute override boundaries', async () => {
        const { factory, projectModel } = buildFixture();
        const first = await factory.acquireUnscoped('project-a', credentials, {
            snowflakeVirtualWarehouse: 'bc',
        });
        const second = await factory.acquireUnscoped(
            'project-ab',
            credentials,
            { snowflakeVirtualWarehouse: 'c' },
        );
        expect(first.warehouseClient).not.toBe(second.warehouseClient);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        await first.sshTunnel.disconnect();
        await second.sshTunnel.disconnect();
    });

    test('a slot probe sets agentSession without resolving a rule or caching the client', async () => {
        const { factory, projectModel, aiAccessService } = buildFixture();
        await factory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'connection_test',
                projectUuid: 'project-uuid',
                credentials,
                agentSession: true,
            },
            contextFor(),
            async () => undefined,
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            credentials,
            expect.objectContaining({ agentSession: true }),
        );
        expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
        expect(aiAccessService.trackQueryRefusal).not.toHaveBeenCalled();
        expect(factory.warehouseClients).toEqual({});
    });
});

describe('agent client cache lifetime', () => {
    test('a released warm client survives an hour but a fresh binding checks its plan again', async () => {
        vi.useFakeTimers();
        try {
            const { factory, aiAccessService, projectModel } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(plan);
            const first = await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => warehouseClient,
            );
            vi.advanceTimersByTime(60 * 60 * 1000);
            const second = await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => warehouseClient,
            );
            expect(second).toBe(first);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledOnce();
            expect(aiAccessService.resolvePlan).toHaveBeenCalledTimes(2);
            expect(disconnect).toHaveBeenCalledTimes(2);
            aiAccessService.resolvePlan.mockRejectedValue(
                new Error('identity removed'),
            );
            const query = vi.fn(async () => {});
            await expect(
                factory.withWarehouseClient(
                    bindingRef,
                    contextFor(QueryExecutionContext.AI),
                    query,
                ),
            ).rejects.toThrow('identity removed');
            expect(query).not.toHaveBeenCalled();
            expect(Object.values(factory.warehouseClients)).toContain(first);
        } finally {
            vi.useRealTimers();
        }
    });

    test('a new identity generation uses a new cache slot even with identical credentials', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(plan);
        const first = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => warehouseClient,
        );
        aiAccessService.resolvePlan.mockResolvedValue({
            ...plan,
            identityUuid: 'next-generation',
        });
        const second = await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => warehouseClient,
        );
        expect(second).not.toBe(first);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(Object.keys(factory.warehouseClients)).toHaveLength(2);
    });

    test('changed secrets under the same generation replace a client through credential equality', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(plan);
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async () => {},
        );
        aiAccessService.resolvePlan.mockResolvedValue({
            ...plan,
            credentials: { ...credentials, password: 'replacement' },
        });
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async () => {},
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(Object.keys(factory.warehouseClients)).toHaveLength(1);
    });
});

describe('Snowflake revocation with a warm agent client', () => {
    afterEach(() => vi.restoreAllMocks());

    test.each([
        ['disconnect', AiAccessRefusalReason.NEEDS_SIGN_IN],
        ['refresh', AiAccessRefusalReason.SIGN_IN_EXPIRED],
        ['probe', AiAccessRefusalReason.PRINCIPAL_FAILED],
    ] as const)(
        'refuses the next binding after %s without running its callback',
        async (failure, reason) => {
            const {
                factory,
                aiAccessService: resolver,
                credentialSource,
                base,
                projectModel,
            } = buildFixture();
            const connection: CreateSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'person',
                password: 'test',
                database: 'test',
                warehouse: 'test',
                schema: 'public',
            };
            const model = {
                findAiCredentialWithSecrets: vi
                    .fn<
                        () => Promise<
                            UserWarehouseCredentialsWithSecrets | undefined
                        >
                    >()
                    .mockResolvedValue({
                        uuid: 'agent-credential',
                        expiresAt: null,
                        credentials: {
                            type: WarehouseTypes.SNOWFLAKE,
                            authenticationType: SnowflakeAuthenticationType.SSO,
                            user: 'person',
                            refreshToken: 'refresh-token',
                        },
                    }),
                rotateRefreshToken: vi.fn(),
            };
            const config = {
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    snowflakeAi: {
                        ...lightdashConfigMock.auth.snowflakeAi,
                        clientId: 'client',
                        clientSecret: 'secret',
                        authorizationEndpoint:
                            'https://snowflake.example.test/authorize',
                        tokenEndpoint: 'https://snowflake.example.test/token',
                        account: 'test-account',
                    },
                },
            };
            const provider = new SnowflakeAiCredentialProvider({
                lightdashConfig: config,
                userWarehouseCredentialsModel: model,
            } as unknown as ConstructorParameters<
                typeof SnowflakeAiCredentialProvider
            >[0]);
            const aiAccessService = new AiAccessService({
                lightdashConfig: config,
                analytics: { track: vi.fn() },
                featureFlagModel: {
                    get: vi.fn(async () => ({ enabled: true })),
                },
                organizationAgentIdentityRulesModel: {
                    get: vi.fn(async () => ({ source: 'agent_sign_in' })),
                },
                userModel: {
                    getUserDetailsByUuid: vi.fn(async () => ({
                        email: 'person@example.test',
                    })),
                },
                providerRegistry: () => provider,
            } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
            resolver.resolvePlan.mockImplementation(
                aiAccessService.resolvePlan.bind(aiAccessService),
            );
            credentialSource.loadBase.mockResolvedValue({
                ...base,
                credentials: connection,
            });
            const refreshToken = vi
                .spyOn(refresh, 'requestNewAccessToken')
                .mockImplementation((_strategy, _token, callback) => {
                    callback(null, 'access-token', 'refresh-token', {});
                });
            vi.mocked(checkSnowflakeAgentSessionWithToken).mockResolvedValue({
                agentActivated: true,
                currentRole: 'role',
                activeRestrictedSessionScopes: 'scope',
            });
            const first = await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => warehouseClient,
            );
            const second = await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => warehouseClient,
            );
            expect(second).toBe(first);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledOnce();
            if (failure === 'disconnect')
                model.findAiCredentialWithSecrets.mockResolvedValue(undefined);
            else if (failure === 'refresh')
                refreshToken.mockImplementation(
                    (_strategy, _token, callback) => {
                        callback(
                            {
                                statusCode: 400,
                                data: '{"error":"invalid_grant"}',
                            },
                            '',
                            '',
                            {},
                        );
                    },
                );
            else
                vi.mocked(
                    checkSnowflakeAgentSessionWithToken,
                ).mockRejectedValue(new Error('invalid access token'));
            const query = vi.fn();
            await expect(
                factory.withWarehouseClient(
                    bindingRef,
                    contextFor(QueryExecutionContext.AI),
                    query,
                ),
            ).rejects.toMatchObject({ refusal: { reason } });
            expect(query).not.toHaveBeenCalled();
            expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(
                failure === 'refresh' ? 6 : 3,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledOnce();
        },
    );
});

describe('BigQuery SSO runtime hydration', () => {
    it('hydrates a secret-free selected personal credential with the configured secret', async () => {
        connect.mockImplementation(async (value) => value);
        const { factory, credentialSource, projectModel, base } =
            buildFixture();
        const personal = {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.SSO,
            project: 'analytics',
            dataset: 'prod',
            timeoutSeconds: undefined,
            priority: undefined,
            retries: undefined,
            location: undefined,
            maximumBytesBilled: undefined,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'saved-id',
                refresh_token: 'personal-refresh',
            },
            userWarehouseCredentialsUuid: 'personal-uuid',
        } satisfies Awaited<ReturnType<WarehouseCredentialSource['finish']>>;
        base.credentials = { ...personal, keyfileContents: {} };
        credentialSource.finish.mockResolvedValue(personal);
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[0][0],
        ).toHaveProperty(
            'keyfileContents.client_secret',
            lightdashConfigMock.auth.google.oauth2ClientSecret,
        );
        expect(personal).not.toHaveProperty('keyfileContents.client_secret');
    });
});

const ssoCredentials = (
    refreshToken = 'personal-refresh',
): CreateWarehouseCredentials => ({
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    project: 'analytics',
    dataset: 'prod',
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
    keyfileContents: {
        type: 'authorized_user',
        client_id: 'saved-client',
        refresh_token: refreshToken,
    },
});

describe('resolver cache identity and lifecycle', () => {
    afterEach(() => vi.restoreAllMocks());

    it('pins the cache key for an unregistered mode', async () => {
        const { factory } = buildFixture();
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        expect(Object.keys(factory.warehouseClients)).toEqual([
            '[false,"project-uuid",null,null,null,null,null]',
        ]);
    });

    it('reuses one identity and separates personal owners and reconnect tokens', async () => {
        const { factory, credentialSource, projectModel } = buildFixture();
        const first = {
            ...ssoCredentials(),
            userWarehouseCredentialsUuid: 'personal-one',
        };
        credentialSource.finish.mockResolvedValue(first);
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(1);
        credentialSource.finish.mockResolvedValue({
            ...first,
            userWarehouseCredentialsUuid: 'personal-two',
        });
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        credentialSource.finish.mockResolvedValue({
            ...ssoCredentials('reconnected-token'),
            userWarehouseCredentialsUuid: 'personal-two',
        });
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(3);
        expect(Object.keys(factory.warehouseClients)).toHaveLength(3);
        expect(
            JSON.stringify(Object.keys(factory.warehouseClients)),
        ).not.toMatch(
            /personal-refresh|reconnected-token|test-google-client-secret/,
        );
    });

    it('replaces a cached client when the configured secret changes', async () => {
        const { factory, credentialSource, projectModel } = buildFixture();
        credentialSource.finish.mockResolvedValue({
            ...ssoCredentials(),
            userWarehouseCredentialsUuid: undefined,
        });
        const originalSecret =
            lightdashConfigMock.auth.google.oauth2ClientSecret;
        try {
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(),
                async () => {},
            );
            lightdashConfigMock.auth.google.oauth2ClientSecret =
                'rotated-config-secret';
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(),
                async () => {},
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            expect(Object.keys(factory.warehouseClients)).toHaveLength(1);
            expect(
                projectModel.getWarehouseClientFromCredentials.mock.calls[1][0],
            ).toHaveProperty(
                'keyfileContents.client_secret',
                'rotated-config-secret',
            );
        } finally {
            lightdashConfigMock.auth.google.oauth2ClientSecret = originalSecret;
        }
    });

    it.each(['success', 'callback failure', 'construction failure'] as const)(
        'disposes once after %s',
        async (outcome) => {
            const dispose = vi.spyOn(
                BigquerySsoCredentialResolver.prototype,
                'dispose',
            );
            const { factory, projectModel } = buildFixture();
            const error = new Error(outcome);
            if (outcome === 'construction failure')
                projectModel.getWarehouseClientFromCredentials.mockImplementationOnce(
                    () => {
                        throw error;
                    },
                );
            const operation = factory.withWarehouseClient(
                compileRef(ssoCredentials()),
                contextFor(),
                async () => {
                    if (outcome === 'callback failure') throw error;
                },
            );
            if (outcome === 'success') await operation;
            else await expect(operation).rejects.toBe(error);
            expect(dispose).toHaveBeenCalledOnce();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    it('releases a lease idempotently and does not resolve an already selected credential twice', async () => {
        const resolve = vi.spyOn(
            BigquerySsoCredentialResolver.prototype,
            'resolve',
        );
        const dispose = vi.spyOn(
            BigquerySsoCredentialResolver.prototype,
            'dispose',
        );
        const { factory, credentialSource } = buildFixture();
        credentialSource.finish.mockResolvedValue({
            ...ssoCredentials(),
            userWarehouseCredentialsUuid: 'personal',
        });
        const selected = await factory.resolveWarehouseCredentials(
            bindingRef,
            contextFor(),
        );
        const lease = await factory.acquireWarehouseConnection(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: selected.warehouseCredentials,
            },
            contextFor(),
        );
        await Promise.all([lease.release(), lease.release()]);
        expect(resolve).toHaveBeenCalledOnce();
        expect(dispose).toHaveBeenCalledOnce();
        expect(credentialSource.finish).toHaveBeenCalledOnce();
    });

    it('uses a resolved reference without selecting or resolving again', async () => {
        const resolve = vi.spyOn(
            BigquerySsoCredentialResolver.prototype,
            'resolve',
        );
        const { factory, credentialSource } = buildFixture();
        credentialSource.finish.mockResolvedValue({
            ...ssoCredentials(),
            userWarehouseCredentialsUuid: 'personal',
        });
        const selected = await factory.resolveWarehouseCredentials(
            bindingRef,
            contextFor(),
        );
        await factory.withWarehouseClient(
            {
                kind: 'resolved',
                projectUuid: 'project-uuid',
                credentials: selected.warehouseCredentials,
                aiPlan: selected.aiPlan,
                warehouseConnectionUuid: selected.warehouseConnectionUuid,
                connectionRoute: selected.connectionRoute,
            },
            contextFor(),
            async () => {},
        );
        expect(resolve).toHaveBeenCalledOnce();
        expect(credentialSource.finish).toHaveBeenCalledOnce();
    });

    it.each(['final', 'ai'] as const)(
        'hydrates the %s selection without finishing the project credential',
        async (mode) => {
            const {
                factory,
                credentialSource,
                aiAccessService,
                projectModel,
                base,
            } = buildFixture();
            if (mode === 'final') {
                credentialSource.loadBase.mockResolvedValue({
                    ...base,
                    kind: 'final',
                    warehouseConnectionUuid: null,
                    credentials: ssoCredentials(),
                });
            } else {
                aiAccessService.resolvePlan.mockResolvedValue({
                    ...plan,
                    credentials: ssoCredentials(),
                });
            }
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(mode === 'ai' ? QueryExecutionContext.AI : null),
                async () => {},
            );
            expect(
                projectModel.getWarehouseClientFromCredentials.mock.calls[0][0],
            ).toHaveProperty(
                'keyfileContents.client_secret',
                lightdashConfigMock.auth.google.oauth2ClientSecret,
            );
            expect(credentialSource.finish).not.toHaveBeenCalled();
        },
    );

    it('honours resolver options and disables caching when requested', async () => {
        const originalResolve = BigquerySsoCredentialResolver.prototype.resolve;
        vi.spyOn(
            BigquerySsoCredentialResolver.prototype,
            'resolve',
        ).mockImplementation(
            async function resolve(this: BigquerySsoCredentialResolver, input) {
                return {
                    ...(await originalResolve.call(this, input)),
                    cacheable: false,
                    clientOptions: { maxOpenConnections: 7 },
                };
            },
        );
        const { factory, credentialSource, projectModel } = buildFixture();
        credentialSource.finish.mockResolvedValue({
            ...ssoCredentials(),
            userWarehouseCredentialsUuid: undefined,
        });
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(),
            async () => {},
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[0][1],
        ).toMatchObject({ maxOpenConnections: 7 });
        expect(Object.keys(factory.warehouseClients)).toHaveLength(0);
    });

    it('preserves a revoked token error without selecting another identity', async () => {
        const resolve = vi.spyOn(
            BigquerySsoCredentialResolver.prototype,
            'resolve',
        );
        const { factory, credentialSource, projectModel, aiAccessService } =
            buildFixture();
        credentialSource.finish.mockResolvedValue({
            ...ssoCredentials(),
            userWarehouseCredentialsUuid: 'personal',
        });
        const revoked = new BigqueryTokenError('invalid_grant');
        const runQuery = vi.fn().mockRejectedValue(revoked);
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            (creds) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery,
            }),
        );
        await expect(
            factory.withWarehouseClient(
                bindingRef,
                contextFor(),
                async ({ warehouseClient }) => {
                    await warehouseClient.runQuery('SELECT 1', {});
                },
            ),
        ).rejects.toBe(revoked);
        expect(runQuery).toHaveBeenCalledExactlyOnceWith('SELECT 1', {});
        expect(credentialSource.loadBase).toHaveBeenCalledOnce();
        expect(credentialSource.finish).toHaveBeenCalledOnce();
        expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledOnce();
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledOnce();
    });

    it.each([
        undefined,
        BigqueryAuthenticationType.PRIVATE_KEY,
        BigqueryAuthenticationType.ADC,
    ])(
        'leaves %s BigQuery credentials unchanged',
        async (authenticationType) => {
            const { factory, projectModel } = buildFixture();
            const input = {
                ...ssoCredentials(),
                authenticationType,
                keyfileContents: {
                    type: 'authorized_user',
                    client_id: 'cli-id',
                    client_secret: 'cli-secret',
                    refresh_token: 'cli-refresh',
                },
            } as CreateWarehouseCredentials;
            await factory.withWarehouseClient(
                compileRef(input),
                contextFor(),
                async () => {},
            );
            expect(
                projectModel.getWarehouseClientFromCredentials.mock.calls[0][0],
            ).toEqual(input);
        },
    );
});
