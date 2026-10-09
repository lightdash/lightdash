import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    QueryExecutionContext,
    type SendNowScheduler,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
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
                expect(agentExecutionContext.getStore()).toEqual({
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
            expect(agentExecutionContext.getStore()).toEqual({
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
