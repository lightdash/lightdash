import {
    toolRunContentQueryOutputSchema,
    type ToolRunContentQueryArgs,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getRunContentQuery } from './runContentQuery';

const sqlChart = {
    uuid: 'sql-chart-uuid',
    slug: 'orders-by-status',
    name: 'Orders by status',
    sql: 'select status, count(*) as orders from orders group by 1',
};

const makeDependencies = () => ({
    updateProgress: vi.fn().mockResolvedValue(undefined),
    runAsyncQuery: vi.fn(),
    runSavedChartQuery: vi.fn(),
    getSavedChart: vi.fn(),
    getSqlChart: vi.fn().mockResolvedValue(sqlChart),
    runSqlChartQuery: vi.fn().mockResolvedValue({
        queryUuid: 'query-uuid',
        rows: [
            { status: 'completed', orders: 97 },
            { status: 'shipped', orders: 26 },
        ],
        columns: ['status', 'orders'],
        rowCount: 2,
        sqlChart,
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

describe('runContentQuery on a saved SQL chart', () => {
    it('runs the saved SQL chart by slug without asking for approval', async () => {
        const deps = makeDependencies();

        const output = await run(deps, {
            type: 'chart',
            chartType: 'sql_chart',
            chartSlug: 'orders-by-status',
            limit: 10,
        });

        expect(deps.runSqlChartQuery).toHaveBeenCalledExactlyOnceWith({
            chartSlug: 'orders-by-status',
            dashboardSlug: null,
            limit: 10,
        });
        expect(deps.getSqlChart).not.toHaveBeenCalled();
        expect(deps.getSavedChart).not.toHaveBeenCalled();
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            result: expect.stringContaining('status,orders\ncompleted,97'),
            structuredContent: {
                outcome: 'rows',
                chart: null,
                sqlChart: {
                    chartUuid: 'sql-chart-uuid',
                    slug: 'orders-by-status',
                    name: 'Orders by status',
                    sql: sqlChart.sql,
                },
                rowCount: 2,
                shownRowCount: 1,
                columns: [
                    { fieldId: null, label: 'status' },
                    { fieldId: null, label: 'orders' },
                ],
                rows: [['completed', 97]],
            },
        });
    });

    it('applies the dashboard context for a SQL chart tile', async () => {
        const deps = makeDependencies();

        await run(deps, {
            type: 'dashboardChart',
            chartType: 'sql_chart',
            chartSlug: 'orders-by-status',
            dashboardSlug: 'jaffle-dashboard',
            limit: null,
        });

        expect(deps.runSqlChartQuery).toHaveBeenCalledExactlyOnceWith({
            chartSlug: 'orders-by-status',
            dashboardSlug: 'jaffle-dashboard',
            limit: 500,
        });
    });

    it('keeps running explore charts when chartType is null', async () => {
        const deps = makeDependencies();
        deps.getSavedChart.mockRejectedValue(new Error('not found'));

        await run(deps, {
            type: 'chart',
            chartType: null,
            chartSlug: 'orders',
            limit: null,
        });

        expect(deps.getSavedChart).toHaveBeenCalledExactlyOnceWith('orders');
        expect(deps.runSqlChartQuery).not.toHaveBeenCalled();
    });

    it('returns the SQL chart structure without rows when data access is off', async () => {
        const deps = { ...makeDependencies(), enableDataAccess: false };

        const output = await run(deps, {
            type: 'chart',
            chartType: 'sql_chart',
            chartSlug: 'orders-by-status',
            limit: null,
        });

        expect(deps.runSqlChartQuery).not.toHaveBeenCalled();
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            structuredContent: {
                outcome: 'dataAccessDisabled',
                chart: null,
                sqlChart: { chartUuid: 'sql-chart-uuid', sql: sqlChart.sql },
            },
        });
    });

    it('reports a SQL chart the agent cannot see as an error', async () => {
        const deps = makeDependencies();
        deps.runSqlChartQuery.mockRejectedValue(
            new Error('SQL chart "orders-by-status" was not found'),
        );

        const output = await run(deps, {
            type: 'chart',
            chartType: 'sql_chart',
            chartSlug: 'orders-by-status',
            limit: null,
        });

        expect(output).toMatchObject({
            metadata: { status: 'error' },
            result: expect.stringContaining('was not found'),
        });
    });
});
