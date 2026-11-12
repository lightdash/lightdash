import { type DashboardParameterControl } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { ParameterControlPopover } from './ParameterControlPopover';
import { type ParameterControlParameter } from './parameterControlsBar';

const region: ParameterControlParameter = {
    key: 'region',
    definition: {
        label: 'Region',
        type: 'string',
        options: ['EMEA', 'APAC'],
        default: 'EMEA',
    },
};
const currency: ParameterControlParameter = {
    key: 'currency',
    definition: { label: 'Currency', type: 'string', options: ['EUR', 'USD'] },
};

const control = (
    overrides: Partial<DashboardParameterControl> = {},
): DashboardParameterControl => ({
    id: 'c1',
    label: 'Region',
    value: 'APAC',
    valueType: { type: 'string', multiple: false },
    parameters: { region: 'all' },
    ...overrides,
});

const render = (
    props: Partial<ComponentProps<typeof ParameterControlPopover>> = {},
) => {
    const store = createDashboardTestStore();
    seedDashboardEditState(store, {
        dashboard: {
            config: {
                isDateZoomDisabled: false,
                controlSections: [{ id: 'market', name: 'Market' }],
            },
        },
    });
    const handlers = {
        onChange: vi.fn(),
        onCancel: vi.fn(),
        onApply: vi.fn(),
    };
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <ParameterControlPopover
                control={control()}
                nameSuffix={null}
                parameters={[region]}
                input={region}
                tileCount={2}
                hasChosenTiles={false}
                totalTileCount={3}
                projectUuid="project-1"
                projectTimezone={null}
                parameterValues={{}}
                shadowedReservedNames={[]}
                isViewer={false}
                isMissingRequired={false}
                initialView="value"
                onChooseTiles={null}
                isAsking={false}
                onResolvePending={vi.fn()}
                {...handlers}
                {...props}
            />
        </DashboardStoreTestProvider>,
    );
    return { ...handlers, user: userEvent.setup() };
};

describe('ParameterControlPopover', () => {
    it('edits the value with the shipped input, which takes focus', async () => {
        const { user, onChange } = render();
        const input = screen.getByRole('combobox');
        expect(input).toHaveValue('APAC');
        expect(input).toHaveFocus();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeVisible();
        await user.click(input);
        await user.click(await screen.findByRole('option', { name: 'EMEA' }));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'EMEA' }),
        );
    });

    it('keeps a saved value visible when it falls outside the current options', async () => {
        const { user, onChange } = render({
            control: control({ value: 'AMER' }),
        });
        const input = screen.getByRole('combobox', { name: 'Region' });
        expect(input).toHaveValue('AMER');
        await user.click(input);
        expect(
            screen.getByText('Unavailable in current options'),
        ).toBeVisible();
        expect(screen.getByRole('option', { name: 'AMER' })).toBeVisible();
        await user.click(screen.getByRole('option', { name: 'APAC' }));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'APAC' }),
        );
    });

    it('shows unavailable saved values when editing a multiple selection', async () => {
        const input = {
            ...region,
            definition: { ...region.definition, multiple: true },
        };
        const { user } = render({
            control: control({
                value: ['APAC', 'AMER'],
                valueType: { type: 'string', multiple: true },
            }),
            input,
        });
        expect(
            screen.getByText('APAC', { selector: '.mantine-Pill-label' }),
        ).toBeVisible();
        expect(
            screen.getByText('AMER', { selector: '.mantine-Pill-label' }),
        ).toBeVisible();
        await user.click(screen.getByRole('combobox', { name: 'Region' }));
        expect(
            screen.getByText('Unavailable in current options'),
        ).toBeVisible();
        expect(screen.getByRole('option', { name: 'AMER' })).toBeVisible();
    });

    it('says what clearing falls back to while a value is set', () => {
        render();
        expect(
            screen.getByText('If cleared, tiles use the default, EMEA.'),
        ).toBeInTheDocument();
    });

    it('says each tile keeps its own value when no key has a default', () => {
        render({
            control: control({ label: 'Currency', value: 'EUR' }),
            parameters: [currency],
            input: currency,
        });
        expect(
            screen.getByText('If cleared, each tile uses its own value.'),
        ).toBeInTheDocument();
    });

    it('says nothing with no value, or when the keys have different defaults', () => {
        render({ control: control({ value: null }) });
        expect(screen.queryByText(/^If cleared,/)).toBeNull();
    });

    it('says nothing for keys with different defaults', () => {
        render({
            parameters: [
                region,
                {
                    ...currency,
                    definition: { ...currency.definition, default: 'EUR' },
                },
            ],
        });
        expect(screen.queryByText(/^If cleared,/)).toBeNull();
    });

    it('clears from the keyboard and returns focus to the input', async () => {
        const { user, onChange } = render();
        await user.tab();
        expect(
            screen.getByRole('button', { name: 'Clear parameter' }),
        ).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ value: null }),
        );
        expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('shows the input error when a tile needs a value', () => {
        render({ isMissingRequired: true, control: control({ value: null }) });
        expect(screen.getByRole('combobox')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
    });

    it('counts the tiles it sets, with no Choose tiles yet', () => {
        render();
        expect(screen.getByText('Sets 2 of 3 tiles')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Choose tiles/ }),
        ).toBeNull();
    });

    it('allows editors to apply a control with no tiles', () => {
        render({ tileCount: 0 });
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    });

    it('blocks an editor who chose no tiles, in the prompt too', () => {
        render({ tileCount: 0, hasChosenTiles: true, isAsking: true });
        for (const button of screen.getAllByRole('button', { name: 'Apply' }))
            expect(button).toBeDisabled();
    });

    it('blocks a viewer from applying a control with no tiles', () => {
        render({ tileCount: 0, isViewer: true });
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });

    it('gives a viewer the value only: no rename, count or settings', () => {
        render({ isViewer: true });
        for (const name of [/^Settings/, /^Rename$/])
            expect(screen.queryByRole('button', { name })).toBeNull();
        expect(screen.queryByText(/^Sets/)).toBeNull();
    });

    it("renames inline with Enter, a blank name following the parameter's", async () => {
        const { user, onChange } = render({
            control: control({ label: 'Sales region' }),
        });
        await user.click(screen.getByRole('button', { name: 'Rename' }));
        await user.keyboard('EMEA region{Enter}');
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ label: 'EMEA region' }),
        );
        await user.click(screen.getByRole('button', { name: 'Rename' }));
        await user.keyboard('{Backspace}{Enter}');
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ label: null }),
        );
    });

    it("keeps following the parameter's label when a rename is left untouched", async () => {
        const { user, onChange } = render({
            control: control({ label: null }),
        });
        await user.click(screen.getByRole('button', { name: 'Rename' }));
        await user.keyboard('{Enter}');
        expect(onChange).not.toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Region' }),
        );
    });

    it('holds section and visibility in Settings', async () => {
        const { user, onChange } = render({ initialView: 'settings' });
        await user.click(screen.getByRole('combobox', { name: 'Section' }));
        await user.click(await screen.findByRole('option', { name: 'Market' }));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ sectionId: 'market' }),
        );
        const visibility = screen.getByRole('switch', {
            name: 'Show to viewers',
        });
        expect(visibility).toBeChecked();
        expect(visibility).toHaveAccessibleDescription(
            'The value still applies to its tiles when hidden.',
        );
        await user.click(visibility);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ hidden: true }),
        );
        expect(
            screen.queryByRole('textbox', { name: 'Name' }),
        ).not.toBeInTheDocument();
    });
});
