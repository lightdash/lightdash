import {
    DimensionType,
    FieldType,
    MetricType,
    VizIndexType,
    type DataAppVizSchema,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { pivotPreviewResults } from './pivotPreviewResults';

const dimension = (name: string, type = DimensionType.STRING) => ({
    fieldType: FieldType.DIMENSION as const,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
});
const itemsMap: ItemsMap = {
    orders_date: dimension('date', DimensionType.DATE),
    orders_status: dimension('status'),
    orders_count: {
        ...dimension('count'),
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
    },
};
const schema: DataAppVizSchema = {
    fields: [
        { name: 'date', label: 'Date', type: 'dimension', required: true },
        {
            name: 'status',
            label: 'Status',
            type: 'series',
            required: false,
            multiple: true,
        },
        {
            name: 'count',
            label: 'Count',
            type: 'metric',
            required: true,
            multiple: true,
        },
    ],
    configOptions: [],
    colorPalette: null,
};
const cell = (raw: string | number | null, formatted = String(raw ?? '')) => ({
    value: { raw, formatted },
});
const row = (
    date: string,
    status: string | null,
    count: number | null,
): ResultRow => ({
    orders_date: cell(date),
    orders_status: cell(
        status,
        status === null ? '(empty)' : status.toUpperCase(),
    ),
    orders_count: cell(count, `${count} orders`),
});
const rows = [
    row('2026-01-01', 'placed', 10),
    row('2026-01-01', 'shipped', 20),
    row('2026-01-02', 'placed', 30),
];
const fieldMapping = {
    date: 'orders_date',
    status: ['orders_status'],
    count: ['orders_count'],
};
const build = (
    overrides: Partial<Parameters<typeof pivotPreviewResults>[0]> = {},
) =>
    pivotPreviewResults({
        schema,
        itemsMap,
        fieldMapping,
        rows,
        pivotDetails: null,
        ...overrides,
    });

describe('pivotPreviewResults', () => {
    it('preserves formatting, input order and sparse cells without mutating source rows', () => {
        const before = structuredClone(rows);
        const result = build();
        const columns = result.pivotDetails!.valuesColumns;
        expect(result.rows).toHaveLength(2);
        expect(columns.map((column) => column.pivotValues[0])).toEqual([
            {
                referenceField: 'orders_status',
                value: 'placed',
                formatted: 'PLACED',
            },
            {
                referenceField: 'orders_status',
                value: 'shipped',
                formatted: 'SHIPPED',
            },
        ]);
        expect(result.rows[0][columns[0].pivotColumnName]).toEqual(
            cell(10, '10 orders'),
        );
        expect(result.rows[1][columns[1].pivotColumnName]).toEqual(
            cell(null, ''),
        );
        expect(result.pivotDetails!.indexColumn).toEqual([
            { reference: 'orders_date', type: VizIndexType.TIME },
        ]);
        expect(result.pivotDetails!.originalColumns.orders_date.type).toBe(
            DimensionType.DATE,
        );
        expect(result.pivotDetails!.originalColumns.orders_count.type).toBe(
            DimensionType.NUMBER,
        );
        expect(rows).toEqual(before);
    });

    it('keeps null and empty string series distinct', () => {
        const result = build({
            rows: [row('2026-01-01', null, 10), row('2026-01-01', '', 20)],
        });
        const columns = result.pivotDetails!.valuesColumns;
        expect(columns).toHaveLength(2);
        expect(columns[0].pivotColumnName).not.toBe(columns[1].pivotColumnName);
        expect(columns[0].pivotValues[0]).toEqual({
            referenceField: 'orders_status',
            value: null,
            formatted: '(empty)',
        });
        expect(result.rows[0][columns[0].pivotColumnName].value.raw).toBe(10);
        expect(result.rows[0][columns[1].pivotColumnName].value.raw).toBe(20);
    });

    it('rebuilds the pivot after changing series bindings without changing the query rows', () => {
        const first = build();
        const next = build({
            fieldMapping: {
                date: 'orders_status',
                status: 'orders_date',
                count: 'orders_count',
            },
        });
        expect(first.pivotDetails!.groupByColumns).toEqual([
            { reference: 'orders_status' },
        ]);
        expect(next.pivotDetails!.groupByColumns).toEqual([
            { reference: 'orders_date' },
        ]);
        expect(next.rows.map((r) => r.orders_status.value.raw)).toEqual([
            'placed',
            'shipped',
        ]);
    });

    it('supports multiple series dimensions and metrics including table calculations', () => {
        const result = build({
            itemsMap: {
                ...itemsMap,
                orders_region: dimension('region'),
                ratio: { name: 'ratio', displayName: 'Ratio', sql: '1' },
            },
            fieldMapping: {
                ...fieldMapping,
                status: ['orders_status', 'orders_region', 'orders_status'],
                count: ['orders_count', 'ratio'],
            },
            rows: rows.map((r) => ({
                ...r,
                orders_region: cell('west'),
                ratio: cell(0.5, '50%'),
            })),
        });
        expect(result.pivotDetails!.groupByColumns).toHaveLength(2);
        expect(result.pivotDetails!.valuesColumns).toHaveLength(4);
        const ratio = result.pivotDetails!.valuesColumns.find(
            (c) => c.referenceField === 'ratio',
        )!;
        expect(ratio.pivotValues.map((v) => v.value)).toEqual([
            'placed',
            'west',
        ]);
        expect(result.rows[0][ratio.pivotColumnName]).toEqual(cell(0.5, '50%'));
    });

    it('ignores unbound measures when grouping saved-chart series', () => {
        const result = build({
            itemsMap: {
                ...itemsMap,
                orders_revenue: {
                    ...dimension('revenue'),
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                },
                ratio: { name: 'ratio', displayName: 'Ratio', sql: '1' },
            },
            rows: rows.map((r, i) => ({
                ...r,
                orders_revenue: cell(i * 100),
                ratio: cell(i / 10),
            })),
        });
        expect(result.rows).toHaveLength(2);
        expect(result.pivotDetails!.indexColumn).toEqual([
            { reference: 'orders_date', type: VizIndexType.TIME },
        ]);
        expect(result.pivotDetails!.valuesColumns).toHaveLength(2);
    });

    it('preserves extra query dimensions rather than overwriting their groups', () => {
        const result = build({
            itemsMap: { ...itemsMap, orders_region: dimension('region') },
            rows: ['west', 'east'].map((region) => ({
                ...rows[0],
                orders_region: cell(region),
            })),
        });
        expect(result.rows.map((r) => r.orders_region.value.raw)).toEqual([
            'west',
            'east',
        ]);
    });

    it('leaves rows flat when the optional series is unbound or no values are bound', () => {
        expect(
            build({
                fieldMapping: { date: 'orders_date', count: 'orders_count' },
            }),
        ).toEqual({ rows, pivotDetails: null });
        expect(build({ fieldMapping: { status: 'orders_status' } })).toEqual({
            rows,
            pivotDetails: null,
        });
    });

    it('handles empty results and already pivoted results', () => {
        expect(build({ rows: [] }).rows).toEqual([]);
        const pivoted = build();
        const result = build(pivoted);
        expect(result.rows).toBe(pivoted.rows);
        expect(result.pivotDetails).toBe(pivoted.pivotDetails);
    });
});
