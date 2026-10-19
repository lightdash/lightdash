import {
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CompiledMetric,
    type Explore,
    type MergeFieldOrigins,
    type MetricQuery,
    type ResultRow,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    Context,
    type MetricQueryDataContext,
} from '../../MetricQueryData/context';
import CellContextMenu from './CellContextMenu';

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({ data: undefined }),
}));
vi.mock('../../../providers/Ability', () => ({
    Can: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
    useExploreQueries: (names: (string | undefined)[]) =>
        names.map((name) => (name ? explore : undefined)),
}));
vi.mock('../../../features/mergeQuery/hooks/useMergeQuickFilter', () => ({
    useMergeQuickFilter: () => ({ canFilter: () => false, addFilter: vi.fn() }),
}));
vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => merge,
}));

const count: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    table: 'orders',
    tableLabel: 'Orders',
    tablesReferences: ['orders'],
    name: 'count',
    label: 'Count',
    sql: '${TABLE}.id',
    compiledSql: 'COUNT("orders".id)',
    hidden: false,
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
            dimensions: {},
            metrics: { count },
            lineageGraph: {},
        },
    },
};
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
const fieldOrigins: MergeFieldOrigins = {
    orders_2_orders_count: {
        kind: 'source',
        sourceId: 'b',
        sourceFieldId: 'orders_count',
    },
};
const merge = {
    additionalSources: [
        {
            id: 'b',
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_count'],
            filters: {},
        },
    ],
    mergeResults: { fieldOrigins },
};
// The results table carries the merged column, not the source field
const mergedCount: CompiledMetric = { ...count, table: 'orders_2_orders' };
const rows: ResultRow[] = [
    { orders_2_orders_count: { value: { raw: 3, formatted: '3' } } },
];

const MergedCellMenu: FC = () => {
    const table = useReactTable({
        data: rows,
        columns: [
            {
                id: 'orders_2_orders_count',
                accessorFn: (row) => row.orders_2_orders_count,
                meta: { item: mergedCount },
            },
        ],
        getCoreRowModel: getCoreRowModel(),
    });
    return (
        <Menu opened>
            <Menu.Target>
                <button type="button">Cell</button>
            </Menu.Target>
            <Menu.Dropdown>
                <CellContextMenu
                    cell={table.getRowModel().rows[0].getVisibleCells()[0]}
                    itemsMap={{ orders_2_orders_count: mergedCount }}
                    onExpand={vi.fn()}
                />
            </Menu.Dropdown>
        </Menu>
    );
};

describe('results cell menu on a merged result', () => {
    it('drills a second-source metric cell into its source', async () => {
        const openDrillDownModal = vi.fn();
        const metricQueryData: MetricQueryDataContext = {
            tableName: 'orders',
            explore,
            metricQuery,
            underlyingDataConfig: undefined,
            isUnderlyingDataModalOpen: false,
            openUnderlyingDataModal: vi.fn(),
            closeUnderlyingDataModal: vi.fn(),
            drillDownConfig: undefined,
            isDrillDownModalOpen: false,
            openDrillDownModal,
            closeDrillDownModal: vi.fn(),
        };
        renderWithProviders(
            <Context.Provider value={metricQueryData}>
                <MergedCellMenu />
            </Context.Provider>,
        );

        await userEvent.click(await screen.findByText(/Drill into/));

        expect(openDrillDownModal).toHaveBeenCalledWith(
            expect.objectContaining({
                item: count,
                source: expect.objectContaining({
                    metricQuery: expect.objectContaining({
                        exploreName: 'orders',
                        metrics: ['orders_count'],
                    }),
                }),
            }),
        );
    });
});
