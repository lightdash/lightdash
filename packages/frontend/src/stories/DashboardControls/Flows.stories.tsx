import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import { TOTAL_TILE_COUNT, waitForApiIdle } from './fixtures';

const meta: Meta<typeof AddControlFlow> = {
    title: 'Dashboards/Controls/Flows',
    component: AddControlFlow,
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
};

export default meta;
type Story = StoryObj<typeof meta>;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

export const AddAFilter: Story = {
    name: 'Add a filter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        const add = canvas.getByRole('button', { name: 'Add' });
        await userEvent.click(add);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        );
        const amount = await page.findByRole('option', { name: /^Amount,/ });
        await expect(amount).toHaveAccessibleName('Amount, Orders, 4 tiles');
        await userEvent.click(amount);
        const editor = await page.findByRole('dialog', { name: 'Amount' });
        await waitFor(() => expect(editor).toBeVisible());
        await expect(
            within(editor).getByRole('button', {
                name: /^Applies to 4 of 6 tiles/,
            }),
        ).toBeVisible();
        await userEvent.click(
            within(editor).getByRole('button', { name: 'Cancel' }),
        );
        await waitFor(() => expect(add).toHaveFocus());
    },
};

export const AddAParameter: Story = {
    // An unset pill reads its parameter's default
    name: 'Add an unset parameter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        );
        await userEvent.type(
            await page.findByRole('textbox', { name: 'Search parameters' }),
            'region',
        );
        await waitFor(() =>
            expect(page.getAllByRole('option')).toHaveLength(2),
        );
        await userEvent.keyboard('{Enter}');
        const editor = await page.findByRole('dialog', { name: 'Region' });
        await waitFor(() =>
            expect(
                within(editor).getByText(`Sets 2 of ${TOTAL_TILE_COUNT} tiles`),
            ).toBeVisible(),
        );
        await userEvent.click(
            within(editor).getByRole('button', { name: 'Apply' }),
        );
        await expect(
            canvas.getByRole('button', { name: /Region.*Global/ }),
        ).toBeVisible();
        await waitForApiIdle();
    },
};

export const AddASecondControlOnAParameter: Story = {
    name: 'Add a second control on a parameter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        );
        await userEvent.click(
            await page.findByRole('option', { name: /^Week starts on/ }),
        );
        const editor = await page.findByRole('dialog', {
            name: 'Week starts on',
        });
        await waitFor(() =>
            expect(
                within(editor).getByText(`Sets 0 of ${TOTAL_TILE_COUNT} tiles`),
            ).toBeVisible(),
        );
        await expect(within(editor).getByRole('combobox')).toHaveValue('');
        // The control already on the bar, and the new one reading the default
        await expect(
            canvas.getAllByRole('button', { name: /Week starts on.*Monday/ }),
        ).toHaveLength(2);
    },
};

export const MoveMixedSelectionToSection: Story = {
    name: 'Move a filter and parameter into a section',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        const filter = canvas.getByRole('button', { name: /^First name/ });
        const parameter = canvas.getByRole('button', {
            name: /Week starts on.*Monday/,
        });
        await userEvent.keyboard('{Meta>}');
        await userEvent.click(filter);
        await userEvent.click(parameter);
        await userEvent.keyboard('{/Meta}');
        await expect(await page.findByText('2 selected')).toBeVisible();
        await userEvent.click(page.getByRole('button', { name: 'Move to' }));
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Orders/ }),
        );
        const section = canvas.getByRole('group', { name: 'Orders' });
        await expect(
            within(section).getByRole('button', { name: /^First name/ }),
        ).toBeInTheDocument();
        await expect(
            within(section).getByRole('button', {
                name: /Week starts on.*Monday/,
            }),
        ).toBeInTheDocument();
    },
};

export const AddControlsToSection: Story = {
    name: 'Add a filter and parameter to a section',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        const section = canvas.getByRole('group', { name: 'Customers' });
        const expand = within(section).queryByRole('button', {
            name: /Expand/,
        });
        if (expand) await userEvent.click(expand);
        const add = within(section).getByRole('button', {
            name: 'Add to Customers',
        });
        await userEvent.click(add);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        );
        await userEvent.click(
            await page.findByRole('option', { name: /^Amount,/ }),
        );
        const filter = await page.findByRole('dialog', { name: 'Amount' });
        await userEvent.click(
            within(filter).getByRole('button', { name: 'Apply' }),
        );
        await expect(
            within(section).getByRole('button', { name: /^Amount/ }),
        ).toBeVisible();

        await userEvent.click(add);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        );
        await userEvent.click(
            await page.findByRole('option', { name: /^Region, Orders/ }),
        );
        const parameter = await page.findByRole('dialog', { name: 'Region' });
        await userEvent.click(
            within(parameter).getByRole('button', { name: 'Apply' }),
        );
        await expect(
            within(section).getByRole('button', { name: /Region.*Global/ }),
        ).toBeVisible();
        await waitForApiIdle();
    },
};
