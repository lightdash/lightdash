export type AnalyticsQueryStage =
    | 'session_setup'
    | 'bootstrap'
    | 'sql_validation'
    | 'query_execution'
    | 'result_stream'
    | 'cleanup';

type AnalyticsSourceStage = 'storage_list' | 'storage_prepare' | 'storage_sign';

type AnalyticsSourceReason =
    | 'storage_access_denied'
    | 'storage_not_found'
    | 'storage_network_error'
    | 'file_limit_exceeded'
    | 'listing_incomplete'
    | 'unknown';

export class AnalyticsSourceError extends Error {
    constructor(
        readonly stage: AnalyticsSourceStage,
        readonly reason: AnalyticsSourceReason,
        readonly providerStatus?: number,
    ) {
        super(
            'Analytics storage access failed. Check bucket credentials, organization and compacted data availability.',
        );
    }
}

export const classifyAnalyticsQueryFailure = (
    error: unknown,
    stage: AnalyticsQueryStage,
) => {
    if (error instanceof AnalyticsSourceError) {
        return {
            stage: error.stage,
            reason: error.reason,
            ...(error.providerStatus === undefined
                ? {}
                : { providerStatus: error.providerStatus }),
        };
    }

    if (!(error instanceof Error)) return { stage, reason: 'unknown' };

    if (
        'code' in error &&
        (error.code === 'ENOSPC' || error.code === 'EDQUOT')
    ) {
        return { stage, reason: 'temporary_disk_limit' };
    }

    // DuckDB messages may contain SQL, storage URLs and local paths. Log only fixed codes.
    const message = error.message.replace(
        /^Failed to extract statements: /,
        '',
    );
    if (message.startsWith('Parser Error:')) {
        return { stage, reason: 'sql_parser_error' };
    }
    if (message.startsWith('Binder Error:')) {
        return { stage, reason: 'sql_binder_error' };
    }
    if (message.startsWith('SQL validation error:')) {
        return { stage, reason: 'sql_validation_error' };
    }
    if (
        message.startsWith(
            'Out of Memory Error: failed to offload data block',
        ) ||
        /^IO Error: [^\r\n]+(?:No space left on device|Disk quota exceeded)/.test(
            message,
        )
    ) {
        return { stage, reason: 'temporary_disk_limit' };
    }
    if (message.startsWith('Out of Memory Error:')) {
        return { stage, reason: 'duckdb_memory_limit' };
    }
    if (message.startsWith('HTTP Error:')) {
        const status = /\(HTTP (?:code )?([45]\d\d)(?: [^)\r\n]*)?\)$/.exec(
            message.split('\n', 1)[0],
        )?.[1];
        if (status === '401' || status === '403') {
            return { stage, reason: 'storage_access_denied' };
        }
        if (status === '404') return { stage, reason: 'storage_not_found' };
        return { stage, reason: 'storage_http_error' };
    }
    return { stage, reason: 'unknown' };
};
