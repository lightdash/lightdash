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

const mockDashboardContext = vi.hoisted(() => ({
    current: {
        dashboardFilters: {
            dimensions: [] as DashboardFilterRule[],
            metrics: [] as DashboardFilterRule[],
            tableCalculations: [],
        },
        allFilterableFieldsMap: {},
        allFilterableMetricsMap: {},
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

    it('disables the required switch and lists other members for a requirement rule member', () => {
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

        const requiredSwitch = screen.getByLabelText('Required filter');
        expect(requiredSwitch).toBeDisabled();
        expect(requiredSwitch).toBeChecked();
        expect(
            screen.getByText('At least one of group A must be set'),
        ).toBeInTheDocument();
        expect(screen.getByText('Last name')).toBeInTheDocument();
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

        const requiredSwitch = screen.getByLabelText('Required filter');
        expect(requiredSwitch).toBeEnabled();
        expect(requiredSwitch).not.toBeChecked();
        expect(screen.getByText('Required filter')).toBeInTheDocument();
    });
});
