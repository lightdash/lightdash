import { ChartType, type MetricQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getOpenInExploreUrl } from './getOpenInExploreUrl';

const metricQuery: MetricQuery = {
    exploreName: 'events',
    dimensions: ['events_event'],
    metrics: ['events_dynamic_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

describe('getOpenInExploreUrl', () => {
    it('opens the Explore with the parameter values the query ran with', () => {
        const { pathname, search } = getOpenInExploreUrl({
            metricQuery,
            projectUuid: 'project',
            columnOrder: [],
            chartConfig: { type: ChartType.TABLE, config: undefined },
            parameters: { metric_type: 'revenue' },
        });

        const chart = JSON.parse(
            new URLSearchParams(search).get('create_saved_chart_version') ??
                '{}',
        );
        expect(pathname).toBe('/projects/project/tables/events');
        expect(chart.parameters).toEqual({ metric_type: 'revenue' });
    });
});
