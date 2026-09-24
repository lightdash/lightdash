import {
    type DataAppVizConfigOption,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type DataAppVizPaletteDeclaration,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';

const generalContent = <Box data-testid="general">General content</Box>;
const paletteControl = <Box data-testid="palette">Palette picker</Box>;

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

const tabs = (
    configOptions: DataAppVizConfigOption[],
    colorPalette: DataAppVizPaletteDeclaration | null = null,
    onChange = vi.fn(),
    fields: DataAppVizField[] = [],
    fieldMapping: DataAppVizFieldMapping = {},
) => (
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
            <Box data-testid="field-options">{group}</Box>
        )}
        conditionalFormatting={null}
        conditionalFormattingControl={null}
    />
);

const renderTabs = (...args: Parameters<typeof tabs>) =>
    renderWithProviders(tabs(...args));

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

    it('returns to General when the selected field group loses its last binding', async () => {
        const user = userEvent.setup();
        const { rerender } = renderTabs(
            options,
            null,
            vi.fn(),
            [metricsField],
            {
                metrics: ['orders_revenue'],
            },
        );
        await user.click(screen.getByRole('tab', { name: 'Series' }));

        rerender(tabs(options, null, vi.fn(), [metricsField], {}));

        expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(screen.getByTestId('general')).toBeVisible();
    });

    it('preserves the selected group when an earlier field group disappears', async () => {
        const user = userEvent.setup();
        const otherField: DataAppVizField = {
            ...metricsField,
            name: 'other',
            configOptions: [{ ...options[0], group: 'Other' }],
        };
        const fields = [metricsField, otherField];
        const { rerender } = renderTabs([], null, vi.fn(), fields, {
            metrics: ['orders_revenue'],
            other: ['orders_count'],
        });
        await user.click(screen.getByRole('tab', { name: 'Other' }));

        rerender(tabs([], null, vi.fn(), fields, { other: ['orders_count'] }));

        expect(screen.getByRole('tab', { name: 'Other' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(screen.getByTestId('field-options')).toHaveTextContent('Other');
    });

    it('preserves the selected group when declarations are reordered', async () => {
        const user = userEvent.setup();
        const { rerender } = renderTabs(options);
        await user.click(screen.getByRole('tab', { name: 'Style' }));

        rerender(tabs([...options].reverse()));

        expect(screen.getByRole('tab', { name: 'Style' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(screen.getByLabelText('Show legend')).toBeVisible();
    });
});
