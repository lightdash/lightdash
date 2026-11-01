import {
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';

export const API_QUERY_OUTCOMES = [
    'ok',
    'invalid_request',
    'query_error',
    'connection_error',
    'rate_limited',
    'timeout',
    'upstream_error',
    'internal_error',
] as const;

export type ApiQueryOutcome = (typeof API_QUERY_OUTCOMES)[number];

/** Buckets a failed api query by cause, from the errors connectors throw. */
export const getApiQueryOutcome = (error: unknown): ApiQueryOutcome => {
    if (error instanceof ParameterError) return 'invalid_request';
    if (error instanceof WarehouseQueryError) return 'query_error';
    if (error instanceof WarehouseConnectionError) return 'connection_error';
    if (error instanceof TooManyRequestsError) return 'rate_limited';
    if (error instanceof TimeoutError) return 'timeout';
    if (error instanceof UnexpectedServerError) return 'upstream_error';
    return 'internal_error';
};
