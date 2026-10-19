import {
    DimensionType,
    FieldType,
    MetricType,
    QueryExecutionContext,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type Filters,
    type MergeFieldOrigins,
    type MetricQuery,
} from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import UnderlyingDataModal from './UnderlyingDataModal';

const { lightdashApi, useUnderlyingDataResults, showToastError } = vi.hoisted(
    () => ({
        lightdashApi: vi.fn(),
        useUnderlyingDataResults: vi.fn(),
        showToastError: vi.fn(),
    }),
);

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
    useExploreQueries: () => sourceExplores,
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => lightdashApi,
}));
vi.mock('../../hooks/useUnderlyingDataResults', () => ({
    useUnderlyingDataResults,
    getUnderlyingDataResults: vi.fn(),
}));
vi.mock('../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => merge,
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError, showToastSuccess: vi.fn() }),
}));

const field = {
    table: 'orders',
    tableLabel: 'Orders',
    tablesReferences: ['orders'],
    hidden: false,
};
const status: CompiledDimension = {
    ...field,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    sql: '${TABLE}.status',
    compiledSql: '"orders".status',
};
const count: CompiledMetric = {
    ...field,
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name: 'count',
    label: 'Count',
    sql: '${TABLE}.id',
    compiledSql: 'COUNT("orders".id)',
};
const explore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    spotlight: { visibility: 'show', categories: [] },
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: { status },
            metrics: { count },
            lineageGraph: {},
        },
    },
};
const sourceExplores = [explore, explore];
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
let merge: {
    additionalSources: Array<{
        id: string;
        exploreName: string;
        dimensions: string[];
        metrics: string[];
        filters: Filters;
    }>;
    mergeResults: { fieldOrigins: MergeFieldOrigins };
} = {
    additionalSources: [
        {
            id: 'b',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_count'],
            filters: {},
        },
    ],
    mergeResults: {
        fieldOrigins: {
            merge_orders_status: {
                kind: 'joinKey',
                fieldIdBySourceId: { a: 'orders_status', b: 'orders_status' },
            },
            orders_2_orders_count: {
                kind: 'source',
                sourceId: 'b',
                sourceFieldId: 'orders_count',
            },
        },
    },
};
// The chart surfaces pass the merged column, not the source field
const mergedCount: CompiledMetric = { ...count, table: 'orders_2_orders' };
const metricQueryData: MetricQueryDataContext = {
    tableName: 'orders',
    explore,
    metricQuery,
    underlyingDataConfig: {
        item: mergedCount,
        value: { raw: 3, formatted: '3' },
        fieldValues: {
            merge_orders_status: { raw: 'completed', formatted: 'completed' },
            orders_2_orders_count: { raw: 3, formatted: '3' },
        },
    },
    isUnderlyingDataModalOpen: true,
    openUnderlyingDataModal: vi.fn(),
    closeUnderlyingDataModal: vi.fn(),
    drillDownConfig: undefined,
    isDrillDownModalOpen: false,
    openDrillDownModal: vi.fn(),
    closeDrillDownModal: vi.fn(),
};

const renderModal = (context: MetricQueryDataContext) =>
    renderWithProviders(
        <StrictMode>
            <MemoryRouter>
                <Context.Provider value={context}>
                    <UnderlyingDataModal />
                </Context.Provider>
            </MemoryRouter>
        </StrictMode>,
    );

describe('underlying data modal on a merged result', () => {
    const mergeWithKeySelected = merge;
    afterEach(() => {
        merge = mergeWithKeySelected;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        lightdashApi.mockResolvedValue({ queryUuid: 'source-query' });
        useUnderlyingDataResults.mockReturnValue({
            data: undefined,
            error: null,
            isInitialLoading: false,
        });
    });

    it('runs the owning source and scopes underlying data to it', async () => {
        renderModal(metricQueryData);

        await waitFor(() =>
            expect(useUnderlyingDataResults).toHaveBeenCalledWith(
                {
                    dimensions: {
                        id: expect.any(String),
                        and: [
                            expect.objectContaining({
                                target: { fieldId: 'orders_status' },
                                values: ['completed'],
                            }),
                        ],
                    },
                },
                'source-query',
                'orders_count',
                undefined,
                undefined,
                [],
            ),
        );
        const sourceRun = lightdashApi.mock.calls.find(
            ([request]) =>
                request.url === '/projects/project/query/metric-query',
        );
        expect(JSON.parse(sourceRun?.[0].body)).toMatchObject({
            context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
            query: { exploreName: 'orders', metrics: ['orders_count'] },
        });
    });

    it('scopes a pivoted cell to its pivot value in the owning source', async () => {
        renderModal({
            ...metricQueryData,
            underlyingDataConfig: {
                item: mergedCount,
                value: { raw: 3, formatted: '3' },
                fieldValues: {},
                pivotReference: {
                    field: 'orders_2_orders_count',
                    pivotValues: [
                        { field: 'merge_orders_status', value: 'completed' },
                    ],
                },
            },
        });

        await waitFor(() =>
            expect(useUnderlyingDataResults).toHaveBeenCalledWith(
                {
                    dimensions: {
                        id: expect.any(String),
                        and: [
                            expect.objectContaining({
                                target: { fieldId: 'orders_status' },
                                values: ['completed'],
                            }),
                        ],
                    },
                },
                'source-query',
                'orders_count',
                undefined,
                undefined,
                [],
            ),
        );
    });

    it('keeps the join key filter the source does not select', async () => {
        merge = {
            ...merge,
            additionalSources: [
                { ...merge.additionalSources[0], dimensions: [] },
            ],
        };
        renderModal(metricQueryData);

        await waitFor(() =>
            expect(useUnderlyingDataResults).toHaveBeenCalledWith(
                {
                    dimensions: {
                        id: expect.any(String),
                        and: [
                            expect.objectContaining({
                                target: { fieldId: 'orders_status' },
                                values: ['completed'],
                            }),
                        ],
                    },
                },
                'source-query',
                'orders_count',
                undefined,
                undefined,
                [],
            ),
        );
    });
    it.each([
        [
            'the source run fails',
            () => lightdashApi.mockRejectedValue(new Error('down')),
        ],
        [
            'no source owns the column',
            () => {
                merge = {
                    ...merge,
                    mergeResults: {
                        fieldOrigins: {
                            ...merge.mergeResults.fieldOrigins,
                            orders_2_orders_count: {
                                kind: 'tableCalculation',
                            },
                        },
                    },
                };
            },
        ],
    ])('closes with a single toast when %s', async (_, arrange) => {
        arrange();
        const closeUnderlyingDataModal = vi.fn();
        renderModal({ ...metricQueryData, closeUnderlyingDataModal });

        await waitFor(() =>
            expect(closeUnderlyingDataModal).toHaveBeenCalled(),
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(showToastError).toHaveBeenCalledTimes(1);
        expect(showToastError).toHaveBeenCalledWith({
            title: 'Could not open underlying data',
        });
        expect(useUnderlyingDataResults).not.toHaveBeenCalled();
    });
});
