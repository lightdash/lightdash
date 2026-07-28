import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    getItemId,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type CustomSqlDimension,
    type DataAppVizConfigOption,
    type DataAppVizPaletteDeclaration,
    type DataAppVizField,
    type Item,
    type TableCalculation,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ConfigTabs } from './DataAppVizConfigTabs';

const { fieldSelectItems } = vi.hoisted(() => ({
    fieldSelectItems: [] as Item[][],
}));

vi.mock('../../../features/apps/components/DataAppVizLibraryPicker', () => ({
    default: () => null,
}));
vi.mock('../../../features/apps/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));
vi.mock('../../common/FieldSelect', () => ({
    default: ({ items }: { items: Item[] }) => {
        fieldSelectItems.push(items);
        return <div data-testid="field-select" />;
    },
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: vi.fn(),
}));
// Self-wiring against the Explorer store, which this panel test doesn't mount.
vi.mock('../common/ColorPaletteSection', () => ({
    ColorPaletteSection: () => <div data-testid="color-palette-section" />,
}));

import { useDataAppVisualization } from '../../../features/apps/hooks/useDataAppVisualization';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

const makeDimension = (name: string, hidden: boolean): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const makeMetric = (name: string, hidden: boolean): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const customDimension: CustomSqlDimension = {
    id: 'custom-dimension',
    name: 'custom',
    table: 'orders',
    type: CustomDimensionType.SQL,
    sql: '${orders.visible}',
    dimensionType: DimensionType.STRING,
};

const tableCalculation: TableCalculation = {
    name: 'table_calculation',
    displayName: 'Table calculation',
    sql: '${orders_visible_metric}',
};

const declaredFields: DataAppVizField[] = [
    { name: 'source', label: 'Source', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];

const declaredOptions: DataAppVizConfigOption[] = [
    {
        type: 'boolean',
        name: 'showLegend',
        label: 'Show legend',
        group: 'Style',
        default: true,
    },
    {
        type: 'text',
        name: 'title',
        label: 'Title',
        group: 'Style',
        default: 'Sales',
    },
    { type: 'number', name: 'barWidth', label: 'Bar width', default: 8 },
];

const mockSchema = (
    configOptions: DataAppVizConfigOption[],
    colorPalette: DataAppVizPaletteDeclaration | null = null,
) => {
    vi.mocked(useDataAppVisualization).mockReturnValue({
        data: {
            schema: { fields: declaredFields, configOptions, colorPalette },
        },
    } as unknown as ReturnType<typeof useDataAppVisualization>);
};

describe('DataAppVizConfigTabs', () => {
    const setOption = vi.fn();

    beforeEach(() => {
        fieldSelectItems.length = 0;
        setOption.mockClear();
        mockSchema([]);
        vi.mocked(useVisualizationContext).mockReturnValue({
            itemsMap: {
                orders_visible: makeDimension('visible', false),
                orders_hidden: makeDimension('hidden', true),
                orders_visible_metric: makeMetric('visible_metric', false),
                orders_hidden_metric: makeMetric('hidden_metric', true),
                'custom-dimension': customDimension,
                table_calculation: tableCalculation,
            },
            visualizationConfig: {
                chartType: ChartType.DATA_APP_VIZ,
                chartConfig: {
                    dataAppVizUuid: 'data-app-viz-uuid',
                    fieldMapping: {},
                    optionValues: {},
                    setDataAppVizUuid: vi.fn(),
                    setField: vi.fn(),
                    setOption,
                },
            },
        } as unknown as ReturnType<typeof useVisualizationContext>);
    });

    it('matches Explorer field visibility', () => {
        renderWithProviders(<ConfigTabs />);

        expect(fieldSelectItems.map((items) => items.map(getItemId))).toEqual([
            ['orders_visible', 'custom-dimension'],
            ['orders_visible_metric', 'table_calculation'],
        ]);
    });

    it('renders no tab strip when the viz declares no options', () => {
        renderWithProviders(<ConfigTabs />);

        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('builds one tab per declared group, ungrouped options collapsing into Display', () => {
        mockSchema(declaredOptions);

        renderWithProviders(<ConfigTabs />);

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style', 'Display']);
    });

    it('renders declared defaults when nothing is stored', async () => {
        const user = userEvent.setup();
        mockSchema(declaredOptions);
        renderWithProviders(<ConfigTabs />);

        await user.click(screen.getByRole('tab', { name: 'Style' }));

        expect(screen.getByLabelText('Show legend')).toBeChecked();
        expect(screen.getByLabelText('Title')).toHaveValue('Sales');

        await user.click(screen.getByRole('tab', { name: 'Display' }));

        expect(screen.getByLabelText('Bar width')).toHaveValue('8');
    });

    it('renders the standard palette picker for a declared palette', async () => {
        const user = userEvent.setup();
        mockSchema([], { group: 'Colours' });
        renderWithProviders(<ConfigTabs />);

        await user.click(screen.getByRole('tab', { name: 'Colours' }));

        expect(screen.getByTestId('color-palette-section')).toBeInTheDocument();
    });

    it('fires setOption when a control changes', async () => {
        const user = userEvent.setup();
        mockSchema(declaredOptions);
        renderWithProviders(<ConfigTabs />);

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        await user.click(screen.getByLabelText('Show legend'));

        expect(setOption).toHaveBeenCalledWith(
            'data-app-viz-uuid',
            'showLegend',
            false,
        );
    });
});
