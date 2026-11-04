import {
    formatDate,
    parseDate,
    resolveParameterDefault,
    TimeFrames,
} from '@lightdash/common';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { withStoryFrame } from './decorators';
import {
    createParameterControl,
    fieldSearchRequests,
    TOTAL_TILE_COUNT,
    parameters,
    PROJECT_TIMEZONE,
    waitForApiIdle,
} from './fixtures';
import { StatefulParameterPopover } from './StatefulPopovers';
import { type DashboardStoryParameters } from './storyParameters';

const meta: Meta<typeof StatefulParameterPopover> = {
    title: 'Dashboards/Controls/Parameter popover',
    component: StatefulParameterPopover,
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
    // Each story asserts only the value searches it made itself
    beforeEach: () => {
        fieldSearchRequests.length = 0;
    },
    args: {
        isViewer: false,
        isMissingRequired: false,
        initialView: 'value',
        shadowedReservedNames: [],
        onApply: fn(),
        onCancel: fn(),
        onChooseTiles: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

/** One parameter set to EMEA; if cleared, tiles use its default. The value takes focus on open, a pick changes it, Apply hands it on. */
export const SingleValue: Story = {
    name: 'Parameter, single value',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
        ),
    },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await expect(
            canvas.getByText('If cleared, tiles use the default, Global.'),
        ).toBeVisible();
        const value = canvas.getByRole('combobox');
        await expect(value).toHaveValue('EMEA');
        await expect(value).toHaveFocus();
        await userEvent.click(value);
        await userEvent.click(
            await onPage(canvasElement).findByRole('option', { name: 'APAC' }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'APAC' }),
        );
    },
};

/** No default, a value set: if cleared, each tile keeps its own value. */
export const NoDefault: Story = {
    name: 'Parameter, no default',
    args: {
        initialControl: createParameterControl(
            [parameters.paymentsCurrency],
            'EUR',
        ),
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByText('If cleared, each tile uses its own value.'),
        ).toBeVisible();
    },
};

/** Nothing set: nothing to clear, so no caption. */
export const NoValue: Story = {
    name: 'Parameter, no value',
    args: {
        initialControl: createParameterControl(
            [parameters.paymentsCurrency],
            null,
        ),
    },
    play: async ({ canvas }) => {
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
    },
};

/** Defaults that differ (Global, Monday): values resolve per parameter, so no caption. */
export const MixedDefaults: Story = {
    name: 'Parameter, mixed defaults',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion, parameters.ordersWeekStart],
            'EMEA',
        ),
    },
    play: async ({ canvas }) => {
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
    },
};

/** A tile needs a value and there is none: the shipped input's error; Apply still works. */
export const RequiredAndMissing: Story = {
    name: 'Parameter, required and missing',
    args: {
        initialControl: createParameterControl(
            [parameters.paymentsCurrency],
            null,
        ),
        isMissingRequired: true,
    },
    play: async ({ canvas }) => {
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
        await expect(
            canvas.getByRole('button', { name: 'Apply' }),
        ).toBeEnabled();
    },
};

/** `multiple`: several of the fixed options; the default is two of them. */
export const MultipleValues: Story = {
    name: 'Parameter, multiple values',
    args: {
        initialControl: createParameterControl(
            [parameters.customersSegments],
            ['Enterprise'],
        ),
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByText(
                'If cleared, tiles use the default, Enterprise, SMB.',
            ),
        ).toBeVisible();
    },
};

/** A number with fixed options, and a value of its own allowed (`allow_custom_values`). */
export const NumberCustomValues: Story = {
    name: 'Parameter, number, own values allowed',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersMinAmount],
            175,
        ),
    },
    play: async ({ canvas, userEvent, args }) => {
        // 175 is not one of the options, and stays: own values are allowed
        await expect(canvas.getByRole('combobox')).toHaveValue('175');
        await expect(
            canvas.getByText('If cleared, tiles use the default, 100.'),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({ value: 175 }),
        );
    },
};

/** The saved value remains readable when the option list omits it. */
export const ValueOutsideOptions: Story = {
    name: 'Parameter, value outside its options',
    args: {
        initialControl: createParameterControl(
            [parameters.paymentsCurrency],
            'JPY',
        ),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('combobox')).toHaveValue('JPY');
    },
};

/** A date set, whose default is `today` on the project's calendar, read as the shipped pill shows a date. */
export const DateDefaultToday: Story = {
    name: 'Parameter, date, default today',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersStartDate],
            '2026-10-01',
        ),
    },
    play: async ({ canvas }) => {
        const today = resolveParameterDefault(
            parameters.ordersStartDate.definition,
            new Date(),
            PROJECT_TIMEZONE,
        );
        await expect(typeof today).toBe('string');
        await expect(
            canvas.getByText(
                `If cleared, tiles use the default, ${formatDate(
                    parseDate(String(today), TimeFrames.DAY),
                    TimeFrames.DAY,
                    false,
                )}.`,
            ),
        ).toBeVisible();
    },
};

/** Options searched from a field's values (`options_from_dimension`); the search sends the dashboard's other parameter values. */
export const ValuesFromField: Story = {
    name: 'Parameter, values from a field',
    args: {
        initialControl: createParameterControl(
            [parameters.paymentsMethod],
            null,
        ),
    },
    play: async ({ canvas, userEvent }) => {
        await userEvent.click(canvas.getByRole('combobox'));
        await waitFor(() =>
            expect(
                fieldSearchRequests.some(
                    (request) =>
                        request.fieldId === 'payments_payment_method' &&
                        request.parameters['orders.region'] === 'EMEA',
                ),
            ).toBe(true),
        );
        await waitForApiIdle();
    },
};

/** Combined through tile mapping: Orders and Payments Region share a tile, so it counts once; "Choose tiles" maps it. */
export const Combined: Story = {
    name: 'Parameter, combined',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion, parameters.paymentsRegion],
            'EMEA',
        ),
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(
            canvas.getByText(`Sets 3 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
        await userEvent.click(
            canvas.getByRole('button', { name: /Choose tiles/ }),
        );
        await expect(args.onChooseTiles).toHaveBeenCalled();
    },
};

/** A tile listed twice counts once: the popover counts distinct tiles. */
export const DuplicateTiles: Story = {
    name: 'Parameter, a tile listed twice',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
            ['tile-revenue', 'tile-revenue', 'tile-region-mix'],
        ),
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByText(`Sets 2 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
    },
};

/** An editor can map a control that starts with no assigned tiles. */
export const NoTiles: Story = {
    name: 'Parameter, no tiles yet',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersWeekStart],
            null,
            [],
        ),
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(
            canvas.getByText(`Sets 0 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
        await userEvent.click(
            canvas.getByRole('button', { name: /Choose tiles/ }),
        );
        await expect(args.onChooseTiles).toHaveBeenCalled();
        await expect(
            canvas.getByText(`Sets 2 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
    },
};

/** Settings groups editing actions and section placement; Back restores focus. */
export const Settings: Story = {
    name: 'Parameter, settings',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion, parameters.paymentsRegion],
            'EMEA',
        ),
        initialView: 'settings',
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const section = canvas.getByRole('combobox', { name: 'Section' });
        await expect(section).toHaveValue('No section');
        await expect(
            canvas.queryByRole('textbox', { name: 'Name' }),
        ).toBeNull();
        await expect(
            canvas.queryByRole('button', { name: 'Remove from the bar' }),
        ).toBeNull();
        await expect(
            canvas.queryByRole('button', { name: 'Move left' }),
        ).toBeNull();

        await userEvent.click(section);
        await userEvent.click(
            await onPage(canvasElement).findByRole('option', {
                name: 'Orders',
            }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        const chip = canvas.getByRole('button', { name: 'Settings: Orders' });
        await expect(chip).toHaveTextContent('Settings · Orders');
        await expect(chip).toHaveFocus();
        await expect(
            canvas.getByText(`Sets 3 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
    },
};

/** A dashboard with no sections: Settings still opens, with the section at "No section". */
export const NoSections: Story = {
    name: 'Parameter, no sections',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
        ),
    },
    parameters: {
        dashboard: { sections: [] } satisfies DashboardStoryParameters,
    },
    play: async ({ canvas, userEvent }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
        await expect(
            canvas.getByRole('combobox', { name: 'Section' }),
        ).toHaveValue('No section');
    },
};

/** Its key overrides a system variable: the shipped warning beside the name. */
export const ShadowsSystemVariable: Story = {
    name: 'Parameter, overrides a system variable',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
        ),
        shadowedReservedNames: [parameters.ordersRegion.key],
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        // The warning sits right after the name, as on the shipped pill
        const warning =
            canvas.getByText('Region').parentElement?.nextElementSibling ??
            null;
        await expect(warning?.tagName.toLowerCase()).toBe('svg');
        if (warning) await userEvent.hover(warning);
        await expect(
            await onPage(canvasElement).findByRole('tooltip'),
        ).toHaveTextContent(
            'Parameter orders.region overrides the system variable',
        );
    },
};

/** A viewer sets the value only: no rename, tiles or settings. */
export const Viewer: Story = {
    name: 'Parameter, viewer',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
        ),
        isViewer: true,
    },
    play: async ({ canvas }) => {
        for (const name of [/Choose tiles/, /^Settings/, /^Rename$/])
            await expect(canvas.queryByRole('button', { name })).toBeNull();
    },
};

/** A viewer's control on no tiles cannot apply either. */
export const ViewerNoTiles: Story = {
    name: 'Parameter, viewer, no tiles',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
            [],
        ),
        isViewer: true,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const apply = canvas.getByRole('button', { name: 'Apply' });
        await expect(apply).toBeDisabled();
        // A viewer has no Choose tiles: the reason says what it sets instead
        const wrapper = apply.parentElement;
        await expect(wrapper).not.toBeNull();
        if (wrapper) await userEvent.hover(wrapper);
        await expect(
            await onPage(canvasElement).findByRole('tooltip'),
        ).toHaveTextContent('Sets no tiles');
    },
};

/** The name is edited in place; Cancel puts the opening name back. */
export const RenameThenCancel: Story = {
    name: 'Parameter, rename, then cancel',
    args: {
        initialControl: createParameterControl(
            [parameters.ordersRegion],
            'EMEA',
        ),
    },
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
        await userEvent.click(canvas.getByRole('button', { name: 'Rename' }));
        await expect(
            canvas.getByRole('textbox', { name: 'Name' }),
        ).toHaveFocus();
        await userEvent.keyboard('Sales region{Enter}');
        await expect(
            canvas.getByRole('dialog', { name: 'Sales region' }),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
        await expect(args.onCancel).toHaveBeenCalled();
        await expect(
            canvas.getByRole('dialog', { name: 'Region' }),
        ).toBeVisible();
    },
};
