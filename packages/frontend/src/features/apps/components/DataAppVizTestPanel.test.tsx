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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizTestPanel from './DataAppVizTestPanel';
import { buildTestMetricQuery, isMappingComplete } from './dataAppVizTestQuery';

const { fieldSelectItems } = vi.hoisted(() => ({
    fieldSelectItems: [] as Item[][],
}));

vi.mock('../../../components/common/FieldSelect', () => ({
    default: ({
        items,
        onChange,
        placeholder,
    }: {
        items: Item[];
        onChange: (item: Item | undefined) => void;
        placeholder: string;
    }) => {
        fieldSelectItems.push(items);
        return (
            <button
                type="button"
                data-testid="field-select"
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
    useExploreByProjectUuid: vi.fn(),
}));
vi.mock('../../../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: vi.fn(),
}));

import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';

const schema: DataAppVizSchema = {
    fields: [
        { name: 'source', label: 'Source', type: 'dimension', required: true },
        { name: 'target', label: 'Target', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
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
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: exploreWithHiddenFields,
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);
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
        await user.click(screen.getByRole('button', { name: 'Select source' }));
        await user.click(
            screen.getByRole('button', { name: /run test query/i }),
        );

        return user;
    };

    it('lists the declared fields and the explore picker up-front', () => {
        renderWithProviders(
            <DataAppVizTestPanel
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

    it('requests the same filtered Explore list as Explorer', () => {
        renderWithProviders(
            <DataAppVizTestPanel
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
            <DataAppVizTestPanel
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
            <DataAppVizTestPanel
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
            }),
        );
    });

    it('republishes palette edits after a successful query', async () => {
        const onContextChange = vi.fn();
        renderWithProviders(
            <DataAppVizTestPanel
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
            }),
        );
    });

    it('matches Explorer field visibility', async () => {
        const user = userEvent.setup();
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: exploreWithHiddenFields,
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);

        renderWithProviders(
            <DataAppVizTestPanel
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
});
