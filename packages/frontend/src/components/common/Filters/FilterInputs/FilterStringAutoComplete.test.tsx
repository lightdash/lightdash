import {
    DimensionType,
    FieldType,
    type FilterableItem,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterStringAutoComplete from './FilterStringAutoComplete';

// Mock the hooks
vi.mock('../useFiltersContext', () => ({
    default: vi.fn(() => ({
        projectUuid: 'test-project-uuid',
        getAutocompleteFilterGroup: vi.fn(() => undefined),
        parameterValues: {},
    })),
}));

vi.mock('../../../../hooks/useFieldValues', () => ({
    MAX_AUTOCOMPLETE_RESULTS: 100,
    useFieldValues: vi.fn(() => ({
        isInitialLoading: false,
        results: new Set<string>(),
        refreshedAt: new Date(),
        refetch: vi.fn(),
        error: null,
        isError: false,
    })),
}));

vi.mock('../../../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({
        data: { hasCacheAutocompleResults: false },
    })),
}));

const mockField: FilterableItem = {
    name: 'test_field',
    type: DimensionType.STRING,
    table: 'test_table',
    tableLabel: 'Test Table',
    label: 'Test Field',
    fieldType: FieldType.DIMENSION,
    sql: 'test_field',
    hidden: false,
};

const createValues = (count: number) =>
    Array.from({ length: count }, (_, i) => `value-${i}`);

describe('FilterStringAutoComplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('truncation behavior', () => {
        it('shows "+N more" pill when values exceed inline limit', async () => {
            const values = createValues(100);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={[]}
                    onChange={onChange}
                />,
            );

            // Should show the "+50 more" pill
            expect(screen.getByText('+50 more')).toBeInTheDocument();
        });

        it('shows all values when below inline limit', async () => {
            const values = createValues(10);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={[]}
                    onChange={onChange}
                />,
            );

            // Should not show "+N more" pill
            expect(screen.queryByText(/more$/)).not.toBeInTheDocument();

            // All values should be visible
            values.forEach((value) => {
                expect(screen.getByText(value)).toBeInTheDocument();
            });
        });
    });

    describe('data preservation in truncated mode', () => {
        it('preserves hidden values when removing a displayed value', async () => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const values = createValues(100);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={[]}
                    onChange={onChange}
                />,
            );

            // Find the remove button on the first value pill (it's aria-hidden, so we query by class)
            const firstValuePill = screen.getByText('value-0');
            // eslint-disable-next-line testing-library/no-node-access
            const pillContainer = firstValuePill.closest(
                '.mantine-MultiSelect-value',
            );
            // eslint-disable-next-line testing-library/no-node-access
            const removeButton = pillContainer?.querySelector('button');

            expect(removeButton).toBeTruthy();
            await user.click(removeButton!);

            // onChange should be called with 99 values (all except value-0)
            await waitFor(() => {
                expect(onChange).toHaveBeenCalled();
            });

            const calledWith = onChange.mock.calls[0][0];
            expect(calledWith).toHaveLength(99);
            expect(calledWith).not.toContain('value-0');
            // Hidden values should be preserved
            expect(calledWith).toContain('value-50');
            expect(calledWith).toContain('value-99');
        });

        it('preserves hidden values when adding a new value via keyboard', async () => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const values = createValues(60);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={['new-suggestion']}
                    onChange={onChange}
                />,
            );

            // Focus on the input using fireEvent (bypasses pointer-events check)
            const input = screen.getByRole('searchbox');
            fireEvent.focus(input);

            // Type a new value and press Enter
            await user.type(input, 'brand-new-value{Enter}');

            await waitFor(() => {
                expect(onChange).toHaveBeenCalled();
            });

            const calledWith = onChange.mock.calls[0][0];
            // Should have original 60 + 1 new = 61 values
            expect(calledWith).toHaveLength(61);
            expect(calledWith).toContain('brand-new-value');
            // Hidden values should be preserved
            expect(calledWith).toContain('value-50');
            expect(calledWith).toContain('value-59');
        });
    });

    describe('summary mode', () => {
        it('shows summary text input when values exceed summary threshold', async () => {
            const values = createValues(600);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={[]}
                    onChange={onChange}
                />,
            );

            // Should show summary text
            expect(
                screen.getByDisplayValue('600 values selected'),
            ).toBeInTheDocument();

            // Should show "Manage values" button
            expect(
                screen.getByRole('button', { name: 'Manage values' }),
            ).toBeInTheDocument();
        });
    });

    describe('manage values modal', () => {
        it('opens modal when clicking "+N more" pill', async () => {
            const values = createValues(100);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={[]}
                    onChange={onChange}
                />,
            );

            // Click the "+50 more" pill - use fireEvent to bypass pointer-events check
            const morePill = screen.getByText('+50 more');
            fireEvent.mouseDown(morePill);

            // Modal should open
            await waitFor(() => {
                expect(
                    screen.getByText('Manage filter values'),
                ).toBeInTheDocument();
            });
        });

        it('opens modal from summary mode manage values button', async () => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            // Use > 500 values to trigger summary mode
            const values = createValues(600);
            const onChange = vi.fn();

            renderWithProviders(
                <FilterStringAutoComplete
                    filterId="test-filter"
                    field={mockField}
                    values={values}
                    suggestions={[]}
                    onChange={onChange}
                />,
            );

            // In summary mode, there's a visible "Manage values" button
            const manageButton = screen.getByRole('button', {
                name: 'Manage values',
            });
            await user.click(manageButton);

            // Modal should open
            await waitFor(() => {
                expect(
                    screen.getByText('Manage filter values'),
                ).toBeInTheDocument();
            });
        });
    });
});
