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
} as DashboardFilterableField;

const anyValueRule: DashboardFilterRule = {
    id: 'filter-1',
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: false,
    label: undefined,
};

describe('FilterConfiguration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('saves a typed string filter value when Apply is clicked without pressing Enter', async () => {
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

        const input = screen.getByPlaceholderText(
            'Start typing to filter results',
        );
        const applyButton = screen.getByRole('button', { name: 'Apply' });

        expect(applyButton).toBeDisabled();

        fireEvent.focus(input);
        await user.type(input, 'adam');

        expect(applyButton).toBeEnabled();

        fireEvent.mouseDown(applyButton);

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({ values: ['adam'] }),
            );
        });
    });
});
