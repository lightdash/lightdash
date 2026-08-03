import { DimensionType, MetricType } from '@lightdash/common';
import {
    DorisSqlBuilder,
    DorisTypes,
    convertDataTypeToDimensionType,
} from './DorisWarehouseClient';

describe('DorisSqlBuilder', () => {
    const builder = new DorisSqlBuilder();

    it('builds arrays with [...] syntax (Doris native array literal)', () => {
        expect(builder.buildArray(['1', '2', '3'])).toBe('[1, 2, 3]');
    });

    it('quotes identifiers with backticks', () => {
        expect(builder.getFieldQuoteChar()).toBe('`');
    });

    it('uses PERCENTILE for percentile metric type', () => {
        expect(
            builder.getMetricSql('some_col', { type: MetricType.PERCENTILE }),
        ).toBe("PERCENTILE(some_col, 0.5)");
    });

    it('allows custom percentile in PERCENTILE metric', () => {
        expect(
            builder.getMetricSql('some_col', {
                type: MetricType.PERCENTILE,
                percentile: 90,
            }),
        ).toBe("PERCENTILE(some_col, 0.9)");
    });

    it('uses PERCENTILE(..., 0.5) for MEDIAN metric', () => {
        expect(
            builder.getMetricSql('some_col', { type: MetricType.MEDIAN }),
        ).toBe('PERCENTILE(some_col, 0.5)');
    });

    describe('escapeString', () => {
        it('escapes single quotes by doubling them', () => {
            expect(builder.escapeString("it's")).toBe("it''s");
        });

        it('escapes backslashes', () => {
            expect(builder.escapeString('path\\to\\file')).toBe(
                'path\\\\to\\\\file',
            );
        });

        it('removes SQL comments (-- style)', () => {
            expect(builder.escapeString('normal --comment')).toBe('normal ');
        });

        it('removes block SQL comments (/**/)', () => {
            expect(
                builder.escapeString('before/* comment */after'),
            ).toBe('beforeafter');
        });

        it('removes null bytes', () => {
            expect(builder.escapeString('val\0ue')).toBe('value');
        });
    });

    describe('castToTimestamp', () => {
        it('casts ISO date to DATETIME literal', () => {
            // Use fixed UTC date to ensure consistent output across timezones
            const date = new Date(Date.UTC(2024, 5, 15, 10, 30, 0));
            const result = builder.castToTimestamp(date);
            // Verify it produces a valid CAST(... AS DATETIME) expression
            // toISOString includes milliseconds (e.g. "2024-06-15T10:30:00.000Z")
            expect(result).toMatch(
                /^CAST\('\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+' AS DATETIME\)$/,
            );
        });
    });

    describe('getIntervalSql', () => {
        it('builds INTERVAL expression with singular unit name', () => {
            expect(builder.getIntervalSql(7, 'DAY')).toBe('INTERVAL 7 DAY');
        });
    });

    describe('getTimestampDiffSeconds', () => {
        it('builds TIMESTAMPDIFF(SECOND, start, end)', () => {
            expect(
                builder.getTimestampDiffSeconds('start_ts', 'end_ts'),
            ).toBe('TIMESTAMPDIFF(SECOND, start_ts, end_ts)');
        });
    });

    describe('getMedianSql', () => {
        it('uses PERCENTILE with 0.5', () => {
            expect(builder.getMedianSql('col')).toBe('PERCENTILE(col, 0.5)');
        });
    });
});

describe('convertDataTypeToDimensionType', () => {
    // Plain types
    it.each([
        [DorisTypes.BOOLEAN, DimensionType.BOOLEAN],
        [DorisTypes.TINYINT, DimensionType.NUMBER],
        [DorisTypes.SMALLINT, DimensionType.NUMBER],
        [DorisTypes.INT, DimensionType.NUMBER],
        [DorisTypes.BIGINT, DimensionType.NUMBER],
        [DorisTypes.LARGEINT, DimensionType.NUMBER],
        [DorisTypes.FLOAT, DimensionType.NUMBER],
        [DorisTypes.DOUBLE, DimensionType.NUMBER],
        [DorisTypes.DECIMAL, DimensionType.NUMBER],
        [DorisTypes.DECIMALV3, DimensionType.NUMBER],
        [DorisTypes.DATE, DimensionType.DATE],
        [DorisTypes.DATEV2, DimensionType.DATE],
        [DorisTypes.DATETIME, DimensionType.TIMESTAMP],
        [DorisTypes.DATETIMEV2, DimensionType.TIMESTAMP],
        [DorisTypes.VARCHAR, DimensionType.STRING],
        [DorisTypes.STRING, DimensionType.STRING],
        [DorisTypes.TEXT, DimensionType.STRING],
        [DorisTypes.JSON, DimensionType.STRING],
        [DorisTypes.JSONB, DimensionType.STRING],
        [DorisTypes.CHAR, DimensionType.STRING],
    ])('maps plain type %s to %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Types with precision arguments (stripped)
    it.each([
        ['decimal(18,2)', DimensionType.NUMBER],
        ['varchar(255)', DimensionType.STRING],
        ['char(10)', DimensionType.STRING],
        ['datetime(3)', DimensionType.TIMESTAMP],
    ])('strips precision arguments from %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Case-insensitive
    it.each([
        ['BOOLEAN', DimensionType.BOOLEAN],
        ['INT', DimensionType.NUMBER],
        ['VARCHAR', DimensionType.STRING],
        ['DATETIME', DimensionType.TIMESTAMP],
    ])('handles uppercase type %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Unknown types fall through to STRING
    it('returns STRING for unknown types', () => {
        expect(convertDataTypeToDimensionType('SomeFutureType')).toBe(
            DimensionType.STRING,
        );
        expect(convertDataTypeToDimensionType('ARRAY<INT>')).toBe(
            DimensionType.STRING,
        );
    });
});
