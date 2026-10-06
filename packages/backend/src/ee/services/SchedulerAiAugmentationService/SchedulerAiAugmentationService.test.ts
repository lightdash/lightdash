import {
    type Account,
    type DashboardDAO,
    type MetricQuery,
} from '@lightdash/common';
import { SchedulerAiAugmentationService } from './SchedulerAiAugmentationService';

const account = { user: { id: 'person' } } as Account;
const setup = () => {
    const asyncQueryService = {
        isAiMetricQueryVisible: vi.fn(
            async (_account, _project, query: MetricQuery) =>
                query.exploreName === 'visible',
        ),
        isAiSavedChartVisible: vi.fn(
            async (_account, _project, uuid: string) => uuid === 'visible',
        ),
        getRawAsyncQueryResults: vi.fn(
            async ({ queryUuid }: { queryUuid: string }) => ({
                metricQuery: { exploreName: queryUuid },
                rows: [{ value: queryUuid === 'visible' ? 42 : 999 }],
                fields: {},
                truncated: false,
            }),
        ),
        executeDashboardChartQueryAndGetResults: vi
            .fn()
            .mockResolvedValue({ rows: [{ value: 42 }], fields: {} }),
    };
    const service = new SchedulerAiAugmentationService({
        asyncQueryService,
    } as unknown as ConstructorParameters<
        typeof SchedulerAiAugmentationService
    >[0]);
    return { service, asyncQueryService };
};

it('omits hidden charts and names from reused delivery results with a generic note', async () => {
    const { service } = setup();
    const content = await service['getDeliveryQueriesContent'](
        account,
        'project',
        [
            { chartName: 'Visible chart', queryUuid: 'visible' },
            { chartName: 'Hidden model revenue', queryUuid: 'hidden' },
        ],
    );
    expect(content).toContain('Visible chart');
    expect(content).toContain('42');
    expect(content).toContain(
        'Some charts are not available to AI and were omitted.',
    );
    expect(content).not.toContain('Hidden');
    expect(content).not.toContain('999');
});

it('omits hidden dashboard tiles before executing their queries', async () => {
    const { service, asyncQueryService } = setup();
    const dashboard = {
        uuid: 'dashboard',
        projectUuid: 'project',
        filters: {},
        parameters: {},
        tiles: ['visible', 'hidden'].map((uuid) => ({
            uuid,
            type: 'saved_chart',
            properties: { savedChartUuid: uuid, chartName: uuid },
        })),
    } as unknown as DashboardDAO;
    const content = await service['getDashboardDeliveryContent'](
        account,
        dashboard,
        {} as never,
    );
    expect(content).toContain('visible');
    expect(content).not.toContain('hidden');
    expect(content).toContain(
        'Some charts are not available to AI and were omitted.',
    );
    expect(
        asyncQueryService.executeDashboardChartQueryAndGetResults,
    ).toHaveBeenCalledOnce();
});
