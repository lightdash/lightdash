import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type ResultRow,
    type TableChart,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    buildTablePivotInput,
    getConditionalFormattingMinMaxMap,
    resolveTableChartConfig,
} from './config';
import { buildTableModel } from './model';

const dimension = (name: string): Dimension => ({
    name,
    type: DimensionType.STRING,
    table: 'orders',
    tableLabel: 'Orders',
    label: `${name} label`,
    fieldType: FieldType.DIMENSION,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const metric = (name: string): Metric => ({
    name,
    type: MetricType.SUM,
    table: 'orders',
    tableLabel: 'Orders',
    label: `${name} label`,
    fieldType: FieldType.METRIC,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const itemsMap: ItemsMap = {
    orders_status: dimension('status'),
    orders_country: dimension('country'),
    orders_revenue: metric('revenue'),
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_country'],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });

const rows: ResultRow[] = [
    {
        orders_status: cell('completed'),
        orders_country: cell('PT'),
        orders_revenue: cell(10),
    },
    {
        orders_status: cell('returned'),
        orders_country: cell('ES'),
        orders_revenue: cell(25),
    },
    {
        orders_status: cell('completed'),
        orders_country: cell('ES'),
        orders_revenue: cell(null),
    },
];

const columnOrder = ['orders_status', 'orders_country', 'orders_revenue'];

describe('resolveTableChartConfig', () => {
    test('applies the mount-time defaults of an empty config', () => {
        const resolved = resolveTableChartConfig({
            chartConfig: undefined,
            resultsData: { rows, metricQuery, fields: itemsMap },
            itemsMap,
            columnOrder,
            pivotDimensions: undefined,
        });

        expect(resolved.validConfig).toEqual<TableChart>({
            showColumnCalculation: false,
            showRowCalculation: false,
            // items come from a table, so table names default on
            showTableNames: true,
            showResultsTotal: false,
            showSubtotals: false,
            showSubtotalsExpanded: false,
            showRowGrouping: false,
            columns: {},
            hideRowNumbers: false,
            conditionalFormattings: [],
            metricsAsRows: false,
            rowLimit: undefined,
        });
        expect(resolved.selectedItemIds).toEqual([
            'orders_revenue',
            'orders_status',
            'orders_country',
        ]);
        expect(resolved.dimensions).toEqual([
            'orders_status',
            'orders_country',
        ]);
        expect(resolved.canUseSubtotals).toBe(true);
        expect(resolved.hasTotalableColumns).toBe(true);
        expect(resolved.isPivotTableEnabled).toBe(false);
        expect(resolved.isPivotResultStale).toBe(false);
    });

    test('prunes stale column properties and turns subtotals off for a pivot', () => {
        const chartConfig: TableChart = {
            showColumnCalculation: true,
            showRowCalculation: false,
            showTableNames: false,
            showResultsTotal: false,
            showSubtotals: true,
            columns: {
                orders_revenue: { name: 'Revenue', frozen: true },
                removed_field: { visible: false },
            },
            hideRowNumbers: true,
            conditionalFormattings: [],
            metricsAsRows: true,
        };

        const resolved = resolveTableChartConfig({
            chartConfig,
            resultsData: { rows, metricQuery, fields: itemsMap },
            itemsMap,
            columnOrder,
            pivotDimensions: ['orders_country'],
        });

        expect(resolved.validConfig.columns).toEqual({
            orders_revenue: { name: 'Revenue', frozen: true },
        });
        expect(resolved.validConfig.showTableNames).toBe(false);
        expect(resolved.validConfig.hideRowNumbers).toBe(true);
        // one unpivoted dimension left: subtotals are disabled
        expect(resolved.validConfig.showSubtotals).toBe(false);
        expect(resolved.canUseSubtotals).toBe(false);
        // the only metric is not a pivot row, so metrics-as-rows stays on
        expect(resolved.validConfig.metricsAsRows).toBe(true);
        expect(resolved.rowFieldIds).toEqual(['orders_status']);
        expect(resolved.isPivotTableEnabled).toBe(true);
        // results were not pivoted on the configured dimension
        expect(resolved.isPivotResultStale).toBe(true);
    });
});

describe('buildTableModel', () => {
    const columnsInput = {
        itemsMap,
        selectedItemIds: columnOrder,
        isColumnVisible: (id: string) => id !== 'orders_country',
        isColumnFrozen: (id: string) => id === 'orders_status',
        getColumnWidth: (id: string) =>
            id === 'orders_revenue' ? 120 : undefined,
        showTableNames: true,
        getFieldLabelOverride: (id: string) =>
            id === 'orders_revenue' ? 'Revenue' : undefined,
        columnOrder,
        rows,
    };

    test('builds ordered columns with headers, flags and totals', () => {
        const model = buildTableModel({
            ...columnsInput,
            totals: { orders_revenue: 35 },
        });

        expect(model.rows).toBe(rows);
        expect(model.pivotData).toBeUndefined();
        expect(model.columns.map((column) => column.id)).toEqual(columnOrder);

        const [status, country, revenue] = model.columns;
        expect(status.header).toEqual({
            kind: 'field',
            label: 'status label',
            tableLabel: 'Orders',
            showTableName: true,
        });
        expect(status.frozen).toBe(true);
        expect(status.isVisible).toBe(true);
        expect(status.total).toBeNull();

        expect(country.isVisible).toBe(false);

        expect(revenue.header).toEqual({ kind: 'override', label: 'Revenue' });
        expect(revenue.labelOverride).toBe('Revenue');
        expect(revenue.width).toBe(120);
        expect(revenue.total).toEqual({ kind: 'value', value: '35' });
    });

    test('reports totals still loading only for totalable columns', () => {
        const model = buildTableModel({ ...columnsInput, totalsLoading: true });

        expect(model.columns[0].total).toBeNull();
        expect(model.columns[2].total).toEqual({ kind: 'loading' });
    });

    test('dedupes the column order and reports the duplicate', () => {
        const duplicates: string[][] = [];
        const model = buildTableModel({
            ...columnsInput,
            columnOrder: [...columnOrder, 'orders_status'],
            onDuplicateColumns: (order, unique) => {
                duplicates.push(order, unique);
            },
        });

        expect(model.columns.map((column) => column.id)).toEqual(columnOrder);
        expect(duplicates).toEqual([
            [...columnOrder, 'orders_status'],
            columnOrder,
        ]);
    });

    test('has no flat columns when pivoted', () => {
        const model = buildTableModel({
            ...columnsInput,
            pivotDimensions: ['orders_country'],
        });

        expect(model.columns).toEqual([]);
    });
});

describe('buildTablePivotInput', () => {
    test('returns null without pivot details and the pivot config with them', () => {
        const args = {
            pivotDimensions: ['orders_country'],
            rows,
            metricQuery,
            selectedItemIds: columnOrder,
            getField: (id: string) => itemsMap[id],
            getFieldLabel: (id: string) => id,
            isColumnVisible: (id: string) => id !== 'orders_status',
            metricsAsRows: false,
            rowFieldIds: ['orders_status'],
            columnOrder,
            showColumnCalculation: true,
            showRowCalculation: false,
        };

        expect(
            buildTablePivotInput({ ...args, pivotDetails: undefined }),
        ).toBeNull();

        const pivotDetails = {
            totalColumnCount: 1,
            valuesColumns: [],
            indexColumn: { reference: 'orders_status', type: 'dimension' },
            groupByColumns: [{ reference: 'orders_country' }],
            sortBy: [],
            originalColumns: {},
        } as unknown as NonNullable<
            Parameters<typeof buildTablePivotInput>[0]['pivotDetails']
        >;
        const input = buildTablePivotInput({ ...args, pivotDetails });

        expect(input?.pivotConfig).toEqual({
            pivotDimensions: ['orders_country'],
            metricsAsRows: false,
            rowFieldIds: ['orders_status'],
            columnOrder,
            hiddenMetricFieldIds: [],
            hiddenDimensionFieldIds: ['orders_status'],
            columnTotals: true,
            rowTotals: false,
        });
        expect(input?.rows).toBe(rows);
    });
});

describe('getConditionalFormattingMinMaxMap', () => {
    test('collects min and max of the fields a bar display reads', () => {
        expect(
            getConditionalFormattingMinMaxMap({
                itemsMap,
                resultsData: { rows },
                conditionalFormattings: [],
                columnProperties: {
                    orders_revenue: { displayStyle: 'bar' },
                },
            }),
        ).toEqual({ orders_revenue: { min: 10, max: 25 } });
    });

    test('is undefined when no field needs it', () => {
        expect(
            getConditionalFormattingMinMaxMap({
                itemsMap,
                resultsData: { rows },
                conditionalFormattings: [],
                columnProperties: {},
            }),
        ).toBeUndefined();
    });
});
