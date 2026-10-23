import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
    useState,
    type ComponentProps,
    type FC,
    type SetStateAction,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import type DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import {
    dashboardFiltersActions,
    selectDashboardFilters,
    selectHaveFiltersChanged,
    type DashboardStore,
} from '../dashboard/store';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { DashboardHeaderGuard } from './DashboardHeaderGuard';
import {
    useControlsSidebar,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('react-router', () => ({
    useParams: () => ({ mode: 'edit' }),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../../components/common/Dashboard/DashboardHeader', () => ({
    default: ({ onSaveDashboard }: ComponentProps<typeof DashboardHeader>) => (
        <button data-dashboard-edit-action onClick={onSaveDashboard}>
            Save changes
        </button>
    ),
}));

// Its default switched on, with no value: `close()` switches it off
const emptyDefault: DashboardFilterRule = {
    id: 'a',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    disabled: false,
};

const sidebar: { current: ControlsSidebarContextValue | null } = {
    current: null,
};
const Probe: FC = () => {
    sidebar.current = useControlsSidebar();
    return null;
};

const storeSetters = (store: DashboardStore) => ({
    setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
        store.dispatch(
            dashboardFiltersActions.setDashboardFilters(
                typeof value === 'function'
                    ? value(selectDashboardFilters(store.getState()))
                    : value,
            ),
        ),
    setHaveFiltersChanged: (value: SetStateAction<boolean>) =>
        store.dispatch(
            dashboardFiltersActions.setHaveFiltersChanged(
                typeof value === 'function'
                    ? value(selectHaveFiltersChanged(store.getState()))
                    : value,
            ),
        ),
});

// What the dashboard's Save reads: the store at click time
const saved: { filters: DashboardFilters | null } = { filters: null };

const Page: FC = () => {
    const [store] = useState(() =>
        createDashboardTestStore({
            dashboardFilters: {
                dimensions: [emptyDefault],
                metrics: [],
                tableCalculations: [],
            },
        }),
    );
    const [setters] = useState(() => storeSetters(store));
    mockDashboardContext.current = {
        ...setters,
        filterableFieldsByTileUuid: {},
        dashboard: { tiles: [] },
        dashboardTiles: [],
    };
    const headerProps = {
        onSaveDashboard: () => {
            saved.filters = selectDashboardFilters(store.getState());
        },
        onCancel: () => {},
    } as unknown as ComponentProps<typeof DashboardHeader>;
    return (
        <DashboardStoreTestProvider store={store}>
            <ControlsSidebarProvider>
                <DashboardHeaderGuard {...headerProps} />
                <Probe />
            </ControlsSidebarProvider>
        </DashboardStoreTestProvider>
    );
};

describe('the header Save with the editor open', () => {
    it('saves what close() wrote', () => {
        render(<Page />);
        act(() => sidebar.current?.open('a'));
        expect(sidebar.current?.isSidebarOpen).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        expect(sidebar.current?.isSidebarOpen).toBe(false);
        expect(saved.filters?.dimensions).toEqual([
            { ...emptyDefault, disabled: true },
        ]);
    });
});
