import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    FeatureFlags,
    OrganizationMemberRole,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    QuerySurface,
    type Account,
    type AgentCapabilityPolicyState,
    type SourceQuery,
} from '@lightdash/common';
import type { Request } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
} from '../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import { QuerySourceController } from '../../controllers/v2/QuerySourceController';
import { AiAgentToolsService } from '../../ee/services/AiAgentToolsService/AiAgentToolsService';
import { CatalogSearchContext } from '../../models/CatalogModel/CatalogModel';
import {
    expectAdmissionSql,
    setupPermissionSql,
} from '../../services/AgentPermissionService/agentPermissionSqlFixture';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../AgentPermissionService/AgentPermissionService';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import type { ServiceRepository } from '../ServiceRepository';
import { QuerySourceRegistry } from './QuerySourceRegistry';
import { QuerySourceService } from './QuerySourceService';

const projectUuid = 'test-project';
const semanticQuery: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'semantic',
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_count'],
};
const sqlQuery: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'raw',
    sql: 'select 1',
};

const setup = (
    mode: 'off' | 'legacy' | 'managed' = 'managed',
    account: Account = buildAccount(),
) => {
    const organizationUuid = account.organization.organizationUuid!;
    const policy: AgentCapabilityPolicyState = {
        mode: mode === 'off' ? 'managed' : mode,
        version: 1,
        allowedCapabilities: null,
        allowedGroupUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
    };
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId !== FeatureFlags.AgentIdentity || mode !== 'off',
        })),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid }),
    };
    const groupsModel = { findUserInGroups: vi.fn().mockResolvedValue([]) };
    const permissions = new AgentPermissionService({
        featureFlagModel,
        projectModel,
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            getForEnforcement: vi.fn().mockImplementation(async () => ({
                ...policy,
                storedAllowedGroupUuids: policy.allowedGroupUuids,
                hasExistingAllowedGroup:
                    policy.allowedGroupUuids === null
                        ? null
                        : policy.allowedGroupUuids.length > 0,
            })),
            save: vi.fn(),
        },
        userModel: {
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.DEVELOPER],
                customRoles: [],
            }),
        },
        groupsModel,
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        isCustomRolesLicensed: () => false,

        resolveResourceProjectUuid: vi.fn().mockResolvedValue(projectUuid),
        agentActionLogModel: { insert: vi.fn() },
    });
    const asyncQueryService = {
        executeAsyncSqlQuery: vi.fn().mockResolvedValue({
            queryUuid: 'raw-result',
            cacheMetadata: { cacheHit: true },
        }),
        executeAsyncMetricQuery: vi.fn().mockResolvedValue({
            queryUuid: 'semantic-result',
            cacheMetadata: { cacheHit: true },
        }),
        getAsyncQueryResults: vi.fn().mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [],
            columns: {},
        }),
    };
    const projectService = {
        getWarehouseTables: vi.fn().mockResolvedValue({}),
    };
    const registry = QuerySourceRegistry.withBuiltInSources({
        asyncQueryService,
        projectService,
    } as unknown as Parameters<
        typeof QuerySourceRegistry.withBuiltInSources
    >[0]);
    const service = new QuerySourceService({
        getAsyncQueryService: () => ({
            assertCanReadStoredResults: vi.fn(async () => {}),
        }),
        featureFlagModel,
        projectModel,
        queryHistoryModel: {},
        getAgentPermissionService: () => permissions,
        registry,
    } as unknown as ConstructorParameters<typeof QuerySourceService>[0]);
    const tools = new AiAgentToolsService({
        querySourceService: service,
        agentPermissionService: permissions,
        asyncQueryService,
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 100 } } },
    } as unknown as ConstructorParameters<typeof AiAgentToolsService>[0]);
    const composer = (surface: AgentActorSurface, queries: SourceQuery[]) => {
        const runtimeAccount =
            surface === AgentActorSurface.MCP &&
            account.authentication.type === 'session'
                ? fromOauth(defaultSessionUser, {
                      accessToken: 'test-token',
                      client: { id: 'client' },
                  })
                : account;
        return agentExecutionContext.run(
            createAgentExecutionContext({
                account: runtimeAccount,
                surface,
                clientId: null,
                agentUuid: null,
                agentIdentityEnabled: mode !== 'off',
            }),
            () =>
                tools
                    .createRuntime({
                        account: runtimeAccount,
                        user: defaultSessionUser,
                        organizationUuid,
                        projectUuid,
                        source:
                            surface === AgentActorSurface.MCP
                                ? 'mcp'
                                : 'ai_agent',
                        querySurface:
                            surface === AgentActorSurface.MCP
                                ? QuerySurface.MCP
                                : QuerySurface.APP,
                        defaultQueryExecutionContext: QueryExecutionContext.AI,
                        catalogSearchContext: CatalogSearchContext.AI_AGENT,
                        tags: null,
                        spaceAccess: null,
                    } as Parameters<AiAgentToolsService['createRuntime']>[0])
                    .runComposerQueries({
                        queries,
                        terminalNodeId: queries.at(-1)!.nodeId!,
                    }),
        );
    };
    const controller = new QuerySourceController({
        getQuerySourceService: () => service,
    } as unknown as ServiceRepository);
    const oauth = fromOauth(defaultSessionUser, {
        accessToken: 'test-token',
        client: { id: 'test-client' },
    });
    const request = {
        account: oauth,
        header: () => undefined,
    } as unknown as Request;
    return {
        service,
        permissions,
        groupsModel,
        policy,
        composer,
        controller,
        request,
        asyncQueryService,
        projectService,
        account,
    };
};

describe.each([AgentActorSurface.MCP, AgentActorSurface.IN_APP_AGENT])(
    '%s composer SQL ceiling',
    (surface) => {
        it('refuses without the SQL grant before any node or cache access', async () => {
            const { composer, asyncQueryService } = setup();
            const reason = AiAccessRefusalReason.AGENT_CAPABILITY_DENIED;
            await expect(
                composer(surface, [semanticQuery, sqlQuery]),
            ).rejects.toMatchObject({ refusal: { reason } });
            expect(
                asyncQueryService.executeAsyncSqlQuery,
            ).not.toHaveBeenCalled();
            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).not.toHaveBeenCalled();
            expect(
                asyncQueryService.getAsyncQueryResults,
            ).not.toHaveBeenCalled();
        });

        it('dispatches SQL with its grant and no project confirmation', async () => {
            const { policy, composer, asyncQueryService } = setup();
            policy.systemRoleMatrix.developer.push(AgentCapability.RawSql);
            await composer(surface, [semanticQuery, sqlQuery]);
            expect(
                asyncQueryService.executeAsyncSqlQuery,
            ).toHaveBeenCalledOnce();
            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).toHaveBeenCalledOnce();
        });

        it('dispatches semantic-only with query and no warehouse confirmation', async () => {
            const { composer, asyncQueryService } = setup();
            await composer(surface, [semanticQuery]);
            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).toHaveBeenCalledOnce();
        });
    },
);

describe('OAuth REST source dispatch', () => {
    it('allows SQL execution with both grants and no project confirmation', async () => {
        const { controller, request, policy, asyncQueryService } = setup();
        policy.systemRoleMatrix.developer.push(AgentCapability.RawSql);

        await controller.executeSourceQueries(
            { queries: [sqlQuery] },
            projectUuid,
            request,
        );
        expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
    });

    it('allows semantic-only execution with query and no confirmation', async () => {
        const { controller, request, asyncQueryService } = setup();
        await controller.executeSourceQueries(
            { queries: [semanticQuery] },
            projectUuid,
            request,
        );
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).toHaveBeenCalledOnce();
    });
    it('refuses SQL submissions and schema scans before dispatch', async () => {
        const { controller, request, asyncQueryService, projectService } =
            setup();
        await expect(
            controller.executeSourceQueries(
                { queries: [sqlQuery] },
                projectUuid,
                request,
            ),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
        });
        await expect(
            controller.scanQuerySourceSchema(
                projectUuid,
                QuerySourceType.SQL,
                request,
            ),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
        });
        expect(asyncQueryService.executeAsyncSqlQuery).not.toHaveBeenCalled();
        expect(projectService.getWarehouseTables).not.toHaveBeenCalled();
    });

    it('allows SQL scans with the SQL grant and no project confirmation', async () => {
        const { controller, request, policy, projectService } = setup();
        policy.systemRoleMatrix.developer.push(AgentCapability.RawSql);
        await controller.scanQuerySourceSchema(
            projectUuid,
            QuerySourceType.SQL,
            request,
        );
        expect(projectService.getWarehouseTables).toHaveBeenCalledOnce();
    });

    it.each(['off', 'legacy'] as const)(
        '%s leaves SQL dispatch unchanged',
        async (mode) => {
            const { controller, request, asyncQueryService } = setup(mode);
            await controller.executeSourceQueries(
                { queries: [sqlQuery] },
                projectUuid,
                request,
            );
            expect(
                asyncQueryService.executeAsyncSqlQuery,
            ).toHaveBeenCalledOnce();
        },
    );

    it('does not narrow session REST calls', async () => {
        const { controller, request, account, asyncQueryService } = setup();
        await controller.executeSourceQueries(
            { queries: [sqlQuery] },
            projectUuid,
            { ...request, account } as Request,
        );
        expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
    });

    it('does not narrow personal-token REST calls', async () => {
        const { controller, request, asyncQueryService } = setup();
        const account = fromApiKey(defaultSessionUser, 'test-token');
        await controller.executeSourceQueries(
            { queries: [sqlQuery] },
            projectUuid,
            { ...request, account } as Request,
        );
        expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
    });
});

describe.each(['pat', 'service-account', 'oauth'] as const)(
    '%s MCP source access',
    (kind) => {
        it('applies the outer MCP exemption to composer SQL and schema scans', async () => {
            const accounts = {
                pat: () => fromApiKey(defaultSessionUser, 'token'),
                oauth: () =>
                    fromOauth(defaultSessionUser, {
                        accessToken: 'token',
                        client: { id: 'client' },
                    }),
                'service-account': () =>
                    fromServiceAccount(
                        {
                            ...defaultSessionUser,
                            serviceAccount: {
                                uuid: 'service-account',
                                description: 'test',
                            },
                        },
                        'token',
                    ),
            };
            const account = accounts[kind]();
            const {
                composer,
                controller,
                request,
                asyncQueryService,
                projectService,
            } = setup('managed', account);
            const scan = () =>
                agentExecutionContext.run(
                    createAgentExecutionContext({
                        account,
                        surface: AgentActorSurface.MCP,
                        clientId: null,
                        agentUuid: null,
                        agentIdentityEnabled: true,
                    }),
                    () =>
                        controller.scanQuerySourceSchema(
                            projectUuid,
                            QuerySourceType.SQL,
                            { ...request, account } as Request,
                        ),
                );
            if (kind === 'oauth') {
                await expect(
                    composer(AgentActorSurface.MCP, [sqlQuery]),
                ).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    },
                });
                await expect(scan()).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    },
                });
                expect(
                    asyncQueryService.executeAsyncSqlQuery,
                ).not.toHaveBeenCalled();
                expect(
                    projectService.getWarehouseTables,
                ).not.toHaveBeenCalled();
            } else {
                await composer(AgentActorSurface.MCP, [sqlQuery]);
                await scan();
                expect(
                    asyncQueryService.executeAsyncSqlQuery,
                ).toHaveBeenCalledOnce();
                expect(
                    projectService.getWarehouseTables,
                ).toHaveBeenCalledOnce();
            }
        });
    },
);

test.each([AgentActorSurface.MCP, AgentActorSurface.IN_APP_AGENT])(
    'legacy group admission protects %s composer before dispatch',
    async (surface) => {
        const h = setup('legacy');
        h.policy.allowedGroupUuids = ['group'];
        await expect(
            h.composer(surface, [semanticQuery, sqlQuery]),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
        });
        expect(h.asyncQueryService.executeAsyncSqlQuery).not.toHaveBeenCalled();
        expect(
            h.asyncQueryService.executeAsyncMetricQuery,
        ).not.toHaveBeenCalled();
        h.groupsModel.findUserInGroups.mockResolvedValue([
            { groupUuid: 'group' },
        ]);
        await h.composer(surface, [semanticQuery, sqlQuery]);
        expect(h.asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
    },
);

test('legacy group admission protects OAuth source dispatch and scans', async () => {
    const h = setup('legacy');
    h.policy.allowedGroupUuids = ['group'];
    await expect(
        h.controller.executeSourceQueries(
            { queries: [sqlQuery] },
            projectUuid,
            h.request,
        ),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    await expect(
        h.controller.scanQuerySourceSchema(
            projectUuid,
            QuerySourceType.SQL,
            h.request,
        ),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    expect(h.asyncQueryService.executeAsyncSqlQuery).not.toHaveBeenCalled();
    expect(h.projectService.getWarehouseTables).not.toHaveBeenCalled();
});

const admissionDatabase = knex({ client: MockClient, dialect: 'pg' });
const admissionTracker = getTracker();
beforeEach(() => admissionTracker.reset());
afterAll(async () => admissionDatabase.destroy());

test.each(['scan', 'dispatch', 'semantic'] as const)(
    'SQL admission shares the query-source %s gate',
    async (surface) => {
        const h = setup('legacy');
        const sql = setupPermissionSql(
            admissionDatabase,
            admissionTracker,
            fromOauth(defaultSessionUser, {
                accessToken: 'token',
                client: { id: 'client' },
            }),
        );
        Object.assign(h.service, {
            getAgentPermissionService: () => sql.service,
        });
        if (surface === 'scan')
            await h.controller.scanQuerySourceSchema(
                projectUuid,
                QuerySourceType.SQL,
                h.request,
            );
        else
            await h.controller.executeSourceQueries(
                {
                    queries:
                        surface === 'semantic'
                            ? [semanticQuery]
                            : [sqlQuery, { ...sqlQuery, nodeId: 'second' }],
                },
                projectUuid,
                h.request,
            );
        expectAdmissionSql(admissionTracker, {
            policy: surface === 'semantic' ? 0 : 1,
            groups: 0,
            people: 0,
            membership: surface === 'semantic' ? 0 : 1,
        });
    },
);

test.each([
    AgentActorSurface.MCP,
    AgentActorSurface.IN_APP_AGENT,
    AgentActorSurface.SLACK_AGENT,
])(
    'empty capability list stops %s query source before dispatch',
    async (surface) => {
        const h = setup();
        h.policy.systemRoleMatrix.developer = [
            AgentCapability.Query,
            AgentCapability.RawSql,
        ];
        h.policy.allowedCapabilities = [];
        await expect(h.composer(surface, [sqlQuery])).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
                settingsUrl: '/generalSettings/agentIdentity',
            },
        });
        expect(h.asyncQueryService.executeAsyncSqlQuery).not.toHaveBeenCalled();
        h.policy.allowedCapabilities = [
            AgentCapability.Query,
            AgentCapability.RawSql,
        ];
        await h.composer(surface, [sqlQuery]);
        expect(h.asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
    },
);

describe.each(['off', 'managed'] as const)(
    'ordinary REST queries with flag mode %s',
    (mode) => {
        test.each(['session', 'pat', 'service-account'] as const)(
            '%s makes no policy read',
            async (kind) => {
                const accounts = {
                    session: () => buildAccount(),
                    pat: () => fromApiKey(defaultSessionUser, 'token'),
                    'service-account': () =>
                        fromServiceAccount(
                            {
                                ...defaultSessionUser,
                                serviceAccount: {
                                    uuid: 'service-account',
                                    description: 'test',
                                },
                            },
                            'token',
                        ),
                };
                const account = accounts[kind]();
                const h = setup(mode, account);
                h.policy.allowedCapabilities = [];
                h.policy.allowedGroupUuids = [];
                const load = vi.spyOn(h.permissions, 'loadRequest');
                await h.controller.executeSourceQueries(
                    { queries: [sqlQuery] },
                    projectUuid,
                    { ...h.request, account } as Request,
                );
                expect(
                    h.asyncQueryService.executeAsyncSqlQuery,
                ).toHaveBeenCalledOnce();
                expect(load).not.toHaveBeenCalled();
            },
        );
    },
);
