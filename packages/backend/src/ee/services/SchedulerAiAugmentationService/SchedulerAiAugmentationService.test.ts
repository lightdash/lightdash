import {
    QueryExecutionContext,
    type SendNowScheduler,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import Logger from '../../../logging/logger';
import { SchedulerAiAugmentationService } from './SchedulerAiAugmentationService';

type Dependencies = ConstructorParameters<
    typeof SchedulerAiAugmentationService
>[0];

const setup = (enabled: boolean) => {
    const aiAccessService = {
        getAiAccessForUser: vi.fn().mockResolvedValue({
            enabled,
            identity: enabled ? 'principal' : null,
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
            getWarehouseCredentialsForProject: vi.fn().mockResolvedValue({}),
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
    test('logs one reason when multiple saved queries are blocked', async () => {
        const info = vi.fn();
        vi.spyOn(Logger, 'child').mockReturnValue({
            info,
        } as unknown as typeof Logger);
        const { service } = setup(true);
        await service.runForDelivery({
            scheduler,
            createdBy: 'user',
            deliveryQueries: [
                ...deliveryQueries,
                { chartName: 'Other chart', queryUuid: 'other-query' },
            ],
        });
        expect(info).toHaveBeenCalledExactlyOnceWith(
            'Skipping delivery AI augmentation because AI access runs as a separate principal',
            expect.objectContaining({ projectUuid: 'project' }),
        );
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

    test.each(['fast_model', 'agent'] as const)(
        'skips %s before reading saved results when a policy applies',
        async (type) => {
            const {
                service,
                asyncQueryService,
                aiService,
                aiAgentService,
                aiAccessService,
            } = setup(true);
            const result = await service.runForDelivery({
                scheduler: {
                    ...scheduler,
                    aiAugmentation:
                        type === 'agent'
                            ? {
                                  type,
                                  agentUuid: 'agent',
                                  prompt: 'Summarize',
                                  sourceThreadUuid: null,
                              }
                            : { type, prompt: 'Summarize' },
                },
                createdBy: 'user',
                deliveryQueries,
            });
            expect(result).toBeNull();
            expect(aiAccessService.getAiAccessForUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: 'project',
                    warehouseConnectionUuid: 'connection',
                }),
            );
            expect(
                asyncQueryService.getRawAsyncQueryResults,
            ).not.toHaveBeenCalled();
            expect(aiService.generateDeliverySummary).not.toHaveBeenCalled();
            expect(
                aiAgentService.generateScheduledReport,
            ).not.toHaveBeenCalled();
        },
    );
    test('summarizes saved results with AI read enforcement when no policy applies', async () => {
        const { service, asyncQueryService, aiService } = setup(false);
        await expect(
            service.runForDelivery({
                scheduler,
                createdBy: 'user',
                deliveryQueries,
            }),
        ).resolves.toBe('summary');
        expect(asyncQueryService.getRawAsyncQueryResults).toHaveBeenCalledWith({
            account: expect.anything(),
            projectUuid: 'project',
            queryUuid: 'query',
            maxRows: expect.any(Number),
        });
        expect(aiService.generateDeliverySummary).toHaveBeenCalledOnce();
    });
});
