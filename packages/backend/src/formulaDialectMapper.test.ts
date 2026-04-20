import { SupportedDbtAdapter } from '@lightdash/common';
import { mapAdapterToFormulaDialect } from './formulaDialectMapper';

describe('mapAdapterToFormulaDialect', () => {
    test.each([
        [SupportedDbtAdapter.POSTGRES, 'postgres'],
        [SupportedDbtAdapter.REDSHIFT, 'redshift'],
        [SupportedDbtAdapter.BIGQUERY, 'bigquery'],
        [SupportedDbtAdapter.SNOWFLAKE, 'snowflake'],
        [SupportedDbtAdapter.DUCKDB, 'duckdb'],
    ] as const)('maps %s adapter to %s dialect', (adapter, expected) => {
        expect(mapAdapterToFormulaDialect(adapter)).toBe(expected);
    });

    test.each([
        SupportedDbtAdapter.TRINO,
        SupportedDbtAdapter.ATHENA,
        SupportedDbtAdapter.CLICKHOUSE,
        SupportedDbtAdapter.DATABRICKS,
    ])('throws for unsupported adapter %s', (adapter) => {
        expect(() => mapAdapterToFormulaDialect(adapter)).toThrow(
            `Formula table calculations are not yet supported for ${adapter}`,
        );
    });
});
