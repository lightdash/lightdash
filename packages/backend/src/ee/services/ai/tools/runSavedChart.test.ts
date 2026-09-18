import {
    DimensionType,
    FieldType,
    MetricType,
    toolRunSavedChartOutputSchema,
    type ItemsMap,
    type MetricQuery,
    type SavedChart,
} from '@lightdash/common';
import { chart as savedChartMock } from '../../../../services/DashboardService/DashboardService.mock';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
} from '../types/aiAgentDependencies';
import { getRunSavedChart } from './runSavedChart';

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return { ...actual, captureException: vi.fn() };
});

const chartUuid = '11111111-1111-4111-8111-111111111111';

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [{ fieldId: 'orders_count', descending: true }],
    limit: 10,
    tableCalculations: [{ name: 'share', displayName: 'Share', sql: '1' }],
    additionalMetrics: [
        {
            table: 'orders',
            name: 'avg_amount',
            type: MetricType.AVERAGE,
            sql: '${TABLE}.amount',
        },
    ],
};

const savedChart: SavedChart = {
    ...savedChartMock,
    uuid: chartUuid,
    name: 'Orders by status',
    metricQuery,
};

const fields: ItemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    },
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.id',
        hidden: false,
    },
};

const rows = [
    { orders_status: 'done', orders_count: 3 },
    { orders_status: 'pending', orders_count: 1 },
];

const queryResultsWith = (resultRows: Record<string, unknown>[]) => ({
    queryUuid: '22222222-2222-4222-8222-222222222222',
    rows: resultRows,
    cacheMetadata: { cacheHit: false },
    fields,
});

const executeTool = async ({
    getSavedChart = vi.fn().mockResolvedValue(savedChart),
    runAsyncQuery = vi.fn().mockResolvedValue(queryResultsWith(rows)),
    maxContextRows = Number.POSITIVE_INFINITY,
    enableDataAccess = true,
}: {
    getSavedChart?: GetSavedChartFn;
    runAsyncQuery?: RunAsyncQueryFn;
    maxContextRows?: number;
    enableDataAccess?: boolean;
}) => {
    const { execute } = getRunSavedChart({
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runAsyncQuery,
        getSavedChart,
        maxLimit: 500,
        maxContextRows,
        enableDataAccess,
    });
    if (!execute) {
        throw new Error('Expected the tool to define execute');
    }
    const output = await execute(
        { chartUuid },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('runSavedChart', () => {
    it('returns the chart spec and the shown rows as text and structured content', async () => {
        const output = await executeTool({});

        expect(toolRunSavedChartOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            status: 'results',
            chart: {
                chartUuid,
                name: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
                filters: {},
                sorts: [{ fieldId: 'orders_count', descending: true }],
                limit: 10,
                tableCalculations: ['share'],
                customMetrics: ['orders_avg_amount'],
                customDimensions: [],
            },
            rowCount: 2,
            shownRowCount: 2,
            truncated: false,
            columns: [
                { fieldId: 'orders_status', label: 'Status' },
                { fieldId: 'orders_count', label: 'Count' },
            ],
            rows,
        });

        // The text carries the same facts as the structured content.
        expect(output.result).toContain(
            `Chart: "Orders by status" (chartUuid: ${chartUuid})`,
        );
        expect(output.result).toContain('Explore: orders');
        expect(output.result).toContain('Dimensions: orders_status');
        expect(output.result).toContain('Metrics: orders_count');
        expect(output.result).toContain('Filters: {}');
        expect(output.result).toContain(
            'Sorts: [{"fieldId":"orders_count","descending":true}]',
        );
        expect(output.result).toContain('Limit: 10');
        expect(output.result).toContain('Table calculations: share');
        expect(output.result).toContain('Custom metrics: orders_avg_amount');
        expect(output.result).not.toContain('Custom dimensions:');
        expect(output.result).toContain(
            '```csv\nStatus,Count\ndone,3\npending,1\n\n```',
        );
        expect(output.result).not.toContain('Only the first');
    });

    it('caps the shown rows to maxContextRows and reports the truncation', async () => {
        const output = await executeTool({ maxContextRows: 1 });

        expect(toolRunSavedChartOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.structuredContent).toMatchObject({
            status: 'results',
            rowCount: 2,
            shownRowCount: 1,
            truncated: true,
            rows: [rows[0]],
        });
        expect(output.result).toContain(
            'Only the first 1 of those 2 rows are shown here',
        );
        expect(output.result).toContain('```csv\nStatus,Count\ndone,3\n\n```');
        expect(output.result).not.toContain('pending');
    });

    it('returns the retry prompt when the chart produces no rows', async () => {
        const output = await executeTool({
            runAsyncQuery: vi.fn().mockResolvedValue(queryResultsWith([])),
        });

        expect(toolRunSavedChartOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.result).toBe(NO_RESULTS_RETRY_PROMPT);
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            status: 'no_results',
            note: NO_RESULTS_RETRY_PROMPT,
        });
    });

    it('surfaces only the chart structure when data access is disabled', async () => {
        const runAsyncQuery = vi.fn();
        const output = await executeTool({
            runAsyncQuery,
            enableDataAccess: false,
        });

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(toolRunSavedChartOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            status: 'data_access_disabled',
            chart: {
                chartUuid,
                name: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
            },
            note: 'Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.',
        });
        expect(output.result).toBe(
            `Chart: "Orders by status" (chartUuid: ${chartUuid})\nExplore: orders\nDimensions: orders_status\nMetrics: orders_count\n\nData access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.`,
        );
        expect(output.result).not.toContain('Filters:');
    });

    it('mirrors the error text in structured content when the chart cannot be loaded', async () => {
        const output = await executeTool({
            getSavedChart: vi
                .fn()
                .mockRejectedValue(new Error('Chart not found')),
        });

        expect(toolRunSavedChartOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error running saved chart.');
        expect(output.result).toContain('Chart not found');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
