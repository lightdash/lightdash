import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseCredentials,
} from '../types/projects';

export type QueryCostEstimateSettings = {
    estimateQueryBytes: boolean;
    confirmEstimatedBytesAbove: number | null;
    agentMaximumEstimatedBytes: number | null;
};

export type QueryCostEstimate =
    | { status: 'unavailable' }
    | { status: 'error'; message: string }
    | {
          status: 'estimated';
          totalBytesProcessed: number;
          confirmEstimatedBytesAbove: number | null;
          requiresConfirmation: boolean;
      };

export type ApiQueryCostEstimateResponse = {
    status: 'ok';
    results: QueryCostEstimate;
};

const positiveOrNull = (value: number | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;

/** Null when the connection's warehouse has no free dry-run estimate. */
export const getQueryCostEstimateSettings = (
    credentials: CreateWarehouseCredentials | WarehouseCredentials,
): QueryCostEstimateSettings | null => {
    if (credentials.type !== WarehouseTypes.BIGQUERY) return null;
    return {
        estimateQueryBytes: credentials.estimateQueryBytes === true,
        confirmEstimatedBytesAbove: positiveOrNull(
            credentials.confirmEstimatedBytesAbove,
        ),
        agentMaximumEstimatedBytes: positiveOrNull(
            credentials.agentMaximumEstimatedBytes,
        ),
    };
};

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/** Decimal units, matching how BigQuery reports and bills bytes. */
export const formatEstimatedBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const exponent = Math.min(
        Math.floor(Math.log10(bytes) / 3),
        BYTE_UNITS.length - 1,
    );
    const value = bytes / 1000 ** exponent;
    const rounded = value >= 100 || exponent === 0 ? Math.round(value) : value;
    return `${Number(rounded.toFixed(1))} ${BYTE_UNITS[exponent]}`;
};

export const getAgentEstimateExceededMessage = ({
    estimatedBytes,
    limitBytes,
}: {
    estimatedBytes: number;
    limitBytes: number;
}): string =>
    `Query not run: the dry run estimate is ${formatEstimatedBytes(
        estimatedBytes,
    )} (${estimatedBytes} bytes) processed, above the ${formatEstimatedBytes(
        limitBytes,
    )} (${limitBytes} bytes) limit for AI agent queries on this connection. ` +
    `Narrow the query and try again: filter on the partition column, shorten the date range, or select fewer columns.`;
