import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import { DrillDownModal } from './DrillDownModal';

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
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
    underlyingDataConfig: undefined,
    isUnderlyingDataModalOpen: false,
    openUnderlyingDataModal: vi.fn(),
    closeUnderlyingDataModal: vi.fn(),
    drillDownConfig: {
        item: mergedCount,
        fieldValues: {
            merge_orders_status: { raw: 'completed', formatted: 'completed' },
            orders_2_orders_count: { raw: 3, formatted: '3' },
        },
    },
    isDrillDownModalOpen: true,
    openDrillDownModal: vi.fn(),
    closeDrillDownModal: vi.fn(),
};

describe('drill-down modal on a merged result', () => {
    afterEach(() => vi.restoreAllMocks());

    it('drills into the source that owns the clicked column', async () => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        const user = userEvent.setup();
        renderWithProviders(
            <Context.Provider value={metricQueryData}>
                <DrillDownModal />
            </Context.Provider>,
        );

        expect(screen.getByText('Drill into "3"')).toBeInTheDocument();
        await user.click(screen.getByPlaceholderText('Search field...'));
        await user.click(await screen.findByRole('option', { name: 'Status' }));

        const href = screen
            .getByText('Open in new tab')
            .closest('a')
            ?.getAttribute('href');
        const chart = JSON.parse(
            new URL(href ?? '', 'http://localhost').searchParams.get(
                'create_saved_chart_version',
            ) ?? '{}',
        );
        expect(chart.metricQuery.metrics).toEqual(['orders_count']);
        expect(chart.metricQuery.filters.dimensions.and).toEqual([
            expect.objectContaining({
                target: { fieldId: 'orders_status' },
                values: ['completed'],
            }),
        ]);
    });
});
