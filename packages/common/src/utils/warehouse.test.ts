import { SupportedDbtAdapter } from '../types/dbt';
import { ParameterError } from '../types/errors';
import type { WarehouseSqlBuilder } from '../types/warehouse';
import { VizAggregationOptions } from '../visualizations/types';
import { getAggregatedField, quoteFieldReference } from './warehouse';

describe('quoteFieldReference', () => {
    test('escapes ANSI-style active field quote characters', () => {
        expect(quoteFieldReference('total"revenue', '"')).toBe(
            '"total""revenue"',
        );
        expect(quoteFieldReference('total`revenue', '`')).toBe(
            '`total``revenue`',
        );
    });

    test('escapes BigQuery backticks and backslashes', () => {
        expect(
            quoteFieldReference(
                'total`revenue\\path',
                '`',
                SupportedDbtAdapter.BIGQUERY,
            ),
        ).toBe('`total\\`revenue\\\\path`');
    });

    test.each([
        SupportedDbtAdapter.POSTGRES,
        SupportedDbtAdapter.REDSHIFT,
        SupportedDbtAdapter.SNOWFLAKE,
        SupportedDbtAdapter.TRINO,
        SupportedDbtAdapter.ATHENA,
        SupportedDbtAdapter.DUCKDB,
        SupportedDbtAdapter.CLICKHOUSE,
    ])('uses delimiter doubling for %s identifiers', (adapterType) => {
        expect(quoteFieldReference('total"revenue', '"', adapterType)).toBe(
            '"total""revenue"',
        );
    });

    test.each([SupportedDbtAdapter.DATABRICKS, SupportedDbtAdapter.SPARK])(
        'uses backtick doubling for %s identifiers',
        (adapterType) => {
            expect(quoteFieldReference('total`revenue', '`', adapterType)).toBe(
                '`total``revenue`',
            );
        },
    );
});

describe('getAggregatedField', () => {
    test('escapes raw column references before aggregation', () => {
        const warehouseSqlBuilder = {
            getFieldQuoteChar: () => '"',
            getAdapterType: () => SupportedDbtAdapter.POSTGRES,
        } as WarehouseSqlBuilder;

        expect(
            getAggregatedField(
                warehouseSqlBuilder,
                VizAggregationOptions.SUM,
                'total"revenue',
            ),
        ).toBe('sum("total""revenue")');
    });

    test('rejects aggregation function names outside VizAggregationOptions', () => {
        const warehouseSqlBuilder = {
            getFieldQuoteChar: () => '"',
            getAdapterType: () => SupportedDbtAdapter.POSTGRES,
        } as WarehouseSqlBuilder;

        expect(() =>
            getAggregatedField(
                warehouseSqlBuilder,
                'sum) FILTER (WHERE true); SELECT 1; --' as VizAggregationOptions,
                'revenue',
            ),
        ).toThrow(ParameterError);
    });
});
