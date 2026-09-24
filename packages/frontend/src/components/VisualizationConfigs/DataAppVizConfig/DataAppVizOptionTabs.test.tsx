import {
    type DataAppVizConfigOption,
    type DataAppVizField,
    type DataAppVizFieldMapping,
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
    fields: DataAppVizField[] = [],
    fieldMapping: DataAppVizFieldMapping = {},
) =>
    renderWithProviders(
        <DataAppVizOptionTabs
            generalContent={generalContent}
            configOptions={configOptions}
            values={{}}
            onChange={onChange}
            colorPalette={colorPalette}
            resolvedColorPalette={['#111111', '#222222']}
            paletteControl={paletteControl}
            fields={fields}
            fieldMapping={fieldMapping}
            renderFieldOptions={(group) => (
                <div data-testid="field-options">{group}</div>
            )}
        />,
    );

describe('DataAppVizOptionTabs', () => {
    it('renders the general content bare when no options are declared', () => {
        renderTabs([]);

        expect(screen.getByTestId('general')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('keeps the general content in its own tab alongside the option groups', () => {
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

        await user.click(screen.getByRole('tab', { name: 'Colours' }));

        expect(screen.getByTestId('palette')).toBeInTheDocument();
    });

    const metricsField: DataAppVizField = {
        name: 'metrics',
        label: 'Metrics',
        type: 'metric',
        required: true,
        configOptions: [
            {
                type: 'color',
                name: 'color',
                label: 'Colour',
                group: 'Series',
                default: '#111111',
            },
        ],
    };

    it('renders grouped per-field options in their group tab', async () => {
        const user = userEvent.setup();
        renderTabs(options, null, vi.fn(), [metricsField], {
            metrics: ['orders_revenue'],
        });

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style', 'Display', 'Series']);
        await user.click(screen.getByRole('tab', { name: 'Series' }));
        expect(screen.getByTestId('field-options')).toHaveTextContent('Series');
    });

    it('adds no per-field option tab while the input has no bound field', () => {
        renderTabs(options, null, vi.fn(), [metricsField], {});

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style', 'Display']);
    });
});
