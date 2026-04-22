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
        // Belt-and-suspenders: the frontend hides the Formula input mode
        // on unsupported warehouses, but API clients, chart-as-code YAML,
        // or legacy payloads can still reach this path. Fail loudly
        // instead of producing broken SQL. TODO(ZAP-324): add these.
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
            throw new Error(
                `Formula table calculations are not yet supported for ${adapter}`,
            );
        default:
            return assertUnreachable(adapter, `Unknown adapter: ${adapter}`);
    }
};
