import { Ability } from '@casl/ability';
import {
    AnyType,
    ConflictError,
    DEFAULT_MANAGED_AGENT_POLICY,
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
import { getAvailableModels, getModel } from '../ai/models';
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
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        },
        featureFlagModel: {},
        schedulerClient,
        slackClient,
        orgAiCopilotConfigResolver,
        aiOrganizationSettingsService,
        aiAgentToolsService,
        asyncQueryService,
    } as AnyType);

    return {
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
