import {
    AiAccessRefusedError,
    LightdashError,
    MissingWarehouseCredentialsError,
    QueryCostEstimateExceededError,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseQueryTimeoutError,
    type QueryErrorCode,
    type QueryErrorDetails,
} from '@lightdash/common';
import { getDuckdbErrorPhase } from '@lightdash/warehouses';
import { PythonExecutionError } from './python/PythonSandboxRunner';

const BIGQUERY_REASON_CODES: Record<string, QueryErrorCode> = {
    bytesBilledLimitExceeded: 'bigquery_bytes_billed_limit',
    accessDenied: 'bigquery_access_denied',
    invalidQuery: 'bigquery_invalid_query',
    quotaExceeded: 'bigquery_quota_exceeded',
    rateLimitExceeded: 'bigquery_rate_limit_exceeded',
    resourcesExceeded: 'bigquery_resources_exceeded',
    responseTooLarge: 'bigquery_response_too_large',
    notFound: 'bigquery_not_found',
    stopped: 'bigquery_stopped',
    invalid: 'bigquery_invalid',
};

const classify = (error: unknown): QueryErrorDetails | null => {
    if (error instanceof PythonExecutionError) {
        return {
            code: `python_${error.stage}`,
            pythonExceptionType: error.exceptionType,
        };
    }
    const duckdbPhase = getDuckdbErrorPhase(error);
    if (duckdbPhase !== null) {
        return { code: `duckdb_${duckdbPhase}`, pythonExceptionType: null };
    }
    const code = ((): QueryErrorCode | null => {
        if (error instanceof QueryCostEstimateExceededError)
            return 'query_cost_estimate_exceeded';
        if (error instanceof MissingWarehouseCredentialsError)
            return 'missing_warehouse_credentials';
        if (error instanceof WarehouseQueryTimeoutError)
            return 'warehouse_timeout';
        if (error instanceof AiAccessRefusedError) return 'access_refused';
        if (
            error instanceof LightdashError &&
            typeof error.data.bigqueryReason === 'string'
        ) {
            return (
                BIGQUERY_REASON_CODES[error.data.bigqueryReason] ??
                'bigquery_other'
            );
        }
        if (
            error instanceof WarehouseQueryError ||
            error instanceof WarehouseConnectionError
        )
            return 'warehouse_other';
        return null;
    })();
    return code === null ? null : { code, pythonExceptionType: null };
};

/** Classifies a query failure from the error's class and structured data, preferring the most specific code along `cause`. */
export const getQueryErrorDetails = (error: unknown): QueryErrorDetails => {
    const seen = new Set<unknown>();
    let current: unknown = error;
    let generic: QueryErrorDetails | null = null;
    while (current !== null && current !== undefined && !seen.has(current)) {
        seen.add(current);
        const details = classify(current);
        if (details && details.code !== 'warehouse_other') return details;
        generic = generic ?? details;
        current = current instanceof Error ? current.cause : undefined;
    }
    return generic ?? { code: 'unknown', pythonExceptionType: null };
};
