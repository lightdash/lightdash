import { type DataAppVizSchema } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ConfigurePanel from './ConfigurePanel';

vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));

const schema: DataAppVizSchema = {
    fields: [],
    configOptions: [
        { name: 'grid', label: 'Show grid', type: 'boolean', default: true },
        {
            name: 'markers',
            label: 'Show markers',
            type: 'boolean',
            group: 'Style',
            default: false,
        },
    ],
    colorPalette: null,
};

const schemaWithFields: DataAppVizSchema = {
    ...schema,
    fields: [
        { name: 'x', label: 'X axis', type: 'dimension', required: true },
        { name: 'y', label: 'Y axis', type: 'metric', required: false },
    ],
};

const renderPanel = (
    props: Partial<React.ComponentProps<typeof ConfigurePanel>> = {},
) =>
    renderWithProviders(
        <ConfigurePanel
            schema={schema}
            optionValues={{}}
            onOptionChange={vi.fn()}
            colorPaletteUuid={null}
            onPaletteChange={vi.fn()}
            resolvedColorPalette={['#111111']}
            isStale={false}
            {...props}
        />,
    );

describe('ConfigurePanel', () => {
    it('marks the options as the generated contract', () => {
        renderPanel();

        expect(screen.getByText('Generated options')).toBeInTheDocument();
    });

    it('splits the declared options into one tab per group', () => {
        renderPanel();

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['Display', 'Style']);
        expect(screen.getByLabelText('Show grid')).toBeInTheDocument();
        expect(screen.queryByLabelText('Show markers')).not.toBeInTheDocument();
    });

    it('shows another group once its tab is selected', () => {
        renderPanel();

        fireEvent.click(screen.getByRole('tab', { name: 'Style' }));

        expect(screen.getByLabelText('Show markers')).toBeInTheDocument();
        expect(screen.queryByLabelText('Show grid')).not.toBeInTheDocument();
    });

    it('reports an edited option by name', () => {
        const onOptionChange = vi.fn();
        renderPanel({ onOptionChange });

        fireEvent.click(screen.getByLabelText('Show grid'));

        expect(onOptionChange).toHaveBeenCalledWith('grid', false);
    });

    it('falls back to the declared default when no value is stored', () => {
        renderPanel();

        expect(screen.getByLabelText('Show grid')).toBeChecked();
    });

    it('says so when a chart type declares nothing to configure', () => {
        renderPanel({
            schema: { fields: [], configOptions: [], colorPalette: null },
        });

        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
        expect(
            screen.getByText('This chart type declares no display options.'),
        ).toBeInTheDocument();
    });

    it('lists the schema fields as chart inputs, with type and required marker', () => {
        renderPanel({ schema: schemaWithFields });

        expect(screen.getByText('Chart inputs')).toBeInTheDocument();
        expect(screen.getByText('X axis')).toBeInTheDocument();
        expect(screen.getByText('dimension')).toBeInTheDocument();
        expect(screen.getByText('Y axis')).toBeInTheDocument();
        expect(screen.getByText('metric')).toBeInTheDocument();
        // Required is conveyed with text, not colour alone.
        expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('hides the chart inputs section when the schema declares no fields', () => {
        renderPanel();

        expect(screen.queryByText('Chart inputs')).not.toBeInTheDocument();
    });
});
