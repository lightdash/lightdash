import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboardFilters from './EmbedDashboardFilters';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../../../components/common/Filters/FiltersProvider', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../../features/dashboardFilters/ActiveFilters', () => ({
    default: ({ isEditMode }: { isEditMode: boolean }) => (
        <div data-testid="active-filters" data-edit-mode={isEditMode} />
    ),
}));

vi.mock('../../../../../features/dashboardFilters/AddFilterButton', () => ({
    default: ({
        isEditMode,
        onSave,
    }: {
        isEditMode: boolean;
        onSave: (rule: DashboardFilterRule) => void;
    }) => (
        <button
            type="button"
            data-testid="add-filter"
            data-edit-mode={isEditMode}
            onClick={() => onSave(newFilterRule)}
        >
            Add filter
        </button>
    ),
}));

const newFilterRule: DashboardFilterRule = {
    id: 'new-filter',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    label: 'Status',
};

const addDimensionDashboardFilter = vi.fn();
const addMetricDashboardFilter = vi.fn();

describe('EmbedDashboardFilters edit mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDashboardContext.current = {
            projectUuid: 'project-uuid',
            activeTab: undefined,
            allFilterableFieldsMap: {},
            dashboardTiles: [],
            filterableFieldsByTileUuid: {},
            addDimensionDashboardFilter,
            addMetricDashboardFilter,
            allFilterableMetrics: [],
            setHaveFiltersChanged: vi.fn(),
            resetDashboardFilters: vi.fn(),
        };
    });

    it('adds filters as saved and exposes edit controls in edit mode', async () => {
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore()}>
                <EmbedDashboardFilters canAddFilters isEditMode />
            </DashboardStoreTestProvider>,
        );

        expect(screen.getByTestId('active-filters')).toHaveAttribute(
            'data-edit-mode',
            'true',
        );
        expect(screen.getByTestId('add-filter')).toHaveAttribute(
            'data-edit-mode',
            'true',
        );

        await userEvent.click(screen.getByTestId('add-filter'));

        expect(addDimensionDashboardFilter).toHaveBeenCalledWith(
            newFilterRule,
            false,
        );
    });

    it('adds filters as temporary and hides edit controls in view mode', async () => {
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore()}>
                <EmbedDashboardFilters canAddFilters />
            </DashboardStoreTestProvider>,
        );

        expect(screen.getByTestId('active-filters')).toHaveAttribute(
            'data-edit-mode',
            'false',
        );
        expect(screen.getByTestId('add-filter')).toHaveAttribute(
            'data-edit-mode',
            'false',
        );

        await userEvent.click(screen.getByTestId('add-filter'));

        expect(addDimensionDashboardFilter).toHaveBeenCalledWith(
            newFilterRule,
            true,
        );
    });
});
