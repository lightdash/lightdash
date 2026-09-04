import {
    ChartType,
    DimensionType,
    FieldType,
    MergeJoinType,
    MetricType,
    MergeQueryErrorKind,
    type ApiError,
    type ApiExecuteAsyncMergeQueryResults,
    type ItemsMap,
    type MergeQuery,
    type SavedChartDAO,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { PRIMARY_SOURCE_ID } from '../constants';
import { MergeProvider } from './MergeContext';
import { MERGE_URL_PARAM, serializeMergeState } from './mergeUrlState';
import { useMerge } from './useMerge';

const setSearchParams = vi.fn();
const { executeMergeQuery, searchParams } = vi.hoisted(() => ({
    executeMergeQuery: vi.fn(),
    searchParams: new URLSearchParams(),
}));

vi.mock('react-router', () => ({
    useParams: () => ({ projectUuid: 'project-uuid' }),
    useSearchParams: () => [searchParams, setSearchParams],
}));

vi.mock('../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: () => ({
        data: undefined,
        error: null,
        isFetching: false,
    }),
}));

vi.mock('../hooks/useMergeQuery', () => ({ executeMergeQuery }));

const mergeQuery: MergeQuery = {
    sources: [],
    joinKey: [],
    joinType: MergeJoinType.FULL,
    tableCalculations: [],
    limit: 500,
};

const fields: ItemsMap = {
    merge_month: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        name: 'month',
        label: 'Month',
        table: 'merge',
        tableLabel: 'Merged result',
        sql: '${TABLE}.month',
        hidden: false,
    },
    merge_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'merge',
        tableLabel: 'Merged result',
        sql: '${TABLE}.status',
        hidden: false,
    },
    orders_total: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'total',
        label: 'Total',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.total',
        hidden: false,
    },
};

const startedResult = (
    queryUuid: string,
): ApiExecuteAsyncMergeQueryResults => ({
    outcome: 'started',
    parameterReferences: [],
    fieldOrigins: {},
    query: {
        queryUuid,
        cacheMetadata: { cacheHit: false },
        parameterReferences: [],
        usedParametersValues: {},
        resolvedTimezone: null,
        metricQuery: {
            exploreName: 'merge',
            dimensions: ['merge_month', 'merge_status'],
            metrics: ['orders_total'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
        fields,
        warnings: [],
    },
});

const wrapper = ({ children }: PropsWithChildren) => (
    <MergeProvider>{children}</MergeProvider>
);

describe('MergeProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchParams.delete(MERGE_URL_PARAM);
    });

    it('stops waiting for a restored merge once it is refused before execution', () => {
        searchParams.set(
            MERGE_URL_PARAM,
            serializeMergeState({
                focus: { kind: 'join' },
                additionalSources: [
                    {
                        id: 'b',
                        exploreName: 'payments',
                        dimensions: [
                            'orders_status',
                            'payments_payment_method',
                        ],
                        metrics: ['payments_total_revenue'],
                        filters: {},
                    },
                ],
                joinParts: [
                    {
                        fieldIdBySourceId: {
                            [PRIMARY_SOURCE_ID]: 'orders_status',
                            b: 'orders_status',
                        },
                    },
                ],
                joinType: MergeJoinType.FULL,
            }),
        );
        const { result } = renderHook(() => useMerge(), { wrapper });
        expect(result.current.wasRestored).toBe(true);

        act(() => result.current.refuseRestoredRun());

        expect(result.current.wasRestored).toBe(false);
        expect(result.current.isRunning).toBe(false);
        expect(result.current.mergeResults).toBeNull();
        expect(result.current.runErrors).toEqual([]);
        expect(result.current.runError).toBeNull();
        expect(executeMergeQuery).not.toHaveBeenCalled();
    });

    it('publishes join type changes immediately', () => {
        const { result } = renderHook(() => useMerge(), { wrapper });

        expect(result.current.joinType).toBe(MergeJoinType.FULL);

        act(() => result.current.setJoinType(MergeJoinType.LEFT));

        expect(result.current.joinType).toBe(MergeJoinType.LEFT);
    });

    it('adds, deselects, and removes source fields without orphaning join state', () => {
        const { result } = renderHook(() => useMerge(), { wrapper });

        act(() => result.current.addSource('b'));
        act(() => result.current.setSourceExplore('b', 'payments'));
        act(() => {
            result.current.toggleSourceField('b', 'orders_status', true);
            result.current.toggleSourceField(
                'b',
                'payments_unique_payment_count',
                false,
            );
            result.current.setJoinField(0, 'b', 'orders_status');
        });

        expect(result.current.additionalSources[0]).toMatchObject({
            id: 'b',
            exploreName: 'payments',
            dimensions: ['orders_status'],
            metrics: ['payments_unique_payment_count'],
        });
        expect(result.current.joinParts[0].fieldIdBySourceId.b).toBe(
            'orders_status',
        );

        act(() =>
            result.current.toggleSourceField(
                'b',
                'payments_unique_payment_count',
                false,
            ),
        );
        expect(result.current.additionalSources[0].metrics).toEqual([]);

        act(() => result.current.removeSource('b'));
        expect(result.current.isMerging).toBe(false);
        expect(result.current.additionalSources).toEqual([]);
        expect(
            result.current.joinParts[0].fieldIdBySourceId,
        ).not.toHaveProperty('b');
    });

    it('keeps the parameter values used by the merged run', async () => {
        executeMergeQuery.mockResolvedValueOnce({
            outcome: 'started',
            parameterReferences: ['customers.customer_name'],
            fieldOrigins: {},
            query: {
                queryUuid: 'merge-query-uuid',
                cacheMetadata: { cacheHit: false },
                parameterReferences: ['customers.customer_name'],
                usedParametersValues: {
                    'customers.customer_name': 'Ken',
                },
                resolvedTimezone: null,
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                },
                fields: {},
                warnings: [],
            },
        } satisfies ApiExecuteAsyncMergeQueryResults);
        const { result } = renderHook(() => useMerge(), { wrapper });

        act(() =>
            result.current.run(mergeQuery, {
                'customers.customer_name': 'Ken',
            }),
        );

        await waitFor(() =>
            expect(result.current.mergeResults?.usedParametersValues).toEqual({
                'customers.customer_name': 'Ken',
            }),
        );
        expect(executeMergeQuery).toHaveBeenCalledWith(
            'project-uuid',
            mergeQuery,
            { 'customers.customer_name': 'Ken' },
            undefined,
        );
    });

    it('starts an unpivoted run for the raw Results table', async () => {
        executeMergeQuery
            .mockResolvedValueOnce(startedResult('pivoted-query'))
            .mockResolvedValueOnce(startedResult('raw-query'));
        const { result } = renderHook(() => useMerge(), { wrapper });
        const savedChart = {
            chartConfig: { type: ChartType.TABLE },
            pivotConfig: { columns: ['merge_status'] },
        } satisfies Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>;

        act(() => result.current.run(mergeQuery, undefined, savedChart));

        await waitFor(() =>
            expect(
                result.current.mergeResults?.unpivotedResults,
            ).not.toBeNull(),
        );
        expect(executeMergeQuery).toHaveBeenNthCalledWith(
            1,
            'project-uuid',
            mergeQuery,
            undefined,
            savedChart,
        );
        expect(executeMergeQuery).toHaveBeenNthCalledWith(
            2,
            'project-uuid',
            mergeQuery,
            undefined,
        );
    });

    it('keeps the pivoted chart when the raw Results query is refused', async () => {
        executeMergeQuery
            .mockResolvedValueOnce(startedResult('pivoted-query'))
            .mockResolvedValueOnce({
                outcome: 'refused',
                errors: [
                    {
                        kind: MergeQueryErrorKind.UNRESOLVED_COLUMN_TYPE,
                        sourceId: null,
                        fieldIds: ['merge_status'],
                        message: 'Could not compile raw results',
                    },
                ],
                parameterReferences: [],
                fieldOrigins: {},
            });
        const { result } = renderHook(() => useMerge(), { wrapper });
        const savedChart = {
            chartConfig: { type: ChartType.TABLE },
            pivotConfig: { columns: ['merge_status'] },
        } satisfies Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>;

        act(() => result.current.run(mergeQuery, undefined, savedChart));

        await waitFor(() =>
            expect(result.current.mergeResults?.queryUuid).toBe(
                'pivoted-query',
            ),
        );
        expect(result.current.mergeResults?.unpivotedResults).toBeNull();
        expect(result.current.runErrors).toEqual([]);
        expect(result.current.unpivotedRunErrors).toHaveLength(1);
    });

    it('keeps the pivoted chart when the raw Results request fails', async () => {
        const rawResultsError: ApiError = {
            status: 'error',
            error: {
                name: 'NetworkError',
                statusCode: 500,
                message: 'Could not start raw results',
                data: {},
            },
        };
        executeMergeQuery
            .mockResolvedValueOnce(startedResult('pivoted-query'))
            .mockRejectedValueOnce(rawResultsError);
        const { result } = renderHook(() => useMerge(), { wrapper });
        const savedChart = {
            chartConfig: { type: ChartType.TABLE },
            pivotConfig: { columns: ['merge_status'] },
        } satisfies Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>;

        act(() => result.current.run(mergeQuery, undefined, savedChart));

        await waitFor(() =>
            expect(result.current.mergeResults?.queryUuid).toBe(
                'pivoted-query',
            ),
        );
        expect(result.current.runError).toBeNull();
        expect(result.current.unpivotedRunError).toBe(rawResultsError);
    });
});
