import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AnyType,
    ConflictError,
    DEFAULT_MANAGED_AGENT_POLICY,
    FeatureFlags,
    InvalidUser,
    ManagedAgentActionType,
    ManagedAgentRunStatus,
    ManagedAgentTargetType,
    ValidationErrorType,
    ValidationSourceType,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { MockLanguageModelV3 } from 'ai/test';
import { fromSession } from '../../../auth/account';
import { AgentPermissionService } from '../../../services/AgentPermissionService/AgentPermissionService';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import {
    metricQueryMock,
    validExplore,
} from '../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../ai/decisions/AiDecisionClient';
import { getAvailableModels, getModel } from '../ai/models';
import { type getFindContent } from '../ai/tools/findContent';
import { type getRunMetricQuery } from '../ai/tools/runMetricQuery';
import {
    AUTOPILOT_AUTHORITY_CHECK_FAILED_MESSAGE,
    AUTOPILOT_AUTHORITY_REFUSED_MESSAGE,
    createAutopilotAuthority,
} from './autopilotAuthority';
import { ManagedAgentService } from './ManagedAgentService';

const captureAutopilotFailure = vi.fn();
vi.mock('./autopilotFailure', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./autopilotFailure')>()),
    captureAutopilotFailure: (...args: unknown[]) =>
        captureAutopilotFailure(...args),
}));

vi.mock('../ai/models', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ai/models')>()),
    getModel: vi.fn(),
    getAvailableModels: vi.fn(),
}));

const copilotConfig = {
    defaultProvider: 'anthropic',
    telemetryEnabled: false,
    providers: { anthropic: { modelName: 'claude-sonnet-4-6' } },
    byoProviders: [],
};
const resolvedModel = {
    model: {},
    callOptions: {},
    providerOptions: {},
    keyManagement: 'self-managed',
};

const ORGANIZATION_UUID = 'organization-uuid';
const PROJECT_UUID = 'project-uuid';
const USER_UUID = 'user-uuid';

const settings = {
    projectUuid: PROJECT_UUID,
    enabled: true,
    schedule: 'daily',
    enabledByUserUuid: USER_UUID,
    slackChannelId: null,
    toolSettings: {},
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
};

const user = {
    isActive: true,
    userUuid: USER_UUID,
    organizationUuid: ORGANIZATION_UUID,
    abilityRules: [],
    ability: new Ability<PossibleAbilities>([
        { action: 'view', subject: 'Project' },
        {
            action: 'update',
            subject: 'Project',
            conditions: {
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
            },
        },
    ]),
} as AnyType as SessionUser;

const buildService = ({
    suggestionsSpaces = [],
    defaultModelConfig = null,
}: {
    suggestionsSpaces?: Array<{
        uuid: string;
        inheritParentPermissions: boolean;
    }>;
    defaultModelConfig?: {
        modelProvider: string;
        modelName: string;
        reasoning?: boolean;
    } | null;
} = {}) => {
    vi.mocked(getAvailableModels).mockReturnValue([
        { name: 'gpt-5', modelId: 'gpt-5', provider: 'openai' },
        {
            name: 'claude-sonnet-4-6',
            modelId: 'claude-sonnet-4-6',
            provider: 'anthropic',
        },
    ] as AnyType);
    vi.mocked(getModel).mockReset();
    vi.mocked(getModel).mockReturnValue(resolvedModel as AnyType);
    const orgAiCopilotConfigResolver = {
        getCopilotConfig: vi.fn().mockResolvedValue(copilotConfig),
        getOrgModelOverrides: vi.fn().mockResolvedValue({
            modelVisibility: null,
            keyAccessibleModelIds: null,
        }),
    };
    const aiOrganizationSettingsService = {
        getDefaultModelConfig: vi.fn().mockResolvedValue(defaultModelConfig),
    };
    const managedAgentModel = {
        getSettings: vi.fn().mockResolvedValue(settings),
        getLatestRun: vi.fn().mockResolvedValue(null),
        createRunIfIdle: vi.fn().mockResolvedValue(null),
        getRun: vi.fn().mockResolvedValue({
            triggeredBy: 'schedule',
            startedAt: new Date(),
        }),
        finishRun: vi.fn().mockResolvedValue(undefined),
        setRunSessionId: vi.fn().mockResolvedValue(undefined),
        setRunModel: vi.fn().mockResolvedValue(undefined),
        getActionCountsByTypeForRun: vi.fn().mockResolvedValue({}),
        getActions: vi.fn().mockResolvedValue([]),
        getRecentActions: vi.fn().mockResolvedValue([]),
        getAction: vi.fn(),
        reverseAction: vi.fn(),
        createAction: vi.fn().mockResolvedValue({
            actionUuid: 'action-uuid',
            actionType: 'fixed_broken',
        }),
        setCurrentActivity: vi.fn().mockResolvedValue(undefined),
        upsertSettings: vi.fn().mockResolvedValue(settings),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
        }),
        findExploresFromCache: vi.fn().mockResolvedValue({}),
    };
    const schedulerClient = {
        scheduleManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
        triggerManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
        cancelManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const dataRuntime = {
        listExplores: vi.fn().mockResolvedValue([]),
        getProjectParameterDefinitions: vi.fn().mockResolvedValue([]),
        getVerifiedFieldUsage: vi.fn().mockResolvedValue(new Map()),
        findContent: vi.fn().mockResolvedValue({ content: [] }),
        getDashboardCharts: vi.fn(),
    };
    const aiAgentToolsService = {
        createRuntime: vi.fn().mockReturnValue(dataRuntime),
    };
    const slackClient = { postMessage: vi.fn().mockResolvedValue({ ts: '1' }) };
    const analytics = { track: vi.fn() };
    const validationModel = {
        get: vi.fn().mockResolvedValue([]),
        deleteChartValidations: vi.fn().mockResolvedValue(undefined),
    };
    const savedChartModel = {
        get: vi.fn(),
        getLatestVersionSummary: vi.fn().mockResolvedValue({
            versionUuid: 'version-uuid',
        }),
        createVersion: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ uuid: 'new-chart-uuid' }),
    };
    const asyncQueryService = {
        executeMetricQueryAndGetResults: vi.fn().mockResolvedValue({
            rows: [],
        }),
    };
    const spacePermissionService = { resolveAccess: vi.fn() };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        findServiceAccountByUserUuid: vi.fn().mockResolvedValue(undefined),
    };
    const featureFlagModel = { get: vi.fn(async () => ({ enabled: false })) };
    const agentPermissionService = {
        loadRequest: vi.fn().mockResolvedValue({}),
        assertOperationWithRequest: vi.fn().mockResolvedValue(undefined),
    };
    const agentActionLogModel = {
        insert: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ManagedAgentService({
        lightdashConfig: {
            siteUrl: 'http://localhost',
            preAggregates: { enabled: false },
            ai: {
                copilot: { maxQueryLimit: 500, toolDescriptionMaxChars: 500 },
            },
            managedAgent: {
                schedule: '0 0 * * *',
                validatedModels: [],
                maxSteps: 5,
                sessionTimeoutMs: 5000,
            },
        },
        analytics,
        managedAgentModel,
        analyticsModel: {},
        organizationModel: {
            get: vi.fn().mockResolvedValue({
                name: 'Organization',
                organizationUuid: ORGANIZATION_UUID,
            }),
        },
        projectModel,
        validationModel,
        savedChartModel,
        dashboardModel: {},
        spaceModel: {
            find: vi.fn().mockResolvedValue(suggestionsSpaces),
        },
        spacePermissionService,
        userModel,
        featureFlagModel,
        agentPermissionService,
        agentActionLogModel,
        schedulerClient,
        slackClient,
        orgAiCopilotConfigResolver,
        aiOrganizationSettingsService,
        aiAgentToolsService,
        asyncQueryService,
    } as AnyType);

    return {
        userModel,
        featureFlagModel,
        agentPermissionService,
        agentActionLogModel,
        slackClient,
        validationModel,
        savedChartModel,
        spacePermissionService,
        analytics,
        aiAgentToolsService,
        asyncQueryService,
        dataRuntime,
        aiOrganizationSettingsService,
        orgAiCopilotConfigResolver,
        managedAgentModel,
        projectModel,
        schedulerClient,
        service,
    };
};

const startedRun = {
    runUuid: 'run-uuid',
    projectUuid: PROJECT_UUID,
    triggeredBy: 'cron',
    status: ManagedAgentRunStatus.STARTED,
};

describe('ManagedAgentService run locking', () => {
    it('starts a run only when the project has no live run', async () => {
        const { managedAgentModel, service } = buildService();
        managedAgentModel.createRunIfIdle.mockResolvedValueOnce(startedRun);

        await expect(service.startRun(PROJECT_UUID, 'cron')).resolves.toBe(
            startedRun,
        );
        await expect(service.startRun(PROJECT_UUID, 'manual')).rejects.toThrow(
            ConflictError,
        );
    });

    it('refuses run now while a run is live and does not enqueue a job', async () => {
        const { managedAgentModel, schedulerClient, service } = buildService();
        managedAgentModel.getLatestRun.mockResolvedValue(startedRun);

        await expect(
            service.startHeartbeat(user, PROJECT_UUID),
        ).rejects.toThrow(ConflictError);
        expect(
            schedulerClient.triggerManagedAgentHeartbeat,
        ).not.toHaveBeenCalled();
    });

    it('enqueues run now once the latest run has finished', async () => {
        const { managedAgentModel, schedulerClient, service } = buildService();
        managedAgentModel.getLatestRun.mockResolvedValue({
            ...startedRun,
            status: ManagedAgentRunStatus.ERROR,
        });

        await service.startHeartbeat(user, PROJECT_UUID);

        expect(
            schedulerClient.triggerManagedAgentHeartbeat,
        ).toHaveBeenCalledWith(PROJECT_UUID, 'manual');
    });
});

describe('ManagedAgentService.updateSettings', () => {
    it('schedules the heartbeat when Autopilot is enabled', async () => {
        const { schedulerClient, service } = buildService();

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(
            schedulerClient.scheduleManagedAgentHeartbeat,
        ).toHaveBeenCalledWith('0 0 * * *', PROJECT_UUID);
    });
});

describe('ManagedAgentService provider preflight', () => {
    it('rejects enabling on the AI SDK runtime when the org has no usable provider', async () => {
        const { managedAgentModel, schedulerClient, service } = buildService();
        vi.mocked(getModel).mockImplementation(() => {
            throw new Error('anthropic provider configuration is required');
        });

        await expect(
            service.updateSettings(user, PROJECT_UUID, USER_UUID, {
                enabled: true,
            }),
        ).rejects.toThrow(
            /Autopilot needs an AI provider before it can run\. anthropic provider configuration is required\./,
        );

        expect(managedAgentModel.upsertSettings).not.toHaveBeenCalled();
        expect(
            schedulerClient.scheduleManagedAgentHeartbeat,
        ).not.toHaveBeenCalled();
    });

    it('resolves the org default model when enabling on the AI SDK runtime', async () => {
        const { service } = buildService({
            defaultModelConfig: {
                modelProvider: 'openai',
                modelName: 'gpt-5',
            },
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(getModel).toHaveBeenCalledWith(copilotConfig, {
            enableReasoning: true,
            reasoningEffort: 'xhigh',
            provider: 'openai',
            modelName: 'gpt-5',
        });
    });

    it('falls back to the provider default when the org default names an unknown provider', async () => {
        const { service } = buildService({
            defaultModelConfig: {
                modelProvider: 'not-a-provider',
                modelName: 'whatever',
            },
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(getModel).toHaveBeenCalledWith(copilotConfig, {
            enableReasoning: true,
            reasoningEffort: 'xhigh',
            provider: 'anthropic',
            modelName: 'claude-sonnet-4-6',
        });
    });

    it('falls back when the stored org model is no longer available', async () => {
        const { service } = buildService({
            defaultModelConfig: {
                modelProvider: 'openai',
                modelName: 'removed-model',
            },
        });
        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });
        expect(getModel).toHaveBeenCalledWith(copilotConfig, {
            enableReasoning: true,
            reasoningEffort: 'xhigh',
            provider: 'anthropic',
            modelName: 'claude-sonnet-4-6',
        });
    });

    it('does not fall back to a provider hidden by the organization', async () => {
        const { service, orgAiCopilotConfigResolver } = buildService();
        orgAiCopilotConfigResolver.getOrgModelOverrides.mockResolvedValue({
            modelVisibility: { anthropic: { enabled: false } },
            keyAccessibleModelIds: null,
        } as AnyType);
        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });
        expect(getModel).toHaveBeenCalledWith(copilotConfig, {
            enableReasoning: true,
            reasoningEffort: 'xhigh',
            provider: 'openai',
            modelName: 'gpt-5',
        });
    });

    it('rejects enabling when every model is hidden', async () => {
        const { service, orgAiCopilotConfigResolver, managedAgentModel } =
            buildService();
        orgAiCopilotConfigResolver.getOrgModelOverrides.mockResolvedValue({
            modelVisibility: {
                anthropic: { enabled: false },
                openai: { enabled: false },
            },
            keyAccessibleModelIds: null,
        } as AnyType);
        await expect(
            service.updateSettings(user, PROJECT_UUID, USER_UUID, {
                enabled: true,
            }),
        ).rejects.toThrow('No AI model is available');
        expect(managedAgentModel.upsertSettings).not.toHaveBeenCalled();
    });
});

describe('ManagedAgentService heartbeat initialization', () => {
    it('finishes the run as an error if loading its context fails', async () => {
        const { service, managedAgentModel, projectModel } = buildService();
        projectModel.getSummary.mockRejectedValue(
            new Error('Project unavailable'),
        );
        await service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(managedAgentModel.finishRun).toHaveBeenCalledWith('run-uuid', {
            status: 'error',
            actionCount: 0,
            summary: null,
            error: 'Project unavailable',
        });
    });
});

describe('ManagedAgentService runtime details', () => {
    it('reports instance keys accurately and downgrades unvalidated cleanup', async () => {
        const { service, managedAgentModel } = buildService();
        managedAgentModel.getSettings.mockResolvedValue({
            ...settings,
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression: 'cleanup' },
        } as AnyType);
        vi.mocked(getModel).mockReturnValue({
            ...resolvedModel,
            model: {
                provider: 'anthropic.messages',
                modelId: 'claude-sonnet-4-6',
            },
        } as AnyType);
        expect(
            await service.getRuntimeInfo(fromSession(user), PROJECT_UUID),
        ).toMatchObject({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            keySource: 'instance',
            keyManagement: 'self-managed',
            requestedCleanupMode: 'cleanup',
            effectiveCleanupMode: 'observe',
            error: null,
        });
    });

    it('reports an organization key when that provider came from BYO configuration', async () => {
        const { service, orgAiCopilotConfigResolver } = buildService();
        orgAiCopilotConfigResolver.getCopilotConfig.mockResolvedValue({
            ...copilotConfig,
            byoProviders: ['anthropic'],
        } as AnyType);
        vi.mocked(getModel).mockReturnValue({
            ...resolvedModel,
            model: {
                provider: 'anthropic.messages',
                modelId: 'claude-sonnet-4-6',
            },
        } as AnyType);
        expect(
            await service.getRuntimeInfo(fromSession(user), PROJECT_UUID),
        ).toMatchObject({ keySource: 'organization' });
    });

    it('returns an actionable error without model attribution when resolution fails', async () => {
        const { service, orgAiCopilotConfigResolver } = buildService();
        orgAiCopilotConfigResolver.getCopilotConfig.mockRejectedValue(
            new Error('Invalid provider configuration'),
        );
        await expect(
            service.getRuntimeInfo(fromSession(user), PROJECT_UUID),
        ).resolves.toMatchObject({
            provider: null,
            model: null,
            keySource: null,
            keyManagement: null,
            error: expect.stringContaining('Organization settings'),
        });
    });

    it('does not expose configuration to a user who cannot administer the project', async () => {
        const { service } = buildService();
        await expect(
            service.getRuntimeInfo(
                fromSession({ ...user, ability: new Ability([]) }),
                PROJECT_UUID,
            ),
        ).rejects.toThrow();
        expect(getModel).not.toHaveBeenCalled();
    });
});

describe('ManagedAgentService cleanup qualification enforcement', () => {
    it.each(['soft_delete_content', 'bulk_delete_broken_content'])(
        'refuses %s for an unqualified run before invoking its handler',
        async (name) => {
            const { service } = buildService();
            const result = await (service as AnyType).handleToolCall(
                PROJECT_UUID,
                'session',
                'run',
                name,
                {},
                undefined,
                false,
            );
            expect(JSON.parse(result)).toEqual({
                error: 'This model is not enabled for cleanup in this run',
            });
        },
    );
});

describe('ManagedAgentService discovery scope', () => {
    it.each([false, true])(
        'round 18 returned Autopilot data tools establish their scope when invoked: %s',
        async (enabled) => {
            const { service, dataRuntime } = buildService();
            vi.mocked(service['featureFlagModel'].get).mockResolvedValue({
                enabled,
            } as never);
            const run = vi.fn(async () => {
                const scope = agentExecutionContext.getStore();
                expect(scope?.agentIdentityEnabled).toBe(enabled);
                expect(scope?.claim?.act.client_id).toBe('lightdash-autopilot');
                expect(scope?.claim?.subject.uuid).toBe(USER_UUID);
                return {
                    queryUuid: 'query',
                    rows: [],
                    fields: {},
                    cacheMetadata: { cacheHit: false },
                };
            });
            Object.assign(dataRuntime, { runAsyncQuery: run });
            dataRuntime.listExplores.mockResolvedValue([validExplore] as never);
            const { tools } = await service['buildAutopilotDataTools'](
                user,
                PROJECT_UUID,
                ORGANIZATION_UUID,
            );
            await (tools.runMetricQuery as ReturnType<typeof getRunMetricQuery>)
                .execute!(
                {
                    vizConfig: {
                        exploreName: validExplore.name,
                        dimensions: metricQueryMock.dimensions,
                        metrics: metricQueryMock.metrics,
                        sorts: [],
                        limit: 100,
                    },
                    filters: null,
                    customMetrics: null,
                    tableCalculations: null,
                },
                { toolCallId: 'query', messages: [], context: {} },
            );
            expect(run).toHaveBeenCalledOnce();
        },
    );

    it.each([true, false])(
        'resolves the organization flag before reviewing managed metric queries (enabled=%s)',
        async (enabled) => {
            const { service, dataRuntime } = buildService();
            const getFlag = vi.fn().mockResolvedValue({ enabled });
            const internal = service as AnyType;
            internal.lightdashConfig.ai.decisions = {
                apiKey: 'test',
                model: 'test',
                timeoutMs: 100,
            };
            internal.featureFlagModel.get = getFlag;
            dataRuntime.listExplores.mockResolvedValue([
                validExplore,
            ] as AnyType);
            (dataRuntime as AnyType).runAsyncQuery = vi.fn().mockResolvedValue({
                queryUuid: 'query',
                rows: [{ a_met1: 42 }],
                fields: {},
                cacheMetadata: { cacheHit: false },
            });
            const evaluate = vi
                .spyOn(AiDecisionClient.prototype, 'evaluate')
                .mockResolvedValue({
                    conditions: { type: 'noul', noul: 0.99 },
                });
            try {
                const { tools } = await internal.buildAutopilotDataTools(
                    user,
                    PROJECT_UUID,
                    ORGANIZATION_UUID,
                );
                const output = await tools.runMetricQuery.execute(
                    {
                        vizConfig: {
                            exploreName: validExplore.name,
                            dimensions: metricQueryMock.dimensions,
                            metrics: metricQueryMock.metrics,
                            sorts: [],
                            limit: 100,
                        },
                        filters: null,
                        customMetrics: null,
                        tableCalculations: null,
                    },
                    {
                        toolCallId: 'query',
                        messages: [
                            { role: 'user', content: 'Count completed orders' },
                        ],
                    },
                );
                expect(output.metadata.status).toBe('success');
                expect(getFlag).toHaveBeenCalledWith({
                    user: { organizationUuid: ORGANIZATION_UUID },
                    featureFlagId: FeatureFlags.AiAgentFastDecisions,
                });
                expect(evaluate).toHaveBeenCalledTimes(enabled ? 1 : 0);
                expect(output.result.includes('Query/question review')).toBe(
                    enabled,
                );
            } finally {
                evaluate.mockRestore();
            }
        },
    );
    it('passes only the selected spaces to shared discovery', async () => {
        const { service, managedAgentModel, aiAgentToolsService } =
            buildService({
                suggestionsSpaces: [
                    { uuid: 'allowed', inheritParentPermissions: false },
                    { uuid: 'excluded', inheritParentPermissions: false },
                ],
            });
        managedAgentModel.getSettings.mockResolvedValue({
            ...settings,
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, spaceScopeMode: 'only' },
            scopedSpaceUuids: ['allowed'],
        } as AnyType);
        await (service as AnyType).buildAutopilotDataTools(
            user,
            PROJECT_UUID,
            ORGANIZATION_UUID,
        );
        expect(aiAgentToolsService.createRuntime).toHaveBeenCalledWith(
            expect.objectContaining({ spaceAccess: ['allowed'] }),
        );
    });

    it('does not pass an empty scope to shared tools as unrestricted access', async () => {
        const { service, dataRuntime } = buildService();
        const { tools } = await (service as AnyType).buildAutopilotDataTools(
            user,
            PROJECT_UUID,
            ORGANIZATION_UUID,
        );
        const result = await tools.findContent.execute(
            {
                searchQueries: [{ label: 'chart', query: 'chart' }],
                spaceSlug: null,
            },
            { toolCallId: 'call', messages: [] },
        );
        expect(result.metadata.status).toBe('success');
        expect(dataRuntime.findContent).not.toHaveBeenCalled();
        const dashboard = await tools.getDashboardCharts.execute(
            { dashboardUuid: 'dashboard', page: 1 },
            { toolCallId: 'call', messages: [] },
        );
        expect(dashboard.metadata.status).toBe('error');
        expect(dataRuntime.getDashboardCharts).not.toHaveBeenCalled();
    });
});

describe('ManagedAgentService AI SDK heartbeat lifecycle', () => {
    it.each([false, true])(
        'renders saved actions instead of an invented draft (provider failure: %s)',
        async (fail) => {
            captureAutopilotFailure.mockClear();
            const { service, managedAgentModel, analytics, slackClient } =
                buildService();
            managedAgentModel.getSettings.mockResolvedValue({
                ...settings,
                policy: {
                    ...DEFAULT_MANAGED_AGENT_POLICY,
                    aggression: 'cleanup',
                },
            } as AnyType);
            managedAgentModel.getSettings.mockResolvedValue({
                ...(await managedAgentModel.getSettings()),
                slackChannelId: 'test-channel',
            });
            managedAgentModel.getActions.mockResolvedValue([
                {
                    actionType: ManagedAgentActionType.CREATED_CONTENT,
                    targetType: ManagedAgentTargetType.CHART,
                    targetName: 'Saved chart',
                    description: 'Built from popular fields.',
                    reversedAt: null,
                },
            ] as AnyType);
            vi.mocked(service['featureFlagModel'].get).mockImplementation(
                async ({ featureFlagId }) =>
                    ({
                        enabled: featureFlagId === FeatureFlags.AgentIdentity,
                    }) as never,
            );
            let scopedModelCalls = 0;
            let calls = 0;
            let reportCalls = 0;
            const model = new MockLanguageModelV3({
                provider: 'openai.responses',
                modelId: 'unscored-model',
                doGenerate: async (options) => {
                    expect(managedAgentModel.setRunModel).toHaveBeenCalledWith(
                        'run-uuid',
                        { provider: 'openai', name: 'unscored-model' },
                    );
                    expect(managedAgentModel.finishRun).not.toHaveBeenCalled();
                    if (options.tools === undefined) {
                        reportCalls += 1;
                        expect(JSON.stringify(options.prompt)).toContain(
                            'created_content on',
                        );
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: '**Jaffle shop**\n\nGrounded story about Saved chart.',
                                },
                            ],
                            finishReason: { unified: 'stop', raw: undefined },
                            usage: {
                                inputTokens: {
                                    total: 10,
                                    noCache: 10,
                                    cacheRead: 0,
                                    cacheWrite: 0,
                                },
                                outputTokens: {
                                    total: 2,
                                    text: 2,
                                    reasoning: 0,
                                },
                            },
                            warnings: [],
                        };
                    }
                    const scope = agentExecutionContext.getStore();
                    expect(scope?.agentIdentityEnabled).toBe(true);
                    expect(scope?.claim?.act.client_id).toBe(
                        'lightdash-autopilot',
                    );
                    expect(scope?.claim?.subject.uuid).toBe(USER_UUID);
                    scopedModelCalls += 1;
                    expect(
                        options.tools.some(
                            (tool) =>
                                tool.type === 'function' &&
                                tool.name === 'soft_delete_content',
                        ),
                    ).toBe(false);
                    calls += 1;
                    if (calls > 1 && fail)
                        throw new Error('Provider disconnected');
                    return {
                        content:
                            calls === 1
                                ? [
                                      {
                                          type: 'tool-call',
                                          toolCallId: 'summary',
                                          toolName: 'write_slack_summary',
                                          input: JSON.stringify({
                                              summary:
                                                  'I flagged the only chart on the dashboard.',
                                          }),
                                      },
                                  ]
                                : [{ type: 'text', text: 'Done.' }],
                        finishReason: {
                            unified: calls === 1 ? 'tool-calls' : 'stop',
                            raw: undefined,
                        },
                        usage: {
                            inputTokens: {
                                total: 10,
                                noCache: 10,
                                cacheRead: 0,
                                cacheWrite: 0,
                            },
                            outputTokens: { total: 2, text: 2, reasoning: 0 },
                        },
                        warnings: [],
                    };
                },
            });
            vi.mocked(getModel).mockReturnValue({
                ...resolvedModel,
                model,
                callOptions: { maxRetries: 0 },
            } as AnyType);
            await service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            expect(scopedModelCalls).toBeGreaterThan(0);
            expect(managedAgentModel.finishRun).toHaveBeenCalledWith(
                'run-uuid',
                expect.objectContaining({
                    status: fail ? 'error' : 'completed',
                    error: fail ? 'Provider disconnected' : null,
                    summary: expect.stringContaining('Stale flags: 0'),
                }),
            );
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'managed_agent.run_completed',
                    properties: expect.objectContaining({
                        provider: 'openai',
                        model: 'unscored-model',
                        keyManagement: 'self-managed',
                        runUuid: 'run-uuid',
                        status: fail ? 'error' : 'completed',
                    }),
                }),
            );
            const { summary } = managedAgentModel.finishRun.mock.calls[0][1];
            expect(summary).not.toContain('I flagged');
            expect(summary).toContain('Created content: 1 (`Saved chart`)');
            if (fail) {
                expect(summary).toContain('cut short');
                expect(summary).toContain('Agent Suggestions');
                expect(reportCalls).toBe(0);
                expect(captureAutopilotFailure).toHaveBeenCalledTimes(1);
                expect(captureAutopilotFailure).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Provider disconnected',
                    }),
                    {
                        stage: 'run',
                        organizationUuid: expect.any(String),
                        projectUuid: PROJECT_UUID,
                        runUuid: 'run-uuid',
                        attribution: {
                            provider: 'openai',
                            model: 'unscored-model',
                            keyManagement: 'self-managed',
                        },
                    },
                );
            } else {
                expect(summary).toContain('Grounded story about Saved chart.');
                expect(summary).not.toContain('cut short');
                expect(reportCalls).toBe(1);
                expect(captureAutopilotFailure).not.toHaveBeenCalled();
            }
            expect(managedAgentModel.getActions).toHaveBeenCalledTimes(1);
            expect(slackClient.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'Autopilot: Created content: 1',
                }),
            );
            expect(slackClient.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ thread_ts: '1', text: summary }),
            );
            expect(managedAgentModel.getActions).toHaveBeenCalledWith(
                PROJECT_UUID,
                { runUuid: 'run-uuid' },
            );
            expect(summary).toContain(
                '- Ran on: openai / unscored-model with the instance key',
            );
            expect(summary).not.toMatch(/^Provider:/);
            expect(summary).toContain('Cleanup mode is observe');
            expect(managedAgentModel.setRunSessionId).toHaveBeenCalledWith(
                'run-uuid',
                'run-uuid',
            );
        },
    );

    it('reports an unreadable action ledger without inventing zero actions', async () => {
        const { service, managedAgentModel, orgAiCopilotConfigResolver } =
            buildService();
        orgAiCopilotConfigResolver.getCopilotConfig.mockRejectedValue(
            new Error('Provider unavailable'),
        );
        managedAgentModel.getActions.mockRejectedValue(
            new Error('Database unavailable'),
        );
        await service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        const { summary, status, error } =
            managedAgentModel.finishRun.mock.calls[0][1];
        expect(status).toBe('error');
        expect(error).toContain('Provider unavailable');
        expect(summary).toContain('saved action report is unavailable');
        expect(summary).not.toContain('flags: 0');
        expect(summary).not.toContain('No saved actions');
    });

    it('leaves completion attribution unknown when preflight fails before choosing a model', async () => {
        const {
            service,
            managedAgentModel,
            orgAiCopilotConfigResolver,
            analytics,
        } = buildService();
        orgAiCopilotConfigResolver.getCopilotConfig.mockRejectedValue(
            new Error('No configured provider'),
        );
        await service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(managedAgentModel.setRunModel).not.toHaveBeenCalled();
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'managed_agent.run_completed',
                properties: expect.objectContaining({
                    provider: null,
                    model: null,
                    keyManagement: null,
                    status: 'error',
                }),
            }),
        );
    });

    it('does not execute the model if saving attribution fails', async () => {
        const { service, managedAgentModel } = buildService();
        const doGenerate = vi.fn();
        vi.mocked(getModel).mockReturnValue({
            ...resolvedModel,
            model: new MockLanguageModelV3({
                provider: 'openai.responses',
                modelId: 'gpt-test',
                doGenerate,
            }),
        } as AnyType);
        managedAgentModel.setRunModel.mockRejectedValue(
            new Error('Database unavailable'),
        );
        await service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(doGenerate).not.toHaveBeenCalled();
        expect(managedAgentModel.finishRun).toHaveBeenCalledWith(
            'run-uuid',
            expect.objectContaining({
                status: 'error',
                error: 'Database unavailable',
            }),
        );
    });

    it('cannot delete a prior creation through the reversal tool when cleanup is not allowed', async () => {
        const { service, managedAgentModel } = buildService();
        managedAgentModel.getAction.mockResolvedValue({
            actionUuid: 'created-action',
            projectUuid: PROJECT_UUID,
            managedAgentRunUuid: 'run',
            actionType: 'created_content',
            targetType: 'chart',
            targetUuid: 'chart-uuid',
        });
        const result = await (service as AnyType).handleToolCall(
            PROJECT_UUID,
            'session',
            'run',
            'reverse_own_action',
            { action_uuid: 'created-action', reason: 'Remove it' },
            undefined,
            false,
        );
        expect(JSON.parse(result)).toMatchObject({
            error: expect.stringContaining('cannot delete content'),
        });
        expect(managedAgentModel.reverseAction).not.toHaveBeenCalled();
    });
});

describe('ManagedAgentService reversal scope', () => {
    it('refuses to reverse an action recorded by an earlier run', async () => {
        const { service, managedAgentModel } = buildService();
        managedAgentModel.getAction.mockResolvedValue({
            actionUuid: 'old-flag',
            projectUuid: PROJECT_UUID,
            managedAgentRunUuid: 'earlier-run',
            actionType: 'flagged_stale',
            targetType: 'chart',
            targetUuid: 'chart-uuid',
        });
        const result = await (service as AnyType).handleToolCall(
            PROJECT_UUID,
            'session',
            'run',
            'reverse_own_action',
            { action_uuid: 'old-flag', reason: 'Chart is protected' },
        );
        expect(JSON.parse(result)).toMatchObject({
            error: expect.stringContaining('earlier run'),
        });
        expect(managedAgentModel.reverseAction).not.toHaveBeenCalled();
    });

    it('reverses a flag recorded by the current run', async () => {
        const { service, managedAgentModel } = buildService();
        managedAgentModel.getAction.mockResolvedValue({
            actionUuid: 'own-flag',
            projectUuid: PROJECT_UUID,
            managedAgentRunUuid: 'run',
            actionType: 'flagged_stale',
            targetType: 'chart',
            targetUuid: 'chart-uuid',
        });
        managedAgentModel.reverseAction.mockResolvedValue({
            actionUuid: 'own-flag',
            actionType: 'flagged_stale',
            targetName: 'Chart',
        });
        const result = await (service as AnyType).handleToolCall(
            PROJECT_UUID,
            'session',
            'run',
            'reverse_own_action',
            { action_uuid: 'own-flag', reason: 'Recently edited' },
        );
        expect(JSON.parse(result)).toMatchObject({ reversed: true });
        expect(managedAgentModel.reverseAction).toHaveBeenCalledWith(
            'own-flag',
            USER_UUID,
        );
    });
});

describe('ManagedAgentService query check before saving', () => {
    const metricQuery = {
        dimensions: ['orders_status'],
        metrics: ['orders_total_revenue'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    };
    const chartConfig = { type: 'table', config: {} };
    const existingChart = {
        uuid: 'chart-uuid',
        name: 'Revenue by status',
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        spaceUuid: 'space-uuid',
        tableName: 'orders',
        tableConfig: { columnOrder: [] },
        pivotConfig: undefined,
        parameters: undefined,
    };
    const stubGuards = (service: ManagedAgentService) => {
        vi.spyOn(
            service as AnyType,
            'checkTargetProtectionGuard',
        ).mockResolvedValue(null);
        vi.spyOn(
            service as AnyType,
            'assertActorCanUpdateChart',
        ).mockResolvedValue(undefined);
        vi.spyOn(
            service as AnyType,
            'assertActorCanCreateChart',
        ).mockResolvedValue(undefined);
        vi.spyOn(service as AnyType, 'getOrCreateAgentSpace').mockResolvedValue(
            'suggestions-space',
        );
    };

    it('does not save a repaired version when the query fails', async () => {
        const { service, savedChartModel, asyncQueryService } = buildService();
        stubGuards(service);
        savedChartModel.get.mockResolvedValue(existingChart);
        asyncQueryService.executeMetricQueryAndGetResults.mockRejectedValue(
            new Error('column "orders.status" does not exist'),
        );
        await expect(
            (service as AnyType).handleToolCall(
                PROJECT_UUID,
                'session',
                'run',
                'fix_broken_chart',
                {
                    chart_uuid: 'chart-uuid',
                    chart_name: 'Revenue by status',
                    description: 'Renamed the status field',
                    metric_query: metricQuery,
                    chart_config: chartConfig,
                },
            ),
        ).rejects.toThrow(
            /The chart query failed, so nothing was saved[\s\S]*column "orders.status" does not exist/,
        );
        expect(savedChartModel.createVersion).not.toHaveBeenCalled();
    });

    it('runs the repaired query at limit 1 before saving the version', async () => {
        const { service, savedChartModel, asyncQueryService } = buildService();
        stubGuards(service);
        savedChartModel.get.mockResolvedValue(existingChart);
        const result = await (service as AnyType).handleToolCall(
            PROJECT_UUID,
            'session',
            'run',
            'fix_broken_chart',
            {
                chart_uuid: 'chart-uuid',
                chart_name: 'Revenue by status',
                description: 'Renamed the status field',
                metric_query: metricQuery,
                chart_config: chartConfig,
            },
        );
        expect(JSON.parse(result)).toMatchObject({ fixed: true });
        expect(
            asyncQueryService.executeMetricQueryAndGetResults,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: PROJECT_UUID,
                metricQuery: expect.objectContaining({
                    exploreName: 'orders',
                    limit: 1,
                }),
            }),
            expect.anything(),
        );
        expect(savedChartModel.createVersion).toHaveBeenCalledTimes(1);
    });

    it('does not create a chart when its query fails', async () => {
        const { service, savedChartModel, asyncQueryService, projectModel } =
            buildService();
        stubGuards(service);
        projectModel.findExploresFromCache.mockResolvedValue({
            orders: {
                tables: {
                    orders: {
                        dimensions: { status: {} },
                        metrics: { total_revenue: {} },
                    },
                },
            },
        });
        asyncQueryService.executeMetricQueryAndGetResults.mockRejectedValue(
            new Error('relation "orders" does not exist'),
        );
        await expect(
            (service as AnyType).handleToolCall(
                PROJECT_UUID,
                'session',
                'run',
                'create_content_from_code',
                {
                    description: 'Users keep asking for revenue by status',
                    chart_as_code: {
                        name: 'Revenue by status',
                        tableName: 'orders',
                        metricQuery,
                        chartConfig,
                    },
                },
            ),
        ).rejects.toThrow(
            /nothing was saved[\s\S]*relation "orders" does not exist/,
        );
        expect(savedChartModel.create).not.toHaveBeenCalled();
    });
});

describe('ManagedAgentService broken-content pagination', () => {
    it('reaches every visible item even when earlier pages are repaired', async () => {
        const {
            service,
            validationModel,
            savedChartModel,
            spacePermissionService,
        } = buildService();
        const actor = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                {
                    action: 'view',
                    subject: 'SavedChart',
                    conditions: {
                        'metadata.savedChartUuid': { $ne: 'chart-0050' },
                    },
                },
            ]),
        };
        const validations = Array.from({ length: 251 }, (_, index) => ({
            validationId: null,
            validationUuid: `validation-${index}`,
            projectUuid: PROJECT_UUID,
            createdAt: new Date('2026-01-01'),
            source: ValidationSourceType.Chart,
            chartUuid: `chart-${String(index).padStart(4, '0')}`,
            name: `Chart ${index}`,
            tableName: 'orders',
            error: 'Missing field',
            errorType: ValidationErrorType.Dimension,
        }));
        validationModel.get.mockResolvedValue([...validations].reverse());
        savedChartModel.get.mockImplementation(async (uuid: string) => ({
            uuid,
            name: uuid,
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
            spaceUuid: 'space',
        }));
        spacePermissionService.resolveAccess.mockResolvedValue({
            inheritsFromOrgOrProject: true,
            access: [],
        });
        type Page = {
            items: { uuid: string }[];
            total_count: number;
            returned_count: number;
            next_cursor: string | null;
            truncated: boolean;
            omitted_count: number;
        };
        const readPage = async (cursor: string | null): Promise<Page> => {
            const response = await service['handleGetBrokenContent'](
                actor,
                PROJECT_UUID,
                {
                    table_name: 'orders',
                    limit: 500,
                    cursor: cursor ?? undefined,
                },
            );
            try {
                return JSON.parse(response);
            } catch {
                throw new Error('Invalid tool JSON');
            }
        };
        const first = await readPage(null);
        expect(first.next_cursor).toBe('chart-0100');
        expect(first.items).toHaveLength(100);
        expect(first.total_count).toBe(250);
        expect((await readPage('')).items).toEqual(first.items);
        const visited = first.items.map(({ uuid }) => uuid);
        // Completed repairs disappear from validation rows before the next request.
        validationModel.get.mockResolvedValue(
            validations.filter((row) => !visited.includes(row.chartUuid)),
        );
        const second = await readPage(first.next_cursor);
        expect(second.items).toHaveLength(100);
        const third = await readPage(second.next_cursor);
        expect(third).toMatchObject({
            returned_count: 50,
            next_cursor: null,
            truncated: false,
            omitted_count: 0,
        });
        const all = [
            ...visited,
            ...second.items.map(({ uuid }) => uuid),
            ...third.items.map(({ uuid }) => uuid),
        ];
        expect(all).toEqual(
            validations
                .map(({ chartUuid }) => chartUuid)
                .filter((uuid) => uuid !== 'chart-0050'),
        );
        expect(new Set(all).size).toBe(250);
        expect((await readPage('chart-9999')).items).toEqual([]);
    });
});

describe('Autopilot chart payload validation', () => {
    it.each([undefined, null, [], ''])(
        'rejects invalid filters before chart persistence: %s',
        (filters) => {
            expect(() =>
                ManagedAgentService['validateChartPayload'](
                    {
                        dimensions: [],
                        metrics: ['orders_total_revenue'],
                        filters,
                    },
                    { type: 'big_number' },
                ),
            ).toThrow(
                'metric_query.filters must be an object; use {} when no filters apply',
            );
        },
    );

    it('accepts an explicitly unfiltered query', () => {
        expect(() =>
            ManagedAgentService['validateChartPayload'](
                {
                    dimensions: [],
                    metrics: ['orders_total_revenue'],
                    filters: {},
                },
                { type: 'big_number' },
            ),
        ).not.toThrow();
    });
});

describe('ManagedAgentService bulk stale flagging', () => {
    const staleItem = (index: number) => ({
        lastViewedAt: index % 2 === 0 ? null : new Date('2026-03-04T00:00:00Z'),
        lastViewedByUserUuid: null,
        lastViewedByUserName: null,
        createdByUserUuid: USER_UUID,
        createdByUserName: 'User',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        contentUuid: `chart-${index}`,
        contentName: `Chart ${index}`,
        contentType: 'chart' as const,
        spaceUuid: 'space-uuid',
        viewsCount: index,
        reason:
            index % 2 === 0
                ? ('never_viewed' as const)
                : ('not_viewed_recently' as const),
    });

    const setup = (aggression: 'observe' | 'flag' | 'cleanup') => {
        const built = buildService();
        built.managedAgentModel.getSettings.mockResolvedValue({
            ...settings,
            policy: {
                ...DEFAULT_MANAGED_AGENT_POLICY,
                aggression,
                escalationHours: 48,
            },
        });
        const items = Array.from({ length: 70 }, (_, index) =>
            staleItem(index),
        );
        vi.spyOn(
            built.service as AnyType,
            'getVisibleStaleContent',
        ).mockResolvedValue(items);
        const recentFlag = new Date(Date.now() - 60 * 60 * 1000);
        const oldFlag = new Date(Date.now() - 72 * 60 * 60 * 1000);
        const flagContent = vi
            .spyOn(built.service as AnyType, 'handleFlagContent')
            .mockImplementation(async (...args: AnyType[]) => {
                const { target_uuid: uuid } = args[4];
                if (uuid === 'chart-1')
                    return JSON.stringify({
                        already_flagged: true,
                        flagged_at: recentFlag.toISOString(),
                    });
                if (uuid === 'chart-2')
                    return JSON.stringify({
                        already_flagged: true,
                        flagged_at: oldFlag.toISOString(),
                    });
                if (uuid === 'chart-3')
                    return JSON.stringify({ blocked: true, error: 'Verified' });
                if (uuid === 'chart-4')
                    return JSON.stringify({ skipped: true, note: 'Deleted' });
                return JSON.stringify({ action_uuid: `action-${uuid}` });
            });
        return { ...built, flagContent };
    };

    it('flags every stale item in one call with server-written descriptions', async () => {
        const { service, flagContent } = setup('flag');
        const result = JSON.parse(
            await service['handleBulkFlagStaleContent'](
                user,
                PROJECT_UUID,
                'session',
                'run',
                { target_type: ManagedAgentTargetType.CHART },
            ),
        );
        expect(flagContent).toHaveBeenCalledTimes(70);
        expect(flagContent.mock.calls[0][4]).toEqual({
            target_type: ManagedAgentTargetType.CHART,
            target_uuid: 'chart-0',
            target_name: 'Chart 0',
            flag_type: ManagedAgentActionType.FLAGGED_STALE,
            description:
                'Never viewed since it was created on 2026-01-02 (90+ day staleness policy).',
            metadata: {
                bulk: true,
                reason: 'never_viewed',
                last_viewed_at: null,
                views_count: 0,
                created_at: '2026-01-02T00:00:00.000Z',
            },
        });
        expect(result).toMatchObject({
            candidate_count: 70,
            flagged_count: 66,
            already_flagged_count: 2,
            skipped_count: 1,
            blocked_count: 1,
        });
        expect(result.already_flagged.items).toEqual([
            expect.objectContaining({
                uuid: 'chart-1',
                escalation_eligible: false,
            }),
            expect.objectContaining({
                uuid: 'chart-2',
                escalation_eligible: true,
            }),
        ]);
        expect(result.blocked.items).toEqual([
            { uuid: 'chart-3', reason: 'Verified' },
        ]);
    });

    it('refuses to flag in observe mode', async () => {
        const { service, flagContent } = setup('observe');
        const result = JSON.parse(
            await service['handleBulkFlagStaleContent'](
                user,
                PROJECT_UUID,
                'session',
                'run',
                { target_type: ManagedAgentTargetType.CHART },
            ),
        );
        expect(result).toMatchObject({ blocked: true });
        expect(flagContent).not.toHaveBeenCalled();
    });
});

const authorityTextTurn = (text = 'Done.') => ({
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 2, text: 2, reasoning: 0 },
    },
    warnings: [],
});

const authorityToolTurn = (
    toolName: string,
    input: Record<string, unknown> = {},
) => ({
    ...authorityTextTurn(),
    content: [
        {
            type: 'tool-call' as const,
            toolCallId: toolName,
            toolName,
            input: JSON.stringify(input),
        },
    ],
    finishReason: { unified: 'tool-calls' as const, raw: undefined },
});

describe('ManagedAgentService heartbeat authority', () => {
    it('preserves flag-off person, flag, policy, finish and Slack calls', async () => {
        const fixture = buildService({
            suggestionsSpaces: [
                { uuid: 'space', inheritParentPermissions: true },
            ],
        });
        const {
            service,
            managedAgentModel,
            userModel,
            featureFlagModel,
            agentPermissionService,
            agentActionLogModel,
            slackClient,
        } = fixture;
        managedAgentModel.getSettings.mockResolvedValue({
            ...settings,
            slackChannelId: 'channel',
        });
        let turn = 0;
        const doGenerate = vi.fn(
            async (
                options: Parameters<MockLanguageModelV3['doGenerate']>[0],
            ) => {
                if (!options.tools) return authorityTextTurn('Report.');
                turn += 1;
                if (turn === 1) return authorityToolTurn('get_recent_actions');
                if (turn === 2)
                    return authorityToolTurn('findContent', {
                        searchQueries: [{ label: 'sales', query: 'sales' }],
                        spaceSlug: null,
                    });
                return authorityTextTurn();
            },
        );
        vi.mocked(getModel).mockReturnValue({
            ...resolvedModel,
            model: new MockLanguageModelV3({ doGenerate }),
        } as AnyType);

        await service.runHeartbeat(PROJECT_UUID, 'run-uuid');

        expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(2);
        expect(featureFlagModel.get).toHaveBeenCalledTimes(2);
        expect(agentPermissionService.loadRequest).not.toHaveBeenCalled();
        expect(
            agentPermissionService.assertOperationWithRequest,
        ).not.toHaveBeenCalled();
        expect(userModel.findServiceAccountByUserUuid).not.toHaveBeenCalled();
        expect(agentActionLogModel.insert).not.toHaveBeenCalled();
        expect(managedAgentModel.finishRun).toHaveBeenCalledTimes(1);
        expect(managedAgentModel.finishRun).toHaveBeenCalledWith(
            'run-uuid',
            expect.objectContaining({
                status: 'completed',
                actionCount: 0,
                error: null,
            }),
        );
        expect(slackClient.postMessage).toHaveBeenCalledTimes(2);
        expect(doGenerate).toHaveBeenCalledTimes(4);
        expect(fixture.dataRuntime.findContent).toHaveBeenCalledTimes(1);
    });
});

const blockedPersonMessage =
    'Run blocked: the person who enabled Autopilot can no longer run agents. Another admin can enable it again.';
const blockedCheckMessage = 'Run blocked: the access check could not run.';

const buildAuthorityFixture = () => {
    const fixture = buildService({
        suggestionsSpaces: [{ uuid: 'space', inheritParentPermissions: true }],
    });
    fixture.featureFlagModel.get.mockResolvedValue({ enabled: true });
    fixture.managedAgentModel.getSettings.mockResolvedValue({
        ...settings,
        slackChannelId: 'channel',
    });
    const doGenerate = vi
        .fn<MockLanguageModelV3['doGenerate']>()
        .mockResolvedValue(authorityTextTurn());
    vi.mocked(getModel).mockReturnValue({
        ...resolvedModel,
        callOptions: { maxRetries: 0 },
        model: new MockLanguageModelV3({ doGenerate }),
    } as AnyType);
    return { ...fixture, doGenerate };
};

const savedAuthorityAction = {
    actionType: ManagedAgentActionType.CREATED_CONTENT,
    targetType: ManagedAgentTargetType.CHART,
    targetName: 'Saved chart',
    description: 'Built from popular fields.',
    reversedAt: null,
};

const expectAuthorityBlocked = (
    fixture: ReturnType<typeof buildAuthorityFixture>,
    error: string,
    actionCount = 0,
) => {
    expect(fixture.managedAgentModel.finishRun).toHaveBeenCalledExactlyOnceWith(
        'run-uuid',
        expect.objectContaining({
            status: ManagedAgentRunStatus.ERROR,
            error,
            actionCount,
        }),
    );
    expect(fixture.slackClient.postMessage).not.toHaveBeenCalled();
    expect(fixture.analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
            event: 'managed_agent.run_completed',
            properties: expect.objectContaining({
                status: 'error',
                slackPosted: false,
                actionCount,
                error,
            }),
        }),
    );
};

describe('ManagedAgentService enabled heartbeat authority', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['inactive', 'removed', 'policy', 'database'] as const)(
        'blocks %s at the start without a model call',
        async (failure) => {
            const fixture = buildAuthorityFixture();
            captureAutopilotFailure.mockClear();
            const { userModel, agentPermissionService, agentActionLogModel } =
                fixture;
            if (failure === 'inactive')
                userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                    ...user,
                    isActive: false,
                });
            if (failure === 'removed')
                userModel.findSessionUserAndOrgByUuid
                    .mockResolvedValueOnce(user)
                    .mockRejectedValue(new InvalidUser('Removed'));
            if (failure === 'database')
                agentPermissionService.loadRequest.mockRejectedValueOnce(
                    new Error('database down'),
                );
            if (failure === 'policy') {
                const permissions = new AgentPermissionService({
                    agentActionLogModel,
                } as AnyType);
                vi.spyOn(
                    permissions as AnyType,
                    'resolvePolicyWithRequest',
                ).mockResolvedValue({
                    mode: 'legacy',
                    allowedGroupUuids: [],
                } as AnyType);
                vi.spyOn(
                    permissions as AnyType,
                    'createEvaluation',
                ).mockReturnValue({
                    readChecks: vi.fn().mockResolvedValue({
                        id: 'agent_admission',
                        kind: 'agent_admission',
                        status: 'refused',
                        reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                        policyLayer: 'organization_setting',
                    }),
                    checks: [],
                });
                agentPermissionService.assertOperationWithRequest.mockImplementation(
                    (args) => permissions.assertOperationWithRequest(args),
                );
            }

            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');

            expectAuthorityBlocked(
                fixture,
                failure === 'database'
                    ? blockedCheckMessage
                    : blockedPersonMessage,
            );
            expect(fixture.doGenerate).not.toHaveBeenCalled();
            expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(
                2,
            );
            expect(agentActionLogModel.insert).toHaveBeenCalledTimes(
                failure === 'database' ? 0 : 1,
            );
            expect(captureAutopilotFailure).toHaveBeenCalledTimes(
                failure === 'database' ? 1 : 0,
            );
            expect(fixture.featureFlagModel.get).toHaveBeenCalledTimes(1);
        },
    );

    it('allows an inactive service account with two full checks', async () => {
        const fixture = buildAuthorityFixture();
        fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
            ...user,
            isActive: false,
        });
        fixture.userModel.findServiceAccountByUserUuid.mockResolvedValue({
            serviceAccountUuid: 'service-account',
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(fixture.managedAgentModel.finishRun).toHaveBeenCalledWith(
            'run-uuid',
            expect.objectContaining({ status: 'completed' }),
        );
        expect(
            fixture.userModel.findServiceAccountByUserUuid,
        ).toHaveBeenCalledTimes(2);
        expect(
            fixture.agentPermissionService.loadRequest,
        ).toHaveBeenCalledTimes(2);
        expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(2);
    });

    it.each(['inactive', 'database'] as const)(
        'stops queued custom tools on %s and keeps saved actions',
        async (failure) => {
            const fixture = buildAuthorityFixture();
            captureAutopilotFailure.mockClear();
            fixture.managedAgentModel.createAction.mockImplementation(
                async () => {
                    fixture.managedAgentModel.getActions.mockResolvedValue([
                        savedAuthorityAction,
                    ] as AnyType);
                    return {
                        ...savedAuthorityAction,
                        actionUuid: 'saved-action',
                    } as AnyType;
                },
            );
            let turn = 0;
            fixture.doGenerate.mockImplementation(async () => {
                turn += 1;
                if (turn === 1)
                    return authorityToolTurn('log_project_insight', {
                        description: 'Saved finding',
                    });
                if (failure === 'inactive')
                    fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                        { ...user, isActive: false },
                    );
                else
                    fixture.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
                        new Error('database down'),
                    );
                const first = authorityToolTurn('log_project_insight', {
                    description: 'Blocked finding',
                });
                const second = authorityToolTurn('log_project_insight', {
                    description: 'Queued finding',
                });
                second.content[0].toolCallId = 'queued';
                return {
                    ...first,
                    content: [...first.content, ...second.content],
                };
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            expectAuthorityBlocked(
                fixture,
                failure === 'inactive'
                    ? blockedPersonMessage
                    : blockedCheckMessage,
                1,
            );
            expect(fixture.doGenerate).toHaveBeenCalledTimes(2);
            expect(captureAutopilotFailure).toHaveBeenCalledTimes(
                failure === 'inactive' ? 0 : 1,
            );
            expect(
                fixture.managedAgentModel.createAction,
            ).toHaveBeenCalledTimes(1);
            expect(
                fixture.managedAgentModel.finishRun.mock.calls[0][1].summary,
            ).toContain('Saved chart');
            expect(
                fixture.userModel.findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(failure === 'database' ? 5 : 4);
        },
    );

    it.each([20_000, 31_000])(
        'checks data tools only when stale at %i ms',
        async (elapsed) => {
            const fixture = buildAuthorityFixture();
            let now = 1_000;
            vi.spyOn(Date, 'now').mockImplementation(() => now);
            let turn = 0;
            fixture.doGenerate.mockImplementation(async (options) => {
                if (!options.tools) return authorityTextTurn();
                turn += 1;
                if (turn === 1) {
                    now += elapsed;
                    fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                        { ...user, isActive: false },
                    );
                    fixture.managedAgentModel.getActions.mockResolvedValue([
                        savedAuthorityAction,
                    ] as AnyType);
                    return authorityToolTurn('findContent', {
                        searchQueries: [{ label: 'sales', query: 'sales' }],
                        spaceSlug: null,
                    });
                }
                expect(
                    fixture.userModel.findSessionUserAndOrgByUuid,
                ).toHaveBeenCalledTimes(2);
                return authorityTextTurn();
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            expectAuthorityBlocked(fixture, blockedPersonMessage, 1);
            expect(fixture.doGenerate).toHaveBeenCalledTimes(
                elapsed < 30_000 ? 2 : 1,
            );
            expect(fixture.dataRuntime.findContent).toHaveBeenCalledTimes(
                elapsed < 30_000 ? 1 : 0,
            );
            expect(
                fixture.userModel.findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(3);
        },
    );

    it.each([null, 'Provider disconnected'])(
        'blocks delivery and preserves the existing error %s',
        async (runError) => {
            const fixture = buildAuthorityFixture();
            fixture.managedAgentModel.getActions.mockResolvedValue([
                savedAuthorityAction,
            ] as AnyType);
            fixture.doGenerate.mockImplementation(async () => {
                fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                    { ...user, isActive: false },
                );
                if (runError) throw new Error(runError);
                return authorityTextTurn();
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            expectAuthorityBlocked(
                fixture,
                runError ?? blockedPersonMessage,
                1,
            );
            expect(fixture.doGenerate).toHaveBeenCalledTimes(1);
            expect(
                fixture.managedAgentModel.finishRun.mock.calls[0][1].summary,
            ).toContain('Saved chart');
        },
    );

    it('keeps the original enabling person when settings change during the run', async () => {
        const fixture = buildAuthorityFixture();
        let turn = 0;
        fixture.doGenerate.mockImplementation(async (options) => {
            if (!options.tools) return authorityTextTurn();
            turn += 1;
            fixture.managedAgentModel.getSettings.mockResolvedValue({
                ...settings,
                enabledByUserUuid: 'other-admin',
            });
            return turn === 1
                ? authorityToolTurn('get_recent_actions')
                : authorityTextTurn();
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(
            fixture.userModel.findSessionUserAndOrgByUuid.mock.calls,
        ).toEqual(Array(4).fill([USER_UUID, ORGANIZATION_UUID]));
        expect(
            fixture.agentPermissionService.assertOperationWithRequest,
        ).toHaveBeenCalledTimes(2);
        for (const [args] of fixture.agentPermissionService
            .assertOperationWithRequest.mock.calls)
            expect(args.operation).toMatchObject({
                account: { user: { id: USER_UUID } },
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                surface: AgentActorSurface.IN_APP_AGENT,
                kind: 'agent_turn',
            });
        expect(fixture.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'managed_agent.run_completed',
                userId: USER_UUID,
            }),
        );
        expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(2);
    });

    it('posts parent and chunks with two full checks on a short allowed run', async () => {
        const fixture = buildAuthorityFixture();
        fixture.doGenerate.mockImplementation(async (options) =>
            authorityTextTurn(
                options.tools ? 'Done.' : 'Long report. '.repeat(600),
            ),
        );
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(
            fixture.agentPermissionService.loadRequest,
        ).toHaveBeenCalledTimes(2);
        expect(
            fixture.userModel.findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledTimes(3);
        expect(
            fixture.userModel.findServiceAccountByUserUuid,
        ).not.toHaveBeenCalled();
        expect(fixture.agentActionLogModel.insert).not.toHaveBeenCalled();
        const { summary } =
            fixture.managedAgentModel.finishRun.mock.calls[0][1];
        expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(
            1 + Math.ceil(summary.length / 2800),
        );
        expect(
            fixture.slackClient.postMessage.mock.calls[0][0],
        ).not.toHaveProperty('thread_ts');
        expect(
            fixture.slackClient.postMessage.mock.calls
                .slice(1)
                .map(([args]) => args.text)
                .join(''),
        ).toBe(summary);
    });

    it('checks again before the parent when finishing the row takes 30 seconds', async () => {
        const fixture = buildAuthorityFixture();
        let now = 1_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        fixture.managedAgentModel.finishRun.mockImplementation(async () => {
            now += 31_000;
            fixture.agentPermissionService.loadRequest.mockRejectedValue(
                new Error('database down'),
            );
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(fixture.slackClient.postMessage).not.toHaveBeenCalled();
        expect(
            fixture.managedAgentModel.finishRun,
        ).toHaveBeenCalledExactlyOnceWith(
            'run-uuid',
            expect.objectContaining({ status: 'completed', error: null }),
        );
        expect(fixture.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'managed_agent.run_completed',
                properties: expect.objectContaining({ slackPosted: false }),
            }),
        );
    });

    it('stops remaining chunks when authority fails after a slow Slack parent', async () => {
        const fixture = buildAuthorityFixture();
        let now = 1_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        fixture.slackClient.postMessage.mockImplementation(async () => {
            now += 31_000;
            fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...user,
                isActive: false,
            });
            return { ts: '1' };
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(1);
        expect(fixture.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'managed_agent.run_completed',
                properties: expect.objectContaining({ slackPosted: false }),
            }),
        );
    });
});

describe('ManagedAgentService authority check cadence', () => {
    afterEach(() => vi.restoreAllMocks());

    it('exports the exact blocked messages', () => {
        expect(AUTOPILOT_AUTHORITY_REFUSED_MESSAGE).toBe(blockedPersonMessage);
        expect(AUTOPILOT_AUTHORITY_CHECK_FAILED_MESSAGE).toBe(
            blockedCheckMessage,
        );
    });

    it.each([500, 15_000])(
        'checks 40 data calls spaced %i ms apart',
        async (interval) => {
            const fixture = buildAuthorityFixture();
            fixture.service['lightdashConfig'].managedAgent.maxSteps = 50;
            let now = 1_000;
            vi.spyOn(Date, 'now').mockImplementation(() => now);
            let turn = 0;
            fixture.doGenerate.mockImplementation(async (options) => {
                if (!options.tools) return authorityTextTurn();
                turn += 1;
                if (turn > 40) return authorityTextTurn();
                now += interval;
                return authorityToolTurn('findContent', {
                    searchQueries: [{ label: 'sales', query: 'sales' }],
                    spaceSlug: null,
                });
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            const checks = interval === 500 ? 2 : 22;
            expect(
                fixture.agentPermissionService.loadRequest,
            ).toHaveBeenCalledTimes(checks);
            expect(
                fixture.userModel.findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(checks + 1);
            expect(fixture.dataRuntime.findContent).toHaveBeenCalledTimes(40);
            expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(2);
        },
    );

    it('keeps the missing-person error and Slack behaviour when no enabling UUID exists', async () => {
        const fixture = buildAuthorityFixture();
        fixture.managedAgentModel.getSettings.mockResolvedValue({
            ...settings,
            enabledByUserUuid: null,
            slackChannelId: 'channel',
        } as AnyType);
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expect(
            fixture.managedAgentModel.finishRun,
        ).toHaveBeenCalledExactlyOnceWith(
            'run-uuid',
            expect.objectContaining({
                status: 'error',
                actionCount: 0,
                error: 'Autopilot actor is not configured for project project-uuid',
            }),
        );
        expect(fixture.featureFlagModel.get).not.toHaveBeenCalled();
        expect(
            fixture.userModel.findSessionUserAndOrgByUuid,
        ).not.toHaveBeenCalled();
        expect(
            fixture.agentPermissionService.loadRequest,
        ).not.toHaveBeenCalled();
        expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(2);
    });

    it('checks authority again when narrative generation takes over 30 seconds', async () => {
        const fixture = buildAuthorityFixture();
        let now = 1_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        fixture.doGenerate.mockImplementation(async (options) => {
            if (!options.tools) {
                now += 31_000;
                fixture.agentPermissionService.loadRequest.mockRejectedValueOnce(
                    new Error('database down'),
                );
            }
            return authorityTextTurn('Saved report.');
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expectAuthorityBlocked(fixture, blockedCheckMessage);
        expect(
            fixture.agentPermissionService.loadRequest,
        ).toHaveBeenCalledTimes(3);
        expect(
            fixture.managedAgentModel.finishRun.mock.calls[0][1].summary,
        ).toContain('Saved report.');
    });
});

describe('ManagedAgentService authority review regressions', () => {
    beforeEach(() => captureAutopilotFailure.mockClear());
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it.each([true, false])(
        'handles preparation refusal with flag %s',
        async (enabled) => {
            const fixture = buildAuthorityFixture();
            fixture.featureFlagModel.get.mockResolvedValue({ enabled });
            const refusal = new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            );
            fixture.dataRuntime.listExplores.mockImplementation(async () => {
                await fixture.agentActionLogModel.insert({ status: 'refused' });
                throw refusal;
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            if (enabled) expectAuthorityBlocked(fixture, blockedPersonMessage);
            else {
                expect(
                    fixture.managedAgentModel.finishRun,
                ).toHaveBeenCalledExactlyOnceWith(
                    'run-uuid',
                    expect.objectContaining({
                        status: 'error',
                        error: refusal.message,
                    }),
                );
                expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(
                    2,
                );
            }
            expect(fixture.doGenerate).not.toHaveBeenCalled();
            expect(fixture.featureFlagModel.get).toHaveBeenCalledTimes(1);
            expect(
                fixture.userModel.findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(1);
            expect(fixture.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
            expect(
                fixture.agentPermissionService.loadRequest,
            ).not.toHaveBeenCalled();
            expect(captureAutopilotFailure).toHaveBeenCalledTimes(
                enabled ? 0 : 1,
            );
        },
    );

    it.each(
        (
            ['final', 'narrative', 'slack-parent', 'slack-chunk'] as const
        ).flatMap((stage) =>
            [false, true].map((refused) => ({ stage, refused })),
        ),
    )(
        'reports errors at $stage with refusal $refused',
        async ({ stage, refused }) => {
            captureAutopilotFailure.mockClear();
            const fixture = buildAuthorityFixture();
            let now = 1000;
            vi.spyOn(Date, 'now').mockImplementation(() => now);
            const error = new Error('authority database unavailable');
            const fail = () => {
                if (refused)
                    fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                        { ...user, isActive: false },
                    );
                else
                    fixture.agentPermissionService.loadRequest.mockRejectedValue(
                        error,
                    );
            };
            fixture.doGenerate.mockImplementation(async (options) => {
                if (stage === 'final' && options.tools) fail();
                if (stage === 'narrative' && !options.tools) {
                    now += 31000;
                    fail();
                }
                return authorityTextTurn('Saved narrative.');
            });
            if (stage === 'slack-parent')
                fixture.managedAgentModel.finishRun.mockImplementation(
                    async () => {
                        now += 31000;
                        fail();
                    },
                );
            if (stage === 'slack-chunk')
                fixture.slackClient.postMessage.mockImplementation(async () => {
                    now += 31000;
                    fail();
                    return { ts: '1' };
                });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            expect(captureAutopilotFailure).toHaveBeenCalledTimes(
                refused ? 0 : 1,
            );
            if (!refused)
                expect(captureAutopilotFailure).toHaveBeenCalledWith(
                    error,
                    expect.anything(),
                );
            expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(
                stage === 'slack-chunk' ? 1 : 0,
            );
            expect(fixture.agentActionLogModel.insert).toHaveBeenCalledTimes(
                refused ? 1 : 0,
            );
            expect(fixture.analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'managed_agent.run_completed',
                    properties: expect.objectContaining({
                        slackPosted: false,
                    }),
                }),
            );
        },
    );

    it('reports a timeout even when a data check subsequently refuses', async () => {
        vi.useFakeTimers();
        const fixture = buildAuthorityFixture();
        let personLoads = 0;
        fixture.userModel.findSessionUserAndOrgByUuid.mockImplementation(
            async () => {
                personLoads += 1;
                if (personLoads === 3) {
                    await vi.advanceTimersByTimeAsync(5001);
                    return { ...user, isActive: false };
                }
                return user;
            },
        );
        fixture.doGenerate.mockImplementation(async () => {
            vi.setSystemTime(Date.now() + 31000);
            return authorityToolTurn('findContent', {
                searchQueries: [{ label: 'sales', query: 'sales' }],
                spaceSlug: null,
            });
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expectAuthorityBlocked(
            fixture,
            'Autopilot timed out after 5 seconds at step 1',
        );
        expect(captureAutopilotFailure).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ name: 'AutopilotTimeoutError' }),
            expect.objectContaining({ stage: 'timeout' }),
        );
    });

    it.each(['removed', 'transient'] as const)(
        'handles a %s custom-tool person load',
        async (failure) => {
            const fixture = buildAuthorityFixture();
            const error =
                failure === 'removed'
                    ? new InvalidUser('Removed')
                    : new Error('Temporary person load failure');
            fixture.userModel.findSessionUserAndOrgByUuid
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(user)
                .mockRejectedValueOnce(error);
            if (failure === 'removed')
                fixture.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
                    error,
                );
            let turn = 0;
            fixture.doGenerate.mockImplementation(async (options) => {
                if (!options.tools) return authorityTextTurn();
                turn += 1;
                if (turn === 1) return authorityToolTurn('get_recent_actions');
                expect(JSON.stringify(options.prompt)).toContain(error.message);
                return authorityTextTurn();
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            if (failure === 'removed') {
                expectAuthorityBlocked(fixture, blockedPersonMessage);
                expect(
                    fixture.agentActionLogModel.insert,
                ).toHaveBeenCalledTimes(1);
                expect(fixture.doGenerate).toHaveBeenCalledTimes(1);
            } else {
                expect(
                    fixture.managedAgentModel.finishRun,
                ).toHaveBeenCalledWith(
                    'run-uuid',
                    expect.objectContaining({
                        status: 'completed',
                        error: null,
                    }),
                );
                expect(fixture.doGenerate).toHaveBeenCalledTimes(3);
                expect(
                    fixture.agentActionLogModel.insert,
                ).not.toHaveBeenCalled();
            }
            expect(
                fixture.managedAgentModel.getRecentActions,
            ).not.toHaveBeenCalled();
            expect(
                fixture.userModel.findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(failure === 'removed' ? 4 : 5);
            expect(captureAutopilotFailure).not.toHaveBeenCalled();
        },
    );

    it('shares concurrent stale data checks and audits a refusal once', async () => {
        const fixture = buildAuthorityFixture();
        let now = 1000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        fixture.doGenerate.mockImplementation(async () => {
            now += 31000;
            fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...user,
                isActive: false,
            });
            const first = authorityToolTurn('findContent', {
                searchQueries: [{ label: 'sales', query: 'sales' }],
                spaceSlug: null,
            });
            const second = authorityToolTurn('findContent', {
                searchQueries: [{ label: 'cost', query: 'cost' }],
                spaceSlug: null,
            });
            second.content[0].toolCallId = 'second-data-call';
            return { ...first, content: [...first.content, ...second.content] };
        });
        await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
        expectAuthorityBlocked(fixture, blockedPersonMessage);
        expect(
            fixture.userModel.findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledTimes(3);
        expect(fixture.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
        expect(fixture.dataRuntime.findContent).not.toHaveBeenCalled();
        expect(captureAutopilotFailure).not.toHaveBeenCalled();
    });

    it.each([true, false])(
        'preserves empty provider errors with flag %s',
        async (enabled) => {
            const fixture = buildAuthorityFixture();
            fixture.featureFlagModel.get.mockResolvedValue({ enabled });
            const error = new Error('');
            fixture.doGenerate.mockImplementation(async () => {
                fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                    { ...user, isActive: false },
                );
                throw error;
            });
            await fixture.service.runHeartbeat(PROJECT_UUID, 'run-uuid');
            if (enabled) expectAuthorityBlocked(fixture, blockedPersonMessage);
            else {
                expect(
                    fixture.managedAgentModel.finishRun,
                ).toHaveBeenCalledWith(
                    'run-uuid',
                    expect.objectContaining({ status: 'completed', error: '' }),
                );
                expect(fixture.slackClient.postMessage).toHaveBeenCalledTimes(
                    2,
                );
            }
            expect(captureAutopilotFailure).toHaveBeenCalledExactlyOnceWith(
                error,
                expect.anything(),
            );
        },
    );

    it.each(['space', 'reverse'] as const)(
        'stops a pending %s effect when a data check refuses',
        async (effect) => {
            const fixture = buildAuthorityFixture();
            const { service } = fixture;
            let now = 1000;
            vi.spyOn(Date, 'now').mockImplementation(() => now);
            const authority = createAutopilotAuthority(
                fixture,
                {
                    userUuid: USER_UUID,
                    organizationUuid: ORGANIZATION_UUID,
                    projectUuid: PROJECT_UUID,
                    surface: AgentActorSurface.IN_APP_AGENT,
                },
                { initialFailure: null, onFailure: vi.fn() },
            );
            await authority.assert();
            const { tools } = await service['buildAutopilotDataTools'](
                user,
                PROJECT_UUID,
                ORGANIZATION_UUID,
                () => authority,
            );
            const paused = Promise.withResolvers<void>();
            const resume = Promise.withResolvers<void>();
            const pause = async () => {
                paused.resolve();
                await resume.promise;
            };
            const createSpace = vi
                .fn()
                .mockResolvedValue({ uuid: 'created-space' });
            let name: string;
            let input: Record<string, unknown>;
            if (effect === 'space') {
                name = 'create_content_from_code';
                input = {
                    chart_as_code: {
                        name: 'Revenue',
                        tableName: 'orders',
                        metricQuery: {
                            dimensions: ['orders_status'],
                            metrics: ['orders_total_revenue'],
                            filters: {},
                            sorts: [],
                            limit: 500,
                            tableCalculations: [],
                        },
                        chartConfig: { type: 'table', config: {} },
                    },
                    description: 'Revenue',
                };
                fixture.projectModel.findExploresFromCache.mockResolvedValue({
                    orders: {
                        tables: {
                            orders: {
                                dimensions: { status: {} },
                                metrics: { total_revenue: {} },
                            },
                        },
                    },
                });
                vi.spyOn(
                    service as AnyType,
                    'assertActorCanCreateSpace',
                ).mockResolvedValue(undefined);
                vi.spyOn(
                    service as AnyType,
                    'assertActorCanCreateChart',
                ).mockResolvedValue(undefined);
                service['spaceModel'].find = vi.fn().mockResolvedValue([]);
                service['spaceModel'].createSpace = createSpace;
                service['userModel'].getUserDetailsByUuid = vi
                    .fn()
                    .mockImplementation(async () => {
                        await pause();
                        return { userId: 1 };
                    });
                fixture.managedAgentModel.getSettings.mockResolvedValue({
                    ...settings,
                    policy: DEFAULT_MANAGED_AGENT_POLICY,
                } as AnyType);
            } else {
                name = 'reverse_own_action';
                input = { action_uuid: 'action', reason: 'Duplicate finding' };
                fixture.managedAgentModel.getAction.mockResolvedValue({
                    actionUuid: 'action',
                    projectUuid: PROJECT_UUID,
                    managedAgentRunUuid: 'run-uuid',
                    actionType: ManagedAgentActionType.INSIGHT,
                    reversedAt: null,
                });
                fixture.managedAgentModel.reverseAction.mockResolvedValue({
                    actionUuid: 'action',
                });
                fixture.managedAgentModel.getSettings.mockImplementation(
                    async () => {
                        await pause();
                        return settings;
                    },
                );
            }
            const custom = service['handleToolCall'](
                PROJECT_UUID,
                'run-uuid',
                'run-uuid',
                name,
                input,
                authority.abortSignal,
                true,
                authority,
            );
            const outcome = custom.then(
                () => null,
                (error: unknown) => error,
            );
            await paused.promise;
            now += 31000;
            fixture.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...user,
                isActive: false,
            });
            await expect(
                (tools.findContent as ReturnType<typeof getFindContent>)
                    .execute!(
                    {
                        searchQueries: [{ label: 'sales' }],
                        spaceSlug: null,
                    },
                    { toolCallId: 'data', messages: [], context: {} },
                ),
            ).rejects.toThrow();
            resume.resolve();
            expect(await outcome).toEqual(
                expect.objectContaining({ message: blockedPersonMessage }),
            );
            expect(createSpace).not.toHaveBeenCalled();
            expect(fixture.savedChartModel.create).not.toHaveBeenCalled();
            expect(
                fixture.managedAgentModel.reverseAction,
            ).not.toHaveBeenCalled();
            expect(fixture.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
        },
    );
});
