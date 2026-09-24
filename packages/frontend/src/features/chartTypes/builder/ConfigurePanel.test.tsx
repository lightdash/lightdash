import { type DataAppVizSchema } from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { buildSampleVizContext } from '../utils/sampleVizContext';
import ConfigurePanel from './ConfigurePanel';
import { type ExploreSourceControls } from './exploreSource';
import { type SavedChartSourceControls } from './savedChartSource';

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
        {
            name: 'x',
            label: 'X axis',
            type: 'dimension',
            required: true,
            description: 'The category plotted across the chart.',
        },
        { name: 'y', label: 'Y axis', type: 'metric', required: false },
    ],
};

const renderPanel = ({
    schema: panelSchema = schema,
    ...props
}: Partial<React.ComponentProps<typeof ConfigurePanel>> = {}) =>
    renderWithProviders(
        <ConfigurePanel
            schema={panelSchema}
            optionValues={{}}
            onOptionChange={vi.fn()}
            colorPaletteUuid={null}
            onPaletteChange={vi.fn()}
            resolvedColorPalette={['#111111']}
            previewContext={buildSampleVizContext(panelSchema)}
            isStale={false}
            {...props}
        />,
    );

describe('ConfigurePanel', () => {
    it('keeps generated options above the tabs', () => {
        renderPanel();

        expect(screen.getByText('Generated options')).toBeVisible();
        expect(
            screen
                .getByText('Generated options')
                .compareDocumentPosition(screen.getByRole('tablist')),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));
        expect(screen.getByText('Generated options')).toBeVisible();
        expect(
            screen.queryByText('View sample data · 12 rows'),
        ).not.toBeInTheDocument();
    });

    it('splits the declared options into one tab per group', () => {
        renderPanel();

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Display', 'Style']);
        expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));
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
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));

        fireEvent.click(screen.getByLabelText('Show grid'));

        expect(onOptionChange).toHaveBeenCalledWith('grid', false);
    });

    it('falls back to the declared default when no value is stored', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));

        expect(screen.getByLabelText('Show grid')).toBeChecked();
    });

    it('says so when a chart type declares nothing to configure', () => {
        renderPanel({
            schema: { fields: [], configOptions: [], colorPalette: null },
        });

        expect(screen.getByRole('tab', { name: 'General' })).toBeVisible();
        expect(
            screen.getByText('This chart type declares no display options.'),
        ).toBeInTheDocument();
    });

    it('lists the schema fields as chart inputs, with type and required marker', () => {
        renderPanel({ schema: schemaWithFields });

        expect(
            within(screen.getByRole('tabpanel', { name: 'General' })).getByText(
                'Chart inputs',
            ),
        ).toBeVisible();
        const generalPanel = screen.getByRole('tabpanel', { name: 'General' });
        expect(within(generalPanel).getAllByText('X axis')).not.toHaveLength(0);
        expect(within(generalPanel).getByText('dimension')).toBeInTheDocument();
        expect(within(generalPanel).getAllByText('Y axis')).not.toHaveLength(0);
        expect(within(generalPanel).getByText('metric')).toBeInTheDocument();
        expect(screen.getByLabelText('About X axis')).toBeInTheDocument();
        expect(screen.getByText('View sample data · 12 rows')).toBeVisible();
        // Required is conveyed with text, not colour alone.
        expect(screen.getByText('Required')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));
        expect(screen.queryByText('Chart inputs')).not.toBeInTheDocument();
    });

    it('reveals only declared chart guidance on demand', async () => {
        const guidance =
            'Use one row per month and map each metric to its declared field.';
        renderPanel({
            schema: { ...schemaWithFields, inputGuidance: guidance },
        });

        const disclosure = screen.getByRole('button', {
            name: 'How to use this chart type',
        });
        const sampleDataLauncher = screen.getByRole('button', {
            name: 'View sample data · 12 rows',
        });
        expect(sampleDataLauncher.compareDocumentPosition(disclosure)).toBe(
            Node.DOCUMENT_POSITION_PRECEDING,
        );
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText(guidance)).not.toBeVisible();

        fireEvent.click(disclosure);

        await waitFor(() => expect(screen.getByText(guidance)).toBeVisible());
    });

    it('returns to General if the selected option group disappears', () => {
        const { rerender } = renderPanel();
        fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
        rerender(
            <ConfigurePanel
                schema={{
                    fields: schemaWithFields.fields,
                    configOptions: [],
                    colorPalette: null,
                }}
                optionValues={{}}
                onOptionChange={vi.fn()}
                colorPaletteUuid={null}
                onPaletteChange={vi.fn()}
                resolvedColorPalette={[]}
                previewContext={buildSampleVizContext({
                    fields: schemaWithFields.fields,
                    configOptions: [],
                    colorPalette: null,
                })}
                isStale={false}
            />,
        );
        expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(screen.getByText('Chart inputs')).toBeVisible();
    });

    it('names the attached source the chart inputs pick fields from', () => {
        const savedChartSource: SavedChartSourceControls = {
            sourceIdentity: 'chart-orders:0',
            attached: {
                uuid: 'chart-orders',
                status: 'ready',
                chartName: 'Orders',
                spaceName: 'Sales',
                rowCount: 6,
                columns: [],
                ranAt: null,
                message: null,
            },
            previewSource: 'chart',
            includeRows: false,
            setIncludeRows: vi.fn(),
            attach: vi.fn(),
            detach: vi.fn(),
            viewRows: vi.fn(),
            retry: vi.fn(),
        };
        const { unmount } = renderPanel({
            schema: schemaWithFields,
            savedChartSource,
            previewDataSource: {
                kind: 'live',
                chartName: 'Orders',
                rowCount: 6,
            },
        });

        expect(
            screen.getByText(
                'Fields from Orders. Changing one re-runs the query.',
            ),
        ).toBeVisible();
        unmount();

        const exploreSource: ExploreSourceControls = {
            sourceIdentity: 'explore-orders:0',
            attached: {
                name: 'orders',
                label: 'Orders',
                joinedTableLabels: [],
                fieldCount: 12,
                queriedFieldCount: 3,
                status: 'ready',
                isRunning: false,
                isPickingFields: false,
                rowCount: 6,
                ranAt: null,
                message: null,
            },
            previewSource: 'explore',
            includeRows: false,
            setIncludeRows: vi.fn(),
            attach: vi.fn(),
            detach: vi.fn(),
            viewRows: vi.fn(),
            retry: vi.fn(),
        };
        const explorePanel = renderPanel({
            schema: schemaWithFields,
            exploreSource,
            previewDataSource: {
                kind: 'live',
                chartName: 'Orders',
                rowCount: 6,
            },
        });
        expect(
            screen.getByText(
                'Fields from Orders. Changing one re-runs the query.',
            ),
        ).toBeVisible();
        explorePanel.unmount();

        renderPanel({ schema: schemaWithFields });
        expect(screen.queryByText(/^Fields from/)).not.toBeInTheDocument();
    });

    it('hides the chart inputs section when the schema declares no fields', () => {
        renderPanel();

        expect(screen.queryByText('Chart inputs')).not.toBeInTheDocument();
    });
});
