import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import FilterConfiguration from './index';

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector({ sqlChartTilesMetadata: {} })),
}));

// Filter requirements UI is feature-flagged; tests exercise the flag-on UX
const mockDashboardContext = vi.hoisted(() => ({
    current: {
        dashboardFilters: {
            dimensions: [] as DashboardFilterRule[],
            metrics: [] as DashboardFilterRule[],
            tableCalculations: [],
        },
        allFilterableFieldsMap: {},
        allFilterableMetricsMap: {},
        isFilterRequirementsEnabled: true,
    },
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
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

const mockField = {
    name: 'first_name',
    type: DimensionType.STRING,
    table: 'customers',
    tableLabel: 'Customers',
    label: 'First name',
    fieldType: FieldType.DIMENSION,
    sql: 'first_name',
    hidden: false,
} as unknown as DashboardFilterableField;

const anyValueRule: DashboardFilterRule = {
    id: 'filter-1',
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
};

describe('FilterConfiguration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDashboardContext.current.dashboardFilters = {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        };
        mockDashboardContext.current.isFilterRequirementsEnabled = true;
    });

    it('saves a value typed into the input when Apply is clicked without pressing Enter', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();

        renderWithProviders(
            <FilterConfiguration
                isEditMode={false}
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={anyValueRule}
                originalFilterRule={anyValueRule}
                onSave={onSave}
            />,
        );

        const input = document.querySelector(
            'input[data-autofocus]',
        ) as HTMLInputElement;
        expect(input).toBeTruthy();

        fireEvent.focus(input);
        await user.type(input, 'adam');

        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ values: ['adam'] }),
        );
    });

    it('allows changing between multiple and single values', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={anyValueRule}
                originalFilterRule={anyValueRule}
                onSave={vi.fn()}
            />,
        );

        const toggle = screen.getByRole('button', {
            name: 'Multiple values',
        });
        const rightSection = toggle.closest<HTMLElement>(
            '[data-position="right"]',
        );
        expect(
            rightSection?.parentElement?.style.getPropertyValue(
                '--input-right-section-pointer-events',
            ),
        ).toBe('all');

        await user.click(toggle);

        expect(
            screen.getByRole('button', { name: 'Single value' }),
        ).toBeVisible();
    });

    it('keeps the required toggle on and lists rule siblings for a rule member', () => {
        const memberRule: DashboardFilterRule = {
            ...anyValueRule,
            requiredGroupId: 'group-1',
        };
        const otherMemberRule: DashboardFilterRule = {
            id: 'filter-2',
            target: {
                fieldId: 'customers_last_name',
                tableName: 'customers',
            },
            operator: FilterOperator.EQUALS,
            values: [],
            disabled: true,
            label: 'Last name',
            requiredGroupId: 'group-1',
        };
        mockDashboardContext.current.dashboardFilters.dimensions = [
            memberRule,
            otherMemberRule,
        ];

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={memberRule}
                originalFilterRule={memberRule}
                onSave={vi.fn()}
            />,
        );

        const requiredSwitch = screen.getByLabelText('Required');
        expect(requiredSwitch).toBeEnabled();
        expect(requiredSwitch).toBeChecked();
        expect(screen.getByText(/Shares a rule/)).toBeInTheDocument();
        expect(screen.getByText('Last name')).toBeInTheDocument();
    });

    it('restores rule membership when the required toggle is turned off and back on', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        const memberRule: DashboardFilterRule = {
            ...anyValueRule,
            requiredGroupId: 'group-1',
        };
        const otherMemberRule: DashboardFilterRule = {
            id: 'filter-2',
            target: {
                fieldId: 'customers_last_name',
                tableName: 'customers',
            },
            operator: FilterOperator.EQUALS,
            values: [],
            disabled: true,
            label: 'Last name',
            requiredGroupId: 'group-1',
        };
        mockDashboardContext.current.dashboardFilters.dimensions = [
            memberRule,
            otherMemberRule,
        ];

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={memberRule}
                originalFilterRule={memberRule}
                onSave={onSave}
            />,
        );

        const requiredSwitch = screen.getByLabelText('Required');
        await user.click(requiredSwitch);
        expect(requiredSwitch).not.toBeChecked();

        await user.click(requiredSwitch);
        expect(requiredSwitch).toBeChecked();
        expect(screen.getByText(/Shares a rule/)).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                required: false,
                requiredGroupId: 'group-1',
            }),
        );
    });

    it('renders the legacy checkbox and preserves rule membership when the flag is off', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        mockDashboardContext.current.isFilterRequirementsEnabled = false;
        const memberRule: DashboardFilterRule = {
            ...anyValueRule,
            requiredGroupId: 'group-1',
        };

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={memberRule}
                originalFilterRule={memberRule}
                onSave={onSave}
            />,
        );

        expect(screen.queryByLabelText('Required')).not.toBeInTheDocument();
        const checkbox = screen.getByLabelText(
            'Require viewers to pick a value to load the dashboard',
        );
        expect(checkbox).not.toBeChecked();

        await user.click(checkbox);
        expect(checkbox).toBeChecked();

        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                required: true,
                requiredGroupId: 'group-1',
            }),
        );
    });

    it('shows an enabled unchecked required toggle when the filter is not part of a rule', () => {
        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={anyValueRule}
                originalFilterRule={anyValueRule}
                onSave={vi.fn()}
            />,
        );

        const requiredSwitch = screen.getByLabelText('Required');
        expect(requiredSwitch).toBeEnabled();
        expect(requiredSwitch).not.toBeChecked();
        expect(screen.getByText('Required')).toBeInTheDocument();
    });
});
