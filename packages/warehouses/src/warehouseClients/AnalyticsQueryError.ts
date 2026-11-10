import { WarehouseQueryError } from '@lightdash/common';

const messages = {
    sql_parser_error:
        'The analytics query contains malformed SQL. Check any custom column expressions.',
    unknown_field:
        'The analytics query references an unknown field. Check the fields in your custom columns.',
    sql_binder_error:
        'The analytics query could not resolve an expression. Check its fields, functions, and types.',
    sql_not_allowed: 'The analytics query contains SQL that is not allowed.',
    storage_access_denied: 'Access to analytics storage was denied.',
    storage_network_error:
        'A network error interrupted access to analytics storage. Try again.',
    storage_read_failed:
        'Could not read analytics data from storage. Try again or contact your administrator.',
    file_limit_exceeded: 'The analytics query exceeds the data file limit.',
    duckdb_resource_limit:
        'The analytics query exceeded its resource limit. Try a narrower date range.',
    unknown:
        'The analytics query failed. Ask your administrator to check the server logs.',
} as const;

export class AnalyticsQueryError extends WarehouseQueryError {
    readonly storageStatus: number | null;

    constructor(
        readonly code: keyof typeof messages,
        storageStatus?: number,
    ) {
        super(messages[code]);
        this.storageStatus =
            storageStatus !== undefined &&
            Number.isInteger(storageStatus) &&
            storageStatus >= 400 &&
            storageStatus <= 599
                ? storageStatus
                : null;
    }
}

export const toAnalyticsQueryError = (error: unknown): AnalyticsQueryError => {
    if (error instanceof AnalyticsQueryError) return error;
    if (!(error instanceof Error)) return new AnalyticsQueryError('unknown');

    // DuckDB can echo SQL, field names, and signed URLs. Only return fixed messages.
    const { message } = error;
    if (/^(?:Failed to extract statements: )?Parser Error:/.test(message)) {
        return new AnalyticsQueryError('sql_parser_error');
    }
    if (message.startsWith('Binder Error:')) {
        return new AnalyticsQueryError(
            /^Binder Error: (?:Referenced column [^\r\n]+ not found|Values list [^\r\n]+ does not have a column named)/.test(
                message,
            )
                ? 'unknown_field'
                : 'sql_binder_error',
        );
    }
    if (message.startsWith('SQL validation error:')) {
        return new AnalyticsQueryError('sql_not_allowed');
    }
    if (message.startsWith('HTTP Error:')) {
        const status = /\(HTTP (?:code )?([45]\d\d)(?: [^)\r\n]*)?\)$/.exec(
            message.split('\n', 1)[0],
        )?.[1];
        return new AnalyticsQueryError(
            status === '401' || status === '403'
                ? 'storage_access_denied'
                : 'storage_read_failed',
            status === undefined ? undefined : Number(status),
        );
    }
    if (message.startsWith('Out of Memory Error:')) {
        return new AnalyticsQueryError('duckdb_resource_limit');
    }
    return new AnalyticsQueryError('unknown');
};
