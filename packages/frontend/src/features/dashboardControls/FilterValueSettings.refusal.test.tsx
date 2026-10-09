import {
    FilterOperator,
    FilterType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterValueSettings } from './FilterValueSettings';

// The shipped inputs are real here: the number input keeps its own text

const LOCKED_REQUIRED = 'A locked, required filter must have a value';

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
const Harness: FC = () => {
    const [rule, setRule] = useState(lockedRequired);
    return (
        <FiltersProvider>
            <FilterValueSettings
                filterType={FilterType.NUMBER}
                field={null}
                filterRule={rule}
                onChange={(next) => {
                    onChange(next);
                    setRule(next);
                }}
            />
        </FiltersProvider>
    );
};

describe('FilterValueSettings, a refused edit', () => {
    it('puts the kept value back in the input and says why', async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness />);

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
});
