import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    TimeFrames,
    type DateFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { Modal } from '@mantine/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MantineProvider from '../../../../providers/MantineProvider';
import { renderWithProviders } from '../../../../testing/testUtils';
import MantineModal from '../../MantineModal';
import FiltersProvider from '../FiltersProvider';
import DateFilterInputs from './DateFilterInputs';

const dimension = (timeInterval?: TimeFrames): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date',
    label: 'Order date',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
    ...(timeInterval ? { timeInterval } : {}),
});

const rule = (operator: FilterOperator, values: string[]): DateFilterRule => ({
    id: 'rule-1',
    target: { fieldId: 'orders_order_date' },
    operator,
    values,
});

// A picker that closes itself on Escape consumes the key: a host modal (a
// scheduled delivery's filters) listens on window and skips a prevented Escape
let windowEscapes: KeyboardEvent[] = [];
const recordEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') windowEscapes.push(event);
};
afterEach(() => {
    window.removeEventListener('keydown', recordEscape);
    windowEscapes = [];
});

describe.each([
    [
        'the multi-date picker',
        dimension(),
        rule(FilterOperator.EQUALS, ['2026-01-15']),
    ],
    [
        'the quarter picker',
        dimension(TimeFrames.QUARTER),
        rule(FilterOperator.LESS_THAN, ['2026-01-01']),
    ],
    [
        'the day calendar',
        dimension(),
        rule(FilterOperator.LESS_THAN, ['2026-01-15']),
    ],
    [
        'the week calendar',
        dimension(TimeFrames.WEEK),
        rule(FilterOperator.LESS_THAN, ['2026-01-12']),
    ],
    [
        'the range calendar',
        dimension(),
        rule(FilterOperator.IN_BETWEEN, ['2026-01-05', '2026-01-28']),
    ],
    [
        'the invalid-value popover',
        dimension(),
        rule(FilterOperator.LESS_THAN, ['not a date']),
    ],
])('Escape in %s inside a modal', (_, field, initialRule) => {
    it('closes the picker, consumes the key and leaves the modal open', async () => {
        const user = userEvent.setup();
        window.addEventListener('keydown', recordEscape);
        const onModalClose = vi.fn();
        renderWithProviders(
            <MantineProvider env="default">
                <MantineModal opened onClose={onModalClose} title="Delivery">
                    <FiltersProvider itemsMap={{}}>
                        <DateFilterInputs
                            filterType={FilterType.DATE}
                            field={field}
                            rule={initialRule}
                            onChange={() => {}}
                        />
                    </FiltersProvider>
                </MantineModal>
            </MantineProvider>,
        );
        const pickerDropdowns = () =>
            [...document.querySelectorAll('.mantine-Popover-dropdown')].filter(
                (dropdown) => !dropdown.closest('[role="dialog"][aria-modal]'),
            );

        await user.click(screen.getAllByRole('textbox').at(-1)!);
        await waitFor(() => expect(pickerDropdowns()).toHaveLength(1));
        await user.keyboard('{Escape}');

        await waitFor(() => expect(pickerDropdowns()).toHaveLength(0));
        expect(windowEscapes).toHaveLength(1);
        expect(windowEscapes[0].defaultPrevented).toBe(true);
        expect(onModalClose).not.toHaveBeenCalled();
    });

    // Mantine's own Modal (the scheduled delivery form) ignores a prevented
    // Escape and skips one whose target is marked data-mantine-stop-propagation
    it("closes the picker and leaves Mantine's Modal open", async () => {
        const user = userEvent.setup();
        const onModalClose = vi.fn();
        renderWithProviders(
            <MantineProvider env="default">
                <Modal opened onClose={onModalClose} title="Delivery">
                    <FiltersProvider itemsMap={{}}>
                        <DateFilterInputs
                            filterType={FilterType.DATE}
                            field={field}
                            rule={initialRule}
                            onChange={() => {}}
                        />
                    </FiltersProvider>
                </Modal>
            </MantineProvider>,
        );

        await user.click(screen.getAllByRole('textbox').at(-1)!);
        await waitFor(() =>
            expect(
                document.querySelectorAll(
                    '.mantine-Popover-dropdown:not(.mantine-Modal-content *)',
                ).length,
            ).toBeGreaterThan(0),
        );
        await user.keyboard('{Escape}');

        expect(onModalClose).not.toHaveBeenCalled();
    });
});

it("keeps Mantine's Modal open on Escape after a day is picked in the multi-date picker", async () => {
    const user = userEvent.setup();
    const onModalClose = vi.fn();
    renderWithProviders(
        <MantineProvider env="default">
            <Modal opened onClose={onModalClose} title="Delivery">
                <FiltersProvider itemsMap={{}}>
                    <DateFilterInputs
                        filterType={FilterType.DATE}
                        field={dimension()}
                        rule={rule(FilterOperator.EQUALS, ['2026-01-15'])}
                        onChange={() => {}}
                    />
                </FiltersProvider>
            </Modal>
        </MantineProvider>,
    );

    await user.click(screen.getAllByRole('textbox').at(-1)!);
    // The picked day keeps focus, inside the calendar
    await user.click(
        await screen.findByRole('button', {
            name: '20 January 2026',
            hidden: true,
        }),
    );
    await user.keyboard('{Escape}');

    expect(onModalClose).not.toHaveBeenCalled();
});
