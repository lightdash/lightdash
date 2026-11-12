import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import {
    createDateZoomControl,
    dateZoomSettings,
    TOTAL_TILE_COUNT,
    waitForApiIdle,
} from './fixtures';
import { type DashboardStoryParameters } from './storyParameters';

// The real bar: date zooms are pills among the controls, the default zoom
// at the strip's start; each opens its popover
const meta: Meta<typeof AddControlFlow> = {
    title: 'Dashboards/Controls/Date zoom popover',
    component: AddControlFlow,
    parameters: {
        layout: 'fullscreen',
        dashboard: {
            dateZoom: dateZoomSettings,
        } satisfies DashboardStoryParameters,
    },
    decorators: [withStoryFrame],
};

export default meta;
type Story = StoryObj<typeof meta>;

type Page = ReturnType<typeof within>;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);
// By its marker: the pill's CSS adds to the name a browser computes. The
// bar draws its pills once the dashboard's fields have settled. A pill reads
// "Revenue zoom is Week", the default zoom "Default zoom Month"
const pill = (_page: Page, name: string) =>
    waitFor(
        () => {
            const found = [
                ...document.querySelectorAll<HTMLElement>(
                    '[data-default-date-zoom], [data-date-zoom-pill]',
                ),
            ].find((element) => element.textContent?.startsWith(`${name} `));
            if (found === undefined) throw new Error(`No ${name} pill`);
            return found;
        },
        { timeout: 10000 },
    );
const popover = (page: Page) => page.findByRole('dialog');

/** "Revenue zoom is Week" opens its popover: a pick and Apply change the pill. */
export const Named: Story = {
    name: 'Named zoom, value',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        await userEvent.click(await pill(page, 'Revenue zoom'));
        const dialog = within(await popover(page));
        const grain = dialog.getByRole('combobox', { name: 'Revenue zoom' });
        await expect(grain).toHaveValue('Week');
        await waitFor(() => expect(grain).toHaveFocus());
        // The popover fades in
        await waitFor(() =>
            expect(
                dialog.getByRole('button', {
                    name: 'Applies to 2 of 5 tiles. Choose tiles',
                }),
            ).toBeVisible(),
        );
        await userEvent.click(grain);
        await userEvent.click(
            await page.findByRole('option', { name: 'Month' }),
        );
        await userEvent.click(dialog.getByRole('button', { name: 'Apply' }));
        await expect(await pill(page, 'Revenue zoom')).toHaveTextContent(
            'Revenue zoom is Month',
        );
    },
};

/** Settings: a section moves the pill into it at once; hidden from viewers shows the eye-off. */
export const NamedSettings: Story = {
    name: 'Named zoom, settings',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        await userEvent.click(await pill(page, 'Revenue zoom'));
        const dialog = within(await popover(page));
        await userEvent.click(dialog.getByRole('button', { name: 'Settings' }));
        await userEvent.click(
            dialog.getByText('Show to viewers', { exact: true }),
        );
        await waitFor(() =>
            expect(
                dialog.getByText(
                    'The grain still applies to its tiles when hidden.',
                ),
            ).toBeVisible(),
        );
        await userEvent.click(
            dialog.getByRole('combobox', { name: 'Section' }),
        );
        await userEvent.click(
            await page.findByRole('option', { name: 'Orders' }),
        );
        // The section moves the pill at once; its popover follows it
        await userEvent.click(
            within(await popover(page)).getByRole('button', { name: 'Apply' }),
        );
        const moved = await pill(page, 'Revenue zoom');
        await expect(
            page.getByRole('group', { name: 'Orders' }),
        ).toContainElement(moved);
        await expect(moved).toHaveAttribute('data-hidden', 'true');
    },
};

/** "Add", then "Date zoom": a new zoom opens on its name, and Apply waits for a tile. */
export const NamedNew: Story = {
    name: 'Named zoom, new from Add',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        await userEvent.click(page.getByRole('button', { name: 'Add' }));
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Date zoom/ }),
        );
        const dialog = within(await popover(page));
        const nameInput = dialog.getByRole('textbox', { name: 'Name' });
        await waitFor(() => expect(nameInput).toHaveFocus());
        await expect(nameInput).toHaveValue('Date zoom');
        const apply = dialog.getByRole('button', { name: 'Apply' });
        await expect(apply).toBeDisabled();
        if (apply.parentElement) await userEvent.hover(apply.parentElement);
        await expect(await page.findByRole('tooltip')).toHaveTextContent(
            'Choose at least one tile',
        );
    },
};

/** Choose tiles: the mapping row stands in for the bar, a card per tile. */
export const ChooseTiles: Story = {
    name: 'Named zoom, choose tiles',
    args: { withTiles: true },
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        await userEvent.click(await pill(page, 'Revenue zoom'));
        await userEvent.click(
            await page.findByRole('button', { name: /Choose tiles$/ }),
        );
        const row = await waitFor(() => {
            const element = canvasElement.querySelector<HTMLElement>(
                '[data-controls-mapping-row]',
            );
            if (element === null) throw new Error('No mapping row');
            return element;
        });
        await expect(row).toHaveTextContent('applies to2 of 5 tiles');
        // The tiles bar slides in
        const bar = await page.findByRole('region', {
            name: 'Tiles zoomed by Revenue zoom',
        });
        await waitFor(() => expect(bar).toBeVisible());
    },
};

/** A viewer picks a grain from the shipped menu: one click, no popover. */
export const NamedViewer: Story = {
    name: 'Named zoom, viewer',
    args: { isEditMode: false },
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        const revenue = await waitFor(
            () => page.getByRole('button', { name: /^Revenue zoom / }),
            { timeout: 10000 },
        );
        await expect(revenue).toHaveTextContent('Revenue zoom is Week');
        await userEvent.click(revenue);
        await userEvent.click(
            await page.findByRole('menuitem', { name: 'Month' }),
        );
        await expect(revenue).toHaveTextContent('Revenue zoom is Month');
        await expect(page.queryByRole('dialog')).toBeNull();
    },
};

/** Default zoom leads the strip, before the named zooms; clearing it leaves tiles their own grain. */
export const Default: Story = {
    name: "Default zoom, at the strip's start",
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        const defaultPill = await pill(page, 'Default zoom');
        await expect(defaultPill).toHaveTextContent('Default zoom Month');
        const pills = [
            ...canvasElement.querySelectorAll(
                '[data-default-date-zoom], [data-date-zoom-pill]',
            ),
        ];
        await expect(pills.at(0)).toBe(defaultPill);
        await userEvent.click(defaultPill);
        const dialog = within(await popover(page));
        await waitFor(() =>
            expect(
                dialog.getByText(
                    `Applies to the other ${TOTAL_TILE_COUNT - 3} tiles`,
                ),
            ).toBeVisible(),
        );
        await userEvent.click(
            dialog.getByRole('button', { name: 'Clear grain' }),
        );
        await userEvent.click(dialog.getByRole('button', { name: 'Apply' }));
        await expect(await pill(page, 'Default zoom')).toHaveTextContent(
            'Default zoom None',
        );
    },
};

/** A viewer's default zoom: the shipped menu, one click picks. */
export const DefaultViewer: Story = {
    name: 'Default zoom, viewer',
    args: { isEditMode: false },
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        await userEvent.click(
            await waitFor(
                () => page.getByRole('button', { name: /^Default zoom/ }),
                { timeout: 10000 },
            ),
        );
        await userEvent.click(
            await page.findByRole('menuitem', { name: 'Week' }),
        );
        await expect(
            page.getByRole('button', { name: /^Default zoom/ }),
        ).toHaveTextContent('Default zoom · Week');
    },
};

/** No named zoom yet: the default zoom alone. */
export const NoNamedZoom: Story = {
    name: 'Default zoom, no named zoom',
    parameters: {
        dashboard: {
            dateZoom: {
                ...dateZoomSettings,
                dateZoomConfig: { controls: [], tileTargets: {} },
            },
        } satisfies DashboardStoryParameters,
    },
    play: async ({ canvasElement }) => {
        const page = onPage(canvasElement);
        await waitForApiIdle();
        await expect(await pill(page, 'Default zoom')).toBeVisible();
        await expect(
            page.queryByRole('button', {
                name: new RegExp(`^${createDateZoomControl().name}`),
            }),
        ).toBeNull();
    },
};
