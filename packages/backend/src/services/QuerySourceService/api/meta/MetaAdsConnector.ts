import {
    ApiConnectorType,
    DimensionType,
    getMetaAdsInsightsPath,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
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
    META_ADS_BREAKDOWNS,
    META_ADS_DATE_FILTERS,
    META_ADS_NAME_FILTERS,
} from './metaAdsSemanticLayer';

const INSIGHTS_PAGE_SIZE = 500;
const CALLS_PER_QUERY = 10;
/** The most rows one query can read: every page it may fetch. */
export const META_ADS_MAX_QUERY_ROWS = INSIGHTS_PAGE_SIZE * CALLS_PER_QUERY;
export const META_ADS_TIMEOUT_MS = 60_000;
// Meta counts load per app and ad account and publishes no fixed number, so
// these stay well below what its best-practices page warns about.
const META_ADS_LIMITS = {
    concurrentCalls: 3,
    callsPerMinute: 60,
    callsPerHour: 1_000,
    callsPerQuery: CALLS_PER_QUERY,
};

/**
 * Insights ANDs one flat list of filters on ad objects and reads one date
 * range in the ad account's time zone. Everything else is refused.
 */
export const META_ADS_CAPABILITIES: ApiConnectorCapabilities = {
    filters: {
        operators: {
            string: META_ADS_NAME_FILTERS,
            date: META_ADS_DATE_FILTERS,
        },
        multipleValues: true,
        or: false,
        nestedGroups: false,
    },
    metricFilters: false,
    dates: {
        rangeRequired: true,
        operators: META_ADS_DATE_FILTERS,
        grains: [],
        timezone: 'fixed',
    },
    pushdown: ALL_PUSHDOWN_REFUSED,
};

const OBJECT_FIELDS = [
    'campaign_id',
    'campaign_name',
    'objective',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',
] as const;
const NUMERIC_FIELDS = [
    'spend',
    'impressions',
    'reach',
    'frequency',
    'clicks',
    'inline_link_clicks',
    'ctr',
    'cpc',
    'cpm',
] as const;
// `actions:omni_purchase` reads one action type out of an actions-style list
const ACTION_COLUMN = /^(actions|action_values|purchase_roas):[a-z0-9_.]+$/;
const FIELD_LISTS: ReadonlySet<string> = new Set([
    ...OBJECT_FIELDS,
    ...NUMERIC_FIELDS,
]);
const NUMERIC_COLUMNS: ReadonlySet<string> = new Set(NUMERIC_FIELDS);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const requestSchema = z
    .object({
        level: z.enum(['account', 'campaign', 'adset', 'ad']),
        time_range: z
            .object({
                since: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
                until: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
            })
            .strict(),
        time_increment: z
            .union([z.literal(1), z.literal('monthly'), z.literal('all_days')])
            .optional(),
        fields: z
            .array(
                z
                    .string()
                    .refine(
                        (field) =>
                            FIELD_LISTS.has(field) || ACTION_COLUMN.test(field),
                        'Unknown Insights field',
                    ),
            )
            .min(1),
        breakdowns: z.array(z.enum(META_ADS_BREAKDOWNS)).optional(),
        filtering: z
            .array(
                z
                    .object({
                        field: z
                            .string()
                            .regex(/^(campaign|adset|ad)\.[a-z_]+$/),
                        operator: z.enum([
                            'EQUAL',
                            'NOT_EQUAL',
                            'IN',
                            'NOT_IN',
                            'CONTAIN',
                            'NOT_CONTAIN',
                        ]),
                        value: z.union([z.string(), z.array(z.string())]),
                    })
                    .strict(),
            )
            .optional(),
        sort: z
            .array(
                z
                    .string()
                    .regex(/^[a-z_]+_(ascending|descending)$/, 'Unknown sort'),
            )
            .max(1)
            .optional(),
        // Agents often copy the API's own row limit; the smaller limit wins.
        limit: z.number().int().positive().optional(),
    })
    .strict();

type MetaAdsRequest = z.infer<typeof requestSchema>;

const responseSchema = z.object({
    data: z.array(z.record(z.string(), z.unknown())),
    paging: z
        .object({
            cursors: z.object({ after: z.string().optional() }).optional(),
            next: z.string().optional(),
        })
        .optional(),
});

const actionListSchema = z.array(
    z.object({
        action_type: z.string(),
        value: z.union([z.string(), z.number()]),
    }),
);

const errorSchema = z.object({
    error: z.object({
        message: z.string().optional(),
        code: z.number().optional(),
        error_subcode: z.number().optional(),
    }),
});

const META_THROTTLE_CODES = new Set([4, 17, 613]);
const isMetaThrottle = (code: number | undefined) =>
    code !== undefined &&
    (META_THROTTLE_CODES.has(code) || (code >= 80000 && code <= 80014));
const META_TOO_MUCH_DATA_SUBCODE = 1487534;

/** Turns an Insights error response into an error that says what to change. */
export const toMetaAdsError = (
    response: ApiConnectorResponse,
    adAccountId: string,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const {
        message,
        code,
        error_subcode: subcode,
    } = parsed.success
        ? parsed.data.error
        : { message: undefined, code: undefined, error_subcode: undefined };
    const detail = message ? `: ${message}` : '';
    if (code === 190) {
        return new WarehouseConnectionError(
            `Meta rejected the access token${detail}. Generate a new system user token with ads_read and update this live data source.`,
        );
    }
    if (code === 200 || code === 10 || response.status === 403) {
        return new WarehouseConnectionError(
            `Meta denied access to ad account ${adAccountId}${detail}. Check that the token has ads_read and its system user is assigned to this ad account.`,
        );
    }
    if (isMetaThrottle(code) || response.status === 429) {
        return new TooManyRequestsError(
            `Meta Ads rate limit reached${detail}. Retry in a few minutes.`,
            { retryAfterSeconds: null },
        );
    }
    if (
        subcode === META_TOO_MUCH_DATA_SUBCODE ||
        code === 1 ||
        response.status === 504
    ) {
        return new WarehouseQueryError(
            `Meta Ads can't return this much data at once${detail}. Narrow the date range or remove a dimension.`,
        );
    }
    if (code === 3018) {
        return new WarehouseQueryError(
            `Meta Ads keeps 37 months of history${detail}. Choose a more recent date range.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Meta Ads rejected the request${detail}`,
        );
    }
    return new UnexpectedServerError(
        `Meta Ads returned ${response.status}${detail}`,
    );
};

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

// Insights reports `ctr` as a percentage; the semantic layer's rate fields
// are fractions, as in the other live data sources.
const scaleMetric = (column: string, value: number | null) =>
    column === 'ctr' && value !== null ? value / 100 : value;

/** One action type's value, or null when Meta reports nothing for it. */
const readActionColumn = (
    row: Record<string, unknown>,
    column: string,
): number | null => {
    const [list, actionType] = column.split(':');
    const parsed = actionListSchema.safeParse(row[list]);
    if (!parsed.success) {
        return null;
    }
    return toNumber(
        parsed.data.find((action) => action.action_type === actionType)?.value,
    );
};

const toRow = (
    row: Record<string, unknown>,
    columns: ApiConnectorColumn[],
    timeIncrement: MetaAdsRequest['time_increment'],
): Record<string, unknown> =>
    Object.fromEntries(
        columns.map(({ name }) => {
            if (name === 'date_start') {
                const date = String(row.date_start ?? '');
                return [
                    name,
                    timeIncrement === 'monthly' && date
                        ? `${date.slice(0, 7)}-01`
                        : date || null,
                ];
            }
            if (ACTION_COLUMN.test(name)) {
                return [name, readActionColumn(row, name)];
            }
            if (NUMERIC_COLUMNS.has(name)) {
                return [name, scaleMetric(name, toNumber(row[name]))];
            }
            return [name, row[name] ?? null];
        }),
    );

const getColumns = ({
    fields,
    breakdowns,
    time_increment: timeIncrement,
}: MetaAdsRequest): ApiConnectorColumn[] => [
    ...(timeIncrement && timeIncrement !== 'all_days'
        ? [{ name: 'date_start', type: DimensionType.DATE }]
        : []),
    ...fields.map((name) => ({
        name,
        type:
            NUMERIC_COLUMNS.has(name) || ACTION_COLUMN.test(name)
                ? DimensionType.NUMBER
                : DimensionType.STRING,
    })),
    ...(breakdowns ?? []).map((name) => ({
        name,
        type: DimensionType.STRING,
    })),
];

const toInsightsFields = (fields: string[]) => [
    ...new Set(
        fields.map((field) =>
            ACTION_COLUMN.test(field) ? field.split(':')[0] : field,
        ),
    ),
];

const parseRequest = (query: string): MetaAdsRequest => {
    let json: unknown;
    try {
        json = JSON.parse(query);
    } catch {
        throw new ParameterError('The Meta Ads request must be a JSON object');
    }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        throw new ParameterError(
            `Invalid Meta Ads request at ${
                issue.path.join('.') || 'the top level'
            }: ${issue.message}`,
        );
    }
    if (parsed.data.time_range.since > parsed.data.time_range.until) {
        throw new ParameterError('The date range starts after it ends');
    }
    return parsed.data;
};

export type MetaAdsConnectorArgs = {
    adAccountId: string;
    /** Sends to the Graph API with the connection's access token attached. */
    send: ApiConnectorTransport;
};

export class MetaAdsConnector implements ApiConnector {
    private readonly adAccountId: string;

    private readonly send: ApiConnectorTransport;

    constructor({ adAccountId, send }: MetaAdsConnectorArgs) {
        this.adAccountId = adAccountId;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.META_ADS,
            label: 'Meta Ads',
            level: 3,
            queryLanguage: 'Insights JSON',
            maxRows: META_ADS_MAX_QUERY_ROWS,
            timeoutMs: META_ADS_TIMEOUT_MS,
            limits: META_ADS_LIMITS,
            capabilities: META_ADS_CAPABILITIES,
        };
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > META_ADS_MAX_QUERY_ROWS
        ) {
            throw new ParameterError(
                `limit must be between 1 and ${META_ADS_MAX_QUERY_ROWS} rows`,
            );
        }
        const request = parseRequest(payload.query);
        const columns = getColumns(request);

        const baseQuery: Record<string, string> = {
            level: request.level,
            time_range: JSON.stringify(request.time_range),
            time_increment: String(request.time_increment ?? 'all_days'),
            fields: toInsightsFields(request.fields).join(','),
            ...(request.breakdowns?.length
                ? { breakdowns: request.breakdowns.join(',') }
                : {}),
            ...(request.filtering?.length
                ? { filtering: JSON.stringify(request.filtering) }
                : {}),
            ...(request.sort?.length
                ? { sort: JSON.stringify(request.sort) }
                : {}),
        };

        const { rows, truncated } = await readRowsWithinCap({
            label: 'Meta Ads',
            requestedRows: Math.min(limit, request.limit ?? limit),
            maxRows: META_ADS_MAX_QUERY_ROWS,
            pageSize: INSIGHTS_PAGE_SIZE,
            maxPages: CALLS_PER_QUERY,
            fetchPage: async ({ limit: pageLimit, cursor }) => {
                const response = await this.send({
                    method: 'GET',
                    path: getMetaAdsInsightsPath(this.adAccountId),
                    query: {
                        ...baseQuery,
                        limit: String(pageLimit),
                        ...(cursor ? { after: cursor } : {}),
                    },
                    body: undefined,
                });
                if (response.status < 200 || response.status >= 300) {
                    throw toMetaAdsError(response, this.adAccountId);
                }
                const parsed = responseSchema.safeParse(response.body);
                if (!parsed.success) {
                    throw new UnexpectedServerError(
                        'Meta Ads returned a response in an unexpected shape',
                    );
                }
                const { data, paging } = parsed.data;
                return {
                    rows: data,
                    nextCursor: paging?.next
                        ? paging.cursors?.after
                        : undefined,
                };
            },
        });

        return {
            columns,
            rows: rows.map((row) =>
                toRow(row, columns, request.time_increment),
            ),
            truncated,
            bytesRead: null,
        };
    }
}
