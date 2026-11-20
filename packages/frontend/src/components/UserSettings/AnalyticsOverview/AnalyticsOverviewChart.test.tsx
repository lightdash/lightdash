import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import EChartsReact from '../../EChartsReactWrapper';
import AnalyticsOverviewChart from './AnalyticsOverviewChart';
import {
    analyticsTabs,
    type AnalyticsChartSpec,
} from './analyticsOverviewConfig';
import { type AnalyticsOverviewQueryResult } from './useAnalyticsOverviewQuery';

vi.mock('../../EChartsReactWrapper', () => ({ default: vi.fn(() => null) }));

let result: AnalyticsOverviewQueryResult;

const renderChart = (chart: AnalyticsChartSpec) => {
    renderWithProviders(
        <AnalyticsOverviewChart
            chart={chart}
            result={result}
            projectNames={{}}
        />,
    );
    return vi.mocked(EChartsReact).mock.calls.at(-1)![0].option;
};

describe('Analytics chart presentation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        result = {
            data: [
                {
                    user_activity_activity_date_day: '2026-11-06',
                    user_activity_unique_users: 3,
                    user_activity_total_queries: 200,
                    data_app_events_event_ts_day: '2026-11-06',
                    data_app_events_total_views: 12,
                    data_app_events_unique_viewers: 4,
                    query_events_cache_hit: true,
                    query_events_total_queries: 2,
                },
            ],
            isLoading: false,
            isError: false,
        } as unknown as AnalyticsOverviewQueryResult;
    });

    it('only plots the selected metric from the shared activity query', () => {
        const option = renderChart(analyticsTabs[0].charts[0]);
        expect(option.series).toEqual([
            expect.objectContaining({ type: 'line', data: [3] }),
        ]);
    });

    it('plots app loads and viewers separately from one query', () => {
        const chart = analyticsTabs.find(({ id }) => id === 'apps')!.charts[0];
        const option = renderChart(chart);
        expect(chart.query.metrics).toEqual(['total_views', 'unique_viewers']);
        expect(option.series).toEqual([
            expect.objectContaining({
                name: 'App loads',
                type: 'line',
                data: [12],
            }),
            expect.objectContaining({
                name: 'Observed viewers',
                type: 'line',
                data: [4],
            }),
        ]);
    });

    it('uses a donut and the full dashboard color for cache hits', () => {
        const chart = analyticsTabs.find(({ id }) => id === 'queries')!
            .charts[1];
        const option = renderChart(chart);
        expect(option.series).toEqual([
            expect.objectContaining({
                type: 'pie',
                radius: ['45%', '70%'],
                data: [
                    {
                        name: 'Cache hit',
                        value: 2,
                        itemStyle: { color: '#12B886' },
                    },
                ],
            }),
        ]);
    });
});
