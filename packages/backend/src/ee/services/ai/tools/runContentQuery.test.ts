import {
    MetricType,
    toolRunContentQueryOutputSchema,
    type SavedChart,
    type ToolRunContentQueryArgs,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { chart as savedChartMock } from '../../../../services/DashboardService/DashboardService.mock';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
} from '../types/aiAgentDependencies';
import { getRunContentQuery } from './runContentQuery';

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return { ...actual, captureException: vi.fn() };
});

const fields = {
    a_dim1: validExplore.tables.a.dimensions.dim1,
    a_met1: validExplore.tables.a.metrics.met1,
};

const rows = [
    { a_dim1: 'first', a_met1: 1 },
    { a_dim1: 'second', a_met1: 2 },
    { a_dim1: 'third', a_met1: 3 },
];

const savedChart: SavedChart = {
    ...savedChartMock,
    uuid: 'chart-uuid',
    name: 'Orders by status',
    metricQuery: {
        ...metricQueryMock,
        sorts: [{ fieldId: 'a_met1', descending: true }],
        additionalMetrics: [
            {
                table: 'a',
                name: 'custom_sum',
                sql: '1',
                type: MetricType.SUM,
            },
        ],
    },
};

const metricQueryInput: ToolRunContentQueryArgs = {
    source: {
        type: 'metricQuery',
        tableName: validExplore.name,
        metricQuery: {
            exploreName: validExplore.name,
            dimensions: ['a_dim1'],
            metrics: ['a_met1'],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        },
        parameters: null,
    },
};

const chartInput: ToolRunContentQueryArgs = {
    source: { type: 'chart', chartSlug: 'orders-by-status', limit: null },
};

const dashboardChartInput: ToolRunContentQueryArgs = {
    source: {
        type: 'dashboardChart',
        chartSlug: 'orders-by-status',
        dashboardSlug: 'orders-dashboard',
        limit: 5,
    },
};

const buildTool = ({
    runAsyncQuery = vi.fn().mockResolvedValue({
        queryUuid: 'query-uuid',
        rows,
        cacheMetadata: { cacheHit: false },
        fields,
    }),
    runSavedChartQuery = vi.fn().mockResolvedValue({
        rows,
        cacheMetadata: { cacheHit: false },
        fields,
    }),
    validateContent = vi.fn(),
    maxContextRows = Number.POSITIVE_INFINITY,
    enableDataAccess = true,
}: {
    runAsyncQuery?: RunAsyncQueryFn;
    runSavedChartQuery?: RunSavedChartQueryFn;
    validateContent?: () => void;
    maxContextRows?: number;
    enableDataAccess?: boolean;
} = {}) =>
    getRunContentQuery({
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runAsyncQuery,
        runSavedChartQuery,
        getSavedChart: vi.fn().mockResolvedValue(savedChart),
        validateContent,
        maxLimit: 500,
        maxContextRows,
        enableDataAccess,
    });

const execute = async (
    contentQueryTool: ReturnType<typeof buildTool>,
    input: ToolRunContentQueryArgs,
) => {
    if (!contentQueryTool.execute) {
        throw new Error('Expected the tool to have an execute function');
    }
    const output = await contentQueryTool.execute(input, {
        messages: [],
        toolCallId: 'tool-call-1',
        context: {},
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getRunContentQuery', () => {
    beforeEach(() => {
        vi.mocked(Sentry.captureException).mockClear();
    });

    it('returns the rows of an unsaved metric query as CSV and structured content', async () => {
        const output = await execute(buildTool(), metricQueryInput);

        expect(toolRunContentQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toBe(
            '```csv\ndim1,met1\nfirst,1\nsecond,2\nthird,3\n\n```',
        );
        expect(output.structuredContent).toEqual({
            outcome: 'rows',
            chart: null,
            rowCount: 3,
            shownRowCount: 3,
            columns: [
                { fieldId: 'a_dim1', label: 'dim1' },
                { fieldId: 'a_met1', label: 'met1' },
            ],
            rows,
        });
    });

    it('returns a saved chart header, spec and rows for a chart source', async () => {
        const runSavedChartQuery: RunSavedChartQueryFn = vi
            .fn()
            .mockResolvedValue({
                rows,
                cacheMetadata: { cacheHit: false },
                fields,
            });
        const output = await execute(
            buildTool({ runSavedChartQuery }),
            dashboardChartInput,
        );

        expect(runSavedChartQuery).toHaveBeenCalledWith({
            chartUuid: 'chart-uuid',
            dashboardSlug: 'orders-dashboard',
            limit: 5,
        });
        expect(toolRunContentQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.result).toContain(
            'Chart: "Orders by status" (chartUuid: chart-uuid)',
        );
        expect(output.result).toContain(`Explore: ${validExplore.name}`);
        expect(output.result).toContain('Custom metrics: a_custom_sum');
        expect(output.result).toContain('Table calculations: tc');
        expect(output.result).toContain('dim1,met1\nfirst,1');
        expect(output.structuredContent).toEqual({
            outcome: 'rows',
            chart: {
                chartUuid: 'chart-uuid',
                name: 'Orders by status',
                exploreName: validExplore.name,
                dimensions: ['a_dim1'],
                metrics: ['a_met1'],
                filters: {},
                sorts: [{ fieldId: 'a_met1', descending: true }],
                limit: 501,
                tableCalculations: ['tc'],
                customMetrics: ['a_custom_sum'],
                customDimensions: [],
            },
            rowCount: 3,
            shownRowCount: 3,
            columns: [
                { fieldId: 'a_dim1', label: 'dim1' },
                { fieldId: 'a_met1', label: 'met1' },
            ],
            rows,
        });
    });

    it('shows only the first maxContextRows rows in both text and structured content', async () => {
        const output = await execute(
            buildTool({ maxContextRows: 2 }),
            metricQueryInput,
        );

        expect(output.result).toContain('Only the first 2 of those 3 rows');
        expect(output.result).toContain('first,1\nsecond,2\n\n```');
        expect(output.result).not.toContain('third');
        expect(output.structuredContent).toMatchObject({
            outcome: 'rows',
            rowCount: 3,
            shownRowCount: 2,
            rows: rows.slice(0, 2),
        });
    });

    it('reports no results when the query returns no rows', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
            rows: [],
            cacheMetadata: { cacheHit: false },
            fields,
        });
        const output = await execute(
            buildTool({ runAsyncQuery }),
            metricQueryInput,
        );

        expect(toolRunContentQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.result).toBe(NO_RESULTS_RETRY_PROMPT);
        expect(output.structuredContent).toEqual({ outcome: 'noResults' });
    });

    it('describes the chart structure without rows when data access is disabled', async () => {
        const runSavedChartQuery: RunSavedChartQueryFn = vi.fn();
        const output = await execute(
            buildTool({ runSavedChartQuery, enableDataAccess: false }),
            chartInput,
        );

        expect(runSavedChartQuery).not.toHaveBeenCalled();
        expect(toolRunContentQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.result).toContain('Data access is disabled');
        expect(output.result).not.toContain('Filters:');
        expect(output.structuredContent).toEqual({
            outcome: 'dataAccessDisabled',
            chart: {
                chartUuid: 'chart-uuid',
                name: 'Orders by status',
                exploreName: validExplore.name,
                dimensions: ['a_dim1'],
                metrics: ['a_met1'],
            },
        });
    });

    it('validates the metric query without running it when data access is disabled', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn();
        const output = await execute(
            buildTool({ runAsyncQuery, enableDataAccess: false }),
            metricQueryInput,
        );

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(output.result).toBe(
            'Data access is disabled for this agent. The metric query shape is valid, but row values cannot be returned.',
        );
        expect(output.structuredContent).toEqual({
            outcome: 'dataAccessDisabled',
            chart: null,
        });
    });

    it('mirrors the error text in structured content when validation fails', async () => {
        const output = await execute(
            buildTool({
                validateContent: () => {
                    throw new Error('Field a_dim1 does not exist');
                },
            }),
            metricQueryInput,
        );

        expect(toolRunContentQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error running content query.');
        expect(output.result).toContain('Field a_dim1 does not exist');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
