import {
    FilterOperator,
    FilterType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterValueSettings } from './FilterValueSettings';

vi.mock('../../components/common/Filters/FilterInputs', () => ({
    default: () => <div data-testid="value-input" />,
}));

const NOTE = /Not set: each tile keeps its own values/;
const ERROR = 'Choose a default value or turn it off';

const makeRule = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'filter-1',
    label: 'Status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    ...overrides,
});

const renderSettings = (rule: DashboardFilterRule, attemptedApply = false) => {
    const onChange = vi.fn();
    renderWithProviders(
        <FilterValueSettings
            filterType={FilterType.STRING}
            field={null}
            filterRule={rule}
            attemptedApply={attemptedApply}
            onChange={onChange}
        />,
    );
    return onChange;
};

describe('FilterValueSettings', () => {
    it('shows the note and no inputs while the default is off', () => {
        renderSettings(makeRule({ disabled: true }));

        expect(
            screen.getByRole('switch', { name: 'Provide default value' }),
        ).not.toBeChecked();
        expect(screen.getByText(NOTE)).toBeInTheDocument();
        expect(screen.queryByLabelText('Operator')).not.toBeInTheDocument();
        expect(screen.queryByTestId('value-input')).not.toBeInTheDocument();
    });

    it('enables the rule when the default is turned on', async () => {
        const user = userEvent.setup();
        const rule = makeRule({ disabled: true });
        const onChange = renderSettings(rule);

        await user.click(
            screen.getByRole('switch', { name: 'Provide default value' }),
        );

        expect(onChange).toHaveBeenCalledWith({ ...rule, disabled: false });
    });

    it('shows the operator and the value input while the default is on', () => {
        renderSettings(makeRule({ values: ['done'] }));

        expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
        expect(
            screen.getByRole('combobox', { name: 'Operator' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('value-input')).toBeInTheDocument();
    });

    it('shows the missing value error only after an Apply attempt', () => {
        renderSettings(makeRule({}));
        expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
    });

    it('shows the missing value error after an Apply attempt', () => {
        renderSettings(makeRule({}), true);
        expect(screen.getByText(ERROR)).toBeInTheDocument();
    });

    it('keeps the error away from a rule that has a value', () => {
        renderSettings(makeRule({ values: ['done'] }), true);
        expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
    });

    it('has no default switch for a required filter', () => {
        renderSettings(makeRule({ required: true, values: ['done'] }));

        expect(
            screen.queryByRole('switch', { name: 'Provide default value' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'This value is dropped when the dashboard is saved.',
            ),
        ).toBeInTheDocument();
    });
});
