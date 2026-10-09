import {
    FilterOperator,
    FilterType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterValueSettings } from './FilterValueSettings';

// Stands in for the value input, with one way to empty it
vi.mock('../../components/common/Filters/FilterInputs', () => ({
    default: ({
        rule,
        onChange,
    }: {
        rule: DashboardFilterRule;
        onChange: (next: DashboardFilterRule) => void;
    }) => (
        <div data-testid="value-input">
            <button
                type="button"
                onClick={() => onChange({ ...rule, values: [] })}
            >
                Empty the input
            </button>
        </div>
    ),
}));

const LOCKED_REQUIRED = 'A locked, required filter must have a value';

const NOTE = /Not set: each tile keeps its own values/;
const HINT = 'Choose a value, or the default is left off.';

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

const REQUIRED_NOTE =
    'Temporary filter values for required filters will be removed on dashboard save';

const renderSettings = (
    rule: DashboardFilterRule,
    filterType: FilterType = FilterType.STRING,
) => {
    const onChange = vi.fn();
    renderWithProviders(
        <FilterValueSettings
            filterType={filterType}
            field={null}
            filterRule={rule}
            onChange={onChange}
        />,
    );
    return onChange;
};

describe('FilterValueSettings', () => {
    it('leaves out the label input and the Required card of the shipped form', () => {
        renderSettings(makeRule({ values: ['done'] }));

        expect(screen.queryByLabelText('Filter label')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('switch', { name: /Required/ }),
        ).not.toBeInTheDocument();
        expect(screen.getAllByRole('switch')).toHaveLength(1);
    });

    const chooseOperator = (name: string) => {
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(screen.getByRole('option', { name, hidden: true }));
    };

    describe('default value', () => {
        it('shows the note and a disabled any value input while the default is off', () => {
            renderSettings(makeRule({ disabled: true }));

            expect(
                screen.getByRole('switch', { name: 'Provide default value' }),
            ).not.toBeChecked();
            expect(screen.getByText(NOTE)).toBeInTheDocument();
            const anyValue = screen.getByPlaceholderText('any value');
            expect(anyValue).toBeDisabled();
            expect(screen.queryByTestId('value-input')).not.toBeInTheDocument();
        });

        it('has no any value input for an operator that takes no value', () => {
            renderSettings(
                makeRule({ disabled: true, operator: FilterOperator.NULL }),
            );
            expect(
                screen.queryByPlaceholderText('any value'),
            ).not.toBeInTheDocument();
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

        it('clears the values when the default is turned off', async () => {
            const user = userEvent.setup();
            const rule = makeRule({ values: ['done'] });
            const onChange = renderSettings(rule);

            await user.click(
                screen.getByRole('switch', { name: 'Provide default value' }),
            );

            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ disabled: true, values: [] }),
            );
        });

        it('shows the operator and the value input while the default is on', () => {
            renderSettings(makeRule({ values: ['done'] }));

            expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
            expect(screen.getByRole('combobox')).toBeInTheDocument();
            expect(screen.getByTestId('value-input')).toBeInTheDocument();
            expect(
                screen.queryByPlaceholderText('any value'),
            ).not.toBeInTheDocument();
        });

        it('says the default is left off while it has no value', () => {
            renderSettings(makeRule({}));
            expect(screen.getByText(HINT)).toBeInTheDocument();
        });

        it('keeps the hint away from a rule that has a value', () => {
            renderSettings(makeRule({ values: ['done'] }));
            expect(screen.queryByText(HINT)).not.toBeInTheDocument();
        });
    });

    describe('a locked and required filter', () => {
        const emptyTheValue = () =>
            fireEvent.click(
                screen.getByRole('button', { name: 'Empty the input' }),
            );

        it('keeps its value: no viewer could satisfy it without one', () => {
            const onChange = renderSettings(
                makeRule({
                    values: ['done'],
                    required: true,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            // The shipped Apply guard's own words
            expect(screen.getByText(LOCKED_REQUIRED)).toBeInTheDocument();

            emptyTheValue();

            expect(onChange).not.toHaveBeenCalled();
        });

        it('still takes an edit that leaves it with a value', () => {
            const onChange = renderSettings(
                makeRule({
                    values: ['done'],
                    required: true,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Multiple values' }),
            );
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    singleValue: true,
                    values: ['done'],
                }),
            );
        });

        it('takes no operator change that would empty it, as the shipped form empties the value', () => {
            const onChange = renderSettings(
                makeRule({
                    values: ['done'],
                    required: true,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            chooseOperator('includes');
            expect(onChange).not.toHaveBeenCalled();
        });

        it('can be emptied when it is only required, or only locked', () => {
            const required = renderSettings(
                makeRule({ values: ['done'], required: true }),
            );
            expect(screen.queryByText(LOCKED_REQUIRED)).not.toBeInTheDocument();
            emptyTheValue();
            expect(required).toHaveBeenCalledWith(
                expect.objectContaining({ values: [], disabled: true }),
            );
        });

        it('can be edited when it was saved with no value', () => {
            const onChange = renderSettings(
                makeRule({
                    disabled: true,
                    required: true,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            chooseOperator('includes');
            expect(onChange).toHaveBeenCalledTimes(1);
        });
    });

    describe('operator', () => {
        it('is shown and editable while the default is off', () => {
            const rule = makeRule({ disabled: true });
            const onChange = renderSettings(rule);

            expect(screen.getByRole('combobox')).toBeEnabled();
            chooseOperator('includes');

            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    operator: FilterOperator.INCLUDE,
                    disabled: true,
                    values: [],
                }),
            );
        });

        it('keeps the default on when it changes with a value set', () => {
            const onChange = renderSettings(makeRule({ values: ['done'] }));
            chooseOperator('includes');

            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    operator: FilterOperator.INCLUDE,
                    disabled: false,
                }),
            );
        });

        it('switches the default on for an operator that takes no value, as the shipped form does', () => {
            const onChange = renderSettings(makeRule({ disabled: true }));
            chooseOperator('is null');

            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    operator: FilterOperator.NULL,
                    disabled: false,
                }),
            );
        });
    });

    describe('single or multiple values', () => {
        it('reads multiple values for a rule with no setting', () => {
            renderSettings(makeRule({ disabled: true }));
            expect(
                screen.getByRole('button', { name: 'Multiple values' }),
            ).toBeInTheDocument();
        });

        it('reflects a saved single value setting', () => {
            renderSettings(makeRule({ disabled: true, singleValue: true }));
            expect(
                screen.getByRole('button', { name: 'Single value' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Multiple values' }),
            ).not.toBeInTheDocument();
        });

        it('writes singleValue and leaves the rest of the rule alone', () => {
            const rule = makeRule({ values: ['done'] });
            const onChange = renderSettings(rule);

            fireEvent.click(
                screen.getByRole('button', { name: 'Multiple values' }),
            );

            expect(onChange).toHaveBeenCalledWith({
                ...rule,
                singleValue: true,
                disabled: false,
            });
        });

        it('switches a single value filter back to multiple values', () => {
            const rule = makeRule({ disabled: true, singleValue: true });
            const onChange = renderSettings(rule);

            fireEvent.click(
                screen.getByRole('button', { name: 'Single value' }),
            );

            expect(onChange).toHaveBeenCalledWith({
                ...rule,
                singleValue: false,
            });
        });

        it('is not offered where the shipped form does not offer it', () => {
            renderSettings(
                makeRule({ operator: FilterOperator.NULL }),
                FilterType.STRING,
            );
            expect(
                screen.queryByRole('button', { name: /values?$/ }),
            ).not.toBeInTheDocument();
        });

        it('is not offered for a date filter', () => {
            renderSettings(makeRule({ disabled: true }), FilterType.DATE);
            expect(
                screen.queryByRole('button', { name: /values?$/ }),
            ).not.toBeInTheDocument();
        });
    });

    describe('required filter', () => {
        it('has no default switch and notes that the value is temporary', () => {
            renderSettings(makeRule({ required: true, values: ['done'] }));

            expect(
                screen.queryByRole('switch', { name: 'Provide default value' }),
            ).not.toBeInTheDocument();
            expect(screen.getByText(REQUIRED_NOTE)).toBeInTheDocument();
        });

        it('shows the operator and the value input with no value set', () => {
            renderSettings(makeRule({ required: true, disabled: true }));

            expect(screen.getByRole('combobox')).toBeInTheDocument();
            expect(screen.getByTestId('value-input')).toBeInTheDocument();
            expect(
                screen.queryByPlaceholderText('any value'),
            ).not.toBeInTheDocument();
            expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
            expect(screen.queryByText(REQUIRED_NOTE)).not.toBeInTheDocument();
        });

        it('shows the same for a filter that shares a requirement', () => {
            renderSettings(makeRule({ requiredGroupId: 'g', disabled: true }));

            expect(
                screen.queryByRole('switch', { name: 'Provide default value' }),
            ).not.toBeInTheDocument();
            expect(screen.getByTestId('value-input')).toBeInTheDocument();
        });

        it('stays off when its operator changes with no value', () => {
            const onChange = renderSettings(
                makeRule({ required: true, disabled: true }),
            );
            chooseOperator('includes');

            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    operator: FilterOperator.INCLUDE,
                    required: true,
                    disabled: true,
                }),
            );
        });
    });
});
