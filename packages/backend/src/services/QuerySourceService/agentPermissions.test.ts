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
    type AgentCapabilityPolicy,
    type SourceQuery,
} from '@lightdash/common';
import type { Request } from 'express';
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
    const policy: AgentCapabilityPolicy = {
        mode: mode === 'off' ? 'managed' : mode,
        version: 1,
        allowedProjectUuids: [projectUuid],
        allowedUserUuids: null,
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
    const confirmation = {
        get: vi.fn().mockResolvedValue(null),
        getCurrentBindingFingerprint: vi.fn().mockResolvedValue('binding'),
        upsert: vi.fn(),
        delete: vi.fn(),
    };
    const permissions = new AgentPermissionService({
        featureFlagModel,
        projectModel,
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn(),
        },
        agentWarehouseRestrictionConfirmationModel: confirmation,
        userModel: {
            findSessionUserByUUIDInOrganization: vi.fn(),
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.DEVELOPER],
                customRoles: [],
            }),
        },
        isCustomRolesLicensed: () => false,
        getOrganizationSettings: vi.fn().mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
        }),
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
        policy,
        confirmation,
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
        it.each([
            [false, false, AiAccessRefusalReason.AGENT_CAPABILITY_DENIED],
            [true, false, AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED],
        ] as const)(
            'refuses before any node or cache access (grant=%s, confirmed=%s)',
            async (grant, confirmed, reason) => {
                const { policy, composer, asyncQueryService } = setup();
                if (grant)
                    policy.systemRoleMatrix.developer.push(
                        AgentCapability.RawSql,
                    );
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
            },
        );

        it('dispatches SQL with its grant and current binding confirmation', async () => {
            const { policy, confirmation, composer, asyncQueryService } =
                setup();
            policy.systemRoleMatrix.developer.push(AgentCapability.RawSql);
            confirmation.get.mockResolvedValue({
                bindingFingerprint: 'binding',
            });
            await composer(surface, [semanticQuery, sqlQuery]);
            expect(
                asyncQueryService.executeAsyncSqlQuery,
            ).toHaveBeenCalledOnce();
            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).toHaveBeenCalledOnce();
        });

        it('dispatches semantic-only with query and no warehouse confirmation', async () => {
            const { composer, asyncQueryService, confirmation } = setup();
            await composer(surface, [semanticQuery]);
            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).toHaveBeenCalledOnce();
            expect(confirmation.get).not.toHaveBeenCalled();
        });
    },
);

describe('OAuth REST source dispatch', () => {
    it('allows SQL execution with both grants and current confirmation', async () => {
        const { controller, request, policy, confirmation, asyncQueryService } =
            setup();
        policy.systemRoleMatrix.developer.push(AgentCapability.RawSql);
        await expect(
            controller.executeSourceQueries(
                { queries: [sqlQuery] },
                projectUuid,
                request,
            ),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
            },
        });
        confirmation.get.mockResolvedValue({ bindingFingerprint: 'binding' });
        await controller.executeSourceQueries(
            { queries: [sqlQuery] },
            projectUuid,
            request,
        );
        expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
    });

    it('allows semantic-only execution with query and no confirmation', async () => {
        const { controller, request, confirmation, asyncQueryService } =
            setup();
        await controller.executeSourceQueries(
            { queries: [semanticQuery] },
            projectUuid,
            request,
        );
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).toHaveBeenCalledOnce();
        expect(confirmation.get).not.toHaveBeenCalled();
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

    it('requires confirmation for SQL scans and accepts the current binding', async () => {
        const { controller, request, policy, confirmation, projectService } =
            setup();
        policy.systemRoleMatrix.developer.push(AgentCapability.RawSql);
        await expect(
            controller.scanQuerySourceSchema(
                projectUuid,
                QuerySourceType.SQL,
                request,
            ),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
            },
        });
        confirmation.get.mockResolvedValue({ bindingFingerprint: 'binding' });
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
                confirmation,
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
                expect(confirmation.get).not.toHaveBeenCalled();
            }
        });
    },
);
