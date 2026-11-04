import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import { TOTAL_TILE_COUNT, waitForApiIdle } from './fixtures';

const meta: Meta<typeof AddControlFlow> = {
    title: 'Prototypes/Dashboard controls/Flows',
    component: AddControlFlow,
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
};

export default meta;
type Story = StoryObj<typeof meta>;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

/** Add, Filter, a field: its filter opens; Cancel goes back to the Add menu. */
export const AddAFilter: Story = {
    name: 'Add a filter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        );
        await userEvent.click(
            await page.findByRole('option', { name: /^Amount/ }),
        );
        await expect(
            await canvas.findByRole('dialog', { name: 'Amount' }),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
        await expect(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        ).toBeVisible();
    },
};

/** Add, Parameter, a search and Enter: its control opens; Cancel goes back to the Add menu. */
export const AddAParameter: Story = {
    name: 'Add a parameter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        );
        await userEvent.type(
            canvas.getByRole('textbox', { name: 'Search parameters' }),
            'region',
        );
        // The search settles after its debounce: Orders Region comes first
        await waitFor(() =>
            expect(canvas.getAllByRole('option')).toHaveLength(2),
        );
        await userEvent.keyboard('{Enter}');
        await expect(
            await canvas.findByRole('dialog', { name: 'Region' }),
        ).toBeVisible();
        await expect(
            canvas.getByText(`Sets 2 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
        await expect(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        ).toBeVisible();
        await waitForApiIdle();
    },
};

/** A parameter already on the bar stays pickable: a second control with no tiles, which cannot apply until a tile is chosen. */
export const AddASecondControlOnAParameter: Story = {
    name: 'Add a second control on a parameter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        );
        await userEvent.click(
            await canvas.findByRole('option', { name: /^Week starts on/ }),
        );
        await expect(
            await canvas.findByRole('dialog', { name: 'Week starts on' }),
        ).toBeVisible();
        await expect(
            canvas.getByText(`Sets 0 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
        const apply = canvas.getByRole('button', { name: 'Apply' });
        await expect(apply).toBeDisabled();
        await userEvent.click(
            canvas.getByRole('button', { name: /Choose tiles/ }),
        );
        await expect(
            canvas.getByText(`Sets 2 of ${TOTAL_TILE_COUNT} tiles`),
        ).toBeVisible();
        await expect(apply).toBeEnabled();
    },
};

/** The tiles a field reaches read the same in the picker and in its new filter. */
export const AddAFilterTileCounts: Story = {
    name: 'Add a filter, tile counts match',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        for (const fieldName of ['First name', 'Amount']) {
            await userEvent.click(
                await page.findByRole('menuitem', { name: /^Filter/ }),
            );
            const option = await canvas.findByRole('option', {
                name: new RegExp(`^${fieldName},`),
            });
            const picked = /(\d+) tiles?$/.exec(option.textContent ?? '');
            await expect(picked).not.toBeNull();
            await userEvent.click(option);
            await expect(
                await canvas.findByRole('button', { name: /^Applies to/ }),
            ).toHaveAccessibleName(
                new RegExp(
                    `^Applies to ${picked?.[1]} (of ${TOTAL_TILE_COUNT} )?tiles?\\.`,
                ),
            );
            await userEvent.click(
                canvas.getByRole('button', { name: 'Cancel' }),
            );
        }
        await waitForApiIdle();
    },
};
