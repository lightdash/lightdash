import {
    type ResultRow,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { memo, Profiler, type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    dashboardChartSortActions,
    selectTileChartSorts,
    type DashboardStore,
} from '../../features/dashboard/store';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import DashboardHeaderContextMenu from './DashboardHeaderContextMenu';

const mocks = vi.hoisted(() => ({
    store: undefined as DashboardStore | undefined,
}));

// Mirrors DashboardProvider's stable setTileChartSorts callback
const setTileChartSorts = (tileUuid: string, sorts: SortField[]) =>
    mocks.store?.dispatch(
        dashboardChartSortActions.setTileSorts({ tileUuid, sorts }),
    );
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (context: unknown) => unknown) =>
        selector({ setTileChartSorts }),
}));

const status: TableCalculation = {
    name: 'status',
    displayName: 'Status',
    sql: '${orders.status}',
};
const columns: ColumnDef<ResultRow>[] = [
    { id: 'status', meta: { item: status } },
];

const renders: Record<string, number> = {};

const HeaderMenu: FC<{ tileUuid: string }> = ({ tileUuid }) => {
    const table = useReactTable({
        data: [],
        columns,
        getCoreRowModel: getCoreRowModel(),
    });
    const header = table.getHeaderGroups()[0].headers[0];
    return (
        <Profiler
            id={tileUuid}
            onRender={() => {
                renders[tileUuid] = (renders[tileUuid] ?? 0) + 1;
            }}
        >
            <div data-testid={tileUuid}>
                <DashboardHeaderContextMenu
                    header={header}
                    tileUuid={tileUuid}
                />
            </div>
        </Profiler>
    );
};

// Memoized so only store subscriptions re-render it
const MemoHeaderMenu = memo(HeaderMenu);

const renderTwoTiles = (store: DashboardStore) =>
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <MemoHeaderMenu tileUuid="tile-a" />
            <MemoHeaderMenu tileUuid="tile-b" />
        </DashboardStoreTestProvider>,
    );

const openMenu = async (tileUuid: string) => {
    await userEvent.click(
        within(screen.getByTestId(tileUuid)).getByRole('button', {
            name: 'Context menu',
        }),
    );
    return screen.findByRole('menu');
};

const resetRenders = () => {
    Object.keys(renders).forEach((key) => delete renders[key]);
};

describe('DashboardHeaderContextMenu', () => {
    beforeEach(() => {
        resetRenders();
    });

    it('sorts, re-sorts and clears one tile without re-rendering the other', async () => {
        const store = createDashboardTestStore();
        mocks.store = store;
        renderTwoTiles(store);
        resetRenders();

        const menu = await openMenu('tile-a');
        const [ascendingItem] = within(menu).getAllByRole('menuitem');
        await userEvent.click(ascendingItem);
        expect(selectTileChartSorts(store.getState(), 'tile-a')).toEqual([
            { fieldId: 'status', descending: false },
        ]);
        expect(selectTileChartSorts(store.getState(), 'tile-b')).toEqual([]);
        expect(renders['tile-b']).toBeUndefined();

        const reopened = await openMenu('tile-a');
        const descendingItem = within(reopened).getAllByRole('menuitem')[1];
        await userEvent.click(descendingItem);
        expect(selectTileChartSorts(store.getState(), 'tile-a')).toEqual([
            { fieldId: 'status', descending: true },
        ]);

        const withRemove = await openMenu('tile-a');
        await userEvent.click(
            within(withRemove).getByRole('menuitem', { name: 'Remove sort' }),
        );
        expect(selectTileChartSorts(store.getState(), 'tile-a')).toEqual([]);
        expect(renders['tile-b']).toBeUndefined();
    });

    it('does not re-render for a repeated identical sort', () => {
        const store = createDashboardTestStore({
            chartSortsByTileUuid: {
                'tile-a': [{ fieldId: 'status', descending: true }],
            },
        });
        mocks.store = store;
        renderTwoTiles(store);
        resetRenders();

        act(() => {
            setTileChartSorts('tile-a', [
                { fieldId: 'status', descending: true },
            ]);
        });
        expect(renders).toEqual({});

        act(() => {
            setTileChartSorts('tile-b', [
                { fieldId: 'status', descending: false },
            ]);
        });
        expect(renders).toEqual({ 'tile-b': 1 });
    });
});
