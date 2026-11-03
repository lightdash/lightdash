import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    TimeFrames,
    type DateFilterRule,
    type FilterableDimension,
    type FilterableItem,
    type Metric,
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
const quarterField = dimension(DimensionType.DATE, TimeFrames.QUARTER);
const timestampField = dimension(DimensionType.TIMESTAMP);
// A metric filter on a date-typed metric renders the same date inputs
const dateMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.DATE,
    name: 'latest_order_date',
    label: 'Latest order date',
    table: 'orders',
    tableLabel: 'Orders',
    sql: 'MAX(${TABLE}.order_date)',
    hidden: false,
};

type Props = {
    field: FilterableItem;
    initialRule: DateFilterRule;
    onChange: (rule: DateFilterRule) => void;
    onDismissOutside: () => void;
    onDismiss: () => void;
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
    onDismiss,
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [rule, setRule] = useState(initialRule);
    useEditorDismiss({
        isOpen,
        isFieldClicked: false,
        isAsking: false,
        isPristineNew: false,
        clearField: () => {},
        dismiss: () => {
            onDismiss();
            setIsOpen(false);
        },
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

const renderEditor = (field: FilterableItem, rule: DateFilterRule) => {
    const onChange = vi.fn<(rule: DateFilterRule) => void>();
    const onDismissOutside = vi.fn();
    const onDismiss = vi.fn();
    renderWithProviders(
        // The shared providers set Mantine's test env, which renders dropdowns
        // in place; the bug needs them portalled to the body, as in the browser
        <MantineProvider env="default">
            <Editor
                field={field}
                initialRule={rule}
                onChange={onChange}
                onDismissOutside={onDismissOutside}
                onDismiss={onDismiss}
            />
        </MantineProvider>,
    );
    return {
        onDismissOutside,
        onDismiss,
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

        it('on a date metric: sets the clicked day and keeps the editor open', async () => {
            const user = userEvent.setup();
            const { onDismissOutside, lastValues } = renderEditor(
                dateMetric,
                makeRule(operator, ['2026-01-15']),
            );

            await pickDay(user, valueInputs()[0], '20 January 2026');

            expect(lastValues()).toStrictEqual(['2026-01-20']);
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

    // Each case opens the calendar of a portalled date input
    const calendarCases: [string, FilterableItem, FilterOperator, number][] = [
        ['"is before" on a date field', dateField, FilterOperator.LESS_THAN, 0],
        [
            '"is after" on a week field',
            weekField,
            FilterOperator.GREATER_THAN,
            0,
        ],
        [
            '"is before" on a date metric',
            dateMetric,
            FilterOperator.LESS_THAN,
            0,
        ],
        [
            '"is between" start on a date field',
            dateField,
            FilterOperator.IN_BETWEEN,
            0,
        ],
        [
            '"is between" end on a date field',
            dateField,
            FilterOperator.IN_BETWEEN,
            1,
        ],
        [
            '"is before" on a timestamp field',
            timestampField,
            FilterOperator.LESS_THAN,
            0,
        ],
    ];

    const openCalendar = async (
        user: ReturnType<typeof userEvent.setup>,
        index: number,
    ) => {
        await user.click(valueInputs()[index]);
        await screen.findByRole('button', {
            name: '20 January 2026',
            hidden: true,
        });
    };

    const calendarValues = (field: FilterableItem) =>
        field === timestampField
            ? ['2026-01-05T00:00:00Z', '2026-01-28T00:00:00Z']
            : ['2026-01-05', '2026-01-28'];

    const expectCalendarClosed = () =>
        waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: '20 January 2026',
                    hidden: true,
                }),
            ).not.toBeInTheDocument(),
        );

    // Escape with a calendar open closes the calendar only; the next one
    // cancels the edit
    describe.each(calendarCases)(
        'Escape with the calendar of %s open',
        (_, field, operator, index) => {
            it('closes the calendar and keeps the editor, then cancels on the next press', async () => {
                const user = userEvent.setup();
                const values =
                    field === timestampField
                        ? ['2026-01-05T00:00:00Z', '2026-01-28T00:00:00Z']
                        : ['2026-01-05', '2026-01-28'];
                const { onDismiss, onDismissOutside } = renderEditor(
                    field,
                    makeRule(operator, values),
                );

                await user.click(valueInputs()[index]);
                await screen.findByRole('button', {
                    name: '20 January 2026',
                    hidden: true,
                });
                await user.keyboard('{Escape}');

                await waitFor(() =>
                    expect(
                        screen.queryByRole('button', {
                            name: '20 January 2026',
                            hidden: true,
                        }),
                    ).not.toBeInTheDocument(),
                );
                expect(onDismiss).not.toHaveBeenCalled();
                expectEditorOpen(onDismissOutside);

                await user.keyboard('{Escape}');

                expect(onDismiss).toHaveBeenCalledTimes(1);
                expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
            });
        },
    );

    // A press outside with a calendar open closes the calendar only, as with
    // any open list; the next one cancels the edit
    describe.each(calendarCases)(
        'A press outside with the calendar of %s open',
        (_, field, operator, index) => {
            it('closes the calendar and keeps the editor, then cancels on the next press', async () => {
                const user = userEvent.setup();
                const { onDismissOutside } = renderEditor(
                    field,
                    makeRule(operator, calendarValues(field)),
                );

                await openCalendar(user, index);
                await user.click(document.body);

                await expectCalendarClosed();
                expectEditorOpen(onDismissOutside);

                await user.click(document.body);

                expect(onDismissOutside).toHaveBeenCalledTimes(1);
                expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
            });
        },
    );

    // Popovers whose focus stays on their input close themselves on Escape
    describe.each([
        [
            '"is" on a date field (multi-date picker)',
            dateField,
            makeRule(FilterOperator.EQUALS, ['2026-01-15']),
        ],
        [
            '"is before" on a quarter field',
            quarterField,
            makeRule(FilterOperator.LESS_THAN, ['2026-01-01']),
        ],
        [
            '"is before" with a value that is not a date',
            dateField,
            makeRule(FilterOperator.LESS_THAN, ['not a date']),
        ],
    ])('The popover of %s', (_, field, rule) => {
        it('closes the popover and keeps the editor, then cancels on the next press', async () => {
            const user = userEvent.setup();
            const { onDismiss, onDismissOutside } = renderEditor(field, rule);
            const openPopovers = () =>
                [
                    ...document.querySelectorAll('.mantine-Popover-dropdown'),
                ].filter(
                    (dropdown) => !dropdown.closest('[data-testid="editor"]'),
                );

            await user.click(valueInputs()[0]);
            await waitFor(() => expect(openPopovers()).toHaveLength(1));
            await user.keyboard('{Escape}');

            await waitFor(() => expect(openPopovers()).toHaveLength(0));
            expect(onDismiss).not.toHaveBeenCalled();
            expectEditorOpen(onDismissOutside);

            await user.keyboard('{Escape}');

            expect(onDismiss).toHaveBeenCalledTimes(1);
        });

        it('closes the popover on a press outside and keeps the editor, then cancels on the next press', async () => {
            const user = userEvent.setup();
            const { onDismissOutside } = renderEditor(field, rule);
            const openPopovers = () =>
                [
                    ...document.querySelectorAll('.mantine-Popover-dropdown'),
                ].filter(
                    (dropdown) => !dropdown.closest('[data-testid="editor"]'),
                );

            await user.click(valueInputs()[0]);
            await waitFor(() => expect(openPopovers()).toHaveLength(1));
            await user.click(document.body);

            await waitFor(() => expect(openPopovers()).toHaveLength(0));
            expectEditorOpen(onDismissOutside);

            await user.click(document.body);

            expect(onDismissOutside).toHaveBeenCalledTimes(1);
        });
    });
});
