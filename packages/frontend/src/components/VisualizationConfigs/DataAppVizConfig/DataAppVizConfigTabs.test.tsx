import {
    ChartType,
    CustomDimensionType,
    defineUserAbility,
    DimensionType,
    FieldType,
    getItemId,
    MetricType,
    OrganizationMemberRole,
    type CompiledDimension,
    type CompiledMetric,
    type CustomSqlDimension,
    type DataAppViz,
    type DataAppVizConfigOption,
    type DataAppVizPaletteDeclaration,
    type DataAppVizField,
    type Item,
    type ItemsMap,
    type TableCalculation,
} from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAbility } from '../../../providers/Ability/constants';
import { renderWithProviders } from '../../../testing/testUtils';
import { ConfigTabs } from './DataAppVizConfigTabs';

type PickerProps = {
    disabled: boolean;
    onSelect: (dataAppViz: DataAppViz | null) => void;
};

const { fieldSelectItems, pickerProps } = vi.hoisted(() => ({
    fieldSelectItems: [] as Item[][],
    pickerProps: [] as PickerProps[],
}));

vi.mock('../../../features/apps/components/DataAppVizLibraryPicker', () => ({
    default: (props: PickerProps) => {
        pickerProps.push(props);
        return <div data-testid="viz-picker" />;
    },
}));
vi.mock('../../../features/apps/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));
vi.mock('../../../features/apps/components/DataAppVizDock', () => ({
    default: () => <div data-testid="viz-dock" />,
}));
// The panel reads the project from the route, which this test does not mount.
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-1' }),
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
    viz: Partial<DataAppViz> = {},
) => {
    vi.mocked(useDataAppVisualization).mockReturnValue({
        data: {
            schema: { fields: declaredFields, configOptions, colorPalette },
            ...viz,
        },
    } as unknown as ReturnType<typeof useDataAppVisualization>);
};

// The org and user the app-provider mock signs in as; an ability has to be
// built for the same pair to match its conditions.
const MOCK_ORGANIZATION_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';
const MOCK_USER_UUID = 'b264d83a-9000-426a-85ec-3f9c20f368ce';

const signInAs = (role: OrganizationMemberRole) =>
    defaultAbility.update(
        defineUserAbility(
            {
                role,
                organizationUuid: MOCK_ORGANIZATION_UUID,
                userUuid: MOCK_USER_UUID,
                roleUuid: undefined,
            },
            [],
        ).rules,
    );

const queryColumns: ItemsMap = {
    orders_visible: makeDimension('visible', false),
    orders_hidden: makeDimension('hidden', true),
    orders_visible_metric: makeMetric('visible_metric', false),
    orders_hidden_metric: makeMetric('hidden_metric', true),
    'custom-dimension': customDimension,
    table_calculation: tableCalculation,
};

describe('DataAppVizConfigTabs', () => {
    const setOption = vi.fn();
    const setDataAppVizUuid = vi.fn();

    const mockContext = (itemsMap: ItemsMap) =>
        vi.mocked(useVisualizationContext).mockReturnValue({
            itemsMap,
            visualizationConfig: {
                chartType: ChartType.DATA_APP_VIZ,
                chartConfig: {
                    dataAppVizUuid: 'data-app-viz-uuid',
                    fieldMapping: {},
                    optionValues: {},
                    setDataAppVizUuid,
                    setField: vi.fn(),
                    setOption,
                },
            },
        } as unknown as ReturnType<typeof useVisualizationContext>);

    beforeEach(() => {
        fieldSelectItems.length = 0;
        pickerProps.length = 0;
        setOption.mockClear();
        setDataAppVizUuid.mockClear();
        defaultAbility.update([]);
        mockSchema([]);
        mockContext(queryColumns);
    });

    it('offers the dock over their own visualization', async () => {
        signInAs(OrganizationMemberRole.EDITOR);
        mockSchema([], null, {
            spaceUuid: null,
            createdByUserUuid: MOCK_USER_UUID,
        });

        renderWithProviders(<ConfigTabs />);

        expect(await screen.findByTestId('viz-dock')).toBeInTheDocument();
    });

    // Ownership grants manage, so the role floor for revising a visualization
    // is lower than the one for building a new one.
    it('offers it to an interactive viewer over their own visualization', async () => {
        signInAs(OrganizationMemberRole.INTERACTIVE_VIEWER);
        mockSchema([], null, {
            spaceUuid: null,
            createdByUserUuid: MOCK_USER_UUID,
        });

        renderWithProviders(<ConfigTabs />);

        expect(await screen.findByTestId('viz-dock')).toBeInTheDocument();
    });

    it("withholds it over someone else's visualization, which they cannot revise", async () => {
        signInAs(OrganizationMemberRole.EDITOR);
        mockSchema([], null, {
            spaceUuid: null,
            createdByUserUuid: 'someone-else',
        });

        renderWithProviders(<ConfigTabs />);

        // The picker is theirs — choosing a renderer is configuring a chart.
        expect(await screen.findByTestId('viz-picker')).toBeInTheDocument();
        // `findBy` rather than `queryBy`: the gate reads false until the user
        // query settles, so an immediate assertion passes on timing alone.
        await expect(screen.findByTestId('viz-dock')).rejects.toThrow();
    });

    it('matches Explorer field visibility', () => {
        renderWithProviders(<ConfigTabs />);

        expect(fieldSelectItems.map((items) => items.map(getItemId))).toEqual([
            ['orders_visible', 'custom-dimension'],
            ['orders_visible_metric', 'table_calculation'],
        ]);
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

    it('binds the picked viz contract to the query columns', () => {
        renderWithProviders(<ConfigTabs />);

        const picked = {
            dataAppVizUuid: 'picked-uuid',
            schema: {
                fields: [
                    ...declaredFields,
                    {
                        name: 'breakdown',
                        label: 'Breakdown',
                        type: 'series',
                        required: false,
                    },
                ],
                configOptions: [],
                colorPalette: null,
            },
        } as unknown as DataAppViz;
        act(() => pickerProps[pickerProps.length - 1].onSelect(picked));

        expect(setDataAppVizUuid).toHaveBeenCalledWith('picked-uuid', {
            source: 'orders_visible',
            value: 'orders_visible_metric',
            breakdown: 'custom-dimension',
        });
    });

    it('will not offer the picker before the query has columns', () => {
        mockContext({});
        renderWithProviders(<ConfigTabs />);

        expect(pickerProps[pickerProps.length - 1].disabled).toBe(true);
        expect(
            screen.getByText('Run your query to pick a visualization.'),
        ).toBeInTheDocument();
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
