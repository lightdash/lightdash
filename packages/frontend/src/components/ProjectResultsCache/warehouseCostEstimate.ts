import {
    assertUnreachable,
    DuckdbConnectionType,
    WarehouseTypes,
    type DuckdbCredentials,
    type WarehouseCredentials,
} from '@lightdash/common';
import { formatWarehouseTime } from './formatWarehouseTime';

const HOUR_MS = 60 * 60 * 1000;
const TIB_BYTES = 1024 ** 4;

export type WarehouseCostRate =
    | { kind: 'perHour'; usdPerHour: number; assumption: string }
    | { kind: 'perTib'; usdPerTib: number; assumption: string };

export type WarehouseUsage = {
    warehouseTimeMs: number;
    bytesBilled: number;
};

const CLICKHOUSE_CLOUD_HOST_SUFFIX = '.clickhouse.cloud';

const getDuckdbCostRate = (
    credentials: DuckdbCredentials,
): WarehouseCostRate | null => {
    switch (credentials.connectionType) {
        case DuckdbConnectionType.MOTHERDUCK:
            return {
                kind: 'perHour',
                usdPerHour: 4.8,
                assumption: 'a Jumbo MotherDuck Duckling ($4.80/hour)',
            };
        case DuckdbConnectionType.DUCKLAKE:
        case DuckdbConnectionType.EMBEDDED:
        case DuckdbConnectionType.ANALYTICS:
            return null;
        default:
            return assertUnreachable(credentials, 'Unknown DuckDB connection');
    }
};

// US on-demand list prices for a mid-sized warehouse on a higher edition.
export const getWarehouseCostRate = (
    credentials: WarehouseCredentials,
): WarehouseCostRate | null => {
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return {
                kind: 'perHour',
                usdPerHour: 4 * 3,
                assumption:
                    'a Medium Snowflake warehouse, Enterprise edition (4 credits/hour at $3/credit)',
            };
        case WarehouseTypes.DATABRICKS:
            return {
                kind: 'perHour',
                usdPerHour: 24 * 0.7,
                assumption:
                    'a Medium serverless SQL warehouse (24 DBUs/hour at $0.70/DBU)',
            };
        case WarehouseTypes.REDSHIFT:
            return {
                kind: 'perHour',
                usdPerHour: 32 * 0.375,
                assumption:
                    'Redshift Serverless with 32 RPUs ($0.375/RPU-hour)',
            };
        case WarehouseTypes.CLICKHOUSE:
            return credentials.host.endsWith(CLICKHOUSE_CLOUD_HOST_SUFFIX)
                ? {
                      kind: 'perHour',
                      usdPerHour: 12 * 0.2985,
                      assumption:
                          'a ClickHouse Cloud Scale service with 3 × 32 GiB replicas (12 units at $0.2985/unit-hour)',
                  }
                : null;
        case WarehouseTypes.DUCKDB:
            return getDuckdbCostRate(credentials);
        case WarehouseTypes.BIGQUERY:
            return {
                kind: 'perTib',
                usdPerTib: 6.25,
                assumption: 'BigQuery on-demand pricing',
            };
        // Athena bills by data scanned, which it doesn't report to us.
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return null;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

const estimateWarehouseCostUsd = (
    usage: WarehouseUsage,
    rate: WarehouseCostRate,
): number => {
    switch (rate.kind) {
        case 'perHour':
            return (usage.warehouseTimeMs / HOUR_MS) * rate.usdPerHour;
        case 'perTib':
            return (usage.bytesBilled / TIB_BYTES) * rate.usdPerTib;
        default:
            return assertUnreachable(rate, 'Unknown cost rate');
    }
};

const MIN_DISPLAYED_USD = 0.01;

// Null when the saving is too small to be worth showing.
export const getDisplayedCostUsd = (
    usage: WarehouseUsage,
    rate: WarehouseCostRate,
): number | null => {
    const usd = estimateWarehouseCostUsd(usage, rate);
    return usd < MIN_DISPLAYED_USD ? null : usd;
};

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumSignificantDigits: 2,
});

const rateFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    trailingZeroDisplay: 'stripIfInteger',
});

const quantityFormatter = new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 2,
});

export const formatApproxUsd = (usd: number): string =>
    `~${usdFormatter.format(usd)}`;

export const formatCostFormula = (
    usage: WarehouseUsage,
    rate: WarehouseCostRate,
): string => {
    switch (rate.kind) {
        case 'perHour':
            return `${formatWarehouseTime(
                Math.round(usage.warehouseTimeMs),
            )} of warehouse time × ${rateFormatter.format(rate.usdPerHour)}/hour`;
        case 'perTib':
            return `${quantityFormatter.format(
                usage.bytesBilled / TIB_BYTES,
            )} TiB billed × ${rateFormatter.format(rate.usdPerTib)}/TiB`;
        default:
            return assertUnreachable(rate, 'Unknown cost rate');
    }
};
