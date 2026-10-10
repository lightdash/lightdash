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
    FeatureFlags,
    QueryExecutionContext,
    QuerySurface,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseTypes,
    type AiExecutionPlan,
    type CreateDatabricksCredentials,
    type CreateDuckdbDucklakeCredentials,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    BigqueryWarehouseClient,
    checkSnowflakeAgentSessionWithToken,
    exchangeDatabricksOAuthCredentials,
    ListedDatabasesPostgresWarehouseClient,
    SshTunnel,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { expectTypeOf } from 'vitest';
import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    GetTableMetadataCommand,
    ListDatabasesCommand,
    StartQueryExecutionCommand,
} from '../../../../warehouses/node_modules/@aws-sdk/client-athena';
import { Trino } from '../../../../warehouses/node_modules/trino-client';
import { snowflakeOAuthRefreshClient } from '../../auth/snowflakeOAuthRefresh';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import {
    athenaConnection,
    athenaSecrets,
    clickhouseConnection,
    clickhouseSecrets,
    postgresConnection,
    postgresSecrets,
    redshiftConnection,
    redshiftSecrets,
    snowflakeSecrets,
    trinoConnection,
    trinoSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SshKeyPairModel } from '../../models/SshKeyPairModel';
import { type AiUserWarehouseCredentials } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { AiAccessService } from '../AiAccessService/AiAccessService';
import { SnowflakeAgentClientResolver } from '../AiAccessService/SnowflakeAgentClientResolver';
import { createAnalyticsClient } from '../ProjectService/analyticsProject/analyticsProjectClient';
import {
    buildAiServiceAccountCredentials,
    resolveAiServiceAccountCredentials,
} from './aiServiceAccountCredentialResolvers';
import {
    connectionContextFromUser,
    ConnectionSurface,
    WarehouseCredentialKind,
} from './ConnectionContext';
import {
    credentialResolution,
    preparedCredentials,
    type MaterializedCredentials,
} from './CredentialResolver';
import { createCredentialResolverRegistry } from './credentialResolvers';
import { prepareWarehouseOAuthCredentials } from './preparedOAuthCredentials';
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';
import { DatabricksOAuthCredentialResolver } from './resolvers/DatabricksOAuthCredentialResolver';
import { AgentSignInResolverHarness } from './resolvers/SnowflakeAgentSignInCredentialResolver.mock';
import { SnowflakeOAuthCredentialResolver } from './resolvers/SnowflakeOAuthCredentialResolver';
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

const { createSnowflakeConnection } = vi.hoisted(() => ({
    createSnowflakeConnection: vi.fn(),
}));
vi.mock('../../../../warehouses/node_modules/snowflake-sdk', async () => ({
    ...(
        await vi.importActual<{ default: Record<string, unknown> }>(
            '../../../../warehouses/node_modules/snowflake-sdk',
        )
    ).default,
    createConnection: createSnowflakeConnection,
}));

const athenaSdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock(
    '../../../../warehouses/node_modules/@aws-sdk/client-athena',
    async (importOriginal) => ({
        ...(await importOriginal<
            typeof import('../../../../warehouses/node_modules/@aws-sdk/client-athena')
        >()),
        AthenaClient: vi.fn(
            class MockAthenaClient {
                send = athenaSdk.send;
                destroy = athenaSdk.destroy;
            },
        ),
    }),
);

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
    exchangeDatabricksOAuthCredentials: vi.fn(),
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
    {
        ...credentials,
        useSshTunnel: true,
        sshTunnelPrivateKey: 'COPIED-PRIVATE',
    },
    {
        ...credentials,
        type: WarehouseTypes.REDSHIFT,
        authenticationType: RedshiftAuthenticationType.PASSWORD,
        port: 5439,
        useSshTunnel: true,
        sshTunnelPrivateKey: 'COPIED-PRIVATE',
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
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
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
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: false }),
    } as unknown as FeatureFlagModel;
    const sshKeyPairModel = {
        find: vi.fn<SshKeyPairModel['find']>().mockResolvedValue(null),
    };
    const factory = new WarehouseClientFactory({
        credentialResolvers: createCredentialResolverRegistry({
            databricksOAuthCredentialResolver:
                new DatabricksOAuthCredentialResolver({
                    lightdashConfig: lightdashConfigMock,
                } as never),
            snowflakeOAuthCredentialResolver:
                new SnowflakeOAuthCredentialResolver({} as never),
            lightdashConfig: lightdashConfigMock,
            sshKeyPairModel,
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
        sshKeyPairModel,
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
        const original = {
            ...credentials,
            useSshTunnel: true,
            sshTunnelPrivateKey: 'COPIED-PRIVATE',
        };
        const tunneled = { ...original, host: '127.0.0.1', port: 43210 };
        connect.mockResolvedValueOnce(tunneled);
        await factory.withWarehouseClient(
            compileRef(original),
            contextFor(null, 'compile'),
            async (connection) => {
                expect(connection.warehouseCredentials).toMatchObject(original);
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
            sshTunnelPrivateKey: 'COPIED-PRIVATE',
        };
        connect.mockResolvedValueOnce(tunneled);
        await factory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: {
                    ...credentials,
                    useSshTunnel: true,
                    sshTunnelPrivateKey: 'COPIED-PRIVATE',
                },
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
            sshTunnelPrivateKey: 'COPIED-PRIVATE',
        };
        connect.mockResolvedValueOnce(tunneled);
        await factory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: {
                    ...credentials,
                    useSshTunnel: true,
                    sshTunnelPrivateKey: 'COPIED-PRIVATE',
                },
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
                    credentials: {
                        ...credentials,
                        useSshTunnel: true,
                        sshTunnelPrivateKey: 'COPIED-PRIVATE',
                    },
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
                        credentials: {
                            ...credentials,
                            useSshTunnel: true,
                            sshTunnelPrivateKey: 'COPIED-PRIVATE',
                        },
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
        sourceProjectUuid: 'project',
        inheritedFromProjectUuid: null,
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

    const postgresPlan = async (connection = postgresConnection) => ({
        ...slotPlan,
        credentials: await resolveAiServiceAccountCredentials({
            connection,
            stored: postgresSecrets,
            owner: {
                kind: 'aiServiceAccount' as const,
                uuid: 'slot-row',
                identityUuid: 'generation-a',
                sourceProjectUuid: 'project',
            },
            context: contextFor(QueryExecutionContext.AI),
            projectUuid: 'project-uuid',
            warehouseConnectionUuid: null,
        }),
    });

    test.each([true, false])(
        'opens the Postgres AI tunnel with the local endpoint, copied key=%s',
        async (copiedKey) => {
            const {
                factory,
                aiAccessService,
                projectModel,
                credentialSource,
                sshKeyPairModel,
            } = buildFixture();
            const connection = {
                ...postgresConnection,
                sshTunnelPrivateKey: copiedKey ? 'tunnel-private' : undefined,
            };
            sshKeyPairModel.find.mockResolvedValue(
                copiedKey
                    ? null
                    : {
                          publicKey: 'tunnel-public',
                          privateKey: 'organization-private',
                          organizationUuid: 'org-uuid',
                      },
            );
            aiAccessService.resolvePlan.mockResolvedValue(
                await postgresPlan(connection),
            );
            connect.mockImplementation(async (creds) => ({
                ...creds,
                host: '127.0.0.1',
                port: 43210,
            }));
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ connectionCredentials }) => {
                    expect(connectionCredentials).toMatchObject({
                        ...postgresSecrets,
                        host: '127.0.0.1',
                        port: 43210,
                    });
                },
            );
            expect(SshTunnel).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...postgresSecrets,
                    sshTunnelPrivateKey: copiedKey
                        ? 'tunnel-private'
                        : 'organization-private',
                }),
                undefined,
            );
            const clientCredentials =
                projectModel.getWarehouseClientFromCredentials.mock.calls[0][0];
            expect(clientCredentials).toMatchObject({
                ...postgresSecrets,
                host: '127.0.0.1',
                port: 43210,
            });
            for (const field of ['role', 'sslcert', 'sslkey'])
                expect(clientCredentials).not.toHaveProperty(field);
            expect(sshKeyPairModel.find).toHaveBeenCalledOnce();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(disconnect).toHaveBeenCalledOnce();
            expect(Object.keys(factory.warehouseClients)).toEqual([]);
        },
    );

    test.each([true, false])(
        'opens the same tunnel for a Postgres service account Test, copied key=%s',
        async (copiedKey) => {
            const { factory, projectModel, sshKeyPairModel } = buildFixture();
            const connection = {
                ...postgresConnection,
                sshTunnelPrivateKey: copiedKey ? 'tunnel-private' : undefined,
            };
            sshKeyPairModel.find.mockResolvedValue(
                copiedKey
                    ? null
                    : {
                          publicKey: 'tunnel-public',
                          privateKey: 'organization-private',
                          organizationUuid: 'org-uuid',
                      },
            );
            const testCredentials = buildAiServiceAccountCredentials(
                connection,
                postgresSecrets,
            );
            connect.mockImplementation(async (creds) => ({
                ...creds,
                host: '127.0.0.1',
                port: 43211,
            }));
            await factory.withWarehouseClient(
                {
                    kind: 'bypass',
                    mode: 'connection_test',
                    agentSession: true,
                    projectUuid: 'project-uuid',
                    credentials: testCredentials,
                },
                contextFor(QueryExecutionContext.API),
                async ({ warehouseClient }) =>
                    warehouseClient.runQuery(
                        'SELECT current_user AS principal, session_user AS session_principal',
                        {},
                    ),
            );
            expect(SshTunnel).toHaveBeenCalledWith(
                expect.objectContaining({
                    sshTunnelPrivateKey: copiedKey
                        ? 'tunnel-private'
                        : 'organization-private',
                }),
                undefined,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...postgresSecrets,
                    host: '127.0.0.1',
                    port: 43211,
                }),
                expect.any(Object),
            );
            expect(sshKeyPairModel.find).toHaveBeenCalledOnce();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test.each([
        ['28P01', true],
        ['28000', true],
        ['42501', false],
        ['42601', false],
    ])(
        'attributes only Postgres authentication failure %s',
        async (code, refused) => {
            const {
                factory,
                aiAccessService,
                projectModel,
                credentialSource,
                logger,
            } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(await postgresPlan());
            const error = new WarehouseQueryError(
                'password authentication failed for user "ai_agents"',
            );
            error.cause = Object.assign(new Error(postgresSecrets.password), {
                code,
            });
            const client =
                projectModel.getWarehouseClientFromCredentials(credentials);
            vi.spyOn(client, 'runQuery').mockRejectedValue(error);
            projectModel.getWarehouseClientFromCredentials.mockReturnValue(
                client,
            );
            const operation = factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) =>
                    warehouseClient.runQuery('SELECT 1', {}),
            );
            if (refused) {
                await expect(operation).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    },
                });
                expect(
                    aiAccessService.trackQueryRefusal,
                ).toHaveBeenCalledOnce();
            } else {
                await expect(operation).rejects.toBe(error);
                expect(
                    aiAccessService.trackQueryRefusal,
                ).not.toHaveBeenCalled();
            }
            expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
                postgresSecrets.password,
            );
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );
    const redshiftPlan = async (connection = redshiftConnection) => ({
        ...slotPlan,
        credentials: await resolveAiServiceAccountCredentials({
            connection,
            stored: redshiftSecrets,
            owner: {
                kind: 'aiServiceAccount' as const,
                uuid: 'slot-row',
                identityUuid: 'generation-a',
                sourceProjectUuid: 'project',
            },
            context: contextFor(QueryExecutionContext.AI),
            projectUuid: 'project-uuid',
            warehouseConnectionUuid: null,
        }),
    });

    test.each([true, false])(
        'opens the Redshift AI tunnel with the local endpoint, copied key=%s',
        async (copiedKey) => {
            const {
                factory,
                aiAccessService,
                projectModel,
                credentialSource,
                sshKeyPairModel,
            } = buildFixture();
            const connection = {
                ...redshiftConnection,
                sshTunnelPrivateKey: copiedKey ? 'tunnel-private' : undefined,
            };
            sshKeyPairModel.find.mockResolvedValue(
                copiedKey
                    ? null
                    : {
                          publicKey: 'tunnel-public',
                          privateKey: 'organization-private',
                          organizationUuid: 'org-uuid',
                      },
            );
            aiAccessService.resolvePlan.mockResolvedValue(
                await redshiftPlan(connection),
            );
            connect.mockImplementation(async (creds) => ({
                ...creds,
                host: '127.0.0.1',
                port: 43210,
            }));
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ connectionCredentials }) => {
                    expect(connectionCredentials).toMatchObject({
                        ...redshiftSecrets,
                        authenticationType: RedshiftAuthenticationType.PASSWORD,
                        host: '127.0.0.1',
                        port: 43210,
                    });
                },
            );
            expect(SshTunnel).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...redshiftSecrets,
                    authenticationType: RedshiftAuthenticationType.PASSWORD,
                    sshTunnelPrivateKey: copiedKey
                        ? 'tunnel-private'
                        : 'organization-private',
                }),
                undefined,
            );
            const clientCredentials =
                projectModel.getWarehouseClientFromCredentials.mock.calls[0][0];
            expect(clientCredentials).toMatchObject({
                ...redshiftSecrets,
                authenticationType: RedshiftAuthenticationType.PASSWORD,
                host: '127.0.0.1',
                port: 43210,
            });
            for (const field of [
                'accessKeyId',
                'secretAccessKey',
                'sessionToken',
                'assumeRoleArn',
                'assumeRoleExternalId',
                'awsSsoStartUrl',
                'awsSsoRegion',
                'awsSsoAccountId',
                'awsSsoRoleName',
                'autoCreate',
                'dbGroups',
            ])
                expect(clientCredentials).not.toHaveProperty(field);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({ agentJobControls: true }),
            );
            expect(Object.keys(factory.warehouseClients)).toEqual([]);
            expect(sshKeyPairModel.find).toHaveBeenCalledOnce();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(disconnect).toHaveBeenCalledOnce();
            expect(Object.keys(factory.warehouseClients)).toEqual([]);
        },
    );

    test.each(
        [true, false].flatMap((copiedKey) =>
            [true, false].map((queryFails) => ({ copiedKey, queryFails })),
        ),
    )(
        'opens the same tunnel for a Redshift service account Test, copied key=$copiedKey, failure=$queryFails',
        async ({ copiedKey, queryFails }) => {
            const { factory, projectModel, sshKeyPairModel } = buildFixture();
            const connection = {
                ...redshiftConnection,
                sshTunnelPrivateKey: copiedKey ? 'tunnel-private' : undefined,
            };
            sshKeyPairModel.find.mockResolvedValue(
                copiedKey
                    ? null
                    : {
                          publicKey: 'tunnel-public',
                          privateKey: 'organization-private',
                          organizationUuid: 'org-uuid',
                      },
            );
            const testCredentials = buildAiServiceAccountCredentials(
                connection,
                redshiftSecrets,
            );
            connect.mockImplementation(async (creds) => ({
                ...creds,
                host: '127.0.0.1',
                port: 43211,
            }));
            const queryError = new Error('probe failed');
            const operation = factory.withWarehouseClient(
                {
                    kind: 'bypass',
                    mode: 'connection_test',
                    agentSession: true,
                    clientOptions: { agentJobControls: true },
                    projectUuid: 'project-uuid',
                    credentials: testCredentials,
                },
                contextFor(QueryExecutionContext.API),
                async ({ warehouseClient }) => {
                    if (queryFails) throw queryError;
                    return warehouseClient.runQuery(
                        'SELECT current_user AS principal, session_user AS session_principal',
                        {},
                    );
                },
            );
            if (queryFails) await expect(operation).rejects.toBe(queryError);
            else await operation;
            expect(SshTunnel).toHaveBeenCalledWith(
                expect.objectContaining({
                    sshTunnelPrivateKey: copiedKey
                        ? 'tunnel-private'
                        : 'organization-private',
                }),
                undefined,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...redshiftSecrets,
                    authenticationType: RedshiftAuthenticationType.PASSWORD,
                    host: '127.0.0.1',
                    port: 43211,
                }),
                expect.any(Object),
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({ agentJobControls: true }),
            );
            expect(Object.keys(factory.warehouseClients)).toEqual([]);
            expect(sshKeyPairModel.find).toHaveBeenCalledOnce();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );

    test.each([
        ['28P01', true],
        ['28000', true],
        ['42501', false],
        ['42601', false],
    ])(
        'attributes only Redshift authentication failure %s',
        async (code, refused) => {
            const {
                factory,
                aiAccessService,
                projectModel,
                credentialSource,
                logger,
            } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(await redshiftPlan());
            const error = new WarehouseQueryError(
                'password authentication failed for user "ai_agents"',
            );
            error.cause = Object.assign(new Error(redshiftSecrets.password), {
                code,
            });
            const client =
                projectModel.getWarehouseClientFromCredentials(credentials);
            vi.spyOn(client, 'runQuery').mockRejectedValue(error);
            projectModel.getWarehouseClientFromCredentials.mockReturnValue(
                client,
            );
            const operation = factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) =>
                    warehouseClient.runQuery('SELECT 1', {}),
            );
            if (refused) {
                await expect(operation).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    },
                });
                expect(
                    aiAccessService.trackQueryRefusal,
                ).toHaveBeenCalledOnce();
            } else {
                await expect(operation).rejects.toBe(error);
                expect(
                    aiAccessService.trackQueryRefusal,
                ).not.toHaveBeenCalled();
            }
            expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
                redshiftSecrets.password,
            );
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );
    test.each(['binding', 'resolved'] as const)(
        'keeps Redshift slot controls on %s and derived clients',
        async (kind) => {
            const { factory, aiAccessService, projectModel, credentialSource } =
                buildFixture();
            const slot = await redshiftPlan({
                ...redshiftConnection,
                useSshTunnel: false,
            });
            aiAccessService.resolvePlan.mockResolvedValue(slot);
            const ref: WarehouseClientRef =
                kind === 'binding'
                    ? bindingRef
                    : {
                          kind: 'resolved',
                          projectUuid: 'project-uuid',
                          credentials: slot.credentials,
                          aiPlan: slot,
                          warehouseConnectionUuid: 'extra-connection',
                          connectionRoute: {
                              route: 'single',
                              originalWarehouseConnectionUuid: null,
                          },
                      };
            await factory.withWarehouseClient(
                ref,
                contextFor(QueryExecutionContext.AI),
                async ({ deriveClient, connectionCredentials }) => {
                    deriveClient({
                        ...connectionCredentials,
                        schema: 'another_schema',
                    } as CreateWarehouseCredentials);
                },
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            for (const [clientCredentials, options] of projectModel
                .getWarehouseClientFromCredentials.mock.calls) {
                expect(clientCredentials).toMatchObject({
                    ...redshiftSecrets,
                    authenticationType: RedshiftAuthenticationType.PASSWORD,
                });
                expect(options).toMatchObject({
                    agentSession: true,
                    agentJobControls: true,
                });
                expect(clientCredentials).not.toHaveProperty('accessKeyId');
                expect(clientCredentials).not.toHaveProperty('secretAccessKey');
            }
            expect(credentialSource.finish).not.toHaveBeenCalled();
        },
    );

    test('isolates overlapping Redshift slot generations without replacing an active client', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        const connection = { ...redshiftConnection, useSshTunnel: false };
        const oldPlan = await redshiftPlan(connection);
        aiAccessService.resolvePlan.mockResolvedValue(oldPlan);
        const started = Promise.withResolvers<void>();
        const finish = Promise.withResolvers<void>();
        const oldQuery = factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => {
                started.resolve();
                await finish.promise;
                return warehouseClient;
            },
        );
        await started.promise;
        const newPlan = {
            ...oldPlan,
            identityUuid: 'generation-b',
            credentials: await resolveAiServiceAccountCredentials({
                connection,
                stored: {
                    ...redshiftSecrets,
                    password: 'replacement-password',
                },
                owner: {
                    kind: 'aiServiceAccount',
                    uuid: 'slot-row',
                    identityUuid: 'generation-b',
                    sourceProjectUuid: 'project',
                },
                context: contextFor(QueryExecutionContext.AI),
                projectUuid: 'project-uuid',
                warehouseConnectionUuid: null,
            }),
        };
        aiAccessService.resolvePlan.mockResolvedValue(newPlan);
        try {
            const newClient = await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => warehouseClient,
            );
            expect(newClient.credentials).toMatchObject({
                password: 'replacement-password',
            });
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            finish.resolve();
            const oldClient = await oldQuery;
            expect(oldClient).not.toBe(newClient);
            expect(oldClient.credentials).toMatchObject(redshiftSecrets);
        } finally {
            finish.resolve();
            await oldQuery;
        }
    });

    const trinoPlan = async (connection = trinoConnection) => ({
        ...slotPlan,
        credentials: await resolveAiServiceAccountCredentials({
            connection,
            stored: trinoSecrets,
            owner: {
                kind: 'aiServiceAccount' as const,
                uuid: 'slot-row',
                identityUuid: 'generation-a',
                sourceProjectUuid: 'project',
            },
            context: contextFor(QueryExecutionContext.AI),
            projectUuid: 'project-uuid',
            warehouseConnectionUuid: null,
        }),
    });

    test.each([
        [{ status: 401 }, true],
        [{ errorName: 'PERMISSION_DENIED' }, false],
        [{ status: 403 }, false],
        [{ status: 404 }, false],
    ] as const)(
        'attributes only Trino authentication failure %s',
        async (cause, refused) => {
            const {
                factory,
                aiAccessService,
                projectModel,
                credentialSource,
                logger,
            } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(await trinoPlan());
            const error = new WarehouseQueryError('Trino request failed');
            error.cause = cause;
            const client =
                projectModel.getWarehouseClientFromCredentials(credentials);
            vi.spyOn(client, 'runQuery').mockRejectedValue(error);
            projectModel.getWarehouseClientFromCredentials.mockReturnValue(
                client,
            );
            const operation = factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) =>
                    warehouseClient.runQuery('SELECT 1', {}),
            );
            if (refused) {
                await expect(operation).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    },
                });
                expect(
                    aiAccessService.trackQueryRefusal,
                ).toHaveBeenCalledOnce();
            } else {
                await expect(operation).rejects.toBe(error);
                expect(
                    aiAccessService.trackQueryRefusal,
                ).not.toHaveBeenCalled();
            }
            expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
                trinoSecrets.password,
            );
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );
    test.each([401, 403, 404, 'PERMISSION_DENIED'] as const)(
        'attributes the real Trino client wrapper for %s without driver secrets',
        async (failure) => {
            const f = buildFixture();
            const trinoSlotPlan = await trinoPlan();
            const query = vi.fn();
            const passwordSentinel = 'trino-password-sentinel';
            const headerSentinel = 'trino-authorization-sentinel';
            const expectNoSecrets = (
                value: unknown,
                seen = new Set<unknown>(),
            ) => {
                if (typeof value === 'string') {
                    expect(value).not.toContain(passwordSentinel);
                    expect(value).not.toContain(headerSentinel);
                }
                if (
                    typeof value !== 'object' ||
                    value === null ||
                    seen.has(value)
                )
                    return;
                seen.add(value);
                for (const key of Object.getOwnPropertyNames(value)) {
                    expect(key).not.toMatch(/password|header|config|auth/i);
                    if (key !== 'cause')
                        expectNoSecrets(
                            (value as Record<string, unknown>)[key],
                            seen,
                        );
                }
                if ('cause' in value) expectNoSecrets(value.cause, seen);
            };
            const expectedCause =
                typeof failure === 'number'
                    ? { status: failure }
                    : {
                          errorName: failure,
                          errorCode: 4,
                          errorType: 'USER_ERROR',
                      };
            if (typeof failure === 'number')
                query.mockRejectedValue(
                    Object.assign(
                        new Error(`Request failed with status code ${failure}`),
                        {
                            isAxiosError: true,
                            response: {
                                status: failure,
                                headers: { Authorization: headerSentinel },
                            },
                            config: {
                                auth: { password: passwordSentinel },
                            },
                        },
                    ),
                );
            else
                query.mockResolvedValue({
                    next: vi.fn().mockResolvedValue({
                        done: true,
                        value: {
                            error: {
                                message:
                                    'Access Denied: Cannot select from table',
                                ...expectedCause,
                            },
                        },
                    }),
                });
            const create = vi
                .spyOn(Trino, 'create')
                .mockReturnValue({ query } as unknown as Trino);
            try {
                f.projectModel.getWarehouseClientFromCredentials.mockImplementation(
                    warehouseClientFromCredentials,
                );
                f.aiAccessService.resolvePlan.mockResolvedValue(trinoSlotPlan);
                await f.factory.withWarehouseClient(
                    bindingRef,
                    contextFor(QueryExecutionContext.AI),
                    async ({ warehouseClient, deriveClient }) => {
                        const clients = [
                            warehouseClient,
                            deriveClient(trinoSlotPlan.credentials),
                        ];
                        await Promise.all(
                            clients.map(async (client) => {
                                const error = await client
                                    .runQuery('SELECT current_user', {})
                                    .catch((e: unknown) => e);
                                if (failure === 401) {
                                    expect(error).toMatchObject({
                                        refusal: {
                                            reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                                        },
                                    });
                                    expect(
                                        ((error as Error).cause as Error).cause,
                                    ).toStrictEqual({ status: 401 });
                                } else {
                                    expect(error).toBeInstanceOf(
                                        WarehouseQueryError,
                                    );
                                    expect(
                                        (error as Error).cause,
                                    ).toStrictEqual(expectedCause);
                                }
                                expectNoSecrets(error);
                            }),
                        );
                    },
                );
                expect(
                    f.aiAccessService.trackQueryRefusal,
                ).toHaveBeenCalledTimes(failure === 401 ? 1 : 0);
                expect(f.credentialSource.finish).not.toHaveBeenCalled();
            } finally {
                create.mockRestore();
            }
        },
    );
    test.each(['binding', 'resolved'] as const)(
        'keeps Trino slot controls on %s and derived clients',
        async (kind) => {
            const { factory, aiAccessService, projectModel, credentialSource } =
                buildFixture();
            const slot = await trinoPlan();
            aiAccessService.resolvePlan.mockResolvedValue(slot);
            const ref: WarehouseClientRef =
                kind === 'binding'
                    ? bindingRef
                    : {
                          kind: 'resolved',
                          projectUuid: 'project-uuid',
                          credentials: slot.credentials,
                          aiPlan: slot,
                          warehouseConnectionUuid: 'extra-connection',
                          connectionRoute: {
                              route: 'single',
                              originalWarehouseConnectionUuid: null,
                          },
                      };
            await factory.withWarehouseClient(
                ref,
                contextFor(QueryExecutionContext.AI),
                async ({ deriveClient, connectionCredentials }) => {
                    deriveClient({
                        ...connectionCredentials,
                        schema: 'another_schema',
                    } as CreateWarehouseCredentials);
                },
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            for (const [clientCredentials, options] of projectModel
                .getWarehouseClientFromCredentials.mock.calls) {
                expect(clientCredentials).toMatchObject({
                    ...trinoSecrets,
                });
                expect(options).toMatchObject({
                    agentSession: true,
                    agentJobControls: true,
                });
                expect(clientCredentials).not.toHaveProperty('accessKeyId');
                expect(clientCredentials).not.toHaveProperty('secretAccessKey');
            }
            expect(credentialSource.finish).not.toHaveBeenCalled();
        },
    );

    test('isolates overlapping Trino slot generations without replacing an active client', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        const connection = trinoConnection;
        const oldPlan = await trinoPlan(connection);
        aiAccessService.resolvePlan.mockResolvedValue(oldPlan);
        const started = Promise.withResolvers<void>();
        const finish = Promise.withResolvers<void>();
        const oldQuery = factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => {
                started.resolve();
                await finish.promise;
                return warehouseClient;
            },
        );
        await started.promise;
        const newPlan = {
            ...oldPlan,
            identityUuid: 'generation-b',
            credentials: await resolveAiServiceAccountCredentials({
                connection,
                stored: {
                    ...trinoSecrets,
                    password: 'replacement-password',
                },
                owner: {
                    kind: 'aiServiceAccount',
                    uuid: 'slot-row',
                    identityUuid: 'generation-b',
                    sourceProjectUuid: 'project',
                },
                context: contextFor(QueryExecutionContext.AI),
                projectUuid: 'project-uuid',
                warehouseConnectionUuid: null,
            }),
        };
        aiAccessService.resolvePlan.mockResolvedValue(newPlan);
        try {
            const newClient = await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => warehouseClient,
            );
            expect(newClient.credentials).toMatchObject({
                password: 'replacement-password',
            });
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            finish.resolve();
            const oldClient = await oldQuery;
            expect(oldClient).not.toBe(newClient);
            expect(oldClient.credentials).toMatchObject(trinoSecrets);
        } finally {
            finish.resolve();
            await oldQuery;
        }
    });

    const clickhousePlan = async (
        identityUuid = 'generation-a',
        sourceProjectUuid = 'project',
    ) => ({
        ...slotPlan,
        identityUuid,
        sourceProjectUuid,
        inheritedFromProjectUuid:
            sourceProjectUuid === 'parent' ? 'parent' : null,
        credentials: await resolveAiServiceAccountCredentials({
            connection: clickhouseConnection,
            stored: clickhouseSecrets,
            owner: {
                kind: 'aiServiceAccount' as const,
                uuid: 'slot-row',
                identityUuid,
                sourceProjectUuid,
            },
            context: contextFor(QueryExecutionContext.AI),
            projectUuid: 'project-uuid',
            warehouseConnectionUuid: null,
        }),
    });

    test('builds a ClickHouse AI service account client with agent job controls', async () => {
        const { factory, aiAccessService, projectModel, credentialSource } =
            buildFixture();
        const resolved = await clickhousePlan();
        aiAccessService.resolvePlan.mockResolvedValue(resolved);
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            warehouseClientFromCredentials,
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async ({ warehouseClient }) => {
                expect(warehouseClient.credentials).toMatchObject({
                    ...clickhouseSecrets,
                    host: clickhouseConnection.host,
                    schema: clickhouseConnection.schema,
                    secure: clickhouseConnection.secure,
                    requireUserCredentials: false,
                });
            },
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining(clickhouseSecrets),
            expect.objectContaining({
                agentSession: true,
                agentJobControls: true,
            }),
        );
        expect(credentialSource.finish).not.toHaveBeenCalled();
    });

    test.each([false, true])(
        'keeps ClickHouse project, marked-person and AI service account clients separate, reverse=%s',
        async (reverse) => {
            const { factory, projectModel } = buildFixture();
            const own = await clickhousePlan();
            const rotated = await clickhousePlan('generation-b');
            const inherited = await clickhousePlan('generation-b', 'parent');
            const plain = buildAiServiceAccountCredentials(
                clickhouseConnection,
                clickhouseSecrets,
            );
            const identities = [
                { aiPlan: null, credentials: plain },
                { aiPlan: markedPlan, credentials: plain },
                { aiPlan: own, credentials: own.credentials },
                { aiPlan: rotated, credentials: rotated.credentials },
                { aiPlan: inherited, credentials: inherited.credentials },
            ];
            if (reverse) identities.reverse();
            const acquire = async ({
                aiPlan,
                credentials: resolvedCredentials,
            }: (typeof identities)[number]) =>
                factory.withWarehouseClient(
                    {
                        kind: 'resolved',
                        projectUuid: 'project-uuid',
                        credentials: resolvedCredentials,
                        aiPlan,
                        warehouseConnectionUuid: null,
                        connectionRoute: null,
                    },
                    contextFor(
                        aiPlan === null
                            ? QueryExecutionContext.EXPLORE
                            : QueryExecutionContext.AI,
                    ),
                    async ({ warehouseClient }) => warehouseClient,
                );
            const clients = await Promise.all(identities.map(acquire));
            expect(new Set(clients).size).toBe(5);
            const repeated = await Promise.all(identities.map(acquire));
            for (const [index, again] of repeated.entries()) {
                expect(again.credentials).toEqual(clients[index].credentials);
            }
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(5);
            expect(Object.keys(factory.warehouseClients)).toHaveLength(5);
            const options =
                projectModel.getWarehouseClientFromCredentials.mock.calls.map(
                    ([, value]) => value,
                );
            expect(
                options.filter((value) => value?.agentJobControls),
            ).toHaveLength(4);
        },
    );

    test.each(['runQuery', 'streamQuery'] as const)(
        'attributes rejected ClickHouse credentials once through reused inherited %s clients',
        async (method) => {
            const {
                factory,
                aiAccessService,
                projectModel,
                credentialSource,
                logger,
            } = buildFixture();
            const inherited = await clickhousePlan('generation-a', 'parent');
            aiAccessService.resolvePlan.mockResolvedValue(inherited);
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async () => undefined,
            );
            const client = Object.values(factory.warehouseClients)[0];
            const error = new WarehouseQueryError('Authentication failed');
            error.cause = Object.assign(new Error(clickhouseSecrets.password), {
                code: '516',
                type: 'AUTHENTICATION_FAILED',
            });
            vi.spyOn(client, method).mockRejectedValue(error);
            await expect(
                factory.withWarehouseClient(
                    bindingRef,
                    contextFor(QueryExecutionContext.AI),
                    async ({ warehouseClient }) => {
                        if (method === 'runQuery')
                            return warehouseClient.runQuery('SELECT 1', {});
                        return warehouseClient.streamQuery(
                            'SELECT 1',
                            async () => undefined,
                            { tags: {} },
                        );
                    },
                ),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                },
            });
            expect(
                aiAccessService.trackQueryRefusal,
            ).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    warehouseType: WarehouseTypes.CLICKHOUSE,
                }),
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                'parent',
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledOnce();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
                clickhouseSecrets.password,
            );
        },
    );

    test.each(['164', '497', '60', '62', '81', '115', '209', '210', '704'])(
        'preserves ordinary ClickHouse error %s without a credential refusal',
        async (code) => {
            const { factory, aiAccessService, projectModel } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(
                await clickhousePlan(),
            );
            const error = new WarehouseQueryError('Query failed');
            error.cause = Object.assign(new Error('SDK failure'), { code });
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi.fn().mockRejectedValue(error),
                }),
            );
            await expect(
                factory.withWarehouseClient(
                    bindingRef,
                    contextFor(QueryExecutionContext.AI),
                    async ({ warehouseClient }) =>
                        warehouseClient.runQuery('SELECT 1', {}),
                ),
            ).rejects.toBe(error);
            expect(aiAccessService.trackQueryRefusal).not.toHaveBeenCalled();
        },
    );

    const athenaPlan = async () => ({
        ...slotPlan,
        inheritedFromProjectUuid: 'parent',
        sourceProjectUuid: 'parent',
        credentials: await resolveAiServiceAccountCredentials({
            connection: athenaConnection,
            stored: athenaSecrets,
            owner: {
                kind: 'aiServiceAccount',
                uuid: 'athena-slot',
                identityUuid: 'athena-generation',
                sourceProjectUuid: 'parent',
            },
            context: contextFor(QueryExecutionContext.AI),
            projectUuid: 'project',
            warehouseConnectionUuid: null,
        }),
    });
    const athenaSuccess = () => {
        athenaSdk.send.mockReset().mockImplementation(async (command) => {
            if (command instanceof StartQueryExecutionCommand)
                return { QueryExecutionId: 'query-id' };
            if (command instanceof GetQueryExecutionCommand)
                return { QueryExecution: { Status: { State: 'SUCCEEDED' } } };
            if (command instanceof GetQueryResultsCommand)
                return {
                    ResultSet: {
                        ResultSetMetadata: {
                            ColumnInfo: [
                                { Name: 'connection_check', Type: 'integer' },
                            ],
                        },
                        Rows: [
                            { Data: [{ VarCharValue: 'connection_check' }] },
                            { Data: [{ VarCharValue: '1' }] },
                        ],
                    },
                };
            throw new Error('Unexpected Athena command');
        });
    };
    test.each([QueryExecutionContext.AI, QueryExecutionContext.MCP_RUN_SQL])(
        'routes Athena slot queries through its workgroup and results location for %s',
        async (queryContext) => {
            const { factory, aiAccessService, projectModel, credentialSource } =
                buildFixture();
            const executionPlan = await athenaPlan();
            aiAccessService.resolvePlan.mockResolvedValue(executionPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                warehouseClientFromCredentials,
            );
            athenaSuccess();
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(queryContext),
                async ({ warehouseClient }) => {
                    expect(
                        (
                            await warehouseClient.runQuery(
                                'SELECT 1 AS connection_check',
                                {},
                            )
                        ).rows,
                    ).toEqual([{ connection_check: 1 }]);
                },
            );
            expect(AthenaClient).toHaveBeenCalledWith({
                region: 'eu-west-1',
                credentials: {
                    accessKeyId: athenaSecrets.accessKeyId,
                    secretAccessKey: athenaSecrets.secretAccessKey,
                    sessionToken: undefined,
                },
            });
            expect(athenaSdk.send.mock.calls[0][0]).toBeInstanceOf(
                StartQueryExecutionCommand,
            );
            expect(athenaSdk.send.mock.calls[0][0].input).toMatchObject({
                WorkGroup: 'agent-workgroup',
                ResultConfiguration: {
                    OutputLocation: 's3://agent-results/prefix/',
                },
                QueryExecutionContext: {
                    Catalog: 'AwsDataCatalog',
                    Database: 'analytics',
                },
            });
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(
                JSON.stringify(
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[0][0],
                ),
            ).not.toContain('person-');
        },
    );
    test.each([
        'ExpiredToken',
        'InvalidClientTokenId',
        'AccessDeniedException',
        'InvalidRequestException',
        'ThrottlingException',
    ])(
        'attributes only Athena credential failure %s without fallback',
        async (name) => {
            const { factory, aiAccessService, projectModel, credentialSource } =
                buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(await athenaPlan());
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                warehouseClientFromCredentials,
            );
            athenaSdk.send.mockReset().mockRejectedValue(
                Object.assign(new Error('safe'), {
                    name,
                    $metadata: { httpStatusCode: 403 },
                }),
            );
            const result = factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) =>
                    warehouseClient.runQuery('SELECT 1', {}),
            );
            if (name === 'ExpiredToken' || name === 'InvalidClientTokenId') {
                await expect(result).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    },
                });
                expect(
                    aiAccessService.trackQueryRefusal,
                ).toHaveBeenCalledOnce();
                expect(aiAccessService.trackQueryRefusal).toHaveBeenCalledWith(
                    expect.anything(),
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    'parent',
                );
            } else {
                await expect(result).rejects.toBeInstanceOf(
                    WarehouseQueryError,
                );
                expect(
                    aiAccessService.trackQueryRefusal,
                ).not.toHaveBeenCalled();
            }
            expect(athenaSdk.send).toHaveBeenCalledOnce();
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(aiAccessService.resolvePlan).toHaveBeenCalledOnce();
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledOnce();
        },
    );
    test.each(['getFields', 'listDatabases'] as const)(
        'attributes expired Athena keys from %s without fallback',
        async (operation) => {
            const { factory, aiAccessService, projectModel, credentialSource } =
                buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(await athenaPlan());
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                warehouseClientFromCredentials,
            );
            athenaSdk.send.mockReset().mockRejectedValue(
                Object.assign(new Error('safe'), {
                    name: 'ExpiredToken',
                    $metadata: { httpStatusCode: 403 },
                }),
            );

            const result = factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => {
                    if (operation === 'getFields') {
                        return warehouseClient.getFields(
                            'orders',
                            'analytics',
                            'AwsDataCatalog',
                        );
                    }
                    return warehouseClient.listDatabases();
                },
            );

            await expect(result).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                },
            });
            expect(
                aiAccessService.trackQueryRefusal,
            ).toHaveBeenCalledExactlyOnceWith(
                expect.anything(),
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                'parent',
            );
            expect(athenaSdk.send).toHaveBeenCalledOnce();
            expect(athenaSdk.send.mock.calls[0][0]).toBeInstanceOf(
                operation === 'getFields'
                    ? GetTableMetadataCommand
                    : ListDatabasesCommand,
            );
            expect(credentialSource.finish).not.toHaveBeenCalled();
            expect(aiAccessService.resolvePlan).toHaveBeenCalledOnce();
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledOnce();
        },
    );
    test.each([
        'Insufficient Lake Formation permissions',
        "INVALID_CAST_ARGUMENT: Cannot cast '[ExpiredToken]' to INT",
    ])(
        'keeps Athena query execution failures as warehouse errors: %s',
        async (reason) => {
            const { factory, aiAccessService, projectModel } = buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(await athenaPlan());
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                warehouseClientFromCredentials,
            );
            athenaSuccess();
            athenaSdk.send
                .mockResolvedValueOnce({ QueryExecutionId: 'query-id' })
                .mockResolvedValueOnce({
                    QueryExecution: {
                        Status: {
                            State: 'FAILED',
                            StateChangeReason: reason,
                        },
                    },
                });
            const result = factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) =>
                    warehouseClient.runQuery(
                        "SELECT CAST('[ExpiredToken]' AS INTEGER)",
                        {},
                    ),
            );
            await expect(result).rejects.toBeInstanceOf(WarehouseQueryError);
            await expect(result).rejects.toThrow(reason);
            expect(aiAccessService.trackQueryRefusal).not.toHaveBeenCalled();
        },
    );
    test('keeps ordinary Athena queries on the main connection', async () => {
        const {
            factory,
            aiAccessService,
            projectModel,
            credentialSource,
            base,
        } = buildFixture();
        const ordinary = {
            ...athenaConnection,
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            assumeRoleArn: undefined,
        };
        credentialSource.loadBase.mockResolvedValue({
            ...base,
            credentials: ordinary,
        });
        credentialSource.finish.mockResolvedValue({
            ...ordinary,
            userWarehouseCredentialsUuid: undefined,
        });
        aiAccessService.resolvePlan.mockResolvedValue(null);
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            warehouseClientFromCredentials,
        );
        athenaSuccess();
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(null),
            async ({ warehouseClient }) =>
                warehouseClient.runQuery('SELECT 1', {}),
        );
        expect(AthenaClient).toHaveBeenCalledWith({
            region: 'eu-west-1',
            credentials: {
                accessKeyId: 'person-key',
                secretAccessKey: 'person-secret',
                sessionToken: 'person-token',
            },
        });
        expect(athenaSdk.send.mock.calls[0][0].input).toMatchObject({
            WorkGroup: 'person-workgroup',
            ResultConfiguration: { OutputLocation: 's3://person-results/' },
        });
    });

    test.each([401, 403])(
        'attributes only Databricks session authentication failure %s',
        async (status) => {
            const { factory, aiAccessService, projectModel } = buildFixture();
            const error = new WarehouseConnectionError(
                `Received a response with a bad HTTP status code: ${status}`,
            );
            const databricks = {
                type: WarehouseTypes.DATABRICKS,
                serverHostName: 'workspace.example.com',
                httpPath: '/sql/warehouse',
                database: 'schema',
                token: 'slot-token',
            } as const;
            aiAccessService.resolvePlan.mockResolvedValue({
                ...slotPlan,
                credentials: databricks,
            });
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
                    if (status === 401)
                        await expect(
                            warehouseClient.runQuery('SELECT 1', {}),
                        ).rejects.toMatchObject({
                            refusal: { reason: 'ai_service_account_invalid' },
                        });
                    else
                        await expect(
                            warehouseClient.runQuery('SELECT 1', {}),
                        ).rejects.toBe(error);
                },
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(1);
            expect(
                projectModel.getWarehouseClientFromCredentials.mock.calls[0][0],
            ).toMatchObject(databricks);
        },
    );

    test('attributes Databricks query authentication failure without selecting another credential source', async () => {
        const { factory, aiAccessService, projectModel, credentialSource } =
            buildFixture();
        const error = new WarehouseQueryError(
            'Received a response with a bad HTTP status code: 401',
        );
        const databricks = {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'workspace.example.com',
            httpPath: '/sql/warehouse',
            database: 'schema',
            token: 'slot-token',
        } as const;
        aiAccessService.resolvePlan.mockResolvedValue({
            ...slotPlan,
            credentials: databricks,
        });
        const streamQuery = vi.fn().mockRejectedValue(error);
        projectModel.getWarehouseClientFromCredentials.mockImplementation(
            (creds) => ({
                ...warehouseClientMock,
                credentials: creds,
                streamQuery,
            }),
        );
        await expect(
            factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient }) => {
                    await warehouseClient.streamQuery('SELECT 1', vi.fn(), {
                        tags: {},
                    });
                },
            ),
        ).rejects.toMatchObject({
            cause: error,
            refusal: {
                reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
            },
        });
        expect(streamQuery).toHaveBeenCalledOnce();
        expect(aiAccessService.trackQueryRefusal).toHaveBeenCalledOnce();
        expect(aiAccessService.resolvePlan).toHaveBeenCalledOnce();
        expect(credentialSource.loadBase).toHaveBeenCalledOnce();
        expect(credentialSource.finish).not.toHaveBeenCalled();
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledOnce();
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls[0][0],
        ).toMatchObject(databricks);
    });

    test('passes Databricks probe controls through a bypass without an AI plan', async () => {
        const { factory, projectModel, aiAccessService } = buildFixture();
        await factory.withWarehouseClient(
            {
                kind: 'bypass',
                mode: 'connection_test',
                projectUuid: 'project',
                agentSession: true,
                clientOptions: { agentJobControls: true },
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    serverHostName: 'workspace.example.com',
                    httpPath: '/sql/warehouse',
                    database: 'schema',
                    token: 'slot-token',
                },
            },
            contextFor(QueryExecutionContext.API),
            async () => undefined,
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'slot-token' }),
            expect.objectContaining({
                agentJobControls: true,
                agentSession: true,
            }),
        );
        expect(aiAccessService.resolvePlan).not.toHaveBeenCalled();
    });

    test('materializes fresh Databricks tokens without retaining a query client', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        const connection = {
            type: WarehouseTypes.DATABRICKS as const,
            serverHostName: 'workspace.example.com',
            httpPath: '/sql/warehouse',
            database: 'schema',
            personalAccessToken: 'project-pat',
        };
        vi.mocked(exchangeDatabricksOAuthCredentials)
            .mockReset()
            .mockResolvedValueOnce({ accessToken: 'first-token' })
            .mockResolvedValueOnce({ accessToken: 'second-token' });
        aiAccessService.resolvePlan.mockImplementation(async () => ({
            ...slotPlan,
            credentials: await resolveAiServiceAccountCredentials({
                connection,
                stored: {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                    oauthClientId: 'slot-id',
                    oauthClientSecret: 'slot-secret',
                },
                owner: {
                    kind: 'aiServiceAccount',
                    uuid: slotPlan.credentialUuid,
                    identityUuid: slotPlan.identityUuid,
                    sourceProjectUuid: slotPlan.sourceProjectUuid,
                },
                context: contextFor(QueryExecutionContext.AI),
                projectUuid: 'project',
                warehouseConnectionUuid: null,
            }),
        }));
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        expect(exchangeDatabricksOAuthCredentials).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials.mock.calls.map(
                ([creds]) => ('token' in creds ? creds.token : null),
            ),
        ).toEqual(['first-token', 'second-token']);
        expect(factory.warehouseClients).toEqual({});
    });

    const cacheControlCredentials: CreateWarehouseCredentials[] = [
        slotPlan.credentials,
        credentials,
        { ...credentials, type: WarehouseTypes.REDSHIFT },
        {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'warehouse.internal',
            httpPath: '/warehouse',
            personalAccessToken: 'token',
            database: 'database',
        },
        {
            type: WarehouseTypes.CLICKHOUSE,
            host: 'warehouse.internal',
            port: 8123,
            user: 'user',
            password: 'password',
            schema: 'default',
            secure: false,
        },
        {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'account',
            user: 'user',
            password: 'password',
            database: 'database',
            schema: 'public',
            warehouse: 'warehouse',
        },
    ];

    test.each(
        cacheControlCredentials.flatMap((warehouseCredentials) =>
            [
                { aiPlan: null, queryContext: QueryExecutionContext.EXPLORE },
                { aiPlan: null, queryContext: QueryExecutionContext.AI },
                { aiPlan: markedPlan, queryContext: QueryExecutionContext.AI },
                { aiPlan: slotPlan, queryContext: QueryExecutionContext.AI },
            ].map(({ aiPlan, queryContext }) => ({
                warehouseCredentials,
                aiPlan:
                    aiPlan === null
                        ? null
                        : { ...aiPlan, credentials: warehouseCredentials },
                queryContext,
            })),
        ),
    )(
        'sets $warehouseCredentials.type job controls only for a resolved plan: $queryContext $aiPlan.identity',
        async ({ warehouseCredentials, aiPlan, queryContext }) => {
            const {
                factory,
                projectModel,
                credentialSource,
                aiAccessService,
                base,
            } = buildFixture();
            credentialSource.loadBase.mockResolvedValue({
                ...base,
                credentials: warehouseCredentials,
            });
            credentialSource.finish.mockResolvedValue({
                ...warehouseCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
            aiAccessService.resolvePlan.mockResolvedValue(aiPlan);
            await factory.withWarehouseClient(
                bindingRef,
                contextFor(queryContext),
                async () => undefined,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.objectContaining(warehouseCredentials),
                expect.objectContaining({
                    agentSession: queryContext === QueryExecutionContext.AI,
                }),
            );
            const [, options] =
                projectModel.getWarehouseClientFromCredentials.mock.calls[0];
            expect(options?.agentJobControls).toBe(
                aiPlan !== null ||
                    warehouseCredentials.type === WarehouseTypes.BIGQUERY
                    ? aiPlan !== null
                    : undefined,
            );
        },
    );

    test('passes the slot row and source project as the credential owner', async () => {
        const { factory, aiAccessService } = buildFixture();
        aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
        const materialize = vi.spyOn(factory, 'materializeCredentials');
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        expect(materialize.mock.calls[0][4]).toEqual({
            owner: {
                kind: 'aiServiceAccount',
                uuid: slotPlan.credentialUuid,
                identityUuid: slotPlan.identityUuid,
                sourceProjectUuid: slotPlan.sourceProjectUuid,
            },
        });
    });

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

    test('uses inherited authentication on the preview connection', async () => {
        const { factory, aiAccessService, projectModel } = buildFixture();
        const inheritedPlan = {
            ...slotPlan,
            sourceProjectUuid: 'parent',
            inheritedFromProjectUuid: 'parent',
            credentials: {
                ...slotPlan.credentials,
                project: 'preview-warehouse',
                dataset: 'preview-dataset',
            },
        };
        aiAccessService.resolvePlan.mockResolvedValue(inheritedPlan);
        await factory.withWarehouseClient(
            bindingRef,
            contextFor(QueryExecutionContext.AI),
            async (resolved) => {
                expect(resolved.aiPlan).toBe(inheritedPlan);
                expect(resolved.warehouseCredentials).toMatchObject({
                    project: 'preview-warehouse',
                    dataset: 'preview-dataset',
                    keyfileContents: {
                        type: 'service_account',
                        private_key: 'saved-key',
                        client_email: 'agent@example.com',
                    },
                });
            },
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            expect.objectContaining(inheritedPlan.credentials),
            expect.anything(),
        );
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
            {
                ...slotPlan,
                sourceProjectUuid: 'parent',
                inheritedFromProjectUuid: 'parent',
            },
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
        expect(new Set(clients).size).toBe(6);
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
        ).toHaveBeenCalledTimes(6);
        expect(again.credentials).toEqual(clients[3].credentials);
        await factory.withWarehouseClient(
            { ...ref, warehouseConnectionUuid: 'extra' },
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(7);
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
                    inheritedFromProjectUuid: null,
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
            const {
                factory,
                aiAccessService,
                projectModel,
                analytics,
                logger,
            } = buildFixture();
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
            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.debug).toHaveBeenCalledExactlyOnceWith(
                'AI service account key refused',
                expect.objectContaining({
                    reason: 'ai_service_account_invalid',
                    errorMessage: '[REDACTED]',
                }),
            );
        },
    );

    test.each([
        new Error('invalid_grant'),
        new Error('Invalid JWT signature.'),
        new Error(
            'invalid_grant private_key=saved-key token=refresh-secret agent@example.com SELECT secret_column FROM private_table',
        ),
        Object.assign(new Error('unauthenticated'), { code: 401 }),
    ])(
        'attributes runtime authentication errors once per scope: %s',
        async (error) => {
            const { factory, aiAccessService, projectModel, logger } =
                buildFixture();
            aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            projectModel.getWarehouseClientFromCredentials.mockImplementation(
                (creds) => ({
                    ...warehouseClientMock,
                    credentials: creds,
                    runQuery: vi.fn().mockRejectedValue(error),
                    streamQuery: vi.fn().mockRejectedValue(error),
                }),
            );
            projectModel.getSummary.mockResolvedValue({
                name: 'Jaffle shop',
            } as Awaited<ReturnType<ProjectModel['getSummary']>>);
            const context = contextFor(QueryExecutionContext.AI);
            await factory.withWarehouseClient(
                bindingRef,
                context,
                async ({ warehouseClient, deriveClient }) => {
                    await expect(
                        warehouseClient.runQuery('SELECT 1', {}),
                    ).rejects.toMatchObject({
                        cause: error,
                        refusal: {
                            reason: 'ai_service_account_invalid',
                            action: 'ask_admin',
                            message:
                                "Agents can't run on Jaffle shop right now. Its shared agent account failed to sign in. A project admin can check it in Agent identity.",
                            settingsUrl:
                                '/generalSettings/projectManagement/project-uuid/agentIdentity',
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
            expect(logger.debug).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
                'AI service account key refused',
                {
                    projectUuid: 'project-uuid',
                    reason: 'ai_service_account_invalid',
                    errorClass: 'Error',
                    errorCode: 'code' in error ? '401' : null,
                    errorCategory: error.message.includes('invalid_grant')
                        ? 'invalid_grant'
                        : null,
                    errorMessage: expect.any(String),
                },
            );
            expect(
                JSON.stringify([
                    logger.warn.mock.calls,
                    logger.debug.mock.calls,
                ]),
            ).not.toMatch(
                /saved-key|agent@example.com|secret_column|refresh-secret|SELECT 1|private_table/,
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
                null,
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

    test.each([
        { kind: 'compile' as const, projectUuid: 'project-uuid', credentials },
        {
            kind: 'bypass' as const,
            mode: 'connection_test' as const,
            projectUuid: 'project-uuid',
            credentials,
        },
    ])(
        'does not set agent job controls without a plan: $kind $mode',
        async (ref) => {
            const { factory, projectModel } = buildFixture();
            await factory.withWarehouseClient(
                ref,
                contextFor(null, 'compile'),
                async () => undefined,
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.anything(),
                expect.not.objectContaining({
                    agentJobControls: expect.anything(),
                }),
            );
        },
    );
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
                    .fn<() => Promise<AiUserWarehouseCredentials | undefined>>()
                    .mockResolvedValue({
                        uuid: 'agent-credential',
                        aiClientBinding: {
                            organizationUuid: 'org-uuid',
                            clientVersion: 'version-1',
                        },
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
            const config = lightdashConfigMock;
            const provider = new AgentSignInResolverHarness({
                featureFlagModel: {
                    get: vi.fn().mockResolvedValue({ enabled: false }),
                },
                refreshTokenRotation: { run: vi.fn() },
                lightdashConfig: config,
                userWarehouseCredentialsModel: model,
                snowflakeAgentClientResolver: new SnowflakeAgentClientResolver({
                    lightdashConfig: config,
                    organizationSnowflakeAgentClientModel: {
                        getWithSecret: vi.fn().mockResolvedValue({
                            organizationUuid: 'org-uuid',
                            accountUrl: 'https://snowflake.example.test',
                            accountIdentifier: 'test-account',
                            clientId: 'client',
                            clientSecret: 'secret',
                            clientVersion: 'version-1',
                            updatedAt: new Date(),
                        }),
                    },
                }),
            } as unknown as ConstructorParameters<
                typeof AgentSignInResolverHarness
            >[0]);
            const aiAccessService = new AiAccessService({
                agentActionLogModel: {
                    insert: vi.fn().mockResolvedValue(undefined),
                },
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
                agentSignInCredentialResolver: provider.resolver,
            } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
            resolver.resolvePlan.mockImplementation(
                aiAccessService.resolvePlan.bind(aiAccessService),
            );
            credentialSource.loadBase.mockResolvedValue({
                ...base,
                credentials: connection,
            });
            const refreshToken = vi
                .spyOn(snowflakeOAuthRefreshClient, 'requestNewAccessToken')
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
                    agentSignIn: null,
                    cacheable: false,
                    clientOptions: {
                        maxOpenConnections: 7,
                        agentJobControls: true,
                    },
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
        ).toMatchObject({ maxOpenConnections: 7, agentJobControls: false });
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

describe('SSH transport materialisation', () => {
    it.each(sshCredentials)(
        'hydrates $type keys before query, compile and rollback tunnel construction',
        async (creds) => {
            const { factory, credentialSource, sshKeyPairModel, projectModel } =
                buildFixture(true, false, false, false);
            const connection = {
                ...creds,
                sshTunnelPublicKey: 'ORG-PUBLIC',
                sshTunnelPrivateKey: undefined,
            };
            sshKeyPairModel.find.mockResolvedValue({
                publicKey: 'ORG-PUBLIC',
                privateKey: 'ORG-PRIVATE',
                organizationUuid: 'org-uuid',
            });
            credentialSource.finish.mockResolvedValue({
                ...connection,
                userWarehouseCredentialsUuid: undefined,
            });
            const refs: WarehouseClientRef[] = [
                bindingRef,
                compileRef(connection),
                ...(
                    [
                        'connection_test',
                        'test_and_compile',
                        'timezone_preview',
                        'dbt_cloud_preview_webhook',
                    ] as const
                ).map((mode) => ({
                    kind: 'bypass' as const,
                    mode,
                    projectUuid: 'project-uuid',
                    credentials: connection,
                })),
            ];
            await refs.reduce(async (previous, ref) => {
                await previous;
                await factory.withWarehouseClient(
                    ref,
                    contextFor(),
                    async () => {},
                );
                expect(SshTunnel).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        sshTunnelPrivateKey: 'ORG-PRIVATE',
                    }),
                    undefined,
                );
            }, Promise.resolve());
            expect(sshKeyPairModel.find).toHaveBeenCalledTimes(refs.length);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(refs.length);
            expect(Object.keys(factory.warehouseClients)).toEqual([]);
        },
    );
    it.each(sshCredentials)(
        'uses a $type copied key when the pair is gone and does not cache',
        async (creds) => {
            const { factory, credentialSource, sshKeyPairModel, projectModel } =
                buildFixture();
            const connection = {
                ...creds,
                sshTunnelPublicKey: 'DELETED-PUBLIC',
            };
            credentialSource.finish.mockResolvedValue({
                ...connection,
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
            expect(SshTunnel).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    sshTunnelPrivateKey: 'COPIED-PRIVATE',
                }),
                undefined,
            );
            expect(sshKeyPairModel.find).toHaveBeenCalledTimes(2);
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            expect(Object.keys(factory.warehouseClients)).toEqual([]);
        },
    );
});

describe('identity-resolved credentials', () => {
    test.each([true, false])(
        'opens the SSH tunnel for identity-resolved personal credentials, person=%s',
        async (hasPerson) => {
            const { factory, featureFlagModel, projectModel, sshKeyPairModel } =
                buildFixture();
            vi.mocked(featureFlagModel.get).mockResolvedValue({
                id: FeatureFlags.AgentIdentity,
                enabled: true,
            });
            sshKeyPairModel.find.mockResolvedValue({
                organizationUuid: 'org-uuid',
                publicKey: 'PUBLIC',
                privateKey: 'RESOLVED-PRIVATE',
            });
            const disposeIdentity = vi.fn().mockResolvedValue(undefined);
            const resolved: MaterializedCredentials & {
                userWarehouseCredentialsUuid: string;
            } = {
                ...sshCredentials[0],
                sshTunnelPublicKey: 'PUBLIC',
                sshTunnelPrivateKey: undefined,
                userWarehouseCredentialsUuid: 'personal-credential',
                [credentialResolution]: {
                    agentSignIn: null,
                    clientOptions: {},
                    cacheable: true,
                    cacheKeyIdentity: ['personal-identity'],
                    toDbtTarget: vi.fn(() => ({
                        kind: 'none' as const,
                        reason: 'Mock credentials cannot run dbt.',
                    })),
                    dispose: disposeIdentity,
                },
            };
            const context = contextFor();
            if (!hasPerson) context.actor.person = null;
            const materialize = vi.spyOn(factory, 'materializeCredentials');
            connect.mockImplementation(async (creds) => ({
                ...creds,
                host: '127.0.0.1',
                port: 43210,
            }));

            await factory.withWarehouseClient(
                {
                    kind: 'resolved',
                    projectUuid: 'project-uuid',
                    credentials: resolved,
                    aiPlan: null,
                    warehouseConnectionUuid: null,
                    connectionRoute: null,
                },
                context,
                async ({ connectionCredentials }) => {
                    expect(connectionCredentials).toMatchObject({
                        host: '127.0.0.1',
                        port: 43210,
                    });
                },
            );

            expect(SshTunnel).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    host: credentials.host,
                    sshTunnelPrivateKey: 'RESOLVED-PRIVATE',
                }),
                undefined,
            );
            expect(sshKeyPairModel.find).toHaveBeenCalledExactlyOnceWith(
                'PUBLIC',
            );
            expect(materialize).toHaveBeenCalledOnce();
            expect(materialize.mock.calls[0][4]).toMatchObject({
                owner: { kind: 'user', uuid: 'personal-credential' },
                refreshSource: {
                    credentials: resolved,
                    fallback: resolved,
                    personalCredentialPolicy: { strictPersonalOverlay: true },
                },
            });
            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: {
                    organizationUuid: 'org-uuid',
                    userUuid: hasPerson ? 'user-uuid' : '',
                },
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ host: '127.0.0.1', port: 43210 }),
                expect.any(Object),
            );
            expect(disconnect).toHaveBeenCalledOnce();
            expect(disposeIdentity).toHaveBeenCalledOnce();
        },
    );
});

describe('prepared OAuth credentials', () => {
    test.each([
        DatabricksAuthenticationType.OAUTH_U2M,
        DatabricksAuthenticationType.OAUTH_M2M,
    ])(
        'builds a Databricks %s client without a second exchange or internal markers',
        async (authenticationType) => {
            const { factory, projectModel } = buildFixture();
            const resolve = vi.spyOn(
                DatabricksOAuthCredentialResolver.prototype,
                'resolve',
            );
            try {
                const connection: CreateDatabricksCredentials = {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType,
                    serverHostName: 'workspace.example.com',
                    database: 'schema',
                    httpPath: '/sql/warehouse',
                    token: 'already-exchanged',
                    refreshToken: 'refresh',
                };
                const prepared = prepareWarehouseOAuthCredentials(connection);
                await factory.withWarehouseClient(
                    compileRef({ ...prepared }),
                    contextFor(null, 'compile'),
                    async ({ warehouseClient }) => {
                        expect(warehouseClient.credentials).toEqual(connection);
                    },
                );
                expect(resolve).not.toHaveBeenCalled();
                const constructed =
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[0][0];
                expect(constructed).toEqual(connection);
                expect(Object.getOwnPropertySymbols(constructed)).toEqual([]);
            } finally {
                resolve.mockRestore();
            }
        },
    );

    test.each([
        DatabricksAuthenticationType.OAUTH_U2M,
        DatabricksAuthenticationType.OAUTH_M2M,
    ])(
        'keeps Databricks %s cache entries separate by credential owner',
        async (authenticationType) => {
            const { factory, projectModel } = buildFixture();
            const resolve = vi
                .spyOn(DatabricksOAuthCredentialResolver.prototype, 'resolve')
                .mockImplementation(async (input) => ({
                    clientCredentials: input.connection,
                    clientOptions: {},
                    agentSignIn: null,
                    cacheable: true,
                }));
            try {
                const connection: CreateDatabricksCredentials = {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType,
                    serverHostName: 'workspace.example.com',
                    httpPath: '/sql/warehouse',
                    database: 'schema',
                    token: 'access-secret',
                    refreshToken: 'refresh-secret',
                    oauthClientId: 'client',
                    oauthClientSecret: 'client-secret',
                };
                const acquire = async (uuid: string) => {
                    const materialized = await factory.materializeCredentials(
                        connection,
                        contextFor(),
                        'project-uuid',
                        null,
                        { owner: { kind: 'organization', uuid } },
                    );
                    await factory.withWarehouseClient(
                        {
                            kind: 'resolved',
                            projectUuid: 'project-uuid',
                            credentials: materialized,
                            aiPlan: null,
                            warehouseConnectionUuid: null,
                            connectionRoute: null,
                        },
                        contextFor(),
                        async () => {},
                    );
                };
                await acquire('org-row-a');
                await acquire('org-row-b');
                await acquire('org-row-a');
                expect(
                    projectModel.getWarehouseClientFromCredentials,
                ).toHaveBeenCalledTimes(2);
                const keys = Object.keys(factory.warehouseClients);
                expect(keys).toHaveLength(2);
                expect(keys[0]).toContain('org-row-a');
                expect(keys[1]).toContain('org-row-b');
                expect(keys.join()).not.toContain('secret');
            } finally {
                resolve.mockRestore();
            }
        },
    );

    test.each(sshCredentials)(
        'prepared credentials still resolve the $type SSH transport',
        async (connection) => {
            const { factory, sshKeyPairModel, projectModel } = buildFixture();
            sshKeyPairModel.find.mockResolvedValue({
                organizationUuid: 'org-uuid',
                privateKey: 'RESOLVED-PRIVATE',
                publicKey: 'PUBLIC',
            } as never);
            const prepared = {
                ...connection,
                sshTunnelPublicKey: 'PUBLIC',
                sshTunnelPrivateKey: undefined,
                [preparedCredentials]: true as const,
            };
            await factory.withWarehouseClient(
                compileRef({ ...prepared }),
                contextFor(null, 'compile'),
                async () => {},
            );
            expect(sshKeyPairModel.find).toHaveBeenCalledExactlyOnceWith(
                'PUBLIC',
            );
            expect(SshTunnel).toHaveBeenCalledWith(
                expect.objectContaining({
                    sshTunnelPrivateKey: 'RESOLVED-PRIVATE',
                }),
                undefined,
            );
            expect(
                Object.getOwnPropertySymbols(
                    projectModel.getWarehouseClientFromCredentials.mock
                        .calls[0][0],
                ),
            ).toEqual([]);
            expect(disconnect).toHaveBeenCalledOnce();
        },
    );
});

describe('Snowflake AI service account factory integration', () => {
    const makePlan = async (
        override = false,
    ): Promise<
        Extract<AiExecutionPlan, { identity: 'ai_service_account' }>
    > => {
        const slotCredentials = await resolveAiServiceAccountCredentials({
            connection: {
                ...snowflakeSecrets,
                account: 'routing-account',
                database: 'preview-database',
                schema: 'public',
                warehouse: 'PERSON_WH',
                override,
            },
            stored: snowflakeSecrets,
            owner: {
                kind: 'aiServiceAccount',
                uuid: 'slot',
                identityUuid: 'generation',
                sourceProjectUuid: 'parent',
            },
            context: contextFor(QueryExecutionContext.AI),
            projectUuid: 'project-uuid',
            warehouseConnectionUuid: null,
        });
        return {
            identity: 'ai_service_account',
            identityUuid: 'generation',
            credentialUuid: 'slot',
            sourceProjectUuid: 'parent',
            inheritedFromProjectUuid: 'parent',
            credentials: slotCredentials,
            assurances: [{ kind: 'result_cache_off' }],
            audit: {
                actorKind: 'person',
                personUuid: 'user-uuid',
                userUuid: 'user-uuid',
                principalRef: 'slot',
                queryTags: { agent: 'true', ai_principal: 'user-uuid' },
            },
        };
    };
    test.each([true, false])(
        'preserves resolver controls and slot warehouse override=%s through derived clients',
        async (override) => {
            const f = buildFixture();
            const slotPlan = await makePlan(override);
            f.aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            await f.factory.withWarehouseClient(
                {
                    ...bindingRef,
                    overrides: { snowflakeVirtualWarehouse: 'EXPLORE_WH' },
                },
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient, deriveClient }) => {
                    expect(warehouseClient.credentials).toMatchObject({
                        warehouse: override ? 'SlotWarehouse' : 'EXPLORE_WH',
                        user: 'SlotUser',
                        database: 'preview-database',
                    });
                    deriveClient({ ...slotPlan.credentials });
                },
            );
            expect(
                f.projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledTimes(2);
            for (const [, options] of f.projectModel
                .getWarehouseClientFromCredentials.mock.calls)
                expect(options).toMatchObject({
                    agentJobControls: true,
                    agentSession: true,
                });
            expect(f.credentialSource.finish).not.toHaveBeenCalled();
        },
    );
    test('slot probes never cache and do not enable query plan controls', async () => {
        const f = buildFixture();
        const slotPlan = await makePlan();
        await Promise.all(
            [0, 1].map(() =>
                f.factory.withWarehouseClient(
                    {
                        kind: 'bypass',
                        mode: 'connection_test',
                        projectUuid: 'project-uuid',
                        credentials: slotPlan.credentials,
                        agentSession: true,
                    },
                    contextFor(),
                    async ({ deriveClient }) => {
                        deriveClient({ ...slotPlan.credentials });
                    },
                ),
            ),
        );
        expect(f.factory.warehouseClients).toEqual({});
        expect(
            f.projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(4);
        for (const [, options] of f.projectModel
            .getWarehouseClientFromCredentials.mock.calls)
            expect(options?.agentJobControls).toBeUndefined();
    });
    test('normal clients do not acquire the slot cache control', async () => {
        const f = buildFixture();
        const slotPlan = await makePlan();
        const ordinaryCredentials: MaterializedCredentials = {
            ...slotPlan.credentials,
        };
        delete ordinaryCredentials[credentialResolution];
        await f.factory.withWarehouseClient(
            {
                kind: 'resolved',
                projectUuid: 'project-uuid',
                credentials: ordinaryCredentials,
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
            },
            contextFor(QueryExecutionContext.AI),
            async () => undefined,
        );
        expect(
            f.projectModel.getWarehouseClientFromCredentials.mock.calls[0][1]
                ?.agentJobControls,
        ).toBeUndefined();
    });
    test.each([
        { code: '390144', refuses: true },
        { code: '001003', refuses: false },
        { code: '002003', refuses: false },
        { code: 'ETIMEDOUT', refuses: false },
    ])(
        'attributes actual Snowflake wrapper code $code, refuses=$refuses',
        async ({ code, refuses }) => {
            const f = buildFixture();
            const slotPlan = await makePlan();
            const sdkError = Object.assign(new Error('SDK failure'), { code });
            createSnowflakeConnection.mockReturnValue({
                connect: vi.fn((callback: (error: Error) => void) =>
                    callback(sdkError),
                ),
                destroy: vi.fn(),
            });
            f.projectModel.getWarehouseClientFromCredentials.mockImplementation(
                warehouseClientFromCredentials,
            );
            f.aiAccessService.resolvePlan.mockResolvedValue(slotPlan);
            await f.factory.withWarehouseClient(
                bindingRef,
                contextFor(QueryExecutionContext.AI),
                async ({ warehouseClient, deriveClient }) => {
                    await Promise.all(
                        [
                            warehouseClient,
                            deriveClient(slotPlan.credentials),
                        ].map(async (client) => {
                            const query = client.runQuery('SELECT 1', {});
                            if (refuses)
                                await expect(query).rejects.toMatchObject({
                                    refusal: {
                                        reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                                    },
                                });
                            else
                                await expect(query).rejects.toMatchObject({
                                    name: 'WarehouseConnectionError',
                                    cause: sdkError,
                                });
                        }),
                    );
                },
            );
            expect(f.aiAccessService.trackQueryRefusal).toHaveBeenCalledTimes(
                refuses ? 1 : 0,
            );
        },
    );
});
