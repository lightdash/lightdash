import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { AddControlFlow } from './AddControlFlow';
import { AddControlMenu } from './AddControlMenu';
import { withStoryFrame } from './decorators';
import {
    availableTileFilters,
    fields,
    manyFields,
    manyFieldsByTile,
    manyFieldsTiles,
    parameterList,
    tabs,
    tiles,
} from './fixtures';

const meta: Meta<typeof AddControlMenu> = {
    title: 'Dashboards/Controls/Add menu',
    component: AddControlMenu,
    parameters: { layout: 'fullscreen' },
    decorators: [withStoryFrame],
    args: {
        fields: Object.values(fields),
        tabs,
        tiles,
        availableTileFilters,
        parameters: parameterList,
        isViewer: false,
        onPickField: fn(),
        onPickParameter: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const onPage = (canvasElement: HTMLElement) =>
    within(canvasElement.ownerDocument.body);

const optionTexts = (root: HTMLElement) =>
    [...root.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent ?? '',
    );

/** "Add" opens a choice first: Filter or Parameter. */
export const FilterOrParameter: Story = {
    name: 'Filter or parameter',
    render: () => <AddControlFlow />,
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        const add = canvas.getByRole('button', { name: 'Add' });
        await expect(add.querySelector('svg.tabler-icon-plus')).not.toBeNull();
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

/** The field picker: rows by table with the tiles each field filters. */
export const FieldPicker: Story = {
    name: 'Field picker',
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await userEvent.click(
            await onPage(canvasElement).findByRole('menuitem', {
                name: /^Filter/,
            }),
        );
        const search = canvas.getByRole('textbox', { name: 'Search fields' });
        await expect(search).toHaveFocus();
        // Amount is on 4 tiles; one already filtered on the bar says nothing more
        await expect(
            await canvas.findByRole('option', { name: /^Amount/ }),
        ).toHaveTextContent(/^Amount4 tiles$/);
        // A field's description shows on hover, as in the shipped picker
        const firstName = await canvas.findByRole('option', {
            name: /^First name/,
        });
        // The tooltip sits on the row's content, inside the option
        await userEvent.hover(within(firstName).getByText('First name'));
        await expect(
            await onPage(canvasElement).findByRole('tooltip'),
        ).toHaveTextContent(
            "The customer's first name, as entered at checkout.",
        );
        await userEvent.unhover(within(firstName).getByText('First name'));

        await userEvent.type(search, 'status');
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(1));
        await userEvent.keyboard('{Enter}');
        await expect(args.onPickField).toHaveBeenCalledWith(fields.status);
    },
};

/** 2,000 fields: only the rows in view are drawn, and a search settles once typing pauses. */
export const FieldPickerManyFields: Story = {
    name: 'Field picker, 2,000 fields',
    args: {
        fields: manyFields,
        tiles: manyFieldsTiles,
        availableTileFilters: manyFieldsByTile,
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        await userEvent.click(
            await onPage(canvasElement).findByRole('menuitem', {
                name: /^Filter/,
            }),
        );
        await canvas.findAllByRole('option');
        await expect(optionTexts(canvasElement).length).toBeLessThan(60);
        await userEvent.type(
            canvas.getByRole('textbox', { name: 'Search fields' }),
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
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        await expect(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        ).toBeVisible();
    },
};

/** The parameter picker: rows by model, searched by label and model; one on the bar, still pickable. */
export const ParameterPicker: Story = {
    name: 'Parameter picker',
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await userEvent.click(
            await onPage(canvasElement).findByRole('menuitem', {
                name: /^Parameter/,
            }),
        );
        const search = canvas.getByRole('textbox', {
            name: 'Search parameters',
        });
        await expect(search).toHaveFocus();
        // A parameter a control already sets stays pickable, with its tiles only
        const onBar = await canvas.findByRole('option', {
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
        await expect(canvas.getByText('Orders')).toBeVisible();
        await expect(canvas.getByText('Payments')).toBeVisible();
        // Each Region names its model, so the two read apart
        await expect(
            canvas
                .getAllByRole('option')
                .map((option) => option.getAttribute('aria-label')),
        ).toEqual(['Region, Orders, 2 tiles', 'Region, Payments, 2 tiles']);
        await expect(
            canvas.getByRole('option', { name: 'Region, Payments, 2 tiles' }),
        ).toBeVisible();

        // The model's name matches too, in any case
        await userEvent.clear(search);
        await userEvent.type(search, 'PAY');
        await waitFor(() => expect(canvas.queryByText('Orders')).toBeNull());
        await expect(optionTexts(canvasElement)).toHaveLength(3);

        await userEvent.clear(search);
        await userEvent.type(search, 'zzz');
        await expect(
            await canvas.findByText('No matching parameters'),
        ).toBeVisible();

        await userEvent.clear(search);
        await userEvent.type(search, 'currency');
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(1));
        await userEvent.keyboard('{Enter}');
        await expect(args.onPickParameter).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'payments.currency' }),
        );
    },
};

/** Project-wide parameters sit together under "Project", before the models'. */
export const ParameterPickerProject: Story = {
    name: 'Parameter picker, project parameters',
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await userEvent.click(
            await onPage(canvasElement).findByRole('menuitem', {
                name: /^Parameter/,
            }),
        );
        await canvas.findByRole('option', {
            name: 'Fiscal year starts, Project, 2 tiles',
        });
        // First in the list, under its own heading
        await expect(optionTexts(canvasElement)[0]).toMatch(
            /^Fiscal year starts/,
        );
        await expect(canvas.getByText('Project')).toBeVisible();
        await userEvent.type(
            canvas.getByRole('textbox', { name: 'Search parameters' }),
            'project',
        );
        await waitFor(() => expect(optionTexts(canvasElement)).toHaveLength(1));
        await userEvent.click(canvas.getByRole('option'));
        await expect(args.onPickParameter).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'fiscal_year_start',
                source: { type: 'project' },
            }),
        );
    },
};

/** Back from the parameter picker to the Filter or Parameter choice. */
export const ParameterPickerBack: Story = {
    name: 'Parameter picker, back',
    play: async ({ canvas, canvasElement, userEvent }) => {
        const page = onPage(canvasElement);
        await userEvent.click(
            await page.findByRole('menuitem', { name: /^Parameter/ }),
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
        await expect(
            await page.findByRole('menuitem', { name: /^Filter/ }),
        ).toBeVisible();
        await expect(
            canvas.queryByRole('textbox', { name: 'Search parameters' }),
        ).toBeNull();
    },
};

/** No tile uses a parameter: no choice to make, "Add filter" opens the field picker straight away. */
export const AddFilterNoParameters: Story = {
    name: 'Add filter, no parameters',
    args: { parameters: [] },
    play: async ({ canvas, canvasElement }) => {
        await expect(
            canvas.getByRole('button', { name: 'Add filter' }),
        ).toBeVisible();
        await expect(
            canvas.getByRole('textbox', { name: 'Search fields' }),
        ).toHaveFocus();
        await expect(canvas.queryByRole('button', { name: 'Back' })).toBeNull();
        await expect(onPage(canvasElement).queryByText(/Parameter/)).toBeNull();
    },
};

/** A viewer adds filters only: "Add filter" goes straight to the field picker, with no way back to a choice. */
export const Viewer: Story = {
    name: 'Viewer, add filter',
    args: { isViewer: true },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByRole('button', { name: 'Add filter' }),
        ).toBeVisible();
        await expect(canvas.queryByRole('button', { name: 'Add' })).toBeNull();
        await expect(
            canvas.getByRole('textbox', { name: 'Search fields' }),
        ).toHaveFocus();
        await expect(canvas.queryByRole('button', { name: 'Back' })).toBeNull();
    },
};
