import {
    AiAgentMarkerLevel,
    AthenaAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    QueryExecutionContext,
    RedshiftAuthenticationType,
    UnexpectedServerError,
    WarehouseTypes,
    type AiExecutionPlan,
    type CreatePostgresCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    ListedDatabasesPostgresWarehouseClient,
    SshTunnel,
} from '@lightdash/warehouses';
import { expectTypeOf } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import type { AiAccessService } from '../AiAccessService/AiAccessService';
import { createAnalyticsClient } from '../ProjectService/analyticsProject/analyticsProjectClient';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from './ConnectionContext';
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
    SshTunnel: vi.fn().mockImplementation(function MockSshTunnel(
        this: {
            connect: () => Promise<CreateWarehouseCredentials>;
            disconnect: () => Promise<void>;
        },
        credentials: CreateWarehouseCredentials,
    ) {
        this.connect = () => connect(credentials);
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

const buildFixture = (releaseSshTunnelOnScopeExit = true) => {
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
    const aiAccessService = {
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
        lightdashConfig: {
            ...lightdashConfigMock,
            warehouseClient: { releaseSshTunnelOnScopeExit },
        },
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel,
        aiAccessService: aiAccessService as unknown as AiAccessService,
        credentialSource,
        logger: logger as unknown as typeof Logger,
    });
    return {
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
            kind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
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
                                WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
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
                { cacheEnabled: true, wrapConstructionErrors: false },
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenCalledExactlyOnceWith(
                ref.credentials,
                expect.objectContaining({ agentSession }),
            );
            expect(Object.keys(factory.warehouseClients)).toEqual([
                `${agentSession ? 'agent:' : ''}project-uuid${JSON.stringify([plan.identityUuid])}`,
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
            `agent:project-uuid${JSON.stringify([plan.identityUuid])}`,
            `agent:project-uuid${JSON.stringify(['ai-two'])}`,
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
                    credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
                    warehouseConnectionUuid: 'extra-uuid',
                    connectionRoute: extraBase.connectionRoute,
                });
            },
        );
        expect(credentialSource.finish).not.toHaveBeenCalled();
        expect(aiAccessService.resolvePlan).toHaveBeenCalledExactlyOnceWith({
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
                buildFixture();
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
            const { factory, projectModel } = buildFixture();
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
        const { factory, projectModel } = buildFixture();
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
        expect(factory.warehouseClients).toEqual({ 'project-uuid': cached });
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
        const { factory, projectModel } = buildFixture();
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
        expect(factory.warehouseClients['agent:project-uuid']).toBeDefined();
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
            const { factory } = buildFixture(enabled);
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
        expect(factory.warehouseClients).toEqual({ 'project-uuid': query });
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
            const { factory } = buildFixture(enabled);
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
