import {
    DateGranularity,
    EMPTY_DATE_ZOOM_CONFIG,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dashboardDateZoomActions,
    dashboardEditActions,
    dashboardFiltersActions,
    selectDashboardFilters,
    type DashboardStore,
} from '../dashboard/store';
import { selectDateZoomConfig } from '../dashboard/store/dashboardEditSelectors';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { DateZoomEditorPills } from './DateZoomEditorPills';
import {
    useControlsSidebar,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';

const { holder } = vi.hoisted(() => ({
    holder: { store: null as DashboardStore | null },
}));
const resolve = <T,>(value: T | ((previous: T) => T), previous: T): T =>
    typeof value === 'function'
        ? (value as (previous: T) => T)(previous)
        : value;
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (c: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: { uuid: 'dash-1', tiles: [] },
            filterableFieldsByTileUuid: {},
            setDashboardFilters: (
                value:
                    | DashboardFilters
                    | ((f: DashboardFilters) => DashboardFilters),
            ) =>
                holder.store?.dispatch(
                    dashboardFiltersActions.setDashboardFilters(
                        resolve(
                            value,
                            selectDashboardFilters(holder.store.getState()),
                        ),
                    ),
                ),
            setHaveFiltersChanged: (value: boolean) =>
                holder.store?.dispatch(
                    dashboardFiltersActions.setHaveFiltersChanged(
                        resolve(value, false),
                    ),
                ),
            setDashboardTemporaryFilters: vi.fn(),
            setDateZoomConfig: (value: DateZoomConfig) =>
                holder.store?.dispatch(
                    dashboardEditActions.setDateZoomConfig({
                        value,
                        changed: true,
                        saved: EMPTY_DATE_ZOOM_CONFIG,
                    }),
                ),
            setControlGranularity: (
                controlUuid: string,
                granularity: string | undefined,
            ) =>
                holder.store?.dispatch(
                    dashboardDateZoomActions.setControlGranularity({
                        controlUuid,
                        granularity,
                    }),
                ),
        }),
}));
vi.mock('react-router', () => ({ useParams: () => ({ mode: 'edit' }) }));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const country: DashboardFilterRule = {
    id: 'country',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_country', tableName: 'orders' },
    values: ['NL'],
};

const config: DateZoomConfig = {
    controls: [{ uuid: 'revenue', name: 'Revenue zoom', granularity: 'Month' }],
    tileTargets: {
        a: { controlUuid: 'revenue', fieldId: 'a_date', tableName: 'orders' },
    },
};

// The filter provider's context, for a filter edit without its popover
const sidebar: { current: ControlsSidebarContextValue | null } = {
    current: null,
};
const FilterPill: FC = () => {
    const context = useControlsSidebar();
    sidebar.current = context;
    return (
        <button
            data-controls-pill="country"
            onClick={() => context.open('country')}
        >
            Country filter
        </button>
    );
};

const setup = () => {
    const store = createDashboardTestStore({
        isEditMode: true,
        dashboardFilters: {
            dimensions: [country],
            metrics: [],
            tableCalculations: [],
        },
        chartZoomableFieldsByTileUuid: {
            a: [{ fieldId: 'a_date', label: 'Date', tableName: 'orders' }],
        },
    });
    holder.store = store;
    seedDashboardEditState(store, {
        dashboardTiles: [
            {
                uuid: 'a',
                type: 'saved_chart',
                properties: { title: 'a', chartName: 'a' },
            } as DashboardTile,
        ],
        dateZoomConfig: config,
        dateZoomGranularities: [DateGranularity.DAY, DateGranularity.MONTH],
    });
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <ControlsSidebarProvider>
                <FilterPill />
                <DateZoomEditorPills />
            </ControlsSidebarProvider>
        </DashboardStoreTestProvider>,
    );
    return {
        user: userEvent.setup(),
        zoom: () =>
            selectDateZoomConfig(store.getState(), EMPTY_DATE_ZOOM_CONFIG),
        filters: () => selectDashboardFilters(store.getState()),
    };
};

const pill = () =>
    document.querySelector<HTMLElement>('[data-date-zoom-pill="revenue"]')!;

describe('switching between a filter and a date zoom', () => {
    it("a filter's pill over a changed zoom asks, and Apply keeps the zoom then opens the filter", async () => {
        const { user, zoom } = setup();
        await user.click(pill());
        await user.click(screen.getByRole('combobox', { name: 'Granularity' }));
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await user.click(
            screen.getByRole('button', { name: 'Country filter' }),
        );
        expect(sidebar.current?.editing).toBeNull();
        const dialog = screen.getByRole('dialog', { name: 'Revenue zoom' });
        expect(within(dialog).getByRole('status')).toHaveTextContent(
            'Apply changes to Revenue zoom first?',
        );
        await user.click(
            within(within(dialog).getByRole('status').parentElement!).getByRole(
                'button',
                { name: 'Apply' },
            ),
        );
        expect(zoom().controls[0].granularity).toBe('Day');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(sidebar.current?.editing).toEqual({ filterId: 'country' });
    });

    it("a zoom's pill over a changed filter asks, and Apply keeps the filter then opens the zoom", async () => {
        const { user, filters } = setup();
        act(() => sidebar.current!.open('country'));
        act(() =>
            sidebar.current!.updateFilter({ ...country, values: ['BE'] }),
        );
        await user.click(pill());
        expect(sidebar.current?.isAsking).toBe(true);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        act(() => sidebar.current!.resolvePending(true));
        expect(filters().dimensions[0].values).toEqual(['BE']);
        expect(sidebar.current?.editing).toBeNull();
        expect(
            screen.getByRole('dialog', { name: 'Revenue zoom' }),
        ).toBeInTheDocument();
    });
});
