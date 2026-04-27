import {
    assertUnreachable,
    SupportedDbtAdapter,
    WarehouseTypes,
} from '@lightdash/common';
import { type Dialect } from '@lightdash/formula';

// Compile-time guard: every Dialect string is a valid WarehouseTypes
// value. The frontend relies on this identity to check formula support
// against `warehouseConnection.type` directly, without a separate
// warehouseType → dialect mapping. If this assertion ever fails, fix the
// divergence rather than suppress.
type DialectIsWarehouseType = Dialect extends `${WarehouseTypes}`
    ? true
    : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const dialectIsWarehouseType: DialectIsWarehouseType = true;

export const mapAdapterToFormulaDialect = (
    adapter: SupportedDbtAdapter,
): Dialect => {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
            return 'postgres';
        case SupportedDbtAdapter.REDSHIFT:
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
        case SupportedDbtAdapter.ATHENA:
            return 'athena';
        // Trino support follow-up (ZAP-324). The frontend hides the Formula
        // input mode for unsupported warehouses, but API clients, chart-as-
        // code YAML, and legacy payloads can still reach this path. Fail
        // loudly instead of producing broken SQL.
        case SupportedDbtAdapter.TRINO:
            throw new Error(
                `Formula table calculations are not yet supported for ${adapter}`,
            );
        default:
            return assertUnreachable(adapter, `Unknown adapter: ${adapter}`);
    }
};
