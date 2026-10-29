import {
    DEFAULT_UI_STRINGS,
    FilterOperator,
    FilterType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import classes from './FilterEditor.module.css';
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
        <div data-testid="value-input" data-disabled={String(!!rule.disabled)}>
            <button
                type="button"
                onClick={() => onChange({ ...rule, values: [] })}
            >
                Empty the input
            </button>
            <button
                type="button"
                onClick={() => onChange({ ...rule, values: ['shipped'] })}
            >
                Fill the input
            </button>
        </div>
    ),
}));

const LOCKED_REQUIRED = 'A locked, required filter must have a value';

const ANY_VALUE = 'any value';

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
            isEditMode
            isCreatingNew={false}
            filterType={filterType}
            field={null}
            filterRule={rule}
            onChange={onChange}
        />,
    );
    return onChange;
};

describe('FilterValueSettings', () => {
    it("clears a viewer's value to any value with the shipped X", async () => {
        const onChange = vi.fn();
        const { container } = renderWithProviders(
            <FilterValueSettings
                isEditMode={false}
                isCreatingNew={false}
                filterType={FilterType.STRING}
                field={null}
                filterRule={makeRule({ values: ['done'] })}
                onChange={onChange}
            />,
            {
                user: {
                    abilityRules: [{ action: 'manage', subject: 'Explore' }],
                },
            },
        );
        const clear = await waitFor(() => {
            const icon = container.querySelector('.tabler-icon-x');
            if (!icon) throw new Error('no clear X yet');
            return icon.closest('button') as HTMLButtonElement;
        });
        fireEvent.click(clear);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'filter-1', values: [] }),
        );
    });

    it.each([
        [true, true],
        [false, false],
    ])(
        'labels a viewer\'s new filter "Value", as the shipped form (new: %s)',
        (isCreatingNew, hasLabel) => {
            renderWithProviders(
                <FilterValueSettings
                    isEditMode={false}
                    isCreatingNew={isCreatingNew}
                    filterType={FilterType.STRING}
                    field={null}
                    filterRule={makeRule({})}
                    onChange={vi.fn()}
                />,
            );
            expect(
                screen.queryAllByText(
                    DEFAULT_UI_STRINGS['filters.config.valueLabel'],
                ),
            ).toHaveLength(hasLabel ? 1 : 0);
        },
    );

    it('leaves out the label input and the Required card of the shipped form', () => {
        renderSettings(makeRule({ values: ['done'] }));

        expect(screen.queryByLabelText('Filter label')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('switch', { name: /Required/ }),
        ).not.toBeInTheDocument();
        expect(screen.queryAllByRole('switch')).toHaveLength(0);
    });

    const chooseOperator = (name: string) => {
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(screen.getByRole('option', { name, hidden: true }));
    };

    describe('default value', () => {
        const SWITCH = { name: 'Provide default value' };

        it('has no default switch: the value input is always there, enabled', () => {
            renderSettings(makeRule({ values: ['done'] }));
            expect(
                screen.queryByRole('switch', SWITCH),
            ).not.toBeInTheDocument();
            expect(screen.getByTestId('value-input')).toHaveAttribute(
                'data-disabled',
                'false',
            );
        });

        it('shows the value input enabled on a rule that is any value', () => {
            renderSettings(makeRule({ disabled: true }));

            expect(
                screen.queryByRole('switch', SWITCH),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByPlaceholderText(ANY_VALUE),
            ).not.toBeInTheDocument();
            expect(screen.getByTestId('value-input')).toHaveAttribute(
                'data-disabled',
                'false',
            );
            expect(
                screen.queryByText('Set a value, or the default stays off.'),
            ).not.toBeInTheDocument();
        });

        it('puts a typed value in effect, and an emptied one back to any value', () => {
            const rule = makeRule({ disabled: true });
            const onChange = renderSettings(rule);

            fireEvent.click(
                screen.getByRole('button', { name: 'Fill the input' }),
            );
            expect(onChange).toHaveBeenLastCalledWith({
                ...rule,
                values: ['shipped'],
                disabled: false,
            });

            fireEvent.click(
                screen.getByRole('button', { name: 'Empty the input' }),
            );
            expect(onChange).toHaveBeenLastCalledWith({
                ...rule,
                values: [],
                disabled: true,
            });
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

        it('says why on every refused edit, not only the first', () => {
            renderSettings(
                makeRule({
                    values: ['done'],
                    required: true,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            emptyTheValue();
            const first = screen.getByRole('alert');
            expect(first).toHaveTextContent(LOCKED_REQUIRED);

            emptyTheValue();

            // A new alert node is what a screen reader announces again
            const second = screen.getByRole('alert');
            expect(second).toHaveTextContent(LOCKED_REQUIRED);
            expect(second).not.toBe(first);
        });

        it('gives focus back to a select the refused edit came from', () => {
            const onChange = renderSettings(
                makeRule({
                    values: ['done'],
                    required: true,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            const operator = screen.getByRole('combobox');
            expect(operator).toHaveAttribute('readonly');
            operator.focus();

            chooseOperator('includes');

            expect(onChange).not.toHaveBeenCalled();
            expect(screen.getByRole('alert')).toHaveTextContent(
                LOCKED_REQUIRED,
            );
            expect(screen.getByRole('combobox')).toHaveFocus();
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
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

        it('reads any value once a change empties the value, as the shipped form does', () => {
            const onChange = renderSettings(makeRule({ values: ['done'] }));
            chooseOperator('includes');

            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    operator: FilterOperator.INCLUDE,
                    values: [],
                    disabled: true,
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

        it('sits in the operator select while the default is on', () => {
            renderSettings(makeRule({ values: ['done'] }));
            expect(
                screen.getByRole('button', { name: 'Multiple values' }),
            ).toBeInTheDocument();
        });

        it('is offered while the default is off', () => {
            renderSettings(makeRule({ disabled: true }));
            expect(
                screen.getByRole('button', { name: 'Multiple values' }),
            ).toBeInTheDocument();
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
        it('has no switch, and notes that its value is temporary', () => {
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
                screen.queryByPlaceholderText(ANY_VALUE),
            ).not.toBeInTheDocument();
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

    // The rail's `.valueForm` rule narrows the operator select by this shape
    it("puts a viewer's clear X and the operator select directly in the form", async () => {
        const { container } = renderWithProviders(
            <FilterValueSettings
                isEditMode={false}
                isCreatingNew={false}
                filterType={FilterType.STRING}
                field={null}
                filterRule={makeRule({ values: ['done'] })}
                onChange={vi.fn()}
            />,
            {
                user: {
                    abilityRules: [{ action: 'manage', subject: 'Explore' }],
                },
            },
        );
        const form = container.querySelector(`.${classes.valueForm}`);
        expect(form).not.toBeNull();
        await waitFor(() =>
            expect(
                form?.querySelector(
                    ':scope > .mantine-Group-root > .mantine-ActionIcon-root .tabler-icon-x',
                ),
            ).not.toBeNull(),
        );
        expect(
            form?.querySelectorAll(':scope > .mantine-Select-root'),
        ).toHaveLength(1);
    });
});
