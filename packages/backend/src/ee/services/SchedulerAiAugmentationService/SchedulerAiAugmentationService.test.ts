import {
    AiEgressBlockReason,
    AiEgressSurface,
    QueryExecutionContext,
    type SendNowScheduler,
} from '@lightdash/common';
import { AiAccessRestrictionsError } from '../../../services/ProjectService/ProjectService';
import { sessionUser } from '../../../services/UserService.mock';
import { logAiEgressBlock } from '../../../utils/aiEgress/logAiEgressBlock';
import { SchedulerAiAugmentationService } from './SchedulerAiAugmentationService';

vi.mock('../../../utils/aiEgress/logAiEgressBlock', () => ({
    logAiEgressBlock: vi.fn(),
}));

function setup(
    restricted: boolean,
    type: 'agent' | 'fast_model',
    dashboard: boolean,
    hasDeliveryQueries = false,
    flagEnabled = true,
) {
    const asyncQueryService = {
        executeAiQueryFromHistory: vi.fn().mockResolvedValue({
            rows: [{ value: 'fresh-ai' }],
            fields: {},
            truncated: false,
        }),
        getRawAsyncQueryResults: vi.fn().mockResolvedValue({
            rows: [{ value: 'stored-secret' }],
            fields: {},
            truncated: false,
        }),
        executeSavedChartQueryAndGetResults: vi
            .fn()
            .mockResolvedValue({ rows: [{ value: 'fresh-ai' }], fields: {} }),
        executeDashboardChartQueryAndGetResults: vi
            .fn()
            .mockResolvedValue({ rows: [{ value: 'fresh-ai' }], fields: {} }),
    };
    const aiService = {
        generateDeliverySummary: vi.fn().mockResolvedValue('Summary'),
    };
    const aiAgentService = {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        getAgent: vi.fn().mockResolvedValue({ uuid: 'agent' }),
        generateScheduledReport: vi.fn().mockResolvedValue('Report'),
    };
    const service = new SchedulerAiAugmentationService({
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: flagEnabled }),
        },
        projectModel: {
            getAiAccessRestrictions: vi.fn().mockResolvedValue(restricted),
        },
        schedulerService: {
            getSchedulerProjectContext: vi.fn().mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                spaceUuid: null,
            }),
        },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(sessionUser),
        },
        dashboardModel: {
            getByIdOrSlug: vi.fn().mockResolvedValue({
                uuid: 'dashboard',
                projectUuid: 'project',
                organizationUuid: 'org',
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                parameters: {},
                tiles: [
                    {
                        uuid: 'tile',
                        type: 'saved_chart',
                        properties: {
                            savedChartUuid: 'chart',
                            chartName: 'Chart',
                        },
                    },
                ],
            }),
        },
        asyncQueryService,
        aiService,
        aiAgentService,
    } as unknown as ConstructorParameters<
        typeof SchedulerAiAugmentationService
    >[0]);
    const scheduler = {
        savedChartUuid: dashboard ? null : 'chart',
        dashboardUuid: dashboard ? 'dashboard' : null,
        filters: undefined,
        parameters: { region: 'west' },
        selectedTabs: null,
        aiAugmentation:
            type === 'agent'
                ? {
                      type,
                      prompt: 'Summarize',
                      agentUuid: 'agent',
                      sourceThreadUuid: 'old-thread',
                  }
                : { type, prompt: 'Summarize' },
    } as unknown as SendNowScheduler;
    const run = () =>
        service.runForDelivery({
            scheduler,
            createdBy: sessionUser.userUuid,
            deliveryQueries: hasDeliveryQueries
                ? [{ chartName: 'Chart', queryUuid: 'old-query' }]
                : undefined,
        });
    return {
        run,
        asyncQueryService,
        provider:
            type === 'agent'
                ? aiAgentService.generateScheduledReport
                : aiService.generateDeliverySummary,
    };
}

describe('Scheduled summary AI restrictions', () => {
    beforeEach(() => vi.clearAllMocks());

    describe.each(['agent', 'fast_model'] as const)('%s', (type) => {
        it.each([false, true])(
            'sends fresh AI rows for dashboard=%s',
            async (dashboard) => {
                const { run, asyncQueryService, provider } = setup(
                    true,
                    type,
                    dashboard,
                );
                await run();
                const payload = provider.mock.calls[0][1];
                expect(JSON.stringify(payload)).toContain('fresh-ai');
                expect(JSON.stringify(payload)).not.toContain('stored-secret');
                expect(
                    asyncQueryService.getRawAsyncQueryResults,
                ).not.toHaveBeenCalled();
                const query = dashboard
                    ? asyncQueryService.executeDashboardChartQueryAndGetResults
                    : asyncQueryService.executeSavedChartQueryAndGetResults;
                expect(query).toHaveBeenCalledWith(
                    expect.objectContaining({
                        context: QueryExecutionContext.AI,
                        account: expect.objectContaining({
                            user: expect.objectContaining({
                                id: sessionUser.userUuid,
                            }),
                        }),
                        parameters: { region: 'west' },
                    }),
                    expect.anything(),
                );
                if (type === 'agent')
                    expect(payload.sourceThreadUuid).toBeNull();
            },
        );

        it('reruns stored delivery query definitions without reading their old rows', async () => {
            const { run, asyncQueryService, provider } = setup(
                true,
                type,
                false,
                true,
            );
            await run();
            expect(JSON.stringify(provider.mock.calls[0][1])).toContain(
                'fresh-ai',
            );
            expect(JSON.stringify(provider.mock.calls[0][1])).not.toContain(
                'stored-secret',
            );
            expect(
                asyncQueryService.executeAiQueryFromHistory,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ queryUuid: 'old-query' }),
            );
            expect(
                asyncQueryService.getRawAsyncQueryResults,
            ).not.toHaveBeenCalled();
        });

        it('skips the summary and logs a missing AI sign-in without failing the delivery', async () => {
            const { run, asyncQueryService, provider } = setup(
                true,
                type,
                false,
            );
            asyncQueryService.executeSavedChartQueryAndGetResults.mockRejectedValue(
                new AiAccessRestrictionsError(),
            );
            await expect(run()).resolves.toBeNull();
            expect(provider).not.toHaveBeenCalled();
            expect(logAiEgressBlock).toHaveBeenCalledWith(
                expect.objectContaining({
                    surface: AiEgressSurface.SCHEDULED_DELIVERY_SUMMARY,
                    reason: AiEgressBlockReason.ROWS_NOT_FETCHED_BY_AI_SIGN_IN,
                }),
            );
        });

        it('keeps stored delivery rows with restrictions off', async () => {
            const { run, asyncQueryService, provider } = setup(
                false,
                type,
                false,
                true,
            );
            await run();
            expect(JSON.stringify(provider.mock.calls[0][1])).toContain(
                'stored-secret',
            );
            expect(
                asyncQueryService.executeSavedChartQueryAndGetResults,
            ).not.toHaveBeenCalled();
        });

        it('keeps stored delivery rows when the rollout flag is off', async () => {
            const { run, provider } = setup(true, type, false, true, false);
            await run();
            expect(JSON.stringify(provider.mock.calls[0][1])).toContain(
                'stored-secret',
            );
        });
    });
});
