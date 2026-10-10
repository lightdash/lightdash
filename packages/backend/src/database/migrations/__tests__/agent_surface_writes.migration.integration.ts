import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    ChartType,
    ContentAsCodeType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    ProjectType,
    toolCreateContentArgsSchema,
    type AiWebAppPrompt,
    type ChartAsCode,
    type PossibleAbilities,
    type SessionUser,
    type SlackPrompt,
} from '@lightdash/common';
import express, {
    type NextFunction,
    type Request,
    type Response,
} from 'express';
import { randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { fromOauth } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiAgentModel } from '../../../ee/models/AiAgentModel';
import { generateAgentResponse } from '../../../ee/services/ai/agents/agentV2';
import { getCreateContent } from '../../../ee/services/ai/tools/createContent';
import { AiAgentContentValidation } from '../../../ee/services/ai/utils/AiAgentContentValidation';
import { AiAgentService } from '../../../ee/services/AiAgentService/AiAgentService';
import { AiAgentToolsService } from '../../../ee/services/AiAgentToolsService/AiAgentToolsService';
import { McpService } from '../../../ee/services/McpService/McpService';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AppModel } from '../../../models/AppModel';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';
import mcpRouter from '../../../routers/mcpRouter';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { CoderService } from '../../../services/CoderService/CoderService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

vi.mock('../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));
vi.mock('../../../controllers/authentication', () => ({
    allowApiKeyAuthentication: (
        _req: Request,
        _res: Response,
        next: NextFunction,
    ) => next(),
}));
vi.mock('../../../ee/services/ai/agents/agentV2', async (original) => ({
    ...(await original<
        typeof import('../../../ee/services/ai/agents/agentV2')
    >()),
    generateAgentResponse: vi.fn(),
}));
vi.mock('../../../ee/services/ai/models', async (original) => ({
    ...(await original<typeof import('../../../ee/services/ai/models')>()),
    getModel: () => ({
        model: { modelId: 'fixture-model' },
        provider: 'openai',
    }),
}));

describe('trusted surface to persisted chart identity', () => {
    let migrated: MigratedDatabase;
    const servers: Server[] = [];
    beforeAll(async () => {
        migrated = await createMigratedDatabase();
    });
    afterEach(async () => {
        vi.restoreAllMocks();
        await Promise.all(
            servers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve, reject) => {
                        server.close((error) =>
                            error ? reject(error) : resolve(),
                        );
                        server.closeAllConnections();
                    }),
            ),
        );
    });
    afterAll(async () => {
        await migrated?.destroy();
    });

    const setup = async (enabled: boolean) => {
        const { database } = migrated;
        const [org] = await database('organizations')
            .insert({ organization_name: 'Surface identity' })
            .returning('*');
        const [person] = await database('users')
            .insert({
                first_name: 'Surface',
                last_name: 'Writer',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('*');
        const [project] = await database('projects')
            .insert({
                name: 'Surface project',
                organization_id: org.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: person.user_uuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning('*');
        const [space] = await database('spaces')
            .insert({
                name: 'Reports',
                slug: 'reports',
                path: 'reports',
                project_id: project.project_id,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('*');
        const user: SessionUser = {
            ...defaultSessionUser,
            userUuid: person.user_uuid,
            organizationUuid: org.organization_uuid,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'all' },
            ]),
        };
        const projectUuid: string = project.project_uuid;
        const organizationUuid: string = org.organization_uuid;
        const [{ ai_agent_uuid: agentUuid }] = await database('ai_agent')
            .insert({
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
                name: 'Stored agent',
                slug: 'stored-agent',
                description: '',
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: true,
                enable_content_tools: true,
                enable_sql_mode: false,
                enable_user_context: false,
                enable_self_improvement: false,
                admin_only: false,
                model_config: null,
                ai_organization_provider_credential_uuid: null,
                is_system: false,
                version: 1,
                thread_retention_hours: null,
            })
            .returning('ai_agent_uuid');
        const projectInfo = {
            projectUuid,
            organizationUuid,
            name: project.name,
            type: ProjectType.DEFAULT,
            dbtConnection: { type: 'dbt' },
        };
        const projectModel = {
            get: vi.fn().mockResolvedValue(projectInfo),
            getAgentSqlScope: vi.fn().mockResolvedValue(null),
            getSummary: vi.fn().mockResolvedValue(projectInfo),
        };
        const config = {
            ...lightdashConfigMock,
            mcp: { ...lightdashConfigMock.mcp, enabled: true },
        };
        const featureFlagService = {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.AgentIdentity && enabled,
                }),
            ),
        };
        const contentVerificationModel = new ContentVerificationModel({
            database,
        });
        const savedChartModel = new SavedChartModel({
            database,
            lightdashConfig: config,
            contentVerificationModel,
        });
        const dashboardModel = new DashboardModel({
            database,
            contentVerificationModel,
        });
        const agentActionLogModel = new AgentActionLogModel({ database });
        const spaceModel = new SpaceModel({ database });
        const spacePermissionService = {
            can: vi.fn().mockResolvedValue(true),
            resolveAccessBatch: vi.fn(async () => [
                {
                    target: { type: 'space', spaceUuid: space.space_uuid },
                    context: {
                        projectUuid,
                        organizationUuid,
                        spaceUuid: space.space_uuid,
                    },
                    access: [],
                },
            ]),
        };
        const coderService = new CoderService({
            lightdashConfig: config,
            savedChartModel,
            dashboardModel,
            spaceModel,
            projectModel,
            spacePermissionService,
            contentVerificationModel,
            appModel: new AppModel({ database }),
            agentActionLogModel,
            contentAsCodeProjectSettingsModel: {
                get: vi.fn().mockResolvedValue(null),
            },
        } as unknown as ConstructorParameters<typeof CoderService>[0]);
        const tools = new AiAgentToolsService({
            lightdashConfig: config,
            coderService,
            spaceModel,
            agentActionLogModel,
            aiAgentContentValidation: new AiAgentContentValidation(),
            savedChartService: {
                get: (slug: string) =>
                    savedChartModel.get(slug, undefined, { projectUuid }),
            },
            featureFlagService,
            builtInSkills: {
                getAiAgentSkills: vi.fn().mockResolvedValue([]),
                listSkillToolReferences: vi.fn().mockResolvedValue([]),
                listMcpResources: vi.fn().mockResolvedValue([]),
            },
        } as unknown as ConstructorParameters<typeof AiAgentToolsService>[0]);
        vi.spyOn(tools, 'canGenerateDataApp').mockResolvedValue(false);
        const content = {
            version: 1,
            contentType: ContentAsCodeType.CHART,
            description: '',
            verified: false,
            dashboardSlug: '',
            name: 'Surface chart',
            slug: 'surface-chart',
            spaceSlug: 'reports',
            tableName: 'orders',
            chartConfig: { type: ChartType.TABLE },
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 10,
                tableCalculations: [],
            },
        } satisfies ChartAsCode;
        return {
            user,
            projectUuid,
            organizationUuid,
            agentUuid,
            projectModel,
            projectInfo,
            config,
            featureFlagService,
            tools,
            coderService,
            content,
            agentActionLogModel,
        };
    };

    const assertStorage = async (
        fixture: Awaited<ReturnType<typeof setup>>,
        surface:
            | AgentActorSurface.MCP
            | AgentActorSurface.IN_APP_AGENT
            | AgentActorSurface.SLACK_AGENT
            | null,
        enabled: boolean,
    ) => {
        const versions = await migrated
            .database('saved_queries_versions')
            .join(
                'saved_queries',
                'saved_queries.saved_query_id',
                'saved_queries_versions.saved_query_id',
            )
            .where('saved_queries.project_uuid', fixture.projectUuid)
            .select(
                'saved_queries_versions.*',
                'saved_queries.saved_query_uuid',
            );
        expect(versions).toHaveLength(1);
        const rows = await migrated
            .database('agent_action_log')
            .where({ project_uuid: fixture.projectUuid });
        if (surface && enabled) {
            expect(versions[0].agent_identity).toMatchObject({
                subject: { uuid: fixture.user.userUuid },
                act: {
                    surface,
                    client_id: {
                        [AgentActorSurface.MCP]: 'authenticated-oauth-client',
                        [AgentActorSurface.IN_APP_AGENT]: 'lightdash-chat',
                        [AgentActorSurface.SLACK_AGENT]: 'installed-slack-app',
                    }[surface],
                    agent_uuid:
                        surface === AgentActorSurface.MCP
                            ? null
                            : fixture.agentUuid,
                },
            });
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                agent_identity: versions[0].agent_identity,
                version_uuid: versions[0].saved_queries_version_uuid,
                object_uuid: versions[0].saved_query_uuid,
                object_type: 'chart',
                action: 'create',
                outcome: 'allowed',
            });
        } else {
            expect(versions[0].agent_identity).toBeNull();
            expect(rows).toHaveLength(0);
        }
        expect(agentExecutionContext.getStore()).toBeUndefined();
    };

    test.each([true, false])(
        'OAuth MCP HTTP dispatch enabled=%s',
        async (enabled) => {
            const f = await setup(enabled);
            const mcp = new McpService({
                lightdashConfig: f.config,
                aiAgentToolsService: f.tools,
                agentActionLogModel: f.agentActionLogModel,
                featureFlagService: f.featureFlagService,
                projectModel: f.projectModel,
                projectService: {
                    getProject: vi.fn().mockResolvedValue(f.projectInfo),
                },
                aiOrganizationSettingsService: {
                    isMcpContentWritesEnabled: vi.fn().mockResolvedValue(true),
                },
                aiAgentSkillService: {
                    listMcpSkills: vi.fn().mockResolvedValue([]),
                },
                mcpContextModel: {
                    getContext: vi.fn().mockResolvedValue(null),
                },
                mcpToolCallModel: { createToolCall: vi.fn() },
                analytics: { track: vi.fn() },
            } as unknown as ConstructorParameters<typeof McpService>[0]);
            const account = fromOauth(f.user, {
                accessToken: 'fixture-token',
                scope: ['mcp:read', 'mcp:write'],
                client: { id: 'authenticated-oauth-client' },
            });
            const app = express();
            app.use(express.json());
            app.use((req, _res, next) => {
                req.account = account;
                req.user = f.user;
                req.services = {
                    getMcpService: () => mcp,
                } as Express.Request['services'];
                next();
            });
            app.use('/api/v1/mcp', mcpRouter);
            const server = app.listen(0, '127.0.0.1');
            servers.push(server);
            await new Promise<void>((resolve) => {
                server.once('listening', resolve);
            });
            const response = await fetch(
                `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/mcp`,
                {
                    method: 'POST',
                    signal: AbortSignal.timeout(10000),
                    headers: {
                        authorization: 'Bearer fixture-token',
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                        'x-client-id': 'spoofed-client',
                        'x-agent-uuid': 'spoofed-agent',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: {
                            name: 'create_content',
                            arguments: {
                                projectUuid: f.projectUuid,
                                type: 'chart',
                                content: f.content,
                            },
                        },
                    }),
                },
            );
            const body = await response.text();
            expect({ status: response.status, body }).toMatchObject({
                status: 200,
            });
            expect(body).not.toContain('"isError":true');
            expect(body).toContain('Surface chart');
            await assertStorage(f, AgentActorSurface.MCP, enabled);
        },
    );

    test.each(
        (
            [
                AgentActorSurface.IN_APP_AGENT,
                AgentActorSurface.SLACK_AGENT,
            ] as const
        ).flatMap((surface) =>
            [true, false].map((enabled) => ({ surface, enabled })),
        ),
    )('$surface runtime enabled=$enabled', async ({ surface, enabled }) => {
        const f = await setup(enabled);
        const service = new AiAgentService({
            lightdashConfig: f.config,
            projectModel: f.projectModel,
            aiAgentToolsService: f.tools,
            aiAgentModel: new AiAgentModel({
                database: migrated.database,
                lightdashConfig: f.config,
            } as ConstructorParameters<typeof AiAgentModel>[0]),
            featureFlagService: f.featureFlagService,
            aiOrganizationSettingsService: {
                isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
            },
            orgAiCopilotConfigResolver: {
                isOrgBedrockRouted: vi.fn().mockResolvedValue(false),
                getCopilotConfig: vi
                    .fn()
                    .mockResolvedValue({ defaultProvider: 'openai' }),
            },
            slackAuthenticationModel: {
                getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({
                    aiRequireOAuth: true,
                    appId: 'installed-slack-app',
                }),
            },
            aiAgentDocumentModel: {
                findAllContextForAgent: vi.fn().mockResolvedValue([]),
            },
            aiDeepResearchRunModel: {
                findAgentContextByThreadScoped: vi.fn().mockResolvedValue([]),
                findLatestProgressByRunUuids: vi.fn().mockResolvedValue([]),
            },
            aiThreadFileModel: { findForThread: vi.fn().mockResolvedValue([]) },
            aiAgentSkillModel: {
                findBoundToAgent: vi.fn().mockResolvedValue([]),
            },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        vi.spyOn(
            service as unknown as {
                getIsCopilotEnabled: () => Promise<boolean>;
            },
            'getIsCopilotEnabled',
        ).mockResolvedValue(true);
        vi.spyOn(
            service as unknown as {
                getPromptDecisionClient: () => Promise<undefined>;
            },
            'getPromptDecisionClient',
        ).mockResolvedValue(undefined);
        vi.spyOn(
            service as unknown as {
                canCreateDashboardsInProject: () => Promise<boolean>;
            },
            'canCreateDashboardsInProject',
        ).mockResolvedValue(true);
        vi.spyOn(
            service as unknown as {
                getAgentRuntimeMcpServers: () => Promise<[]>;
            },
            'getAgentRuntimeMcpServers',
        ).mockResolvedValue([]);
        vi.mocked(generateAgentResponse).mockImplementation(
            async ({ dependencies }) => {
                const tool = getCreateContent({
                    createContent: dependencies.createContent,
                    sqlChartSaving: { mode: 'client_approved' },
                });
                const result = await tool.execute!(
                    toolCreateContentArgsSchema.parse({
                        type: 'chart',
                        content: f.content,
                    }),
                    { toolCallId: 'create-once', context: {}, messages: [] },
                );
                expect(result).toMatchObject({
                    metadata: { status: 'success' },
                });
                return 'Chart created';
            },
        );
        const prompt = {
            agentUuid: f.agentUuid,
            organizationUuid: f.organizationUuid,
            projectUuid: f.projectUuid,
            threadUuid: randomUUID(),
            promptUuid: randomUUID(),
            prompt: 'Create a chart',
            battleProfile: null,
            threadCreatedFrom:
                surface === AgentActorSurface.SLACK_AGENT ? 'slack' : 'web_app',
            threadEmbedSpaceUuid: null,
            externalUserId: null,
            ...(surface === AgentActorSurface.SLACK_AGENT
                ? { slackUserId: 'slack-user' }
                : {}),
        } as AiWebAppPrompt | SlackPrompt;
        await expect(
            service.generateOrStreamAgentResponse(
                f.user,
                {
                    messageHistory: [],
                    compactionSummary: null,
                    resolveMessageHistory: async () => [],
                },
                {
                    prompt: prompt as AiWebAppPrompt,
                    stream: false,
                    canManageAgent: false,
                    aiCreditCheck: null,
                    isReviewRemediationWorkThread: false,
                },
            ),
        ).resolves.toBe('Chart created');
        await assertStorage(f, surface, enabled);
    });

    test('human uses the same chart writer without a scope', async () => {
        const f = await setup(true);
        await f.coderService.upsertChart(
            f.user,
            f.projectUuid,
            f.content.slug,
            f.content,
            { mode: 'create' },
        );
        await assertStorage(f, null, true);
    });
});
