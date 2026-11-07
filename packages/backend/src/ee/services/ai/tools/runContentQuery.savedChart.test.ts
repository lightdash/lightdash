import { type ToolRunContentQueryArgs } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { metricQueryMock } from '../../../../services/ProjectService/ProjectService.mock';
import { getRunContentQuery } from './runContentQuery';

const makeDependencies = (savedLimit: number) => {
    const metricQuery = { ...metricQueryMock, limit: savedLimit };
    return {
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runAsyncQuery: vi.fn(),
        runSavedChartQuery: vi.fn().mockResolvedValue({
            queryUuid: 'saved-query',
            rows: [],
            fields: {},
            cacheMetadata: { cacheHit: false },
            execution: { metricQuery },
        }),
        getSavedChart: vi.fn().mockResolvedValue({
            uuid: 'chart-uuid',
            name: 'Orders',
            metricQuery,
        }),
        getSqlChart: vi.fn(),
        runSqlChartQuery: vi.fn(),
        validateContent: vi.fn(),
        maxLimit: 500,
        maxContextRows: 50,
        enableDataAccess: true,
        sqlQuerying: null,
    };
};
const options = { messages: [], toolCallId: 'call', context: {} };

const sources: ToolRunContentQueryArgs['source'][] = [
    { type: 'chart', chartType: null, chartSlug: 'orders' },
    {
        type: 'dashboardChart',
        chartType: null,
        chartSlug: 'orders',
        dashboardSlug: 'dashboard',
    },
];

describe('runContentQuery on a saved explore chart', () => {
    it.each(sources)('runs a $type at its saved limit', async (source) => {
        const deps = makeDependencies(40);

        await getRunContentQuery(deps).execute!({ source }, options);

        expect(deps.runSavedChartQuery).toHaveBeenCalledExactlyOnceWith({
            chartUuid: 'chart-uuid',
            dashboardSlug:
                source.type === 'dashboardChart' ? 'dashboard' : null,
            limit: 40,
        });
    });

    it('clamps a saved limit above the AI max', async () => {
        const deps = makeDependencies(10000);

        await getRunContentQuery(deps).execute!(
            { source: sources[0] },
            options,
        );

        expect(deps.runSavedChartQuery).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ limit: 500 }),
        );
    });
});
