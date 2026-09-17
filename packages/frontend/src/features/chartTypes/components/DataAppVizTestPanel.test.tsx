import {
    DimensionType,
    FieldType,
    getItemId,
    MetricType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledMetric,
    type DataAppVizSchema,
    type Explore,
    type Item,
    type ResultRow,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartColorMappingContext } from '../../../hooks/useChartColorConfig/context';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizTestPanel from './DataAppVizTestPanel';
import { buildTestMetricQuery, isMappingComplete } from './dataAppVizTestQuery';

const { fieldSelectItems, exploreByProjectMock, queryExecutorMock } =
    vi.hoisted(() => {
        const fieldSelectItems: Item[][] = [];
        return {
            fieldSelectItems,
            exploreByProjectMock: vi.fn(),
            queryExecutorMock: vi.fn(),
        };
    });

vi.mock('../../../components/common/FieldSelect', () => ({
    default: ({
        items,
        onChange,
        placeholder,
        'aria-label': ariaLabel,
        'aria-describedby': ariaDescribedBy,
    }: {
        items: Item[];
        onChange: (item: Item | undefined) => void;
        placeholder: string;
        'aria-label'?: string;
        'aria-describedby'?: string;
    }) => {
        fieldSelectItems.push(items);
        return (
            <button
                type="button"
                data-testid="field-select"
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                onClick={() => onChange(items[0])}
            >
                {placeholder}
            </button>
        );
    },
}));
vi.mock('../../../components/common/PalettePicker/PalettePicker', () => ({
    PalettePicker: ({
        label,
        onChange,
    }: {
        label: string;
        onChange: (value: string | null) => void;
    }) => (
        <button type="button" onClick={() => onChange('ocean-palette')}>
            {label}
        </button>
    ),
}));
vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: vi.fn(),
}));
vi.mock('../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: vi.fn(),
}));
vi.mock('../../../hooks/useExplores', () => ({
    useExplores: vi.fn(),
}));
vi.mock('../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: exploreByProjectMock,
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: queryExecutorMock,
}));

import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';

const schema: DataAppVizSchema = {
    fields: [
        {
            name: 'source',
            label: 'Source',
            type: 'dimension',
            required: true,
            description: 'The label for each funnel stage',
            examples: ['Listing started', 0, false, null],
        },
        { name: 'target', label: 'Target', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
    inputGuidance:
        'Use one row per stage in order. Reshape separate metrics or flags into stage/count rows before mapping.',
};

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
    colors: name === 'visible' ? { Retail: '#00ff00' } : undefined,
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

const exploreWithHiddenFields: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: '',
            schema: '',
            sqlTable: 'orders',
            dimensions: {
                visible: makeDimension('visible', false),
                hidden: makeDimension('hidden', true),
            },
            metrics: {
                visible_metric: makeMetric('visible_metric', false),
                hidden_metric: makeMetric('hidden_metric', true),
            },
            lineageGraph: {},
        },
    },
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const configurableSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'source',
            label: 'Source',
            type: 'dimension',
            required: true,
        },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLegend',
            label: 'Show legend',
            group: 'Style',
            default: true,
        },
    ],
    colorPalette: { group: 'Style' },
};

const resultRows: ResultRow[] = [
    {
        orders_visible: {
            value: { raw: 'Retail', formatted: 'Retail' },
        },
    },
];

const TestDataAppVizPanel = (
    props: ComponentProps<typeof DataAppVizTestPanel>,
) => (
    <ChartColorMappingContext.Provider value={{ colorMappings: new Map() }}>
        <DataAppVizTestPanel {...props} />
    </ChartColorMappingContext.Provider>
);

describe('isMappingComplete', () => {
    it('is false until every required field is mapped', () => {
        expect(isMappingComplete(schema, {})).toBe(false);
        expect(isMappingComplete(schema, { source: 'orders_status' })).toBe(
            false,
        );
        expect(
            isMappingComplete(schema, {
                source: 'orders_status',
                value: 'orders_total',
            }),
        ).toBe(true);
    });

    it('ignores unmapped optional fields', () => {
        expect(
            isMappingComplete(schema, {
                source: 'orders_status',
                value: 'orders_total',
                // `target` (optional) left unmapped
            }),
        ).toBe(true);
    });
});

describe('buildTestMetricQuery', () => {
    it('routes series/dimension fields to dimensions and metric fields to metrics', () => {
        const q = buildTestMetricQuery('orders', schema, {
            source: 'orders_status',
            target: 'orders_region',
            value: 'orders_total',
        });
        expect(q.exploreName).toBe('orders');
        expect(q.dimensions).toEqual(['orders_status', 'orders_region']);
        expect(q.metrics).toEqual(['orders_total']);
        expect(q.limit).toBe(500);
        expect(q.tableCalculations).toEqual([]);
    });

    it('drops unmapped fields', () => {
        const q = buildTestMetricQuery('orders', schema, {
            source: 'orders_status',
            value: 'orders_total',
        });
        expect(q.dimensions).toEqual(['orders_status']);
        expect(q.metrics).toEqual(['orders_total']);
    });
});

describe('DataAppVizTestPanel', () => {
    beforeEach(() => {
        fieldSelectItems.length = 0;
        vi.mocked(useExplores).mockReturnValue({
            data: [
                { name: 'orders', label: 'Orders' },
                { name: 'customers', label: 'Customers' },
            ],
        } as unknown as ReturnType<typeof useExplores>);
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);
        vi.mocked(useColorPalettes).mockReturnValue({
            data: [
                {
                    colorPaletteUuid: 'ocean-palette',
                    organizationUuid: 'org-1',
                    name: 'Ocean',
                    colors: ['#123456', '#abcdef'],
                    darkColors: null,
                    createdAt: new Date('2026-01-01T00:00:00Z'),
                    isActive: false,
                },
            ],
        } as unknown as ReturnType<typeof useColorPalettes>);
        vi.mocked(useProjectColorPalette).mockReturnValue({
            data: {
                colors: ['#111111'],
                darkColors: null,
                paletteUuid: null,
                paletteName: null,
                source: { type: 'default' },
            },
        } as unknown as ReturnType<typeof useProjectColorPalette>);
        vi.mocked(useQueryExecutor).mockReturnValue([
            {
                query: { isFetching: false, error: null },
                queryResults: {
                    rows: [],
                    isFetchingFirstPage: false,
                    error: null,
                },
            },
            vi.fn(),
        ] as unknown as ReturnType<typeof useQueryExecutor>);
    });

    const runSuccessfulPreviewQuery = async () => {
        const user = userEvent.setup();
        exploreByProjectMock.mockReturnValue({
            data: exploreWithHiddenFields,
        });
        vi.mocked(useQueryExecutor).mockReturnValue([
            {
                query: {
                    data: { queryUuid: 'query-1' },
                    isFetching: false,
                    error: null,
                },
                queryResults: {
                    rows: resultRows,
                    queryUuid: 'query-1',
                    isFetchingFirstPage: false,
                    error: null,
                },
            },
            vi.fn(),
        ] as unknown as ReturnType<typeof useQueryExecutor>);

        await user.click(screen.getByPlaceholderText('Select an explore'));
        await user.click(await screen.findByText('Orders'));
        await user.click(screen.getByRole('button', { name: 'Source' }));
        await user.click(
            screen.getByRole('button', { name: /run test query/i }),
        );

        return user;
    };

    it('lists the declared fields and the explore picker up-front', () => {
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        expect(
            screen.getByPlaceholderText('Select an explore'),
        ).toBeInTheDocument();
        // Declared fields are visible before an explore is chosen.
        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByText('Value')).toBeInTheDocument();
    });

    it('shows chart setup guidance without inline field descriptions', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('region', { name: 'How to use this chart' }),
        ).toBeVisible();
        expect(
            screen.getByText(
                'Use one row per stage in order. Reshape separate metrics or flags into stage/count rows before mapping.',
            ),
        ).not.toBeVisible();
        expect(
            screen.getByText('The label for each funnel stage'),
        ).not.toBeVisible();
        expect(
            screen.queryByText('Examples: Listing started, 0, false, null'),
        ).not.toBeInTheDocument();

        const setupHelp = screen.getByRole('button', {
            name: 'How to use this chart',
        });
        expect(setupHelp).toHaveAttribute('aria-expanded', 'false');
        await user.click(setupHelp);
        expect(setupHelp).toHaveAttribute('aria-expanded', 'true');
        await waitFor(() =>
            expect(screen.getByText(/^Use one row per stage/)).toBeVisible(),
        );

        await user.hover(screen.getByRole('img', { name: 'About Source' }));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'The label for each funnel stage',
        );
        expect(
            screen.queryByText('Examples: Listing started, 0, false, null'),
        ).not.toBeInTheDocument();
        expect(
            screen
                .getAllByText('The label for each funnel stage')
                .some((element) => !element.hasAttribute('hidden')),
        ).toBe(true);
    });

    it('links each field picker to its own mapping guidance after selecting an explore', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        await user.click(screen.getByPlaceholderText('Select an explore'));
        await user.click(await screen.findByText('Orders'));

        expect(
            screen.getByRole('button', { name: 'Source' }),
        ).toHaveAccessibleDescription('The label for each funnel stage');
        expect(
            screen.getByRole('button', { name: 'Value' }),
        ).not.toHaveAttribute('aria-describedby');
        expect(
            screen.queryByRole('img', { name: 'About Value' }),
        ).not.toBeInTheDocument();
    });

    it('requests the same filtered Explore list as Explorer', () => {
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        expect(useExplores).toHaveBeenCalledWith('p1', true);
    });

    it('hides the run action until an explore is selected', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={schema}
                onContextChange={vi.fn()}
            />,
        );

        expect(
            screen.queryByRole('button', { name: /run test query/i }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByPlaceholderText('Select an explore'));
        await user.click(await screen.findByText('Orders'));

        // Still disabled — no field is mapped yet.
        expect(
            screen.getByRole('button', { name: /run test query/i }),
        ).toBeDisabled();
    });

    it('republishes option edits after a successful query', async () => {
        const onContextChange = vi.fn();
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={configurableSchema}
                onContextChange={onContextChange}
            />,
        );

        const user = await runSuccessfulPreviewQuery();
        await waitFor(() =>
            expect(onContextChange).toHaveBeenLastCalledWith({
                fieldMapping: { source: 'orders_visible' },
                rows: resultRows,
                options: { showLegend: true },
                colorPalette: ['#111111'],
                seriesColors: {},
                valueColors: {
                    orders_visible: { Retail: '#00ff00' },
                },
                pivotDetails: null,
                underlyingData: { enabled: false },
                drillDown: { enabled: false },
            }),
        );

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        await user.click(screen.getByLabelText('Show legend'));

        await waitFor(() =>
            expect(onContextChange).toHaveBeenLastCalledWith({
                fieldMapping: { source: 'orders_visible' },
                rows: resultRows,
                options: { showLegend: false },
                colorPalette: ['#111111'],
                seriesColors: {},
                valueColors: {
                    orders_visible: { Retail: '#00ff00' },
                },
                pivotDetails: null,
                underlyingData: { enabled: false },
                drillDown: { enabled: false },
            }),
        );
    });

    it('republishes palette edits after a successful query', async () => {
        const onContextChange = vi.fn();
        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={configurableSchema}
                onContextChange={onContextChange}
            />,
        );

        const user = await runSuccessfulPreviewQuery();
        await waitFor(() =>
            expect(onContextChange).toHaveBeenLastCalledWith({
                fieldMapping: { source: 'orders_visible' },
                rows: resultRows,
                options: { showLegend: true },
                colorPalette: ['#111111'],
                seriesColors: {},
                valueColors: {
                    orders_visible: { Retail: '#00ff00' },
                },
                pivotDetails: null,
                underlyingData: { enabled: false },
                drillDown: { enabled: false },
            }),
        );

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        await user.click(screen.getByRole('button', { name: 'Color palette' }));

        await waitFor(() =>
            expect(onContextChange).toHaveBeenLastCalledWith({
                fieldMapping: { source: 'orders_visible' },
                rows: resultRows,
                options: { showLegend: true },
                colorPalette: ['#123456', '#abcdef'],
                seriesColors: {},
                valueColors: {
                    orders_visible: { Retail: '#00ff00' },
                },
                pivotDetails: null,
                underlyingData: { enabled: false },
                drillDown: { enabled: false },
            }),
        );
    });

    it('matches Explorer field visibility', async () => {
        const user = userEvent.setup();
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: exploreWithHiddenFields,
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);

        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={{
                    fields: [
                        {
                            name: 'source',
                            label: 'Source',
                            type: 'dimension',
                            required: true,
                        },
                        {
                            name: 'value',
                            label: 'Value',
                            type: 'metric',
                            required: true,
                        },
                    ],
                    configOptions: [],
                    colorPalette: null,
                }}
                onContextChange={vi.fn()}
            />,
        );

        await user.click(screen.getByPlaceholderText('Select an explore'));
        await user.click(await screen.findByText('Orders'));

        expect(fieldSelectItems.map((items) => items.map(getItemId))).toEqual([
            ['orders_visible'],
            ['orders_visible_metric'],
        ]);
    });

    it('sends mapped series fields through the shared pivot derivation', async () => {
        const user = userEvent.setup();
        exploreByProjectMock.mockReturnValue({
            data: exploreWithHiddenFields,
        });

        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={{
                    ...schema,
                    fields: schema.fields.map((field) => ({
                        ...field,
                        required: true,
                    })),
                }}
                onContextChange={vi.fn()}
            />,
        );

        await user.click(screen.getByPlaceholderText('Select an explore'));
        await user.click(await screen.findByText('Orders'));
        await user.click(screen.getByRole('button', { name: 'Source' }));
        await user.click(screen.getByRole('button', { name: 'Target' }));
        await user.click(screen.getByRole('button', { name: 'Value' }));
        await user.click(
            screen.getByRole('button', { name: /run test query/i }),
        );

        expect(useQueryExecutor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                pivotConfiguration: {
                    indexColumn: [],
                    valuesColumns: [
                        {
                            reference: 'orders_visible_metric',
                            aggregation: 'any',
                        },
                    ],
                    groupByColumns: [{ reference: 'orders_visible' }],
                    sortBy: undefined,
                },
            }),
            [],
            true,
        );
    });

    it('pushes returned pivot metadata into the builder iframe context', async () => {
        const user = userEvent.setup();
        const pivotDetails = {
            indexColumn: [],
            valuesColumns: [
                {
                    referenceField: 'orders_visible_metric',
                    pivotColumnName: 'orders_visible_metric__visible_retail',
                    aggregation: 'any',
                    pivotValues: [
                        {
                            referenceField: 'orders_visible',
                            value: 'Retail',
                            formatted: 'Retail',
                        },
                    ],
                },
            ],
            groupByColumns: [{ reference: 'orders_visible' }],
        };
        exploreByProjectMock.mockReturnValue({
            data: exploreWithHiddenFields,
        });
        queryExecutorMock.mockReturnValue([
            {
                query: {
                    data: { queryUuid: 'query-1' },
                    isFetching: false,
                    error: null,
                },
                queryResults: {
                    rows: resultRows,
                    queryUuid: 'query-1',
                    pivotDetails,
                    isFetchingFirstPage: false,
                    error: null,
                },
            },
            vi.fn(),
        ]);
        const onContextChange = vi.fn();

        renderWithProviders(
            <TestDataAppVizPanel
                projectUuid="p1"
                schema={{
                    ...schema,
                    fields: schema.fields.map((field) => ({
                        ...field,
                        required: true,
                    })),
                }}
                onContextChange={onContextChange}
            />,
        );

        await user.click(screen.getByPlaceholderText('Select an explore'));
        await user.click(await screen.findByText('Orders'));
        await user.click(screen.getByRole('button', { name: 'Source' }));
        await user.click(screen.getByRole('button', { name: 'Target' }));
        await user.click(screen.getByRole('button', { name: 'Value' }));
        await user.click(
            screen.getByRole('button', { name: /run test query/i }),
        );

        await waitFor(() =>
            expect(onContextChange).toHaveBeenLastCalledWith(
                expect.objectContaining({ pivotDetails }),
            ),
        );
    });
});
