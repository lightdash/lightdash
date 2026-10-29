import {
    DashboardTileTypes,
    DimensionType,
    type DashboardTile,
} from '@lightdash/common';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../../testing/testUtils';
import SqlColumnSelect from './SqlColumnSelect';

const columns = [
    { reference: 'country', type: DimensionType.STRING },
    { reference: 'total', type: DimensionType.NUMBER },
];

const sqlTile = (uuid: string) =>
    ({
        uuid,
        type: DashboardTileTypes.SQL_CHART,
        properties: { savedSqlUuid: `chart-${uuid}` },
    }) as DashboardTile;

// The chart query key a registered (not embedded) SQL chart tile uses
const registeredChartKey = (tileUuid: string) => [
    'savedSqlChart',
    `chart-${tileUuid}`,
    'registered',
    undefined,
    'project',
];

// A dashboard with two SQL chart tiles, sql-1 and sql-2
const renderWithProviders = (
    ui: ReactElement,
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata> = {},
) => {
    const store = createDashboardTestStore({ sqlChartTilesMetadata });
    seedDashboardEditState(store, {
        dashboardTiles: [sqlTile('sql-1'), sqlTile('sql-2')],
    });
    const wrap = (node: ReactElement) => (
        <DashboardStoreTestProvider store={store}>
            {node}
        </DashboardStoreTestProvider>
    );
    const result = renderWithAppProviders(wrap(ui));
    return {
        ...result,
        rerender: (node: ReactElement) => result.rerender(wrap(node)),
    };
};

const select = () => (
    <SqlColumnSelect columns={columns} value={undefined} onChange={vi.fn()} />
);
const input = () => screen.getByPlaceholderText('Search column...');

// A mounted SQL chart tile's query that has not returned
const PendingQuery = ({
    queryKey,
    enabled = true,
    onFinish,
}: {
    queryKey: QueryKey;
    enabled?: boolean;
    onFinish?: (finish: () => void) => void;
}) => {
    useQuery(
        queryKey,
        () =>
            new Promise<null>((resolve) => {
                onFinish?.(() => resolve(null));
            }),
        { enabled },
    );
    return null;
};

describe('SqlColumnSelect', () => {
    it('searches the columns and keeps the search when they change', async () => {
        const { rerender } = renderWithProviders(select());
        expect(input()).not.toHaveAttribute('readonly');

        await userEvent.type(input(), 'tot');
        rerender(
            <SqlColumnSelect
                columns={[...columns]}
                value={undefined}
                onChange={vi.fn()}
            />,
        );
        expect(input()).toHaveValue('tot');
        expect(
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent),
        ).toEqual(['total']);
    });

    it('is busy only while a SQL chart tile without columns runs its query', async () => {
        let finish: () => void = () => {};
        const { rerender } = renderWithProviders(select());
        expect(input()).toHaveAttribute('aria-busy', 'false');

        rerender(
            <>
                <PendingQuery
                    queryKey={[
                        'savedSqlChartResults',
                        'chart',
                        { tileUuid: 'sql-1' },
                    ]}
                    onFinish={(done) => {
                        finish = done;
                    }}
                />
                {select()}
            </>,
        );
        await waitFor(() =>
            expect(input()).toHaveAttribute('aria-busy', 'true'),
        );
        act(() => finish());
        await waitFor(() =>
            expect(input()).toHaveAttribute('aria-busy', 'false'),
        );
    });

    it.each([
        {
            name: 'is not busy beside a disabled results query',
            queryKey: ['savedSqlChartResults', 'chart', { tileUuid: 'sql-1' }],
            enabled: false,
            isBusy: false,
        },
        {
            name: 'is busy during the chart fetch of a tile without columns',
            queryKey: registeredChartKey('sql-1'),
            enabled: true,
            isBusy: true,
        },
    ])('$name', async ({ queryKey, enabled, isBusy }) => {
        renderWithProviders(
            <>
                <PendingQuery queryKey={queryKey} enabled={enabled} />
                {select()}
            </>,
        );
        await act(async () => {});
        expect(input()).toHaveAttribute('aria-busy', String(isBusy));
    });

    it('is not busy when a tile that has its columns queries again', async () => {
        // A refresh, or a filter or parameter change, recreates the query
        renderWithProviders(
            <>
                <PendingQuery
                    queryKey={[
                        'savedSqlChartResults',
                        'chart',
                        { tileUuid: 'sql-1' },
                    ]}
                />
                {select()}
            </>,
            { 'sql-1': { columns } },
        );
        await act(async () => {});
        expect(input()).toHaveAttribute('aria-busy', 'false');
    });

    it('is not busy when a tile that has its columns fetches its chart again', async () => {
        // Back on its tab after the chart went stale; sql-2 has no columns
        renderWithProviders(
            <>
                <PendingQuery queryKey={registeredChartKey('sql-1')} />
                {select()}
            </>,
            { 'sql-1': { columns } },
        );
        await act(async () => {});
        expect(input()).toHaveAttribute('aria-busy', 'false');
    });
});
