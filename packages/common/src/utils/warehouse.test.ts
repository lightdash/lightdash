import { SupportedDbtAdapter } from '../types/dbt';
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
});
