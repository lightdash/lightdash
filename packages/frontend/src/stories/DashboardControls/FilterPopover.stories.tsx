import { FilterOperator, WeekDay } from '@lightdash/common';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { withStoryFrame } from './decorators';
import { fields, rules, TOTAL_TILE_COUNT, waitForApiIdle } from './fixtures';
import { StatefulFilterPopover } from './StatefulPopovers';
import { type DashboardStoryParameters } from './storyParameters';

const meta: Meta<typeof StatefulFilterPopover> = {
    title: 'Dashboards/Controls/Filter popover',
    component: StatefulFilterPopover,
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
    args: {
        isViewer: false,
        isOwnFilter: false,
        isCreatingNew: false,
        canManageExplore: true,
        appliedTileCount: TOTAL_TILE_COUNT,
        isAsking: false,
        initialView: 'value',
        onApply: fn(),
        onCancel: fn(),
        onChooseTiles: fn(),
        onEditRules: fn(),
        onChangeOthers: fn(),
        onDraftChange: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Menus and lists portal to the page, outside the story's canvas
const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

const lastOf = <T,>(items: T[]): T => {
    const item = items[items.length - 1];
    if (item === undefined) throw new Error('Expected at least one element');
    return item;
};

// Opens the header's operator menu and waits for it to settle
const openOperatorMenu = async (
    canvas: ReturnType<typeof within>,
    canvasElement: HTMLElement,
    click: (element: Element) => Promise<void>,
) => {
    // The first load can still be settling: wait for the button, then the menu
    await click(await canvas.findByRole('button', { name: /^Operator:/ }));
    const page = onPage(canvasElement);
    await waitFor(() => expect(page.getByRole('menu')).toBeVisible());
};

/** Multiple values with suggestions, paste detection and "Edit filter values". */
export const TextIsWithSuggestions: Story = {
    name: 'Text, is, with suggestions',
    args: { initialRule: rules.firstName, field: fields.firstName },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Aaron')).toBeVisible();
        // As the shipped editor: a text value takes focus, its list shut
        await expect(
            lastOf(within(canvas.getByRole('dialog')).getAllByRole('textbox')),
        ).toHaveFocus();
        await waitForApiIdle();
    },
};

/** The operator menu: every text operator, then "Allow multiple values"; a pick changes the rule Apply hands on. */
export const TextOperatorMenu: Story = {
    name: 'Text, operator menu',
    args: { initialRule: rules.firstName, field: fields.firstName },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        const page = onPage(canvasElement);
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        for (const operator of [/^starts with$/, /^includes$/, /^is null$/])
            await expect(
                page.getByRole('menuitem', { name: operator }),
            ).toBeVisible();
        await expect(
            page.getByRole('menuitemcheckbox', {
                name: /^Allow multiple values/,
            }),
        ).toBeChecked();

        await userEvent.click(
            page.getByRole('menuitem', { name: /^starts with$/ }),
        );
        await expect(
            canvas.getByRole('button', { name: 'Operator: starts with' }),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({ operator: FilterOperator.STARTS_WITH }),
        );
        await waitForApiIdle();
    },
};

/** Suggestions that fail to load: the picker's error and retry. */
export const TextSuggestionsError: Story = {
    name: 'Text, suggestions fail to load',
    args: { initialRule: rules.city, field: fields.city, appliedTileCount: 4 },
    play: async () => {
        await waitForApiIdle();
    },
};

/** "Allow multiple values" off: one value; checking it keeps the menu open and the operator, and the input takes multiple. */
export const TextOneValueOnly: Story = {
    name: 'Text, one value only',
    args: { initialRule: rules.firstNameSingle, field: fields.firstName },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        const item = page.getByRole('menuitemcheckbox', {
            name: /^Allow multiple values/,
        });
        await expect(item).not.toBeChecked();
        await expect(item).toHaveAccessibleDescription(
            'Viewers pick one value',
        );

        await userEvent.click(item);
        // The menu stays open, its operators still listed
        await expect(
            page.getByRole('menuitem', { name: /^starts with$/ }),
        ).toBeInTheDocument();
        await expect(item).toBeChecked();
        await expect(item).toHaveAccessibleDescription(
            'Viewers can pick multiple values',
        );
        await expect(
            canvas.getByRole('button', { name: /^Operator:/ }),
        ).toHaveAccessibleName('Operator: is');

        // Multiple values now: a second pick adds to Aaron
        await userEvent.keyboard('{Escape}');
        const dialog = within(canvas.getByRole('dialog'));
        const valueInput = lastOf(dialog.getAllByRole('textbox'));
        await userEvent.click(valueInput);
        await userEvent.type(valueInput, 'Bella');
        await userEvent.click(
            await page.findByRole('option', { name: 'Bella' }),
        );
        await expect(dialog.getByText('Aaron')).toBeVisible();
        await expect(dialog.getByText('Bella')).toBeVisible();
        await waitForApiIdle();
    },
};

/** A new filter switched to "is null": the operator is the value, so Apply hands on a filter that is on. */
export const NewFilterIsNull: Story = {
    name: 'Text, new filter, is null',
    args: {
        initialRule: { ...rules.firstName, values: [], disabled: true },
        field: fields.firstName,
    },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await userEvent.click(
            onPage(canvasElement).getByRole('menuitem', { name: /^is null$/ }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({
                operator: FilterOperator.NULL,
                disabled: false,
            }),
        );
        await waitForApiIdle();
    },
};

/** No value to set: the header and footer only. */
export const TextIsNull: Story = {
    name: 'Text, is null',
    args: { initialRule: rules.cityIsNull, field: fields.city },
};

/** A SQL tile's column: no field, so typed values without suggestions. */
export const SqlColumnIs: Story = {
    name: 'SQL column, is',
    args: { initialRule: rules.sqlRegion, field: null, appliedTileCount: 3 },
};

/** A range, from and to. */
export const NumberIsBetween: Story = {
    name: 'Number, is between',
    args: { initialRule: rules.amountBetween, field: fields.amount },
};

/** Outside a range. */
export const NumberIsNotBetween: Story = {
    name: 'Number, is not between',
    args: { initialRule: rules.amountNotBetween, field: fields.amount },
};

/** "Allow multiple values" off: one number input. */
export const NumberIsSingleValue: Story = {
    name: 'Number, is, single value',
    args: { initialRule: rules.amountSingle, field: fields.amount },
};

/** One number to compare against: no "Allow multiple values"; Cancel puts the value back, Apply hands the edit on. */
export const NumberIsGreaterThan: Story = {
    name: 'Number, is greater than',
    args: { initialRule: rules.amountGreater, field: fields.amount },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await expect(
            onPage(canvasElement).queryByRole('menuitemcheckbox', {
                name: /^Allow multiple values/,
            }),
        ).toBeNull();
        await userEvent.keyboard('{Escape}');

        const valueInput = () =>
            within(canvas.getByRole('dialog')).getByRole('spinbutton');
        await userEvent.clear(valueInput());
        await userEvent.type(valueInput(), '250');
        await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
        await expect(args.onCancel).toHaveBeenCalled();
        await expect(valueInput()).toHaveValue(100);

        await userEvent.clear(valueInput());
        await userEvent.type(valueInput(), '250');
        // The shipped number input hands its text on after a 300ms pause
        await waitFor(() =>
            expect(args.onDraftChange).toHaveBeenLastCalledWith(
                expect.objectContaining({ values: [250] }),
            ),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({ values: [250] }),
        );
    },
};

/** Over 500 values: the summary, and "Edit filter values" with Import CSV. */
export const NumberManyValues: Story = {
    name: 'Number, many values',
    args: { initialRule: rules.amountMany, field: fields.amount },
};

/** Several days picked on one calendar. */
export const DateIsSeveralDays: Story = {
    name: 'Date, is, several days',
    args: { initialRule: rules.orderDateIs, field: fields.orderDate },
};

/** A timestamp: a date and a time. */
export const TimestampIs: Story = {
    name: 'Timestamp, is',
    args: { initialRule: rules.createdAtIs, field: fields.createdAt },
};

/** One day to compare against; a date has no "Allow multiple values". */
export const DateIsAfter: Story = {
    name: 'Date, is after',
    args: { initialRule: rules.orderDateAfter, field: fields.orderDate },
    play: async ({ canvas, canvasElement, userEvent }) => {
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await expect(
            onPage(canvasElement).queryByRole('menuitemcheckbox', {
                name: /^Allow multiple values/,
            }),
        ).toBeNull();
    },
};

/** A week dimension: the week picker. */
export const DateIsAfterWeek: Story = {
    name: 'Date, is after, week',
    args: { initialRule: rules.orderWeekAfter, field: fields.orderWeek },
};

/** The project's weeks start on Sunday: the week picker's calendar does too. */
export const DateIsAfterWeekStartingSunday: Story = {
    name: 'Date, is after, week, starting Sunday',
    args: { initialRule: rules.orderWeekAfter, field: fields.orderWeek },
    parameters: {
        dashboard: {
            startOfWeek: WeekDay.SUNDAY,
        } satisfies DashboardStoryParameters,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        // The week picker is the dialog's one text input
        await userEvent.click(
            within(canvas.getByRole('dialog')).getByRole('textbox'),
        );
        const weekdays =
            await onPage(canvasElement).findAllByRole('columnheader');
        await expect(weekdays[0]).toHaveTextContent(/^Su/);
        await expect(weekdays[1]).toHaveTextContent(/^Mo/);
    },
};

/** A month dimension: the month and year picker. */
export const DateIsAfterMonth: Story = {
    name: 'Date, is after, month',
    args: { initialRule: rules.orderMonthAfter, field: fields.orderMonth },
};

/** A quarter dimension: the quarter picker. */
export const DateIsAfterQuarter: Story = {
    name: 'Date, is after, quarter',
    args: { initialRule: rules.orderQuarterAfter, field: fields.orderQuarter },
};

/** A year dimension: the year picker. */
export const DateIsAfterYear: Story = {
    name: 'Date, is after, year',
    args: { initialRule: rules.orderYearAfter, field: fields.orderYear },
};

/** Relative: in the last 14 completed days. In the next and not in the past share it. */
export const DateInThePastCompleted: Story = {
    name: 'Date, in the past, completed',
    args: { initialRule: rules.orderDatePast, field: fields.orderDate },
};

/** This month so far, today included. */
export const DateInTheCurrentToDate: Story = {
    name: 'Date, in the current, to date',
    args: {
        initialRule: rules.orderDateCurrentToDate,
        field: fields.orderDate,
    },
};

/** This month so far, up to yesterday. */
export const DateInTheCurrentExcludingToday: Story = {
    name: 'Date, in the current, to date, excluding today',
    args: {
        initialRule: rules.orderDateCurrentExcludeToday,
        field: fields.orderDate,
    },
};

/** Quarter to date. */
export const DatePeriodToDate: Story = {
    name: 'Date, period to date',
    args: {
        initialRule: rules.orderDatePeriodToDate,
        field: fields.orderDate,
    },
};

/** A date range: the two inputs side by side. */
export const DateIsBetween: Story = {
    name: 'Date, is between',
    args: { initialRule: rules.orderDateBetween, field: fields.orderDate },
};

/** A timestamp range: the pickers stack, as they are wider than the popover. */
export const TimestampIsBetween: Story = {
    name: 'Timestamp, is between',
    args: { initialRule: rules.createdBetween, field: fields.createdAt },
};

/** Yes or no, picked from a list; no "Allow multiple values". */
export const YesNoIs: Story = {
    name: 'Yes/no, is',
    args: { initialRule: rules.isCompleted, field: fields.isCompleted },
    play: async ({ canvas, canvasElement, userEvent }) => {
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await expect(
            onPage(canvasElement).queryByRole('menuitemcheckbox', {
                name: /^Allow multiple values/,
            }),
        ).toBeNull();
    },
};

/** The name is edited in place; Cancel puts the opening name back. */
export const RenameThenCancel: Story = {
    name: 'Rename, then cancel',
    args: { initialRule: rules.amountBetween, field: fields.amount },
    play: async ({ canvas, userEvent }) => {
        // By keyboard, so no pointer rests on the pencil's tooltip
        canvas.getByRole('button', { name: 'Rename' }).focus();
        await userEvent.keyboard('{Enter}');
        // The name input takes focus on open: type straight into it
        await expect(
            canvas.getByRole('textbox', { name: 'Name' }),
        ).toHaveFocus();
        await userEvent.keyboard('Order amount{Enter}');
        await expect(
            canvas.getByRole('dialog', { name: 'Order amount' }),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
        await expect(
            canvas.getByRole('dialog', { name: 'Amount' }),
        ).toBeVisible();
    },
};

/** Section, then the shipped Required and Lock; "Allow multiple values" lives in the operator menu. */
export const Settings: Story = {
    name: 'Settings',
    args: {
        initialRule: rules.statusSettings,
        field: fields.status,
        initialView: 'settings',
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('combobox', { name: 'Section' }),
        ).toBeVisible();
        await expect(
            canvas.queryByRole('switch', { name: 'Multiple values' }),
        ).toBeNull();
        await expect(canvas.queryByText(/multiple values/i)).toBeNull();
        // Reordering is Alt+arrow on a focused pill, not a Settings action
        await expect(
            canvas.queryByRole('button', { name: 'Move left' }),
        ).toBeNull();
    },
};

/** Required as one of a group, met while Customer city has a value: Apply is open. */
export const RequiredOneOfAGroup: Story = {
    name: 'Settings, required, one of a group',
    args: {
        initialRule: rules.regionInGroup,
        field: fields.region,
        initialView: 'settings',
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('button', { name: 'Apply' }),
        ).toBeEnabled();
    },
};

/** Required with no value, which an editor may apply (viewers set it); an alternative joins it through the draft, so the summary names it. */
export const SettingsRequiredWithAlternative: Story = {
    name: 'Settings, required, adding an alternative',
    args: {
        initialRule: rules.regionRequiredAlone,
        field: fields.region,
        initialView: 'settings',
    },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        const page = onPage(canvasElement);
        await expect(
            canvas.getByRole('button', { name: 'Apply' }),
        ).toBeEnabled();
        await userEvent.click(
            canvas.getByRole('button', { name: 'Add an alternative filter' }),
        );
        // The shipped card's picker opens with the filters it can pair with
        const picker = await canvas.findByRole('combobox', {
            name: 'Add filter to rule',
        });
        await userEvent.click(picker);
        await userEvent.click(
            await page.findByRole('option', { name: /^Open orders/ }),
        );
        await expect(args.onChangeOthers).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'filter-status-open' }),
        ]);
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        await expect(
            await canvas.findByRole('button', {
                name: 'Settings: Required, or Open orders',
            }),
        ).toBeVisible();
        await expect(
            canvas.getByRole('button', { name: 'Apply' }),
        ).toBeEnabled();
    },
};

/** Locked and required with no value: no viewer could set it, so Apply is blocked and says why. */
export const RequiredAndLockedNoValue: Story = {
    name: 'Required and locked, no value',
    args: { initialRule: rules.statusRequiredLocked, field: fields.status },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('button', { name: 'Apply' }),
        ).toBeDisabled();
        await waitForApiIdle();
    },
};

/** A viewer cleared a required filter: Apply waits for a value. */
export const ViewerRequiredCleared: Story = {
    name: 'Viewer, required filter cleared',
    args: {
        initialRule: {
            ...rules.statusSaved,
            values: [],
            disabled: false,
            required: true,
        },
        field: fields.status,
        isViewer: true,
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('button', { name: 'Apply' }),
        ).toBeDisabled();
        await waitForApiIdle();
    },
};

/** Clearing the last value of a locked, required filter is refused, by keyboard and by an operator that would empty it. */
export const RequiredAndLockedRefusal: Story = {
    name: 'Required and locked, clearing refused',
    args: {
        initialRule: {
            ...rules.statusRequiredLocked,
            values: ['completed'],
            disabled: false,
        },
        field: fields.status,
    },
    // By keyboard: Backspace on the last value is refused, and focus comes
    // back to the input
    play: async ({ canvas, canvasElement, userEvent }) => {
        const valueInput = lastOf(
            within(canvas.getByRole('dialog')).getAllByRole('textbox'),
        );
        valueInput.focus();
        await userEvent.keyboard('{Backspace}');
        await expect(await canvas.findByRole('alert')).toBeVisible();
        // The refused edit remounts the form; focus returns to its input
        await waitFor(() =>
            expect(
                canvasElement.ownerDocument.activeElement?.closest(
                    '[role="dialog"]',
                ),
            ).not.toBeNull(),
        );
        await expect(canvasElement.ownerDocument.activeElement?.tagName).toBe(
            'INPUT',
        );

        // "starts with" would start empty: refused too, the operator kept
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await userEvent.click(
            onPage(canvasElement).getByRole('menuitem', {
                name: /^starts with$/,
            }),
        );
        await expect(
            canvas.getByRole('button', { name: /^Operator:/ }),
        ).toHaveAccessibleName('Operator: is');
        await expect(await canvas.findByRole('alert')).toBeVisible();
        await waitForApiIdle();
    },
};

/** Another pill was clicked with changes pending. */
export const ChangesPending: Story = {
    name: 'Changes pending, another filter clicked',
    args: {
        initialRule: { ...rules.firstName, values: ['Aaron', 'Bella', 'Amy'] },
        field: fields.firstName,
        isAsking: true,
    },
};

/** A viewer's own filter: tiles, the note and the clear X; no Settings. */
export const ViewerOwnFilter: Story = {
    name: 'Viewer, own filter',
    args: {
        initialRule: rules.firstName,
        field: fields.firstName,
        isViewer: true,
        isOwnFilter: true,
        appliedTileCount: 4,
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(
            canvas.queryByRole('button', { name: /^Settings/ }),
        ).toBeNull();
        await userEvent.click(
            canvas.getByRole('button', { name: /Choose tiles/ }),
        );
        await expect(args.onChooseTiles).toHaveBeenCalled();
        await waitForApiIdle();
    },
};

/** A viewer on a saved filter: the value only, no editor parts, no "Allow multiple values". */
export const ViewerSavedFilter: Story = {
    name: 'Viewer, saved filter',
    args: {
        initialRule: rules.statusSaved,
        field: fields.status,
        isViewer: true,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        for (const name of [/Choose tiles/, /^Settings/, /^Rename$/])
            await expect(canvas.queryByRole('button', { name })).toBeNull();
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await expect(
            onPage(canvasElement).queryByRole('menuitemcheckbox', {
                name: /^Allow multiple values/,
            }),
        ).toBeNull();
        await waitForApiIdle();
    },
};

/** A viewer's new filter: the shipped "Value" label above the value. */
export const ViewerNewFilter: Story = {
    name: 'Viewer, new filter',
    args: {
        initialRule: { ...rules.firstName, values: [], disabled: true },
        field: fields.firstName,
        isViewer: true,
        isOwnFilter: true,
        isCreatingNew: true,
    },
};

/** Every setting on, 4 of 6 tiles: the Settings chip wraps its summary. */
export const BusyFooter: Story = {
    name: 'Footer, busy',
    args: {
        initialRule: rules.statusBusy,
        field: fields.status,
        appliedTileCount: 4,
    },
};

/** A viewer changed a saved filter: "Reset to original" puts its saved value back. */
export const ViewerSavedFilterReset: Story = {
    name: 'Viewer, saved filter, reset',
    args: {
        initialRule: rules.statusSaved,
        field: fields.status,
        isViewer: true,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const reset = () =>
            canvas.queryByRole('button', {
                name: 'Reset filter to original value',
            });
        await expect(reset()).toBeNull();
        await openOperatorMenu(canvas, canvasElement, (element) =>
            userEvent.click(element),
        );
        await userEvent.click(
            onPage(canvasElement).getByRole('menuitem', { name: /^is null$/ }),
        );
        await userEvent.click(reset()!);
        await expect(
            canvas.getByRole('button', { name: /^Operator:/ }),
        ).toHaveAccessibleName('Operator: is');
        await waitForApiIdle();
    },
};
