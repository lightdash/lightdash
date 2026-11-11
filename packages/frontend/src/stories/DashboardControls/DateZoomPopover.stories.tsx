import { DateGranularity } from '@lightdash/common';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps } from 'react';
import { expect, fn, within } from 'storybook/test';
import { withStoryFrame } from './decorators';
import {
    createDateZoomControl,
    enabledGranularities,
    TOTAL_TILE_COUNT,
} from './fixtures';
import {
    StatefulDateZoomPopover,
    StatefulDefaultZoomPopover,
} from './StatefulDateZoomPopovers';

const meta: Meta = {
    title: 'Dashboards/Controls/Date zoom popover',
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
};

export default meta;

type NamedStory = StoryObj<ComponentProps<typeof StatefulDateZoomPopover>>;
type DefaultStory = StoryObj<ComponentProps<typeof StatefulDefaultZoomPopover>>;

const named = {
    render: (args) => <StatefulDateZoomPopover {...args} />,
    args: {
        initialControl: createDateZoomControl(),
        granularities: enabledGranularities,
        isViewer: false,
        isNew: false,
        tileCount: 3,
        viewerGranularity: null,
        initialView: 'value',
        onApply: fn(),
        onViewerApply: fn(),
        onCancel: fn(),
        onChooseTiles: fn(),
    },
} satisfies NamedStory;

const defaultZoom = {
    render: (args) => <StatefulDefaultZoomPopover {...args} />,
    args: {
        enabledGranularities,
        defaultGranularity: DateGranularity.MONTH,
        isViewer: false,
        tileCount: 4,
        viewerGranularity: null,
        initialView: 'value',
        onApply: fn(),
        onViewerApply: fn(),
        onCancel: fn(),
    },
} satisfies DefaultStory;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

/** A named zoom at Week on 3 tiles: the grain takes focus, a pick changes it, Apply hands the zoom on. */
export const Named: NamedStory = {
    ...named,
    name: 'Named zoom, value',
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        const grain = canvas.getByRole('combobox', { name: 'Revenue zoom' });
        await expect(grain).toHaveValue('Week');
        await expect(grain).toHaveFocus();
        await userEvent.click(
            canvas.getByRole('button', {
                name: `Zooms 3 of ${TOTAL_TILE_COUNT} tiles. Choose tiles`,
            }),
        );
        await expect(args.onChooseTiles).toHaveBeenCalled();
        await expect(
            canvas.getByRole('button', { name: 'Settings' }),
        ).toBeVisible();
        await userEvent.click(grain);
        await userEvent.click(
            await onPage(canvasElement).findByRole('option', { name: 'Month' }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({ granularity: 'Month' }),
        );
    },
};

/** In the Orders section: the Settings chip names it. */
export const NamedWithSection: NamedStory = {
    ...named,
    name: 'Named zoom, in a section',
    args: {
        ...named.args,
        initialControl: createDateZoomControl({ sectionId: 'section-orders' }),
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('button', { name: 'Settings: Orders' }),
        ).toHaveTextContent('Settings · Orders');
    },
};

/** Hidden from viewers: the switch is off, and its grain still applies to its tiles. */
export const NamedHidden: NamedStory = {
    ...named,
    name: 'Named zoom, hidden for viewers',
    args: {
        ...named.args,
        initialControl: createDateZoomControl({ hidden: true }),
        initialView: 'settings',
    },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('switch', { name: 'Show to viewers' }),
        ).not.toBeChecked();
        await expect(
            canvas.getByText(
                'The grain still applies to its tiles when hidden.',
            ),
        ).toBeVisible();
    },
};

/** Just added: the name takes focus, it zooms no tiles yet, and Apply waits for one. */
export const NamedNew: NamedStory = {
    ...named,
    name: 'Named zoom, new',
    args: {
        ...named.args,
        initialControl: createDateZoomControl({
            uuid: 'zoom-new',
            name: 'Date zoom',
            granularity: DateGranularity.DAY,
        }),
        isNew: true,
        tileCount: 0,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const nameInput = canvas.getByRole('textbox', { name: 'Name' });
        await expect(nameInput).toHaveFocus();
        await expect(nameInput).toHaveValue('Date zoom');
        await expect(
            canvas.getByRole('button', {
                name: 'Zooms no tiles. Choose tiles',
            }),
        ).toBeVisible();
        const apply = canvas.getByRole('button', { name: 'Apply' });
        await expect(apply).toBeDisabled();
        if (apply.parentElement) await userEvent.hover(apply.parentElement);
        await expect(
            await onPage(canvasElement).findByRole('tooltip'),
        ).toHaveTextContent('Choose at least one tile');
    },
};

/** The name is edited in place; Cancel puts the opening name back. */
export const NamedRenameThenCancel: NamedStory = {
    ...named,
    name: 'Named zoom, rename, then cancel',
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Rename' }));
        await expect(
            canvas.getByRole('textbox', { name: 'Name' }),
        ).toHaveFocus();
        await userEvent.keyboard('Weekly revenue{Enter}');
        await expect(
            canvas.getByRole('dialog', { name: 'Weekly revenue' }),
        ).toBeVisible();
        await expect(
            canvas.getByRole('button', { name: 'Rename' }),
        ).toHaveFocus();
        await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
        await expect(args.onCancel).toHaveBeenCalled();
        await expect(
            canvas.getByRole('dialog', { name: 'Revenue zoom' }),
        ).toBeVisible();
    },
};

/** Settings: its section and whether viewers see it; Back returns focus to the chip. */
export const NamedSettings: NamedStory = {
    ...named,
    name: 'Named zoom, settings',
    args: { ...named.args, initialView: 'settings' },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await expect(
            canvas.getByRole('button', { name: 'Back' }),
        ).toHaveFocus();
        const section = canvas.getByRole('combobox', { name: 'Section' });
        await expect(section).toHaveValue('No section');
        await userEvent.click(section);
        await userEvent.click(
            await onPage(canvasElement).findByRole('option', {
                name: 'Orders',
            }),
        );
        await userEvent.click(
            canvas.getByText('Show to viewers', { exact: true }),
        );
        await expect(
            canvas.getByRole('switch', { name: 'Show to viewers' }),
        ).not.toBeChecked();
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        await expect(
            canvas.getByRole('button', { name: 'Settings: Orders' }),
        ).toHaveFocus();
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith(
            expect.objectContaining({
                sectionId: 'section-orders',
                hidden: true,
            }),
        );
    },
};

/** The dashboard's custom grains follow the standard ones, under "Custom". */
export const NamedCustomGrains: NamedStory = {
    ...named,
    name: 'Named zoom, custom grains',
    args: {
        ...named.args,
        granularities: [
            ...enabledGranularities,
            'retail_week',
            'fiscal_quarter',
        ],
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        await userEvent.click(
            canvas.getByRole('combobox', { name: 'Revenue zoom' }),
        );
        const page = onPage(canvasElement);
        await expect(await page.findByText('Custom')).toBeVisible();
        const options = page
            .getAllByRole('option')
            .map((option) => option.textContent);
        await expect(options).toEqual([
            'Day',
            'Week',
            'Month',
            'Quarter',
            'Year',
            'Fiscal quarter',
            'Retail week',
        ]);
    },
};

/** A viewer picks a grain only: no rename, tiles or settings; at the saved grain, no caption. */
export const NamedViewer: NamedStory = {
    ...named,
    name: 'Named zoom, viewer',
    args: { ...named.args, isViewer: true },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('combobox', { name: 'Revenue zoom' }),
        ).toHaveValue('Week');
        for (const name of [/Choose tiles/, /^Settings/, /^Rename$/])
            await expect(canvas.queryByRole('button', { name })).toBeNull();
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
    },
};

/** A viewer's pick differs from the saved grain: clearing goes back to Week. */
export const NamedViewerPick: NamedStory = {
    ...named,
    name: 'Named zoom, viewer, own pick',
    args: {
        ...named.args,
        isViewer: true,
        viewerGranularity: DateGranularity.MONTH,
    },
    play: async ({ canvas, userEvent, args }) => {
        const grain = canvas.getByRole('combobox', { name: 'Revenue zoom' });
        await expect(grain).toHaveValue('Month');
        await expect(
            canvas.getByText('If cleared, tiles use the saved grain, Week.'),
        ).toBeVisible();
        await userEvent.click(
            canvas.getByRole('button', { name: 'Clear grain' }),
        );
        await expect(grain).toHaveValue('');
        await expect(grain).toHaveAttribute('placeholder', 'Week');
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onViewerApply).toHaveBeenCalledWith(null);
    },
};

/** Default zoom at Month, reaching the 4 tiles in no named zoom; clearing it leaves tiles their own grain. */
export const Default: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, value',
    play: async ({ canvas, userEvent, args }) => {
        const grain = canvas.getByRole('combobox', { name: 'Default zoom' });
        await expect(grain).toHaveValue('Month');
        await expect(grain).toHaveFocus();
        await expect(canvas.getByText('Zooms the other 4 tiles')).toBeVisible();
        await expect(
            canvas.queryByRole('button', { name: /Choose tiles/ }),
        ).toBeNull();
        await expect(
            canvas.queryByRole('button', { name: 'Rename' }),
        ).toBeNull();
        await expect(
            canvas.getByRole('button', { name: 'Settings: 5 grains' }),
        ).toBeVisible();
        await expect(
            canvas.getByText('If cleared, tiles keep their own grain.'),
        ).toBeVisible();
        await userEvent.click(
            canvas.getByRole('button', { name: 'Clear grain' }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith({
            enabledGranularities,
            defaultGranularity: null,
        });
    },
};

/** No default: the select reads None, with nothing to clear. */
export const DefaultNone: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, no default',
    args: { ...defaultZoom.args, defaultGranularity: null },
    play: async ({ canvas }) => {
        const grain = canvas.getByRole('combobox', { name: 'Default zoom' });
        await expect(grain).toHaveValue('');
        await expect(grain).toHaveAttribute('placeholder', 'None');
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
    },
};

/** Settings lists every standard grain, then the dashboard's custom ones; checking one adds it. */
export const DefaultSettings: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, settings, custom grain',
    args: {
        ...defaultZoom.args,
        enabledGranularities: [...enabledGranularities, 'fiscal_quarter'],
        initialView: 'settings',
    },
    play: async ({ canvas, userEvent }) => {
        await expect(canvas.getByText('Grains viewers can pick')).toBeVisible();
        await expect(
            canvas.getByRole('checkbox', { name: 'Second' }),
        ).not.toBeChecked();
        await expect(
            canvas.getByRole('checkbox', { name: 'Fiscal quarter' }),
        ).toBeChecked();
        const retail = canvas.getByRole('checkbox', { name: 'Retail week' });
        await expect(retail).not.toBeChecked();
        await userEvent.click(retail);
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        await expect(
            canvas.getByRole('button', { name: 'Settings: 7 grains' }),
        ).toHaveFocus();
    },
};

/** One grain left: viewers need it, so it cannot be unchecked. */
export const DefaultSettingsLocked: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, settings, one grain',
    args: {
        ...defaultZoom.args,
        enabledGranularities: [DateGranularity.MONTH],
        initialView: 'settings',
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const month = canvas.getByRole('checkbox', { name: 'Month' });
        await expect(month).toBeChecked();
        await expect(month).toBeDisabled();
        await userEvent.hover(canvas.getByText('Month'));
        await expect(
            await onPage(canvasElement).findByRole('tooltip'),
        ).toHaveTextContent('Viewers need at least one grain');
    },
};

/** Unchecking the default grain clears the default, as the shipped menu did. */
export const DefaultUncheckClears: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, unchecking the default clears it',
    args: { ...defaultZoom.args, initialView: 'settings' },
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('checkbox', { name: 'Month' }));
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        await expect(
            canvas.getByRole('combobox', { name: 'Default zoom' }),
        ).toHaveValue('');
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onApply).toHaveBeenCalledWith({
            enabledGranularities: [
                DateGranularity.DAY,
                DateGranularity.WEEK,
                DateGranularity.QUARTER,
                DateGranularity.YEAR,
            ],
            defaultGranularity: null,
        });
    },
};

/** A viewer at Week over a Month default: clearing goes back to the default. */
export const DefaultViewer: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, viewer',
    args: {
        ...defaultZoom.args,
        isViewer: true,
        viewerGranularity: DateGranularity.WEEK,
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(
            canvas.getByText('If cleared, tiles use the default, Month.'),
        ).toBeVisible();
        await expect(
            canvas.queryByRole('button', { name: /^Settings/ }),
        ).toBeNull();
        await userEvent.click(
            canvas.getByRole('button', { name: 'Clear grain' }),
        );
        await expect(
            canvas.getByRole('combobox', { name: 'Default zoom' }),
        ).toHaveAttribute('placeholder', 'Month');
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onViewerApply).toHaveBeenCalledWith(null);
    },
};

/** No default: a viewer's pick, once cleared, leaves tiles their own grain. */
export const DefaultViewerNone: DefaultStory = {
    ...defaultZoom,
    name: 'Default zoom, viewer, no default',
    args: { ...defaultZoom.args, isViewer: true, defaultGranularity: null },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        const grain = canvas.getByRole('combobox', { name: 'Default zoom' });
        await expect(grain).toHaveAttribute('placeholder', 'None');
        await expect(canvas.queryByText(/^If cleared,/)).toBeNull();
        await userEvent.click(grain);
        await userEvent.click(
            await onPage(canvasElement).findByRole('option', { name: 'Day' }),
        );
        await expect(
            canvas.getByText('If cleared, tiles keep their own grain.'),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
        await expect(args.onViewerApply).toHaveBeenCalledWith('Day');
    },
};
