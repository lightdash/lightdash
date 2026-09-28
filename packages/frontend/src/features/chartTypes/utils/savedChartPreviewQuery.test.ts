import {
    QueryExecutionContext,
    QueryHistoryStatus,
    FieldType,
    DimensionType,
    MetricType,
    VizAggregationOptions,
    type ApiExecuteAsyncMetricQueryResults,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';
import { reconcileDataAppVizFieldMapping } from './autoMapDataAppVizFields';
import {
    SAVED_CHART_PREVIEW_ROW_LIMIT,
    executeSavedChartPreviewQuery,
    getSavedChartSourceItemsMap,
} from './savedChartPreviewQuery';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../queryRunner/executeQuery', () => ({ pollForResults: vi.fn() }));

const executedMetricQuery = {
    exploreName: 'orders',
    dimensions: ['merge_status'],
    metrics: ['orders_orders_count'],
    tableCalculations: [],
    filters: {},
    sorts: [],
    limit: 500,
};

describe('executeSavedChartPreviewQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({
            queryUuid: 'preview-query',
            metricQuery: executedMetricQuery,
            fields: { orders_status: { name: 'orders_status' } },
        } as unknown as ApiExecuteAsyncMetricQueryResults);
    });

    it('requests the saved chart’s backend pivot and returns its ready rows', async () => {
        const rows = [
            {
                orders_status: {
                    value: { raw: 'completed', formatted: 'Completed' },
                },
            },
        ];
        const pivotDetails = null;
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows,
            pivotDetails,
            page: 1,
            pageSize: SAVED_CHART_PREVIEW_ROW_LIMIT,
            totalPageCount: 1,
            totalResults: rows.length,
            nextPage: undefined,
            previousPage: undefined,
            queryUuid: 'query-1',
            columns: {},
            metadata: {
                performance: {
                    initialQueryExecutionMs: null,
                    resultsPageExecutionMs: 0,
                    queueTimeMs: null,
                },
                preAggregate: null,
            },
        });

        await expect(
            executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
            }),
        ).resolves.toEqual({
            rows,
            itemsMap: { orders_status: { name: 'orders_status' } },
            metricQuery: executedMetricQuery,
            pivotDetails,
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/project-1/query/chart',
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                context: QueryExecutionContext.DATA_APP_SAMPLE,
                chartUuid: 'chart-1',
                limit: SAVED_CHART_PREVIEW_ROW_LIMIT,
                pivotResults: true,
            }),
        });
        expect(pollForResults).toHaveBeenCalledWith(
            'project-1',
            'preview-query',
        );
    });

    it.each([undefined, { subtotalDimensions: ['orders_status'], parent: [] }])(
        'retains selected hidden result fields as bindable metadata (%j)',
        async (subtotalLevel) => {
            vi.mocked(lightdashApi).mockResolvedValue({
                queryUuid: 'preview-query',
                metricQuery: executedMetricQuery,
                fields: {
                    orders_status: { name: 'status', hidden: true },
                    orders_private: { name: 'private', hidden: true },
                    orders_orders_count: { name: 'orders_count', hidden: true },
                    orders_child: { name: 'child', hidden: true },
                },
            } as unknown as ApiExecuteAsyncMetricQueryResults);
            vi.mocked(pollForResults).mockResolvedValue({
                status: QueryHistoryStatus.READY,
                rows: [],
                columns: { orders_status: {} },
                pivotDetails: null,
            } as unknown as Awaited<ReturnType<typeof pollForResults>>);
            const result = await executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
                subtotalLevel,
                sourceMetricQuery: {
                    ...executedMetricQuery,
                    dimensions: ['orders_status', 'orders_child'],
                },
            });
            expect(result.itemsMap.orders_child).toMatchObject({
                hidden: !subtotalLevel,
            });
            expect(result.itemsMap.orders_status).toMatchObject({
                hidden: false,
            });
            expect(result.itemsMap.orders_orders_count).toMatchObject({
                hidden: false,
            });
            expect(result.itemsMap.orders_private).toMatchObject({
                hidden: true,
            });
        },
    );

    it('sends an explicit preview pivot without changing the saved chart', async () => {
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [],
            pivotDetails: null,
            columns: { orders_region: {}, orders_count: {} },
        } as unknown as Awaited<ReturnType<typeof pollForResults>>);
        const pivotConfiguration = {
            sortBy: [],
            indexColumn: [],
            groupByColumns: [{ reference: 'orders_status' }],
            valuesColumns: [
                {
                    reference: 'orders_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
        };
        await executeSavedChartPreviewQuery({
            projectUuid: 'project-1',
            chartUuid: 'chart-1',
            pivotResults: false,
            pivotConfiguration,
        });
        expect(
            JSON.parse(String(vi.mocked(lightdashApi).mock.calls[0][0].body)),
        ).toMatchObject({
            chartUuid: 'chart-1',
            pivotResults: false,
            pivotConfiguration,
        });
    });

    it('starts a hierarchy preview from the root subtotal without a detail query', async () => {
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [],
            pivotDetails: null,
            columns: { orders_region: {}, orders_count: {} },
        } as unknown as Awaited<ReturnType<typeof pollForResults>>);
        const subtotalLevel = {
            subtotalDimensions: ['orders_region'],
            parent: [],
        };

        const result = await executeSavedChartPreviewQuery({
            projectUuid: 'project-1',
            chartUuid: 'chart-1',
            subtotalLevel,
        });

        expect(result.resultColumnIds).toEqual([
            'orders_region',
            'orders_count',
        ]);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        expect(
            JSON.parse(String(vi.mocked(lightdashApi).mock.calls[0][0].body)),
        ).toMatchObject({
            chartUuid: 'chart-1',
            pivotResults: true,
            subtotalLevel,
        });
    });

    it('maps a failed chart-query request to its API error message', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            status: 'error',
            error: {
                name: 'InternalServerError',
                statusCode: 500,
                message: 'Saved chart query failed',
                data: {},
            },
        });

        await expect(
            executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
            }),
        ).rejects.toThrow('Saved chart query failed');
        expect(pollForResults).not.toHaveBeenCalled();
    });

    it('maps an unfinished poll to an actionable error', async () => {
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            error: 'The warehouse is unavailable',
        } as unknown as Awaited<ReturnType<typeof pollForResults>>);

        await expect(
            executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
            }),
        ).rejects.toThrow('The warehouse is unavailable');
    });
});

describe('getSavedChartSourceItemsMap', () => {
    it('retains a selected hidden dimension as a hierarchy binding', () => {
        const itemsMap = getSavedChartSourceItemsMap(
            {
                orders_hidden: {
                    table: 'orders',
                    name: 'hidden',
                    label: 'Hidden',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: true,
                },
            } as unknown as ItemsMap,
            {
                dimensions: ['orders_hidden'],
                metrics: [],
                tableCalculations: [],
            } as unknown as MetricQuery,
        );
        expect(
            reconcileDataAppVizFieldMapping(
                [
                    {
                        name: 'levels',
                        label: 'Levels',
                        type: 'dimension',
                        multiple: true,
                        required: true,
                    },
                ],
                itemsMap,
                { levels: ['orders_hidden'] },
            ),
        ).toEqual({ levels: ['orders_hidden'] });
    });

    it('keeps only selected source fields and includes saved custom fields before a row query', () => {
        const status = { table: 'orders', name: 'status' };
        const hidden = { table: 'orders', name: 'hidden', hidden: true };
        const unselected = { table: 'orders', name: 'unselected' };
        const custom = { id: 'custom_tier', name: 'Tier', type: 'sql' };
        const metric = {
            table: 'orders',
            name: 'custom_revenue',
            type: MetricType.SUM,
            sql: '${TABLE}.revenue',
        };
        const calculation = { name: 'profit', displayName: 'Profit', sql: '1' };
        const query = {
            dimensions: ['orders_status', 'orders_hidden', 'custom_tier'],
            metrics: ['orders_custom_revenue'],
            tableCalculations: [calculation],
            customDimensions: [custom],
            additionalMetrics: [metric],
        } as unknown as MetricQuery;

        expect(
            getSavedChartSourceItemsMap(
                {
                    orders_status: status,
                    orders_hidden: hidden,
                    orders_unselected: unselected,
                } as unknown as ItemsMap,
                query,
            ),
        ).toEqual({
            orders_status: status,
            orders_hidden: { ...hidden, hidden: false },
            custom_tier: custom,
            orders_custom_revenue: {
                ...metric,
                fieldType: FieldType.METRIC,
                label: 'custom_revenue',
                tableLabel: 'orders',
                hidden: false,
            },
            profit: calculation,
        });
    });
});
