import {
    Compact,
    CustomFormatType,
    DimensionType,
    FieldType,
    Format,
    MetricType,
    NumberSeparator,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { getResultColumnMetadataFromItem } from './resultColumns';

const dimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
    groups: [],
};

const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
    groups: [],
};

const tableCalculation: TableCalculation = {
    name: 'calc',
    displayName: 'My calc',
    sql: '${orders.revenue} * 2',
};

describe('getResultColumnMetadataFromItem', () => {
    test('returns only a label derived from the reference when there is no item', () => {
        expect(
            getResultColumnMetadataFromItem(undefined, 'payment_method'),
        ).toEqual({ label: 'Payment method' });
    });

    test('returns no metadata from an item whose field id differs from the column reference', () => {
        // SqlQueryComposer keys virtual-view items `${table}_${column}` while
        // raw SQL warehouse columns use unprefixed names. Even if a lookup
        // matches, an item with a different field id must not contribute
        // provenance, because its synthesized dimension is not a semantic
        // field.
        const virtualViewDimension: Dimension = {
            ...dimension,
            name: 'status',
            table: 'sql_query_explorer',
        };
        expect(
            getResultColumnMetadataFromItem(virtualViewDimension, 'status'),
        ).toEqual({ label: 'Status' });
    });

    test('enriches a plain dimension with label and provenance', () => {
        expect(
            getResultColumnMetadataFromItem(dimension, 'orders_status'),
        ).toEqual({
            label: 'Orders Status',
            provenance: { fieldId: 'orders_status' },
        });
    });

    test('numeric metrics carry the default format expression', () => {
        expect(
            getResultColumnMetadataFromItem(metric, 'orders_revenue'),
        ).toEqual({
            label: 'Orders Revenue',
            provenance: { fieldId: 'orders_revenue' },
            format: '#,##0.###',
        });
    });

    test('legacy formats compile to expressions with their separator carried beside', () => {
        const percentMetric: Metric = {
            ...metric,
            format: Format.PERCENT,
            separator: NumberSeparator.PERIOD_COMMA,
        };
        expect(
            getResultColumnMetadataFromItem(percentMetric, 'orders_revenue'),
        ).toEqual({
            label: 'Orders Revenue',
            provenance: { fieldId: 'orders_revenue' },
            format: '#,##0.###%',
            separator: NumberSeparator.PERIOD_COMMA,
        });
    });

    test('a stored format expression is carried as-is', () => {
        const formatted: Metric = { ...metric, format: '[$$]#,##0.00' };
        expect(
            getResultColumnMetadataFromItem(formatted, 'orders_revenue').format,
        ).toEqual('[$$]#,##0.00');
    });

    test('parameter-dependent format expressions interpolate against used parameter values', () => {
        const parameterised: Metric = {
            ...metric,
            format: '${ld.parameters.currency=="usd"?"$":"€"}0.00',
        };
        expect(
            getResultColumnMetadataFromItem(parameterised, 'orders_revenue', {
                currency: 'usd',
            }),
        ).toEqual({
            label: 'Orders Revenue',
            provenance: { fieldId: 'orders_revenue' },
            format: '$0.00',
        });
        expect(
            getResultColumnMetadataFromItem(parameterised, 'orders_revenue', {
                currency: 'eur',
            }).format,
        ).toEqual('€0.00');
    });

    test('parameter-dependent formats are omitted when values are missing', () => {
        const parameterised: Metric = {
            ...metric,
            format: '${ld.parameters.currency=="usd"?"$":"€"}0.00',
        };
        // No parameter values at all.
        expect(
            getResultColumnMetadataFromItem(parameterised, 'orders_revenue'),
        ).toEqual({
            label: 'Orders Revenue',
            provenance: { fieldId: 'orders_revenue' },
        });
        // Values that leave the placeholder unresolved.
        expect(
            getResultColumnMetadataFromItem(
                { ...metric, format: '"${ld.parameters.suffix}"0.00' },
                'orders_revenue',
                {},
            ).format,
        ).toBeUndefined();
    });

    test('non-expressible structured formats ride the formatOptions escape hatch', () => {
        const autoCompact: Metric = {
            ...metric,
            formatOptions: {
                type: CustomFormatType.NUMBER,
                compact: Compact.AUTO,
            },
        };
        expect(
            getResultColumnMetadataFromItem(autoCompact, 'orders_revenue'),
        ).toEqual({
            label: 'Orders Revenue',
            provenance: { fieldId: 'orders_revenue' },
            formatOptions: {
                type: CustomFormatType.NUMBER,
                compact: Compact.AUTO,
            },
        });
    });

    test('timestamp dimensions carry timeInterval and shiftsTimezone', () => {
        const timestampDimension: Dimension = {
            ...dimension,
            name: 'created_at',
            type: DimensionType.TIMESTAMP,
            timeInterval: TimeFrames.SECOND,
        };
        expect(
            getResultColumnMetadataFromItem(
                timestampDimension,
                'orders_created_at',
            ),
        ).toEqual({
            label: 'Orders Status',
            provenance: { fieldId: 'orders_created_at' },
            timeInterval: TimeFrames.SECOND,
            shiftsTimezone: true,
        });
    });

    test('date dimensions carry timeInterval without shifting', () => {
        const dateDimension: Dimension = {
            ...dimension,
            name: 'created_month',
            type: DimensionType.DATE,
            timeInterval: TimeFrames.MONTH,
        };
        const metadata = getResultColumnMetadataFromItem(
            dateDimension,
            'orders_created_month',
        );
        expect(metadata.timeInterval).toEqual(TimeFrames.MONTH);
        expect(metadata.shiftsTimezone).toBeUndefined();
    });

    test('year-number dimensions carry no format at all', () => {
        const yearNumDimension: Dimension = {
            ...dimension,
            name: 'created_year_num',
            type: DimensionType.NUMBER,
            timeInterval: TimeFrames.YEAR_NUM,
        };
        expect(
            getResultColumnMetadataFromItem(
                yearNumDimension,
                'orders_created_year_num',
            ),
        ).toEqual({
            label: 'Orders Status',
            provenance: { fieldId: 'orders_created_year_num' },
            timeInterval: TimeFrames.YEAR_NUM,
        });
    });

    test('table calculations get label and format but never provenance', () => {
        expect(
            getResultColumnMetadataFromItem(tableCalculation, 'calc'),
        ).toEqual({
            label: 'My calc',
        });

        const formattedTableCalculation: TableCalculation = {
            ...tableCalculation,
            format: { type: CustomFormatType.PERCENT, round: 1 },
        };
        expect(
            getResultColumnMetadataFromItem(formattedTableCalculation, 'calc'),
        ).toEqual({
            label: 'My calc',
            format: '#,##0.0%',
        });
    });
});
