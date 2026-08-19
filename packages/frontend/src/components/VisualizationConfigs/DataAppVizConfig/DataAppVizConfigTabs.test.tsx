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
    onCreateNew: (() => void) | null;
    onSelectProjectType: (dataAppViz: DataAppViz) => void;
};

type FieldSelectProps = {
    items: Item[];
    onChange: (item: Item | null) => void;
};

const {
    fieldSelectItems,
    fieldSelectProps,
    locationSearch,
    navigate,
    pickerProps,
} = vi.hoisted(() => ({
    fieldSelectItems: [] as Item[][],
    fieldSelectProps: [] as FieldSelectProps[],
    locationSearch: { current: '' },
    navigate: vi.fn(),
    pickerProps: [] as PickerProps[],
}));

vi.mock('../CustomChartType/CustomChartTypePicker', () => ({
    default: (props: PickerProps) => {
        pickerProps.push(props);
        return <div data-testid="viz-picker" />;
    },
}));
vi.mock('../../../features/chartTypes/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));
// The panel reads the project from the route, which this test does not mount.
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-1' }),
    useLocation: () => ({ search: locationSearch.current }),
    // The panel navigates to the builder; this test does not mount a router.
    useNavigate: () => navigate,
    Link: ({ to, children, ...rest }: ReactRouter.LinkProps) => (
        <a
            href={
                typeof to === 'string'
                    ? to
                    : `${to.pathname ?? ''}${to.search ?? ''}`
            }
            {...rest}
        >
            {children}
        </a>
    ),
}));
vi.mock('../../common/FieldSelect', () => ({
    default: (props: FieldSelectProps) => {
        fieldSelectItems.push(props.items);
        fieldSelectProps.push(props);
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

import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
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
            dataAppVizUuid: 'data-app-viz-uuid',
            name: 'Radial gauge',
            description: '',
            spaceUuid: null,
            createdByUserUuid: MOCK_USER_UUID,
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
    const setField = vi.fn();
    const setPivotDimensions = vi.fn();

    const mockContext = (
        itemsMap: ItemsMap,
        dataAppVizUuid: string = 'data-app-viz-uuid',
        optionValues: Record<string, boolean | number | string> = {},
        fieldMapping: Record<string, string> = {},
    ) =>
        vi.mocked(useVisualizationContext).mockReturnValue({
            itemsMap,
            setPivotDimensions,
            visualizationConfig: {
                chartType: ChartType.DATA_APP_VIZ,
                chartConfig: {
                    dataAppVizUuid,
                    fieldMapping,
                    optionValues,
                    setDataAppVizUuid,
                    setField,
                    setOption,
                },
            },
        } as unknown as ReturnType<typeof useVisualizationContext>);

    beforeEach(() => {
        fieldSelectItems.length = 0;
        fieldSelectProps.length = 0;
        pickerProps.length = 0;
        locationSearch.current = '';
        navigate.mockClear();
        setOption.mockClear();
        setDataAppVizUuid.mockClear();
        setField.mockClear();
        setPivotDimensions.mockClear();
        defaultAbility.update([]);
        mockSchema([]);
        mockContext(queryColumns);
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

    it('replaces option controls when the visualization contract changes', async () => {
        const user = userEvent.setup();
        mockContext(queryColumns, 'data-app-viz-uuid', {
            showLegend: false,
        });
        mockSchema([declaredOptions[0]]);
        const { rerender } = renderWithProviders(<ConfigTabs />);

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        expect(screen.getByLabelText('Show legend')).not.toBeChecked();

        mockSchema([
            {
                type: 'number',
                name: 'pointSize',
                label: 'Point size',
                group: 'Marks',
                default: 6,
            },
        ]);
        rerender(<ConfigTabs />);

        expect(
            screen.queryByRole('tab', { name: 'Style' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await user.click(screen.getByRole('tab', { name: 'Marks' }));
        expect(screen.getByLabelText('Point size')).toHaveValue('6');
        expect(screen.queryByLabelText('Show legend')).not.toBeInTheDocument();
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
        act(() =>
            pickerProps[pickerProps.length - 1].onSelectProjectType(picked),
        );

        expect(setDataAppVizUuid).toHaveBeenCalledWith('picked-uuid', {
            source: 'orders_visible',
            value: 'orders_visible_metric',
            breakdown: 'custom-dimension',
        });
        expect(setPivotDimensions).toHaveBeenCalledWith(['custom-dimension']);
    });

    it('updates pivot dimensions when a series mapping changes', () => {
        const fields: DataAppVizField[] = [
            ...declaredFields,
            {
                name: 'breakdown',
                label: 'Breakdown',
                type: 'series',
                required: false,
            },
        ];
        mockSchema([], null, {
            schema: { fields, configOptions: [], colorPalette: null },
        });
        mockContext(
            queryColumns,
            'data-app-viz-uuid',
            {},
            {
                source: 'orders_visible',
                value: 'orders_visible_metric',
            },
        );
        renderWithProviders(<ConfigTabs />);

        act(() =>
            fieldSelectProps[fieldSelectProps.length - 1].onChange(
                customDimension,
            ),
        );

        expect(setField).toHaveBeenCalledWith('breakdown', 'custom-dimension');
        expect(setPivotDimensions).toHaveBeenCalledWith(['custom-dimension']);
    });

    it('will not offer the picker before the query has columns', () => {
        mockContext({});
        renderWithProviders(<ConfigTabs />);

        expect(pickerProps[pickerProps.length - 1].disabled).toBe(true);
        expect(
            screen.getByText('Run your query to pick a custom chart type.'),
        ).toBeInTheDocument();
    });

    it('points builders at the dedicated builder when nothing is selected', async () => {
        signInAs(OrganizationMemberRole.EDITOR);
        mockContext(queryColumns, '');
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useDataAppVisualization>);

        renderWithProviders(<ConfigTabs />);

        // `findBy`: the gate reads false until the user query settles.
        expect(
            (await screen.findByText('builder')).closest('a'),
        ).toHaveAttribute('href', '/projects/project-1/chart-types/new');
    });

    it('keeps the Explorer query in builder links', async () => {
        signInAs(OrganizationMemberRole.EDITOR);
        mockContext(queryColumns, '');
        locationSearch.current =
            '?create_saved_chart_version=serialized-query&fromSpace=space-1';
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useDataAppVisualization>);

        renderWithProviders(<ConfigTabs />);

        expect(
            (await screen.findByText('builder')).closest('a'),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/chart-types/new?create_saved_chart_version=serialized-query&fromSpace=space-1',
        );
        act(() => pickerProps[pickerProps.length - 1].onCreateNew?.());
        expect(navigate).toHaveBeenCalledWith({
            pathname: '/projects/project-1/chart-types/new',
            search: locationSearch.current,
        });
    });

    it('offers no builder link to who cannot create chart types', async () => {
        signInAs(OrganizationMemberRole.INTERACTIVE_VIEWER);
        mockContext(queryColumns, '');
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useDataAppVisualization>);

        renderWithProviders(<ConfigTabs />);

        expect(
            await screen.findByText(/Pick a chart type above/),
        ).toBeInTheDocument();
        await expect(screen.findByText('builder')).rejects.toThrow();
    });

    it('describes the selected type with a jump into its builder', async () => {
        signInAs(OrganizationMemberRole.EDITOR);
        locationSearch.current = '?fromDashboard=dashboard-1';
        mockSchema([], null, { description: 'A gauge for KPI progress' });
        renderWithProviders(<ConfigTabs />);

        expect(screen.getByText('Radial gauge')).toBeInTheDocument();
        expect(
            screen.getByText('A gauge for KPI progress'),
        ).toBeInTheDocument();
        // `findBy`: the gate reads false until the user query settles.
        expect(
            (await screen.findByText('Edit ↗')).closest('a'),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/chart-types/data-app-viz-uuid?fromDashboard=dashboard-1',
        );
    });

    it('offers no builder jump to who cannot edit the selected type', async () => {
        signInAs(OrganizationMemberRole.INTERACTIVE_VIEWER);
        mockSchema([], null, { createdByUserUuid: 'someone-else' });
        renderWithProviders(<ConfigTabs />);

        expect(screen.getByText('Radial gauge')).toBeInTheDocument();
        await expect(screen.findByText('Edit ↗')).rejects.toThrow();
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
