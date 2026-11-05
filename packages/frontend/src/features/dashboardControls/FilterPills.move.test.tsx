import {
    DashboardTileTypes,
    type DashboardTab,
    DimensionType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import { type SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dashboardFiltersActions,
    selectDashboardFilters,
} from '../dashboard/store';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { FilterPills } from './FilterPills';

// The provider and the pills as they are: only the dashboard context is mocked
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useParams: () => ({ mode: 'edit' }),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));

const rule = (id: string, label: string): DashboardFilterRule => ({
    id,
    label,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    values: ['x'],
});
const field = (name: string) => ({
    name,
    table: 'orders',
    tableLabel: 'Orders',
    label: name,
    type: DimensionType.STRING,
    fieldType: 'dimension',
});
const filters: DashboardFilters = {
    dimensions: [rule('status', 'Status'), rule('region', 'Region')],
    metrics: [],
    tableCalculations: [],
};

describe('moving a pill on the bar', () => {
    it('reorders the bar with Alt+ArrowRight and keeps focus on the moved pill', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const store = createDashboardTestStore({ dashboardFilters: filters });
        const fields = [field('status'), field('region')];
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters, tiles: [] },
            dashboardTiles: [
                {
                    uuid: 'tile-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {},
                } as DashboardTile,
            ],
            dashboardTabs: [],
            filterableFieldsByTileUuid: { 'tile-1': fields },
            allFilterableFields: fields,
            allFilterableFieldsMap: {
                orders_status: fields[0],
                orders_region: fields[1],
            },
            allFilterableMetricsMap: {},
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
                store.dispatch(
                    dashboardFiltersActions.setDashboardFilters(
                        typeof value === 'function'
                            ? value(selectDashboardFilters(store.getState()))
                            : value,
                    ),
                ),
            setHaveFiltersChanged: vi.fn(),
            setDashboardTemporaryFilters: vi.fn(),
        };
        seedDashboardEditState(
            store,
            mockDashboardContext.current as DashboardEditTestValues,
        );
        renderWithProviders(
            <DashboardStoreTestProvider store={store}>
                <ControlsSidebarProvider>
                    <FilterPills activeTabUuid={undefined} />
                </ControlsSidebarProvider>
            </DashboardStoreTestProvider>,
        );
        const pills = () =>
            [
                ...document.querySelectorAll<HTMLElement>(
                    '[data-controls-pill]',
                ),
            ].map((element) => element.getAttribute('data-controls-pill'));
        const status = () =>
            document.querySelector<HTMLElement>(
                '[data-controls-pill="status"]',
            )!;
        expect(pills()).toEqual(['status', 'region']);

        act(() => status().focus());
        fireEvent.keyDown(status(), { key: 'ArrowRight', altKey: true });
        await act(() => vi.runAllTimersAsync());

        expect(pills()).toEqual(['region', 'status']);
        expect(status()).toHaveFocus();
        expect(
            screen.getByText('Status moved after Region'),
        ).toBeInTheDocument();
        vi.useRealTimers();
    });
    it('skips a neighbour hidden on the tab in view, and says where it went', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const tabbed: DashboardFilters = {
            dimensions: [
                rule('status', 'Status'),
                rule('region', 'Region'),
                rule('city', 'City'),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const store = createDashboardTestStore({ dashboardFilters: tabbed });
        const fields = [field('status'), field('region'), field('city')];
        const tabs = [
            { uuid: 'tab-1', name: 'One', order: 0 },
            { uuid: 'tab-2', name: 'Two', order: 1 },
        ] as DashboardTab[];
        const onTab = (uuid: string, tabUuid: string) =>
            ({
                uuid,
                tabUuid,
                type: DashboardTileTypes.SAVED_CHART,
                properties: {},
            }) as DashboardTile;
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: tabbed, tiles: [] },
            dashboardTiles: [
                onTab('tile-1', 'tab-1'),
                onTab('tile-2', 'tab-2'),
            ],
            dashboardTabs: tabs,
            activeTab: tabs[0],
            // Region is only on the other tab's tile
            filterableFieldsByTileUuid: {
                'tile-1': [fields[0], fields[2]],
                'tile-2': [fields[1]],
            },
            allFilterableFields: fields,
            allFilterableFieldsMap: {
                orders_status: fields[0],
                orders_region: fields[1],
                orders_city: fields[2],
            },
            allFilterableMetricsMap: {},
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
                store.dispatch(
                    dashboardFiltersActions.setDashboardFilters(
                        typeof value === 'function'
                            ? value(selectDashboardFilters(store.getState()))
                            : value,
                    ),
                ),
            setHaveFiltersChanged: vi.fn(),
            setDashboardTemporaryFilters: vi.fn(),
        };
        seedDashboardEditState(
            store,
            mockDashboardContext.current as DashboardEditTestValues,
        );
        renderWithProviders(
            <DashboardStoreTestProvider store={store}>
                <ControlsSidebarProvider>
                    <FilterPills activeTabUuid="tab-1" />
                </ControlsSidebarProvider>
            </DashboardStoreTestProvider>,
        );
        const status = () =>
            document.querySelector<HTMLElement>(
                '[data-controls-pill="status"]',
            )!;

        act(() => status().focus());
        fireEvent.keyDown(status(), { key: 'ArrowRight', altKey: true });
        await act(() => vi.runAllTimersAsync());

        expect(
            selectDashboardFilters(store.getState()).dimensions.map(
                ({ id }) => id,
            ),
        ).toEqual(['region', 'city', 'status']);
        expect(status()).toHaveFocus();
        expect(screen.getByText('Status moved after City')).toBeInTheDocument();
        vi.useRealTimers();
    });
});
