import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import { dateZoomSettings, sections, waitForApiIdle } from './fixtures';
import { type DashboardStoryParameters } from './storyParameters';

// The controls strip: the toggle, the default zoom, then the controls; the
// toggle collapses it to a count of each kind
const meta: Meta<typeof AddControlFlow> = {
    title: 'Dashboards/Controls/Controls strip',
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

const toggle = (canvasElement: HTMLElement) =>
    waitFor(() => {
        const found = [
            ...canvasElement.querySelectorAll<HTMLElement>(
                'button[aria-expanded]',
            ),
        ].find((element) => element.textContent?.startsWith('Controls'));
        if (found === undefined) throw new Error('No Controls toggle');
        return found;
    });

const defaultZoom = (canvasElement: HTMLElement) =>
    canvasElement.querySelector<HTMLElement>('[data-default-date-zoom]');

/** A viewer's strip, open: the toggle and the default zoom lead the pills. */
export const ViewOpen: Story = {
    name: 'View, open',
    args: { isEditMode: false },
    play: async ({ canvasElement, userEvent }) => {
        await waitForApiIdle();
        const open = await toggle(canvasElement);
        await expect(open).toHaveAttribute('aria-expanded', 'true');
        await expect(defaultZoom(canvasElement)).toBeVisible();
        // Collapses and comes back
        await userEvent.click(open);
        const collapsed = await toggle(canvasElement);
        await expect(collapsed).toHaveAttribute('aria-expanded', 'false');
        await userEvent.click(collapsed);
        await expect(await toggle(canvasElement)).toHaveAttribute(
            'aria-expanded',
            'true',
        );
    },
};

/** Collapsed: the toggle, the default zoom (still usable) and the counts. */
export const ViewCollapsed: Story = {
    name: 'View, collapsed',
    args: { isEditMode: false, isCollapsed: true },
    play: async ({ canvasElement }) => {
        await waitForApiIdle();
        const collapsed = await toggle(canvasElement);
        await expect(collapsed).toHaveAttribute('aria-expanded', 'false');
        await expect(defaultZoom(canvasElement)).toBeVisible();
        await waitFor(() =>
            expect(canvasElement).toHaveTextContent(/\d+ filters/),
        );
        await expect(canvasElement).toHaveTextContent(/1 date zoom/);
    },
};

/** An editor's strip: the toggle and the default zoom before Add. */
export const Edit: Story = {
    name: 'Edit',
    play: async ({ canvasElement }) => {
        await waitForApiIdle();
        await expect(await toggle(canvasElement)).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        await expect(defaultZoom(canvasElement)).toBeVisible();
    },
};

/** Sections wrap below the strip's lead, which stays on the first line. */
export const LongWrapped: Story = {
    name: 'Edit, sections wrapping',
    parameters: {
        dashboard: {
            dateZoom: dateZoomSettings,
            sections,
        } satisfies DashboardStoryParameters,
    },
};
