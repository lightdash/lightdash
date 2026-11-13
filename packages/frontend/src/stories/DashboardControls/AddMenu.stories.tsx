import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { withStoryFrame } from './decorators';
import { type DashboardStoryParameters } from './storyParameters';

// The real bar, in edit mode unless a story says otherwise: its "Add" and
// "..." menus and pickers are the shipped ones, driven by the fixture dashboard
const meta: Meta<typeof AddControlFlow> = {
    title: 'Dashboards/Controls/Add menu',
    component: AddControlFlow,
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
};

export default meta;
type Story = StoryObj<typeof meta>;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

const optionTexts = (root: HTMLElement) =>
    [...root.ownerDocument.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent ?? '',
    );

// "Add", then a kind from its choice
const chooseKind = async (
    canvasElement: HTMLElement,
    userEvent: { click: (element: Element) => Promise<void> },
    kind: 'Filter' | 'Parameter',
) => {
    const page = onPage(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Add' }));
    await userEvent.click(
        await page.findByRole('menuitem', { name: new RegExp(`^${kind}`) }),
    );
};

const noParameters: DashboardStoryParameters = { hasParameters: false };

/** Tiles use parameters: "Add" opens a choice first, Filter or Parameter. */
export const FilterOrParameter: Story = {
    name: 'Filter or parameter',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        const add = canvas.getByRole('button', { name: 'Add' });
        await expect(add.querySelector('svg.tabler-icon-plus')).not.toBeNull();
        // Joined to the "..." menu, as on the bar
        await expect(
            canvas.getByRole('button', { name: 'Filter bar settings' }),
        ).toBeVisible();
        await userEvent.click(add);
        await expect(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        ).toBeEnabled();
        await expect(
            page.getByRole('menuitem', { name: /^Parameter/ }),
        ).toBeEnabled();
        await expect(
            page.getByRole('menu').querySelector('.mantine-Menu-arrow'),
        ).not.toBeNull();
    },
};

/** The field picker: rows by table with the tiles each field filters; a pick opens the filter. */
export const FieldPicker: Story = {
    name: 'Field picker',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await chooseKind(canvasElement, userEvent, 'Filter');
        const search = await page.findByRole('textbox', {
            name: 'Search fields',
        });
        await waitFor(() => expect(search).toHaveFocus());
        await expect(
            await page.findByRole('option', { name: /^Amount,/ }),
        ).toHaveAccessibleName('Amount, Orders, 4 tiles');
        // A field's description shows on hover, as in the shipped picker
        const firstName = await page.findByRole('option', {
            name: /^First name/,
        });
        await userEvent.hover(within(firstName).getByText('First name'));
        await expect(await page.findByRole('tooltip')).toHaveTextContent(
            "The customer's first name, as entered at checkout.",
        );
        await userEvent.unhover(within(firstName).getByText('First name'));

        await userEvent.type(search, 'status');
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(1));
        await userEvent.keyboard('{Enter}');
        const editor = await page.findByRole('dialog', { name: 'Status' });
        await waitFor(() => expect(editor).toBeVisible());
    },
};

/** 2,000 fields on one tile: only the rows in view are drawn, and a search settles once typing pauses. */
export const FieldPickerManyFields: Story = {
    name: 'Field picker, 2,000 fields',
    parameters: {
        dashboard: {
            hasParameters: false,
            isManyFields: true,
        } satisfies DashboardStoryParameters,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            canvas.getByRole('button', { name: 'Add filter' }),
        );
        await page.findAllByRole('option');
        await expect(optionTexts(canvasElement).length).toBeLessThan(60);
        await userEvent.type(
            page.getByRole('textbox', { name: 'Search fields' }),
            'Field 1999',
        );
        await waitFor(() =>
            expect(optionTexts(canvasElement)).toEqual([
                expect.stringMatching(/^Field 1999/),
            ]),
        );
    },
};

/** Back from the field picker to the Filter or Parameter choice. */
export const FieldPickerBack: Story = {
    name: 'Field picker, back',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await chooseKind(canvasElement, userEvent, 'Filter');
        await userEvent.click(
            await page.findByRole('button', { name: 'Back' }),
        );
        // The menu pops back in
        const item = await page.findByRole('menuitem', { name: /^Parameter/ });
        await waitFor(() => expect(item).toBeVisible());
    },
};

/** The parameter picker: rows by model, searched by label and model; one on the bar, still pickable. */
export const ParameterPicker: Story = {
    name: 'Parameter picker',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await chooseKind(canvasElement, userEvent, 'Parameter');
        const search = await page.findByRole('textbox', {
            name: 'Search parameters',
        });
        await waitFor(() => expect(search).toHaveFocus());
        // A parameter a control already sets stays pickable, with its tiles only
        const onBar = await page.findByRole('option', {
            name: 'Week starts on, Orders, 2 tiles',
        });
        await expect(onBar).not.toHaveAttribute('data-combobox-disabled');

        // One row per model's Region, each under its model
        await userEvent.type(search, 'region');
        await waitFor(() =>
            expect(optionTexts(canvasElement)).toEqual([
                expect.stringMatching(/^Region/),
                expect.stringMatching(/^Region/),
            ]),
        );
        await expect(
            page
                .getAllByRole('option')
                .map((option) => option.getAttribute('aria-label')),
        ).toEqual(['Region, Orders, 2 tiles', 'Region, Payments, 2 tiles']);

        // The model's name matches too, in any case
        await userEvent.clear(search);
        await userEvent.type(search, 'PAY');
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(3));

        await userEvent.clear(search);
        await userEvent.type(search, 'zzz');
        await expect(
            await page.findByText('No matching parameters'),
        ).toBeVisible();

        await userEvent.clear(search);
        await userEvent.type(search, 'currency');
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(1));
        await userEvent.keyboard('{Enter}');
        // The pick adds a control and opens it
        await waitFor(() =>
            expect(
                page.queryByRole('textbox', { name: 'Search parameters' }),
            ).toBeNull(),
        );
        await expect(await page.findByRole('dialog')).toBeVisible();
    },
};

/** Project-wide parameters sit together under "Project", before the models'. */
export const ParameterPickerProject: Story = {
    name: 'Parameter picker, project parameters',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await chooseKind(canvasElement, userEvent, 'Parameter');
        await page.findByRole('option', {
            name: 'Fiscal year starts, Project, 2 tiles',
        });
        // First in the list, under its own heading
        await expect(optionTexts(canvasElement)[0]).toMatch(
            /^Fiscal year starts/,
        );
        await userEvent.type(
            page.getByRole('textbox', { name: 'Search parameters' }),
            'project',
        );
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(1));
    },
};

/** Back from the parameter picker to the Filter or Parameter choice. */
export const ParameterPickerBack: Story = {
    name: 'Parameter picker, back',
    play: async ({ canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await chooseKind(canvasElement, userEvent, 'Parameter');
        await userEvent.click(
            await page.findByRole('button', { name: 'Back' }),
        );
        // The menu pops back in
        const item = await page.findByRole('menuitem', { name: /^Filter/ });
        await waitFor(() => expect(item).toBeVisible());
        await waitFor(() =>
            expect(
                page.queryByRole('textbox', { name: 'Search parameters' }),
            ).toBeNull(),
        );
    },
};

/** No tile uses a parameter: "Add filter" opens the field picker straight away, with no way back. */
export const AddFilterNoParameters: Story = {
    name: 'Add filter, no parameters',
    parameters: { dashboard: noParameters },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            canvas.getByRole('button', { name: 'Add filter' }),
        );
        const search = await page.findByRole('textbox', {
            name: 'Search fields',
        });
        await waitFor(() => expect(search).toHaveFocus());
        await expect(page.queryByRole('button', { name: 'Back' })).toBeNull();
        await expect(
            page.queryByRole('menuitem', { name: /^Parameter/ }),
        ).toBeNull();
    },
};

/** A viewer adds filters only: "Add filter" goes straight to the field picker, with no "..." menu. */
export const Viewer: Story = {
    name: 'Viewer, add filter',
    args: { isEditMode: false },
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await expect(canvas.queryByRole('button', { name: 'Add' })).toBeNull();
        await expect(
            canvas.queryByRole('button', { name: 'Filter bar settings' }),
        ).toBeNull();
        await userEvent.click(
            canvas.getByRole('button', { name: 'Add filter' }),
        );
        const search = await page.findByRole('textbox', {
            name: 'Search fields',
        });
        await waitFor(() => expect(search).toHaveFocus());
        await expect(page.queryByRole('button', { name: 'Back' })).toBeNull();
    },
};

/** The bar's other "..." menus point at their button as "Add" does; a section's ungroups without deleting. */
export const BarMenus: Story = {
    name: 'Bar "..." menus',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            canvas.getByRole('button', { name: 'Filter bar settings' }),
        );
        await expect(
            (await page.findByRole('menu')).querySelector(
                '.mantine-Menu-arrow',
            ),
        ).not.toBeNull();
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
        await userEvent.click(
            await canvas.findByRole('button', { name: 'Orders menu' }),
        );
        const ungroup = await page.findByRole('menuitem', { name: 'Ungroup' });
        await waitFor(() => expect(ungroup).toBeVisible());
        await expect(
            page.getByRole('menu').querySelector('.mantine-Menu-arrow'),
        ).not.toBeNull();
    },
};
