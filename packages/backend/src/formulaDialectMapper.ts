import { assertUnreachable, SupportedDbtAdapter } from '@lightdash/common';
import type { Dialect } from '@lightdash/formula';

export const mapAdapterToFormulaDialect = (
    adapter: SupportedDbtAdapter,
): Dialect => {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
            return 'postgres';
        case SupportedDbtAdapter.REDSHIFT:
            // Redshift is PostgreSQL-compatible for every construct the
            // formula package emits. Kept as its own dialect so future
            // divergences can be handled via RedshiftSqlGenerator.
            return 'redshift';
        case SupportedDbtAdapter.BIGQUERY:
            return 'bigquery';
        case SupportedDbtAdapter.SNOWFLAKE:
            return 'snowflake';
        case SupportedDbtAdapter.DUCKDB:
            return 'duckdb';
        case SupportedDbtAdapter.DATABRICKS:
            return 'databricks';
        case SupportedDbtAdapter.CLICKHOUSE:
            return 'clickhouse';
        // TODO(ZAP-324): add support for these remaining warehouses
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
            throw new Error(
                `Formula table calculations are not yet supported for ${adapter}`,
            );
        default:
            return assertUnreachable(adapter, `Unknown adapter: ${adapter}`);
    }
};
