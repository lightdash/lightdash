import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    QueryExecutionContext,
    type SendNowScheduler,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../../../services/AiAccessService/agentActionTestUtils.mock';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { SchedulerAiAugmentationService } from './SchedulerAiAugmentationService';

type Dependencies = ConstructorParameters<
    typeof SchedulerAiAugmentationService
>[0];

const setup = (enabled: boolean) => {
    const aiAccessService = {
        getAiAccessForUser: vi.fn().mockResolvedValue({
            enabled,
            identity: enabled ? 'connected_person' : null,
        }),
    };
    const asyncQueryService = {
        executeSavedChartQueryAndGetResults: vi
            .fn()
            .mockResolvedValue({ rows: [], fields: {} }),
        getAsyncQueryHistory: vi
            .fn()
            .mockResolvedValue({ warehouseConnectionUuid: 'connection' }),
        getRawAsyncQueryResults: vi
            .fn()
            .mockResolvedValue({ rows: [], fields: {}, truncated: false }),
    };
    const aiService = {
        generateDeliverySummary: vi.fn().mockResolvedValue('summary'),
    };
    const aiAgentService = {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        generateScheduledReport: vi.fn(),
        getAgent: vi.fn().mockResolvedValue({}),
    };
    const service = new SchedulerAiAugmentationService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
            getWarehouseCredentialsForBinding: vi.fn().mockResolvedValue({}),
        } as unknown as Dependencies['projectModel'],
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue({}),
            getCredentials: vi.fn().mockResolvedValue({}),
        } as unknown as Dependencies['warehouseConnectionModel'],
        aiAccessService:
            aiAccessService as unknown as Dependencies['aiAccessService'],
        asyncQueryService:
            asyncQueryService as unknown as Dependencies['asyncQueryService'],
        aiService: aiService as unknown as Dependencies['aiService'],
        aiAgentService:
            aiAgentService as unknown as Dependencies['aiAgentService'],
        schedulerService: {
            getSchedulerProjectContext: vi.fn().mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                spaceUuid: null,
            }),
        } as unknown as Dependencies['schedulerService'],
        userModel: {
            findSessionUserAndOrgByUuid: vi
                .fn()
                .mockResolvedValue(defaultSessionUser),
        } as unknown as Dependencies['userModel'],
        dashboardModel: {} as Dependencies['dashboardModel'],
        schedulerAiAugmentationModel:
            {} as Dependencies['schedulerAiAugmentationModel'],
    });
    return {
        service,
        aiAccessService,
        asyncQueryService,
        aiService,
        aiAgentService,
    };
};

const scheduler = {
    dashboardUuid: null,
    savedChartUuid: 'chart',
    aiAugmentation: { type: 'fast_model', prompt: 'Summarize' },
} as SendNowScheduler;
const deliveryQueries = [{ chartName: 'Chart', queryUuid: 'query' }];

describe('SchedulerAiAugmentationService AI access', () => {
    afterEach(() => vi.restoreAllMocks());
    test('refuses saved delivery results when the agent is disconnected', async () => {
        const { service, aiAccessService, asyncQueryService, aiService } =
            setup(true);
        const error = new AiAccessRefusedError(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        aiAccessService.getAiAccessForUser.mockResolvedValue({
            enabled: true,
            identity: 'connected_person',
            refusal: error.refusal,
        });
        await expect(
            service.runForDelivery({
                scheduler,
                createdBy: 'user',
                deliveryQueries,
            }),
        ).rejects.toMatchObject({ refusal: error.refusal });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
        expect(aiService.generateDeliverySummary).not.toHaveBeenCalled();
    });
    test('attributes fresh summary queries to the summary actor', async () => {
        const { service, asyncQueryService } = setup(true);
        asyncQueryService.executeSavedChartQueryAndGetResults.mockImplementation(
            async () => {
                expect(agentExecutionContext.getStore()).toMatchObject({
                    surface: AgentActorSurface.AI_SUMMARY,
                    clientId: 'lightdash-ai-summary',
                });
                return { rows: [], fields: {} };
            },
        );
        await service.runForDelivery({ scheduler, createdBy: 'user' });
        expect(
            asyncQueryService.executeSavedChartQueryAndGetResults,
        ).toHaveBeenCalledOnce();
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });

    test('attributes the report agent own queries to the summary actor', async () => {
        const { service, aiAgentService } = setup(true);
        aiAgentService.generateScheduledReport.mockImplementation(async () => {
            expect(agentExecutionContext.getStore()).toMatchObject({
                surface: AgentActorSurface.AI_SUMMARY,
                clientId: 'lightdash-ai-summary',
            });
            return 'agent summary';
        });
        await expect(
            service.runForDelivery({
                scheduler: {
                    ...scheduler,
                    aiAugmentation: {
                        type: 'agent',
                        agentUuid: 'agent',
                        prompt: 'Summarize',
                        sourceThreadUuid: null,
                    },
                },
                createdBy: 'user',
            }),
        ).resolves.toBe('agent summary');
        expect(aiAgentService.generateScheduledReport).toHaveBeenCalledOnce();
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });

    test('re-queries normal-session delivery results through the agent', async () => {
        const { service, asyncQueryService, aiService } = setup(true);
        asyncQueryService.getRawAsyncQueryResults.mockRejectedValue(
            new AiAccessRefusedError(
                AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            ),
        );
        await expect(
            service.runForDelivery({
                scheduler,
                createdBy: 'user',
                deliveryQueries,
            }),
        ).resolves.toBe('summary');
        expect(
            asyncQueryService.executeSavedChartQueryAndGetResults,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ context: QueryExecutionContext.AI }),
            expect.anything(),
        );
        expect(aiService.generateDeliverySummary).toHaveBeenCalledOnce();
    });
    test('uses the AI context when fresh delivery queries are needed', async () => {
        const { service, asyncQueryService } = setup(false);
        await service.runForDelivery({ scheduler, createdBy: 'user' });
        expect(
            asyncQueryService.executeSavedChartQueryAndGetResults,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ context: QueryExecutionContext.AI }),
            expect.anything(),
        );
    });

    test.each([true, false])(
        'summarizes saved results with connected person=%s',
        async (connected) => {
            const { service, asyncQueryService, aiService } = setup(connected);
            await expect(
                service.runForDelivery({
                    scheduler,
                    createdBy: 'user',
                    deliveryQueries,
                }),
            ).resolves.toBe('summary');
            expect(
                asyncQueryService.getRawAsyncQueryResults,
            ).toHaveBeenCalledWith({
                account: expect.anything(),
                projectUuid: 'project',
                queryUuid: 'query',
                maxRows: expect.any(Number),
                aiAccessOnly: true,
            });
            expect(aiService.generateDeliverySummary).toHaveBeenCalledOnce();
        },
    );
});

test.each(agentActionTestCases)(
    'augmentation upsert: %s',
    async (_, surface, enabled, count) => {
        const { service } = setup(true);
        Object.assign(service['schedulerService'], {
            checkUserCanManageScheduler: vi.fn().mockResolvedValue({
                resource: { projectUuid: 'project', spaceUuid: null },
            }),
        });
        Object.assign(service['schedulerAiAugmentationModel'], {
            upsert: vi.fn().mockResolvedValue(undefined),
        });
        await withAgentActionScope(defaultSessionUser, surface, enabled, () =>
            service.upsertAugmentation(defaultSessionUser, 'scheduler', {
                type: 'fast_model',
                prompt: 'secret instructions',
            }),
        );
        const insert = vi.mocked(service['agentActionLogModel'].insert);
        expect(insert).toHaveBeenCalledTimes(count);
        if (count)
            expect(insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    object_type: 'scheduler_ai_augmentation',
                    object_uuid: 'scheduler',
                    action: 'update',
                }),
            );
        expect(JSON.stringify(insert.mock.calls)).not.toContain('secret');
    },
);

describe.each(agentActionTestCases)(
    'augmentation refusal: %s',
    (_, surface, enabled, count) => {
        test.each(['organization_setting', 'agent_scope'] as const)(
            '%s',
            async (policyLayer) => {
                const { service, aiAgentService } = setup(true);
                Object.assign(service['schedulerService'], {
                    checkUserCanManageScheduler: vi.fn().mockResolvedValue({
                        resource: {
                            projectUuid: 'project',
                            spaceUuid: 'restricted-space',
                        },
                    }),
                });
                if (policyLayer === 'organization_setting')
                    aiAgentService.getIsCopilotEnabled.mockResolvedValue(false);
                else
                    aiAgentService.getAgent.mockResolvedValue({
                        spaceAccess: ['other-space'],
                    });
                await expect(
                    withAgentActionScope(
                        defaultSessionUser,
                        surface,
                        enabled,
                        () =>
                            service.upsertAugmentation(
                                defaultSessionUser,
                                'scheduler',
                                {
                                    type: 'agent',
                                    agentUuid: 'agent',
                                    sourceThreadUuid: null,
                                    prompt: 'secret prompt',
                                },
                            ),
                    ),
                ).rejects.toThrow();
                const insert = vi.mocked(service['agentActionLogModel'].insert);
                expect(insert).toHaveBeenCalledTimes(count);
                if (count)
                    expect(insert).toHaveBeenCalledWith(
                        expect.objectContaining({
                            outcome: 'denied',
                            policy_layer: policyLayer,
                            object_type: 'scheduler_ai_augmentation',
                        }),
                    );
                expect(JSON.stringify(insert.mock.calls)).not.toContain(
                    'secret',
                );
            },
        );
    },
);
