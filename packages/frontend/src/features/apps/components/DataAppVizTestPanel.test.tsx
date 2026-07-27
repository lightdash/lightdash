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
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizTestPanel from './DataAppVizTestPanel';
import { buildTestMetricQuery, isMappingComplete } from './dataAppVizTestQuery';

const { fieldSelectItems } = vi.hoisted(() => ({
    fieldSelectItems: [] as Item[][],
}));

vi.mock('../../../components/common/FieldSelect', () => ({
    default: ({ items }: { items: Item[] }) => {
        fieldSelectItems.push(items);
        return <div data-testid="field-select" />;
    },
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

    it('groups declared options into config tabs, defaults applied', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DataAppVizTestPanel
                projectUuid="p1"
                schema={{
                    fields: schema.fields,
                    configOptions: [
                        {
                            type: 'boolean',
                            name: 'showLegend',
                            label: 'Show legend',
                            group: 'Style',
                            default: true,
                        },
                    ],
                    colorPalette: null,
                }}
                onContextChange={vi.fn()}
            />,
        );

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style']);

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        expect(screen.getByLabelText('Show legend')).toBeChecked();
    });

    it('offers the palette picker for a declared palette', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DataAppVizTestPanel
                projectUuid="p1"
                schema={{
                    fields: schema.fields,
                    configOptions: [],
                    colorPalette: { group: 'Colours' },
                }}
                onContextChange={vi.fn()}
            />,
        );

        await user.click(screen.getByRole('tab', { name: 'Colours' }));

        expect(screen.getByText('Color palette')).toBeInTheDocument();
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
