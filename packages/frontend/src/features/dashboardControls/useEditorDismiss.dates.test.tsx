import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    TimeFrames,
    type DateFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DateFilterInputs from '../../components/common/Filters/FilterInputs/DateFilterInputs';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import MantineProvider from '../../providers/MantineProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { useEditorDismiss } from './useEditorDismiss';

// PROD-12817: a day picked in a date filter's calendar must set the value and
// leave the editor open. The calendar is portalled out of the editor, so the
// press on it must not count as a press outside.

const dimension = (
    type: DimensionType,
    timeInterval?: TimeFrames,
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name: 'order_date',
    label: 'Order date',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
    ...(timeInterval ? { timeInterval } : {}),
});

const dateField = dimension(DimensionType.DATE);
const weekField = dimension(DimensionType.DATE, TimeFrames.WEEK);
const timestampField = dimension(DimensionType.TIMESTAMP);

type Props = {
    field: FilterableDimension;
    initialRule: DateFilterRule;
    onChange: (rule: DateFilterRule) => void;
    onDismissOutside: () => void;
};

// The editor's dismiss rules around the real date inputs, as the dashboard
// controls popover renders them: no popover props, so each calendar is
// portalled to the body. A press outside closes the editor, as the provider's
// discard does
const Editor: FC<Props> = ({
    field,
    initialRule,
    onChange,
    onDismissOutside,
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [rule, setRule] = useState(initialRule);
    useEditorDismiss({
        isOpen,
        isFieldClicked: false,
        isAsking: false,
        isPristineNew: false,
        clearField: () => {},
        dismiss: () => {},
        dismissOutside: () => {
            onDismissOutside();
            setIsOpen(false);
        },
    });
    if (!isOpen) return null;
    return (
        <div data-controls-editor data-testid="editor">
            <FiltersProvider itemsMap={{}}>
                <DateFilterInputs
                    filterType={FilterType.DATE}
                    field={field}
                    rule={rule}
                    onChange={(next) => {
                        setRule(next);
                        onChange(next);
                    }}
                />
            </FiltersProvider>
            <button type="button">Apply</button>
        </div>
    );
};

const renderEditor = (field: FilterableDimension, rule: DateFilterRule) => {
    const onChange = vi.fn<(rule: DateFilterRule) => void>();
    const onDismissOutside = vi.fn();
    renderWithProviders(
        // The shared providers set Mantine's test env, which renders dropdowns
        // in place; the bug needs them portalled to the body, as in the browser
        <MantineProvider env="default">
            <Editor
                field={field}
                initialRule={rule}
                onChange={onChange}
                onDismissOutside={onDismissOutside}
            />
        </MantineProvider>,
    );
    return {
        onDismissOutside,
        lastValues: () => onChange.mock.calls.at(-1)?.[0].values,
    };
};

const expectEditorOpen = (onDismissOutside: () => void) => {
    expect(onDismissOutside).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
};

const makeRule = (
    operator: FilterOperator,
    values: string[],
): DateFilterRule => ({
    id: 'rule-1',
    target: { fieldId: 'orders_order_date' },
    operator,
    values,
});

// The value inputs inside the editor, in order
const valueInputs = () =>
    within(screen.getByTestId('editor'))
        .queryAllByRole('textbox')
        .concat(
            within(screen.getByTestId('editor')).queryAllByRole('button', {
                name: /\d{4}-\d{2}-\d{2}/,
            }),
        );

const pickDay = async (
    user: ReturnType<typeof userEvent.setup>,
    input: HTMLElement,
    dayLabel: string,
) => {
    await user.click(input);
    // `hidden`: jsdom has no layout, so Mantine at times hides a dropdown as
    // detached from its input
    const day = await screen.findByRole('button', {
        name: dayLabel,
        hidden: true,
    });
    // The calendar is outside the editor's DOM: that is the case under test
    expect(screen.getByTestId('editor')).not.toContainElement(day);
    await user.click(day);
};

describe('date filter calendar inside the dashboard filter editor', () => {
    describe.each([
        ['is before', FilterOperator.LESS_THAN],
        ['is on or before', FilterOperator.LESS_THAN_OR_EQUAL],
        ['is after', FilterOperator.GREATER_THAN],
        ['is on or after', FilterOperator.GREATER_THAN_OR_EQUAL],
    ])('"%s"', (_, operator) => {
        it('on a date field: sets the clicked day and keeps the editor open', async () => {
            const user = userEvent.setup();
            const { onDismissOutside, lastValues } = renderEditor(
                dateField,
                makeRule(operator, ['2026-01-15']),
            );

            await pickDay(user, valueInputs()[0], '20 January 2026');

            expect(lastValues()).toStrictEqual(['2026-01-20']);
            expectEditorOpen(onDismissOutside);
        });

        it('on a week field: sets the clicked week and keeps the editor open', async () => {
            const user = userEvent.setup();
            const { onDismissOutside, lastValues } = renderEditor(
                weekField,
                makeRule(operator, ['2026-01-12']),
            );

            await pickDay(user, valueInputs()[0], '21 January 2026');

            // The week commencing the clicked day (weeks start on Sunday here)
            expect(lastValues()).toStrictEqual(['2026-01-18']);
            expectEditorOpen(onDismissOutside);
        });
    });

    it('"is between" on a date field: sets both clicked days and keeps the editor open', async () => {
        const user = userEvent.setup();
        const { onDismissOutside, lastValues } = renderEditor(
            dateField,
            makeRule(FilterOperator.IN_BETWEEN, ['2026-01-05', '2026-01-28']),
        );

        await pickDay(user, valueInputs()[0], '10 January 2026');
        // The start calendar closes on pick; let it go before the end one opens
        await waitFor(() =>
            expect(
                document.querySelector('[data-dates-dropdown]'),
            ).not.toBeInTheDocument(),
        );
        await pickDay(user, valueInputs()[1], '20 January 2026');

        expect(lastValues()).toStrictEqual(['2026-01-10', '2026-01-20']);
        expectEditorOpen(onDismissOutside);
    });

    // Already worked: their pickers mark the open calendar as an open layer
    it('"is" on a date field: adds the clicked day and keeps the editor open', async () => {
        const user = userEvent.setup();
        const { onDismissOutside, lastValues } = renderEditor(
            dateField,
            makeRule(FilterOperator.EQUALS, ['2026-01-15']),
        );

        await pickDay(user, valueInputs()[0], '20 January 2026');

        expect(lastValues()).toStrictEqual(['2026-01-15', '2026-01-20']);
        expectEditorOpen(onDismissOutside);
    });

    it('"is before" on a timestamp field: keeps the editor open on a day click', async () => {
        const user = userEvent.setup();
        const { onDismissOutside, lastValues } = renderEditor(
            timestampField,
            makeRule(FilterOperator.LESS_THAN, ['2026-01-15T00:00:00Z']),
        );

        await pickDay(user, valueInputs()[0], '20 January 2026');

        expect(lastValues()?.[0]).toMatch(/^2026-01-20T/);
        expectEditorOpen(onDismissOutside);
    });

    it('still dismisses on a press outside the editor and its calendar', async () => {
        const user = userEvent.setup();
        const { onDismissOutside } = renderEditor(
            dateField,
            makeRule(FilterOperator.LESS_THAN, ['2026-01-15']),
        );

        await user.click(document.body);

        expect(onDismissOutside).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    });
});
