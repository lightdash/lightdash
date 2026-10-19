import {
    DimensionType,
    FieldType,
    MetricType,
    QueryExecutionContext,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import UnderlyingDataModal from './UnderlyingDataModal';

const { lightdashApi, useUnderlyingDataResults } = vi.hoisted(() => ({
    lightdashApi: vi.fn(),
    useUnderlyingDataResults: vi.fn(),
}));

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => lightdashApi,
}));
vi.mock('../../hooks/useUnderlyingDataResults', () => ({
    useUnderlyingDataResults,
    getUnderlyingDataResults: vi.fn(),
}));
vi.mock('../../features/mergeQuery/hooks/useMergeSourceNames', () => ({
    useMergeSourceNames: () => ({ handleByName: {} }),
}));
vi.mock('../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => merge,
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
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
const merge = {
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

describe('underlying data modal on a merged result', () => {
    it('runs the owning source and scopes underlying data to it', async () => {
        lightdashApi.mockResolvedValue({ queryUuid: 'source-query' });
        useUnderlyingDataResults.mockReturnValue({
            data: undefined,
            error: null,
            isInitialLoading: false,
        });

        renderWithProviders(
            <MemoryRouter>
                <Context.Provider value={metricQueryData}>
                    <UnderlyingDataModal />
                </Context.Provider>
            </MemoryRouter>,
        );

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
});
