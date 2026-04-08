import { assertUnreachable, SupportedDbtAdapter } from '@lightdash/common';
import type { Dialect } from '@lightdash/formula';

export const mapAdapterToFormulaDialect = (
    adapter: SupportedDbtAdapter,
): Dialect => {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
            return 'postgres';
        case SupportedDbtAdapter.BIGQUERY:
            return 'bigquery';
        case SupportedDbtAdapter.SNOWFLAKE:
            return 'snowflake';
        case SupportedDbtAdapter.DUCKDB:
            return 'duckdb';
        // TODO(ZAP-324): add better handling for these unsupported warehouses
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
        case SupportedDbtAdapter.CLICKHOUSE:
        case SupportedDbtAdapter.DATABRICKS:
            throw new Error(
                `Formula table calculations are not yet supported for ${adapter}`,
            );
        default:
            return assertUnreachable(adapter, `Unknown adapter: ${adapter}`);
    }
};
