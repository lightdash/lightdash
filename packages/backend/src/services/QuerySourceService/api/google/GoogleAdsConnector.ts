import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TimeFrames,
    UnexpectedServerError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ALL_PUSHDOWN_REFUSED,
    type ApiConnector,
    type ApiConnectorCapabilities,
    type ApiConnectorColumn,
    type ApiConnectorDescription,
    type ApiConnectorExecuteArgs,
    type ApiConnectorResponse,
    type ApiConnectorResult,
    type ApiConnectorTransport,
} from '../ApiConnector';
import { readRowsWithinCap } from '../apiSourceRows';
import {
    GOOGLE_ADS_DATE_FILTERS,
    GOOGLE_ADS_METRIC_FILTERS,
    GOOGLE_ADS_MICROS_FIELDS,
    GOOGLE_ADS_STRING_FILTERS,
} from './googleAdsSemanticLayer';
import { toGoogleApiError } from './googleApiError';

export const GOOGLE_ADS_ORIGIN = 'https://googleads.googleapis.com';
// Each version is sunset about a year after release; v26 runs to November 2027
// (https://developers.google.com/google-ads/api/docs/sunset-dates).
export const GOOGLE_ADS_API_VERSION = 'v26';
export const GOOGLE_ADS_LIST_CUSTOMERS_PATH = `/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;

// GoogleAdsService.Search returns 10,000 rows a page; asking for one more row
// than the limit keeps every query to one page and one operation.
const GOOGLE_ADS_MAX_ROWS = 10_000;
/** The most rows one query can ask for; one fewer than a page, to detect truncation. */
export const GOOGLE_ADS_MAX_QUERY_ROWS = GOOGLE_ADS_MAX_ROWS - 1;
export const GOOGLE_ADS_TIMEOUT_MS = 60_000;
// Daily operations are shared by every connection of the server's Google
// client (2,880 at Explorer access), so one connection can't take them all.
const GOOGLE_ADS_LIMITS = {
    concurrentCalls: 5,
    callsPerMinute: 60,
    callsPerHour: 1_000,
    callsPerQuery: 1,
};

/**
 * GAQL ANDs one flat list of conditions, so OR and nested groups are refused.
 * Dates are a finite range in the account's own time zone, and metric filters
 * apply to the returned rows.
 */
export const GOOGLE_ADS_CAPABILITIES: ApiConnectorCapabilities = {
    filters: {
        operators: {
            string: GOOGLE_ADS_STRING_FILTERS,
            date: GOOGLE_ADS_DATE_FILTERS,
            metric: GOOGLE_ADS_METRIC_FILTERS,
        },
        multipleValues: true,
        or: false,
        nestedGroups: false,
    },
    metricFilters: true,
    dates: {
        rangeRequired: true,
        operators: GOOGLE_ADS_DATE_FILTERS,
        grains: [
            TimeFrames.DAY,
            TimeFrames.WEEK,
            TimeFrames.MONTH,
            TimeFrames.QUARTER,
            TimeFrames.YEAR,
        ],
        timezone: 'fixed',
    },
    pushdown: ALL_PUSHDOWN_REFUSED,
};

const GAQL_FIELD = /^[a-z_]+(\.[a-z_]+)+$/;
const GAQL_SELECT = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+[a-z_]+\b/i;
const GAQL_TRAILING_LIMIT = /\s+LIMIT\s+(\d+)\s*$/i;
const GAQL_PARAMETERS = /\sPARAMETERS\s/i;
const DATE_COLUMNS = new Set([
    'segments.date',
    'segments.week',
    'segments.month',
    'segments.quarter',
]);

const responseSchema = z.object({
    results: z.array(z.record(z.string(), z.unknown())).optional(),
    nextPageToken: z.string().optional(),
});

const googleAdsFailureSchema = z.object({
    error: z.object({
        message: z.string().optional(),
        status: z.string().optional(),
        details: z
            .array(
                z.object({
                    errors: z
                        .array(z.object({ message: z.string().optional() }))
                        .optional(),
                }),
            )
            .optional(),
    }),
});

export type GoogleAdsConnectorArgs = {
    customerId: string;
    /** Sends to the Google Ads API with the connection's Google sign-in attached. */
    send: ApiConnectorTransport;
};

export const getGoogleAdsSearchPath = (customerId: string) =>
    `/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;

/**
 * Google's top-level message is often just "invalid argument"; the reason
 * is in the GoogleAdsFailure details.
 */
export const toGoogleAdsApiError = (
    response: ApiConnectorResponse,
    resource: string,
): Error => {
    const parsed = googleAdsFailureSchema.safeParse(response.body);
    if (!parsed.success) {
        return toGoogleApiError(response, { label: 'Google Ads', resource });
    }
    const { error } = parsed.data;
    const reasons = (error.details ?? [])
        .flatMap(({ errors }) => errors ?? [])
        .flatMap(({ message }) => message ?? []);
    return toGoogleApiError(
        {
            ...response,
            body: {
                error: {
                    status: error.status,
                    message:
                        reasons.length > 0 ? reasons.join(' ') : error.message,
                },
            },
        },
        { label: 'Google Ads', resource },
    );
};

const parseSelectedFields = (query: string): string[] => {
    const select = GAQL_SELECT.exec(query);
    if (!select) {
        throw new ParameterError(
            'The Google Ads request must be one GAQL query: SELECT fields FROM resource',
        );
    }
    if (GAQL_PARAMETERS.test(query)) {
        throw new ParameterError(
            'The PARAMETERS clause is not available on live data sources. Remove it from the query.',
        );
    }
    const fields = select[1].split(',').map((field) => field.trim());
    const invalid = fields.find((field) => !GAQL_FIELD.test(field));
    if (invalid !== undefined) {
        throw new ParameterError(
            `"${invalid}" isn't a GAQL field. List fields by name, for example metrics.clicks.`,
        );
    }
    return fields;
};

const toCamelCase = (name: string) =>
    name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** `ad_group.id` reads `adGroup.id`: REST rows are nested and camelCased. */
const readField = (row: Record<string, unknown>, field: string): unknown =>
    field
        .split('.')
        .map(toCamelCase)
        .reduce<unknown>(
            (value, key) =>
                typeof value === 'object' && value !== null
                    ? (value as Record<string, unknown>)[key]
                    : undefined,
            row,
        );

/**
 * Metrics arrive as numbers or, for 64-bit ones, as strings. A missing value
 * stays missing rather than becoming a zero nobody reported.
 */
const toMetricValue = (field: string, value: unknown) => {
    if (value === undefined || value === null) {
        return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return null;
    }
    return GOOGLE_ADS_MICROS_FIELDS.has(field) ? number / 1_000_000 : number;
};

const getColumnType = (field: string): DimensionType => {
    if (field.startsWith('metrics.') || field === 'segments.year') {
        return DimensionType.NUMBER;
    }
    return DATE_COLUMNS.has(field) ? DimensionType.DATE : DimensionType.STRING;
};

export class GoogleAdsConnector implements ApiConnector {
    private readonly customerId: string;

    private readonly send: ApiConnectorTransport;

    constructor({ customerId, send }: GoogleAdsConnectorArgs) {
        this.customerId = customerId;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.GOOGLE_ADS,
            label: 'Google Ads',
            level: 3,
            queryLanguage: 'GAQL',
            maxRows: GOOGLE_ADS_MAX_QUERY_ROWS,
            timeoutMs: GOOGLE_ADS_TIMEOUT_MS,
            limits: GOOGLE_ADS_LIMITS,
            capabilities: GOOGLE_ADS_CAPABILITIES,
        };
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new ParameterError('limit must be a positive number of rows');
        }
        const fields = parseSelectedFields(payload.query);
        const queryLimit = GAQL_TRAILING_LIMIT.exec(payload.query)?.[1];
        const requestedRows = Math.min(
            limit,
            queryLimit === undefined ? limit : Number(queryLimit),
        );
        const baseQuery = payload.query
            .replace(GAQL_TRAILING_LIMIT, '')
            .trimEnd();

        const { rows: results, truncated } = await readRowsWithinCap({
            label: 'Google Ads',
            requestedRows,
            maxRows: GOOGLE_ADS_MAX_QUERY_ROWS,
            pageSize: GOOGLE_ADS_MAX_ROWS,
            // Asking for one more row than the limit fits in one page
            maxPages: 1,
            fetchPage: async ({ limit: pageLimit }) => {
                const response = await this.send({
                    method: 'POST',
                    path: getGoogleAdsSearchPath(this.customerId),
                    body: { query: `${baseQuery} LIMIT ${pageLimit}` },
                });
                if (response.status < 200 || response.status >= 300) {
                    throw toGoogleAdsApiError(
                        response,
                        `Google Ads account ${this.customerId}`,
                    );
                }
                const parsed = responseSchema.safeParse(response.body);
                if (!parsed.success) {
                    throw new UnexpectedServerError(
                        'Google Ads returned a response in an unexpected shape',
                    );
                }
                return {
                    rows: parsed.data.results ?? [],
                    nextCursor: parsed.data.nextPageToken,
                };
            },
        });
        const rows = results.map((row) =>
            Object.fromEntries(
                fields.map((field) => {
                    const value = readField(row, field);
                    return [
                        field,
                        field.startsWith('metrics.')
                            ? toMetricValue(field, value)
                            : (value ?? null),
                    ];
                }),
            ),
        );
        const columns: ApiConnectorColumn[] = fields.map((name) => ({
            name,
            type: getColumnType(name),
        }));
        return {
            columns,
            rows,
            truncated,
            bytesRead: null,
        };
    }
}
