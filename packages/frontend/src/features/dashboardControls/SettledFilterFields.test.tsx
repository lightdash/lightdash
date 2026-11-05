import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    type DashboardAvailableFilters,
    type DashboardTile,
} from '@lightdash/common';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { dashboardSourceActions } from '../dashboard/store';
import { SettledFilterFields } from './SettledFilterFields';

const Probe = () => {
    const isLoading = useDashboardContext((c) => c.isLoadingDashboardFilters);
    const tiles = useDashboardContext((c) =>
        Object.keys(c.filterableFieldsByTileUuid ?? {}).join(','),
    );
    return (
        <output>
            {isLoading ? 'loading' : 'ready'} {tiles}
        </output>
    );
};

const chartTile = (uuid: string): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid: undefined,
    properties: {
        savedChartUuid: `chart-${uuid}`,
        title: uuid,
        belongsToDashboard: false,
    },
});

const filtersFor = (tileUuids: string[]): DashboardAvailableFilters => ({
    savedQueryFilters: Object.fromEntries(tileUuids.map((t) => [t, [0]])),
    savedQueryMetricFilters: {},
    allFilterableFields: [
        {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'status',
            table: 'orders',
            tableLabel: 'Orders',
            label: 'Status',
            sql: '',
            hidden: false,
        },
    ],
    allFilterableMetrics: [],
    hiddenFilterableFieldIds: [],
});

// Embeds need no query dashboard, so a token stands in for one
const createStore = (isLoadingDashboardFilters: boolean) => {
    const store = createDashboardTestStore({
        source: {
            embedToken: 'token',
            isLoadingDashboardFilters,
            isFetchingDashboardFilters: isLoadingDashboardFilters,
            availableFilters: isLoadingDashboardFilters
                ? undefined
                : filtersFor(['tile-1', 'tile-2']),
        },
    });
    return seedDashboardEditState(store, {
        dashboardTiles: [chartTile('tile-1'), chartTile('tile-2')],
    });
};

const renderSettled = (store: ReturnType<typeof createStore>) =>
    render(
        <DashboardStoreTestProvider store={store}>
            <SettledFilterFields>
                <Probe />
            </SettledFilterFields>
        </DashboardStoreTestProvider>,
    );

describe('SettledFilterFields', () => {
    it('keeps the last fields while a new set of tiles reloads them', () => {
        const store = createStore(false);
        renderSettled(store);
        expect(screen.getByRole('status')).toHaveTextContent(
            'ready tile-1,tile-2',
        );

        const sync = (
            isLoadingDashboardFilters: boolean,
            availableFilters: DashboardAvailableFilters | undefined,
        ) =>
            act(() => {
                store.dispatch(
                    dashboardSourceActions.sync({
                        ...store.getState().source,
                        isLoadingDashboardFilters,
                        isFetchingDashboardFilters: isLoadingDashboardFilters,
                        availableFilters,
                    }),
                );
            });

        sync(true, undefined);
        expect(screen.getByRole('status')).toHaveTextContent(
            'ready tile-1,tile-2',
        );

        sync(false, filtersFor(['tile-1']));
        expect(screen.getByRole('status')).toHaveTextContent('ready tile-1');
    });

    it('passes the first load through, so the bar shows its skeletons', () => {
        renderSettled(createStore(true));
        expect(screen.getByRole('status')).toHaveTextContent('loading');
    });
});
