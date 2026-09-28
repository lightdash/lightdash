import {
    ChartType,
    LightdashAppPreviewTokenHeader,
    LightdashCustomSqlProvenanceChartUuidHeader,
    LightdashRequestMethodHeader,
    MergeJoinType,
    QueryExecutionContext,
    RequestMethod,
    VizAggregationOptions,
    VizIndexType,
    type ApiExecuteAsyncMergeQueryRequest,
} from '@lightdash/common';
import express from 'express';
import { QueryController } from './QueryController';

describe('QueryController', () => {
    it.each([
        [
            RequestMethod.GSHEETS_ADDON,
            undefined,
            QueryExecutionContext.GSHEETS_ADDON,
        ],
        [undefined, undefined, QueryExecutionContext.API],
        ['future-client', undefined, QueryExecutionContext.API],
        [RequestMethod.CLI, undefined, QueryExecutionContext.CLI],
        [
            RequestMethod.GSHEETS_ADDON,
            QueryExecutionContext.FILTER_AUTOCOMPLETE,
            QueryExecutionContext.FILTER_AUTOCOMPLETE,
        ],
    ])(
        'attributes metric queries from %s with explicit context %s to %s',
        async (method, context, expectedContext) => {
            const executeAsyncMetricQuery = vi
                .fn()
                .mockResolvedValue({ queryUuid: 'query-uuid' });
            const controller = new QueryController({
                getAsyncQueryService: () => ({ executeAsyncMetricQuery }),
            } as unknown as ConstructorParameters<typeof QueryController>[0]);
            const req = {
                account: {},
                headers: {},
                header: (name: string) =>
                    name === LightdashRequestMethodHeader ? method : undefined,
            } as unknown as express.Request;

            await controller.executeAsyncMetricQuery(
                {
                    query: {
                        exploreName: 'orders',
                        dimensions: ['orders_status'],
                        metrics: ['orders_count'],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                    },
                    context,
                },
                'project-uuid',
                req,
            );

            expect(executeAsyncMetricQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expectedContext,
                }),
            );
        },
    );

    it('forwards merge execution to the one-call service interface', async () => {
        const executeAsyncMergeQuery = vi.fn().mockResolvedValue({
            outcome: 'started',
            query: { queryUuid: 'query-uuid' },
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({
                executeAsyncMergeQuery,
            }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: { user: { type: 'registered' } },
            headers: {},
            header: vi.fn(),
        } as unknown as express.Request;
        const body: ApiExecuteAsyncMergeQueryRequest = {
            mergeQuery: {
                sources: [],
                joinKey: [],
                joinType: MergeJoinType.FULL,
                limit: 500,
                tableCalculations: [],
            },
            context: QueryExecutionContext.EXPLORE,
            mode: { type: 'export', limit: 42 },
            chart: {
                chartConfig: { type: ChartType.TABLE, config: {} },
                pivotConfig: { columns: ['customer_id'], rows: [] },
            },
        };

        await controller.executeAsyncMergeQuery(body, 'project-uuid', req);

        expect(executeAsyncMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                mergeQuery: body.mergeQuery,
                context: QueryExecutionContext.EXPLORE,
                mode: body.mode,
                chart: body.chart,
            }),
        );
    });

    it.each([
        { name: 'an extra connection', field: 'finance-uuid' },
        { name: 'the original as null', field: null },
        { name: 'no connection field', field: undefined },
    ])('forwards $name to the SQL runner query', async ({ field }) => {
        const executeAsyncSqlQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({ executeAsyncSqlQuery }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: {},
            headers: {},
            header: vi.fn(),
        } as unknown as express.Request;

        await controller.executeAsyncSqlQuery(
            {
                sql: 'select 1',
                ...(field === undefined
                    ? {}
                    : { warehouseConnectionUuid: field }),
            },
            'project-uuid',
            req,
        );

        expect(
            executeAsyncSqlQuery.mock.calls[0][0].warehouseConnectionUuid,
        ).toBe(field);
    });

    it('forwards the signed Data App preview token to metric-query execution', async () => {
        const executeAsyncMetricQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({ executeAsyncMetricQuery }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: {},
            header: vi.fn(),
            headers: {
                [LightdashAppPreviewTokenHeader.toLowerCase()]:
                    'signed-preview-token',
            },
        } as unknown as express.Request;

        await controller.executeAsyncMetricQuery(
            {
                query: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                },
            } as never,
            'project-uuid',
            req,
        );

        expect(executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                dataAppPreviewToken: 'signed-preview-token',
            }),
        );
    });

    it('forwards the embedded chart provenance candidate to metric-query execution', async () => {
        const executeAsyncMetricQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({ executeAsyncMetricQuery }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: {},
            headers: {},
            header: vi.fn((headerName: string) =>
                headerName === LightdashCustomSqlProvenanceChartUuidHeader
                    ? 'chart-uuid'
                    : undefined,
            ),
        } as unknown as express.Request;

        await controller.executeAsyncMetricQuery(
            {
                query: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                },
            } as never,
            'project-uuid',
            req,
        );

        expect(executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                customSqlProvenanceChartUuid: 'chart-uuid',
            }),
        );
    });

    it('forwards a saved-chart pivot override to the saved-chart execution', async () => {
        const executeAsyncSavedChartQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({ executeAsyncSavedChartQuery }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: { isJwtUser: () => false },
            headers: {},
            header: vi.fn(),
        } as unknown as express.Request;
        const pivotConfiguration = {
            indexColumn: [
                { reference: 'orders_date', type: VizIndexType.TIME },
            ],
            valuesColumns: [
                {
                    reference: 'orders_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            sortBy: undefined,
        };

        await controller.executeAsyncSavedChartQuery(
            {
                chartUuid: 'chart-uuid',
                pivotConfiguration,
            },
            'project-uuid',
            req,
        );

        expect(executeAsyncSavedChartQuery).toHaveBeenCalledWith(
            expect.objectContaining({ pivotConfiguration }),
        );
    });
});
