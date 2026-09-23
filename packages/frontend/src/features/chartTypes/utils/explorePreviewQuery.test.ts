import {
    DimensionType,
    FieldType,
    MetricType,
    QueryExecutionContext,
    QueryHistoryStatus,
    VizAggregationOptions,
    VizIndexType,
    type ApiExecuteAsyncMetricQueryResults,
    type MetricQueryRequest,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';
import { executeExplorePreviewQuery } from './explorePreviewQuery';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../queryRunner/executeQuery', () => ({ pollForResults: vi.fn() }));

const query: Omit<MetricQueryRequest, 'csvLimit'> = {
    exploreName: 'orders',
    dimensions: ['orders_date', 'orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [{ fieldId: 'orders_date', descending: true }],
    limit: 500,
    tableCalculations: [],
};

describe('executeExplorePreviewQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({
            queryUuid: 'preview-query',
            fields: {
                orders_date: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'date',
                    label: 'Date',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.date',
                    hidden: false,
                },
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
            },
        } as unknown as ApiExecuteAsyncMetricQueryResults);
    });

    it('sends the requested backend pivot and returns its rows unchanged', async () => {
        const rows = [
            {
                orders_date: {
                    value: { raw: '2026-01-01', formatted: 'Jan 1, 2026' },
                },
            },
        ];
        const pivotDetails = {
            indexColumn: [{ reference: 'orders_date', type: 'RAW' as const }],
            groupByColumns: [{ reference: 'orders_status' }],
            valuesColumns: [
                {
                    reference: 'orders_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            originalColumns: {},
            totalColumnCount: 2,
        };
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows,
            pivotDetails,
        } as unknown as Awaited<ReturnType<typeof pollForResults>>);
        const pivotConfiguration = {
            indexColumn: [
                { reference: 'orders_date', type: VizIndexType.TIME },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            valuesColumns: [
                {
                    reference: 'orders_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            sortBy: undefined,
        };

        await expect(
            executeExplorePreviewQuery({
                projectUuid: 'project-1',
                query,
                pivotConfiguration,
            }),
        ).resolves.toMatchObject({ rows, pivotDetails });

        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-1/query/metric-query',
                version: 'v2',
                method: 'POST',
                body: JSON.stringify({
                    context: QueryExecutionContext.DATA_APP_SAMPLE,
                    query,
                    pivotConfiguration,
                }),
            }),
        );
    });
});
