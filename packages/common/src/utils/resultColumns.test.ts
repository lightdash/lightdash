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
import {
    getResultColumnMetadataFromItem,
    getResultColumnSourceItem,
} from './resultColumns';

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

describe('getResultColumnSourceItem', () => {
    test('resolves the item stored under the field id', () => {
        const itemsMap = { orders_status: dimension };
        expect(getResultColumnSourceItem(itemsMap, 'orders_status')).toBe(
            dimension,
        );
    });

    test('returns undefined without an items map or a matching entry', () => {
        expect(
            getResultColumnSourceItem(undefined, 'orders_status'),
        ).toBeUndefined();
        expect(getResultColumnSourceItem({}, 'orders_status')).toBeUndefined();
    });

    test('throws when an entry is keyed by anything but its field id', () => {
        // A producer keying by raw column name instead of getItemId (for
        // example a field whose name contains dots) must fail loudly instead
        // of silently losing the field's metadata.
        const itemsMap = { status: dimension };
        expect(() => getResultColumnSourceItem(itemsMap, 'status')).toThrow(
            'must be keyed by getItemId',
        );
    });
});

describe('getResultColumnMetadataFromItem', () => {
    test('returns only a label derived from the reference when there is no item', () => {
        expect(
            getResultColumnMetadataFromItem(undefined, 'payment_method'),
        ).toEqual({ label: 'Payment method' });
    });

    test('throws when the item field id differs from the column reference', () => {
        // Items maps are keyed by getItemId, so a resolved item whose own
        // field id differs from the column reference means the producer keyed
        // its map some other way. Silently skipping the item would drop a
        // real field's metadata with no error.
        const virtualViewDimension: Dimension = {
            ...dimension,
            name: 'status',
            table: 'sql_query_explorer',
        };
        expect(() =>
            getResultColumnMetadataFromItem(virtualViewDimension, 'status'),
        ).toThrow('must be keyed by getItemId');
    });

    test('null format keys on an item do not produce a format expression', () => {
        // Merged items are built with `format: field?.format` and jsonb
        // round-trips store null — a string dimension whose format keys are
        // null must not get a default numeric format.
        const nullFormatDimension = {
            ...dimension,
            format: null,
            compact: null,
            round: null,
        } as unknown as Dimension;
        expect(
            getResultColumnMetadataFromItem(
                nullFormatDimension,
                'orders_status',
            ),
        ).toEqual({
            label: 'Orders Status',
            provenance: { fieldId: 'orders_status' },
        });
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
