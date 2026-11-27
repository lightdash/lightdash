import {
    toolRunContentQueryOutputSchema,
    type ToolRunContentQueryArgs,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getRunContentQuery } from './runContentQuery';

const composerChart = {
    uuid: 'composer-chart-uuid',
    slug: 'revenue-vs-target',
    name: 'Revenue vs target',
    terminalNodeId: 'joined',
};

const makeDependencies = () => ({
    updateProgress: vi.fn().mockResolvedValue(undefined),
    runAsyncQuery: vi.fn(),
    runSavedChartQuery: vi.fn(),
    getSavedChart: vi.fn(),
    getSqlChart: vi.fn(),
    runSqlChartQuery: vi.fn(),
    getComposerChart: vi.fn().mockResolvedValue(composerChart),
    runComposerChartQuery: vi.fn().mockResolvedValue({
        queryUuid: 'query-uuid',
        rows: [
            { month: '2026-01', revenue: 120 },
            { month: '2026-02', revenue: 140 },
        ],
        columns: ['month', 'revenue'],
        rowCount: 2,
        executionStats: null,
        composerChart,
    }),
    validateContent: vi.fn(),
    maxLimit: 500,
    maxContextRows: 1,
    enableDataAccess: true,
    sqlQuerying: null,
});
const options = { messages: [], toolCallId: 'call', context: {} };

const run = async (
    deps: ReturnType<typeof makeDependencies>,
    source: ToolRunContentQueryArgs['source'],
) => {
    const output = await getRunContentQuery(deps).execute!({ source }, options);
    expect(toolRunContentQueryOutputSchema.safeParse(output).success).toBe(
        true,
    );
    return output;
};

const tileSource = {
    type: 'dashboardChart',
    chartType: 'composer_chart',
    chartSlug: 'revenue-vs-target',
    dashboardSlug: 'jaffle-dashboard',
} as const;

describe('runContentQuery on a composer chart', () => {
    it('runs the composer chart on its dashboard tile and returns its terminal rows', async () => {
        const deps = makeDependencies();

        const output = await run(deps, tileSource);

        expect(deps.runComposerChartQuery).toHaveBeenCalledExactlyOnceWith({
            chartSlug: 'revenue-vs-target',
            dashboardSlug: 'jaffle-dashboard',
        });
        expect(deps.getSavedChart).not.toHaveBeenCalled();
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            result: expect.stringContaining('month,revenue\n2026-01,120'),
            structuredContent: {
                outcome: 'rows',
                chart: null,
                sqlChart: null,
                composerChart: {
                    chartUuid: 'composer-chart-uuid',
                    slug: 'revenue-vs-target',
                    name: 'Revenue vs target',
                    terminalNodeId: 'joined',
                },
                rowCount: 2,
                shownRowCount: 1,
                rows: [['2026-01', 120]],
            },
        });
    });

    it('returns the chart without rows when data access is off', async () => {
        const deps = { ...makeDependencies(), enableDataAccess: false };

        const output = await run(deps, tileSource);

        expect(deps.runComposerChartQuery).not.toHaveBeenCalled();
        expect(output).toMatchObject({
            structuredContent: {
                outcome: 'dataAccessDisabled',
                composerChart: { chartUuid: 'composer-chart-uuid' },
            },
        });
    });

    it('reports a refused run as an error', async () => {
        const deps = makeDependencies();
        deps.runComposerChartQuery.mockRejectedValue(
            new Error('Composer chart "revenue-vs-target" was not found'),
        );

        const output = await run(deps, tileSource);

        expect(output).toMatchObject({ metadata: { status: 'error' } });
    });

    it('runs a chart a space owns with no dashboard', async () => {
        const deps = makeDependencies();

        const output = await run(deps, {
            type: 'chart',
            chartType: 'composer_chart',
            chartSlug: 'revenue-vs-target',
        });

        expect(deps.runComposerChartQuery).toHaveBeenCalledExactlyOnceWith({
            chartSlug: 'revenue-vs-target',
            dashboardSlug: null,
        });
        expect(deps.getSavedChart).not.toHaveBeenCalled();
        expect(output).toMatchObject({
            structuredContent: {
                outcome: 'rows',
                composerChart: { chartUuid: 'composer-chart-uuid' },
            },
        });
    });
});
