import { DateGranularity } from '@lightdash/common';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import {
    createDateZoomControl,
    enabledGranularities,
    waitForApiIdle,
} from './fixtures';
import { type DashboardStoryParameters } from './storyParameters';

// The real bar in edit mode: its "..." menu holds the grains viewers can pick
const meta: Meta<typeof AddControlFlow> = {
    title: 'Dashboards/Controls/Date zoom grains menu',
    component: AddControlFlow,
    parameters: {
        layout: 'fullscreen',
        dashboard: {
            dateZoom: {
                dateZoomGranularities: enabledGranularities,
                defaultDateZoomGranularity: DateGranularity.MONTH,
            },
        } satisfies DashboardStoryParameters,
    },
    decorators: [withStoryFrame],
};

export default meta;
type Story = StoryObj<typeof meta>;

type Page = ReturnType<typeof within>;
type UserEvent = {
    click: (element: Element) => Promise<void>;
    hover: (element: Element) => Promise<void>;
    keyboard: (text: string) => Promise<void>;
};

// The bar's "...", then "Date zoom grains" from the keyboard: a pointer
// jump between the target and the submenu would close it, as no real one does
const openGrains = async (page: Page, userEvent: UserEvent) => {
    // The bar redraws once its requests settle, which would close the menu
    await waitForApiIdle();
    await userEvent.click(
        page.getByRole('button', { name: 'Filter bar settings' }),
    );
    const grains = await page.findByRole('menuitem', {
        name: 'Date zoom grains',
    });
    grains.focus();
    await userEvent.keyboard('{ArrowRight}');
    const caption = await page.findByText(
        'For every date zoom on this dashboard',
    );
    await waitFor(() => expect(caption).toBeVisible());
};

// A toggle from the keyboard, which keeps the submenu open as a click does
const toggle = async (userEvent: UserEvent, item: HTMLElement) => {
    item.focus();
    await userEvent.keyboard('{Enter}');
};

// A locked item is disabled; its wrapper takes the hover for the tooltip
const expectLockReason = async (
    page: Page,
    userEvent: UserEvent,
    item: HTMLElement,
    reason: string,
) => {
    await expect(item).toBeDisabled();
    await userEvent.hover(item.parentElement ?? item);
    const tooltip = await page.findByRole('tooltip', { name: reason });
    await waitFor(() => expect(tooltip).toBeVisible());
};

/** The bar's "..." menu: hide date zoom, and "Date zoom grains" for every zoom; each toggle applies at once. */
export const BarMenu: Story = {
    name: 'Grains menu, in the bar menu',
    play: async ({ canvasElement, userEvent }) => {
        const page = within(canvasElement.ownerDocument.body);
        await openGrains(page, userEvent);
        await expect(
            page.getByRole('menuitem', { name: 'Hide date zoom for viewers' }),
        ).toBeVisible();
        const week = page.getByRole('menuitem', { name: 'Week' });
        await expect(week.querySelector('input')).toBeChecked();
        await toggle(userEvent, week);
        // The menu stays open for the next toggle
        await waitFor(() =>
            expect(week).toHaveAttribute('aria-checked', 'false'),
        );
        await expect(
            page.getByRole('menuitem', { name: /^Month/ }),
        ).toHaveTextContent('MonthDefault');
    },
};

/** Grains named zooms are at stay checked, saying which zoom or how many use them. */
export const GrainsInUse: Story = {
    name: 'Grains menu, grains in use',
    parameters: {
        dashboard: {
            dateZoom: {
                dateZoomGranularities: enabledGranularities,
                defaultDateZoomGranularity: DateGranularity.MONTH,
                dateZoomConfig: {
                    controls: [
                        createDateZoomControl(),
                        createDateZoomControl({
                            uuid: 'zoom-orders',
                            name: 'Orders zoom',
                        }),
                        createDateZoomControl({
                            uuid: 'zoom-payments',
                            name: 'Payments zoom',
                            granularity: DateGranularity.MONTH,
                        }),
                    ],
                    tileTargets: {},
                },
            },
        } satisfies DashboardStoryParameters,
    },
    play: async ({ canvasElement, userEvent }) => {
        const page = within(canvasElement.ownerDocument.body);
        await openGrains(page, userEvent);
        await expectLockReason(
            page,
            userEvent,
            page.getByRole('menuitem', { name: 'Week' }),
            'Used by 2 date zooms',
        );
        await expectLockReason(
            page,
            userEvent,
            page.getByRole('menuitem', { name: /^Month/ }),
            'Used by Payments zoom',
        );
    },
};

/** One grain left: viewers need it, so it cannot be unchecked. */
export const LastGrain: Story = {
    name: 'Grains menu, one grain left',
    parameters: {
        dashboard: {
            dateZoom: { dateZoomGranularities: [DateGranularity.WEEK] },
        } satisfies DashboardStoryParameters,
    },
    play: async ({ canvasElement, userEvent }) => {
        const page = within(canvasElement.ownerDocument.body);
        await openGrains(page, userEvent);
        await expectLockReason(
            page,
            userEvent,
            page.getByRole('menuitem', { name: 'Week' }),
            'Viewers need at least one grain',
        );
    },
};

/** Unchecking the default grain clears the default, as the shipped menu did. */
export const UncheckDefault: Story = {
    name: 'Grains menu, unchecking the default clears it',
    play: async ({ canvasElement, userEvent }) => {
        const page = within(canvasElement.ownerDocument.body);
        await openGrains(page, userEvent);
        const month = page.getByRole('menuitem', { name: /^Month/ });
        await toggle(userEvent, month);
        await waitFor(() =>
            expect(month).toHaveAttribute('aria-checked', 'false'),
        );
        // The default is cleared with it
        await expect(month).toHaveTextContent(/^Month$/);
    },
};
