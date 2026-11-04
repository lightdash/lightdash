import {
    DEFAULT_UI_STRINGS,
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterPopover } from './FilterPopover';

// The shipped inputs are real here: the number input keeps its own text

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) =>
        selector({
            allFilterableFieldsMap: {},
            allFilterableMetricsMap: {},
            filterableFieldsByTileUuid: {},
        }),
    ),
}));

const LOCKED_REQUIRED =
    DEFAULT_UI_STRINGS['filters.config.applyLockedRequiredTooltip'];

const field = (type: DimensionType): DashboardFilterableField => ({
    fieldType: FieldType.DIMENSION,
    type,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
});

const lockedRequired: DashboardFilterRule = {
    id: 'filter-1',
    label: 'Amount',
    operator: FilterOperator.GREATER_THAN,
    target: { fieldId: 'orders_amount', tableName: 'orders' },
    values: [5],
    required: true,
    lockedTabUuids: ['tab-1'],
};

const onChange = vi.fn();

// Holds the rule as the dashboard draft would
const Harness: FC<{
    initialRule: DashboardFilterRule;
    filterType: FilterType;
    dimensionType: DimensionType;
}> = ({ initialRule, filterType, dimensionType }) => {
    const [rule, setRule] = useState(initialRule);
    return (
        <FiltersProvider>
            <FilterPopover
                rule={rule}
                field={field(dimensionType)}
                filterType={filterType}
                isViewer={false}
                canChooseTiles
                isCreatingNew={false}
                canManageExplore={false}
                savedRule={null}
                appliedTileCount={1}
                totalTileCount={1}
                filters={{
                    dimensions: [rule],
                    metrics: [],
                    tableCalculations: [],
                }}
                isAsking={false}
                initialView="value"
                onChange={(next) => {
                    onChange(next);
                    setRule(next);
                }}
                onChangeOthers={vi.fn()}
                onCancel={vi.fn()}
                onApply={vi.fn()}
                onChooseTiles={vi.fn()}
                onEditRules={null}
                onResolvePending={vi.fn()}
            />
        </FiltersProvider>
    );
};

const renderHarness = (
    initialRule: DashboardFilterRule,
    filterType = FilterType.NUMBER,
    dimensionType = DimensionType.NUMBER,
) =>
    renderWithProviders(
        <DashboardStoreTestProvider store={createDashboardTestStore()}>
            <Harness
                initialRule={initialRule}
                filterType={filterType}
                dimensionType={dimensionType}
            />
        </DashboardStoreTestProvider>,
    );

describe('FilterPopover with the shipped inputs', () => {
    beforeEach(() => onChange.mockClear());

    it('puts the kept value back in the input and says why on a refused edit', async () => {
        const user = userEvent.setup();
        renderHarness(lockedRequired);

        const input = screen.getByRole('spinbutton');
        await waitFor(() => expect(input).toHaveValue(5));
        // At rest the reason is a quiet line
        expect(screen.getByText(LOCKED_REQUIRED)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await user.clear(input);
        expect(input).toHaveValue(null);

        // The input reports the empty value after its own delay
        expect(await screen.findByRole('alert')).toHaveTextContent(
            LOCKED_REQUIRED,
        );
        expect(onChange).not.toHaveBeenCalled();
        const kept = screen.getByRole('spinbutton');
        await waitFor(() => expect(kept).toHaveValue(5));
        // Typing goes on where it was
        expect(kept).toHaveFocus();

        fireEvent.change(kept, { target: { value: '7' } });
        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ values: [7] }),
            ),
        );
        // An accepted edit makes the line quiet again
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText(LOCKED_REQUIRED)).toBeInTheDocument();
    });

    it("draws the shipped input for the rule's type and operator", () => {
        const base = { ...lockedRequired, required: false, lockedTabUuids: [] };
        const between = renderHarness({
            ...base,
            operator: FilterOperator.IN_BETWEEN,
            values: [1, 9],
        });
        expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
        between.unmount();

        const greater = renderHarness(base);
        expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
        // The operator is a button, so the value input takes focus on open
        expect(screen.getByRole('spinbutton')).toHaveFocus();
        greater.unmount();

        renderHarness(
            { ...base, operator: FilterOperator.EQUALS, values: [true] },
            FilterType.BOOLEAN,
            DimensionType.BOOLEAN,
        );
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
});
