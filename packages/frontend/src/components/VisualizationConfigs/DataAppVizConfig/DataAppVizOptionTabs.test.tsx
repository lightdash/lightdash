import {
    type DataAppVizConfigOption,
    type DataAppVizPaletteDeclaration,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';

const generalContent = <div data-testid="general">General content</div>;
const paletteControl = <div data-testid="palette">Palette picker</div>;

const options: DataAppVizConfigOption[] = [
    {
        type: 'boolean',
        name: 'showLegend',
        label: 'Show legend',
        group: 'Style',
        default: true,
    },
    { type: 'number', name: 'barWidth', label: 'Bar width', default: 8 },
];

const renderTabs = (
    configOptions: DataAppVizConfigOption[],
    colorPalette: DataAppVizPaletteDeclaration | null = null,
    onChange = vi.fn(),
) =>
    renderWithProviders(
        <DataAppVizOptionTabs
            generalContent={generalContent}
            configOptions={configOptions}
            values={{}}
            onChange={onChange}
            colorPalette={colorPalette}
            paletteControl={paletteControl}
        />,
    );

describe('DataAppVizOptionTabs', () => {
    it('renders the general content bare when no options are declared', () => {
        renderTabs([]);

        expect(screen.getByTestId('general')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('builds one tab per declared group, ungrouped options collapsing into Display', () => {
        renderTabs(options);

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style', 'Display']);
        expect(screen.getByTestId('general')).toBeInTheDocument();
    });

    it('falls back to each option default and reports changes by name', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderTabs(options, null, onChange);

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        expect(screen.getByLabelText('Show legend')).toBeChecked();

        await user.click(screen.getByLabelText('Show legend'));
        expect(onChange).toHaveBeenCalledWith('showLegend', false);
    });

    it("renders the caller's palette control in the tab the declaration names", async () => {
        const user = userEvent.setup();
        renderTabs(options, { group: 'Style' });

        await user.click(screen.getByRole('tab', { name: 'Style' }));

        expect(screen.getByTestId('palette')).toBeInTheDocument();
    });

    it('opens a tab for a palette whose group no option shares', async () => {
        const user = userEvent.setup();
        renderTabs(options, { group: 'Colours' });

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style', 'Display', 'Colours']);

        await user.click(screen.getByRole('tab', { name: 'Colours' }));
        expect(screen.getByTestId('palette')).toBeInTheDocument();
    });

    it('shows the palette control once, in one tab only', async () => {
        const user = userEvent.setup();
        renderTabs(options, { group: 'Style' });

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        expect(screen.getAllByTestId('palette')).toHaveLength(1);

        await user.click(screen.getByRole('tab', { name: 'Display' }));
        expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    });

    it('renders no palette control when the viz declares none', async () => {
        const user = userEvent.setup();
        renderTabs(options, null);

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        expect(screen.queryByTestId('palette')).not.toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: 'Display' }));
        expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    });

    it('builds a tab strip for a viz that declares only a palette', async () => {
        const user = userEvent.setup();
        renderTabs([], { group: 'Colours' });

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Colours']);

        await user.click(screen.getByRole('tab', { name: 'Colours' }));
        expect(screen.getByTestId('palette')).toBeInTheDocument();
    });
});
