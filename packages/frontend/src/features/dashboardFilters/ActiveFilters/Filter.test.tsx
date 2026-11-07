import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilterableField,
} from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import Filter from './Filter';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector({ sqlChartTilesMetadata: {} }),
    ),
}));

vi.mock('../../../components/common/Filters/useFiltersContext', () => ({
    default: vi.fn(() => ({
        projectUuid: 'test-project-uuid',
        getAutocompleteFilterGroup: vi.fn(() => undefined),
        getField: vi.fn(() => undefined),
        parameterValues: {},
    })),
}));

vi.mock('../../../hooks/useFieldValues', () => ({
    MAX_AUTOCOMPLETE_RESULTS: 100,
    useFieldValues: vi.fn(() => ({
        isInitialLoading: false,
        results: [],
        refreshedAt: new Date(),
        refetch: vi.fn(),
        reset: vi.fn(),
        error: null,
        isError: false,
    })),
}));

vi.mock('../../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({
        data: { hasCacheAutocompleResults: false },
    })),
}));

const statusField = {
    name: 'status',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Status',
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    sql: '${TABLE}.status',
    hidden: false,
} as DashboardFilterableField;

const buildRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'status-filter',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    label: 'Status',
    ...overrides,
});

const renderFilter = (filterRule: DashboardFilterRule) =>
    renderWithProviders(
        <DashboardStoreTestProvider
            store={createDashboardTestStore({
                dashboardFilters: {
                    dimensions: [filterRule],
                    metrics: [],
                    tableCalculations: [],
                },
            })}
        >
            <Filter
                isEditMode={false}
                isOrphaned={false}
                field={statusField}
                filterRule={filterRule}
                openPopoverId={undefined}
                onPopoverOpen={vi.fn()}
                onPopoverClose={vi.fn()}
                onUpdate={vi.fn()}
                onRemove={vi.fn()}
            />
        </DashboardStoreTestProvider>,
    );

const getPill = () => screen.getByRole('button', { name: /Status/ });

// Mantine marks the input while its list is open
const isValueListOpen = (input: HTMLInputElement) =>
    input.hasAttribute('data-expanded');

describe('Filter pill active state', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: { dimensions: [] } },
            dashboardTiles: [],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFields: [statusField],
            filterableFieldsByTileUuid: {},
            hiddenFilterableFieldIds: new Set<string>(),
        };
    });

    it('marks the pill active when a value is set', () => {
        renderFilter(buildRule({ values: ['completed'] }));

        expect(getPill()).toHaveAttribute('data-filter-active');
    });

    it('leaves the pill inactive when no value is set', () => {
        renderFilter(buildRule({ values: [] }));

        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });

    it('treats a disabled rule as inactive even when it holds values', () => {
        renderFilter(buildRule({ values: ['completed'], disabled: true }));

        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });
});

describe('Filter pill requirement state', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: { dimensions: [] } },
            dashboardTiles: [],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFields: [statusField],
            filterableFieldsByTileUuid: {},
            hiddenFilterableFieldIds: new Set<string>(),
        };
    });

    it('shows an unmet required filter as unmet and never active', () => {
        const rule = buildRule({ required: true, disabled: true, values: [] });
        renderFilter(rule);

        expect(getPill()).toHaveAttribute('data-requirement-unmet');
        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });

    it('keeps an enabled required filter with no values out of the active state', () => {
        const rule = buildRule({ required: true, values: [] });
        renderFilter(rule);

        expect(getPill()).toHaveAttribute('data-requirement-unmet');
        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });

    it('keeps the dashed requirement icon on the left, none on the right', () => {
        renderFilter(buildRule({ required: true, disabled: true, values: [] }));

        expect(
            getPill().querySelector(
                '[data-position="left"] [data-requirement-icon]',
            ),
        ).toBeInTheDocument();
        expect(
            getPill().querySelector(
                '[data-position="right"] [data-requirement-icon]',
            ),
        ).toBeNull();
    });

    it('shows a required filter with a value as active and met', () => {
        renderFilter(buildRule({ required: true, values: ['completed'] }));

        expect(getPill()).toHaveAttribute('data-filter-active');
        expect(getPill()).not.toHaveAttribute('data-requirement-unmet');
    });
});

describe('Filter editor on touch', () => {
    const StatefulFilter: FC<{
        filterRule: DashboardFilterRule;
        onUpdate: (rule: DashboardFilterRule) => void;
    }> = ({ filterRule, onUpdate }) => {
        const [openPopoverId, setOpenPopoverId] = useState<string>();
        return (
            <>
                <div data-testid="outside" />
                <Filter
                    isEditMode={false}
                    isOrphaned={false}
                    isTemporary
                    field={statusField}
                    filterRule={filterRule}
                    openPopoverId={openPopoverId}
                    onPopoverOpen={setOpenPopoverId}
                    onPopoverClose={() => setOpenPopoverId(undefined)}
                    onUpdate={onUpdate}
                    onRemove={vi.fn()}
                />
            </>
        );
    };

    // A touch tap: touchstart, then touchend and the mouse events a frame
    // or more later, all at the point first touched
    const tap = async (target: HTMLElement, afterTouchStart?: () => void) => {
        fireEvent.touchStart(target);
        afterTouchStart?.();
        await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        fireEvent.touchEnd(target);
        fireEvent.mouseDown(target);
        fireEvent.mouseUp(target);
        fireEvent.click(target, { detail: 1 });
    };

    const openEditorAndType = async (text: string) => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        await user.click(getPill());
        const input = (await waitFor(() => {
            const element = document.querySelector('input[data-autofocus]');
            expect(element).toBeTruthy();
            return element;
        })) as HTMLInputElement;
        await user.click(input);
        await user.type(input, text);
        expect(isValueListOpen(input)).toBe(true);
        return input;
    };

    beforeEach(() => {
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: { dimensions: [] } },
            dashboardTiles: [],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFields: [statusField],
            filterableFieldsByTileUuid: {},
            hiddenFilterableFieldIds: new Set<string>(),
        };
    });

    const renderStatefulFilter = (onUpdate: () => void) => {
        const store = createDashboardTestStore({
            dashboardFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        });
        seedDashboardEditState(store, { dashboardTiles: [] });
        return renderWithProviders(
            <DashboardStoreTestProvider store={store}>
                <StatefulFilter
                    filterRule={buildRule({ disabled: true })}
                    onUpdate={onUpdate}
                />
            </DashboardStoreTestProvider>,
        );
    };

    it('applies a typed value when Apply is tapped with the value list open', async () => {
        const onUpdate = vi.fn();
        renderStatefulFilter(onUpdate);

        const input = await openEditorAndType('North Outlet');
        // Closing the in-flow list on touchstart would move Apply out from
        // under the finger before the tap's mousedown
        await tap(screen.getByRole('button', { name: 'Apply' }), () =>
            expect.soft(isValueListOpen(input)).toBe(true),
        );

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                values: ['North Outlet'],
                disabled: false,
            }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Apply' }),
            ).not.toBeInTheDocument(),
        );
    });

    it('closes the editor unsaved when a tap lands outside it', async () => {
        const onUpdate = vi.fn();
        renderStatefulFilter(onUpdate);

        await openEditorAndType('North Outlet');
        await tap(screen.getByTestId('outside'));

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Apply' }),
            ).not.toBeInTheDocument(),
        );
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('applies a typed value when Apply is clicked with a mouse', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onUpdate = vi.fn();
        renderStatefulFilter(onUpdate);

        await openEditorAndType('North Outlet');
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ values: ['North Outlet'] }),
        );
    });
});
