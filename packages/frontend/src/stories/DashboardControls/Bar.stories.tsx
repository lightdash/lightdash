import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import { dateZoomSettings, waitForApiIdle } from './fixtures';
import { type DashboardStoryParameters } from './storyParameters';

// The real bar over the first tab's tiles, to compare an editor's with a viewer's
const meta: Meta<typeof AddControlFlow> = {
    title: 'Dashboards/Controls/Bar',
    component: AddControlFlow,
    args: { withTiles: true },
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

const defaultZoom = (canvasElement: HTMLElement) =>
    waitFor(
        () =>
            within(canvasElement.ownerDocument.body).getByRole('button', {
                name: /^Default zoom/,
            }),
        { timeout: 10000 },
    );

/** An editor's bar: Default zoom is the quiet button on the right. */
export const EditMode: Story = {
    name: 'Edit mode',
    play: async ({ canvasElement }) => {
        await waitForApiIdle();
        await expect(await defaultZoom(canvasElement)).toHaveTextContent(
            'Default zoom Month',
        );
    },
};

/** A viewer's bar: the same quiet button, opening the shipped menu. */
export const ViewMode: Story = {
    name: 'View mode',
    args: { isEditMode: false },
    play: async ({ canvasElement, userEvent }) => {
        await waitForApiIdle();
        const button = await defaultZoom(canvasElement);
        await expect(button).toHaveAttribute('data-variant', 'subtle');
        // The app seeds a viewer's grain from the saved default; here it is picked
        await userEvent.click(button);
        await userEvent.click(
            await within(canvasElement.ownerDocument.body).findByRole(
                'menuitem',
                { name: 'Month' },
            ),
        );
        await expect(button).toHaveTextContent('Default zoom Month');
    },
};
