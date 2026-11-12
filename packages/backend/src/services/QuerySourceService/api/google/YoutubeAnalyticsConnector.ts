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
    type ApiConnectorResult,
    type ApiConnectorTransport,
} from '../ApiConnector';
import { toGoogleApiError } from './googleApiError';
import {
    YOUTUBE_ANALYTICS_DATE_FILTERS,
    YOUTUBE_ANALYTICS_EXACT_FILTERS,
} from './youtubeAnalyticsSemanticLayer';

export const YOUTUBE_ANALYTICS_ORIGIN =
    'https://youtubeanalytics.googleapis.com';
export const YOUTUBE_ANALYTICS_REPORTS_PATH = '/v2/reports';
export const YOUTUBE_ANALYTICS_TIMEOUT_MS = 30_000;

// reports.query documents no row maximum; this keeps results near other api
// sources. The connector asks for one more row to detect truncation.
const YOUTUBE_ANALYTICS_MAX_ROWS = 10_000;
/** The most rows one query can ask for; one fewer than a page, to detect truncation. */
export const YOUTUBE_ANALYTICS_MAX_QUERY_ROWS = YOUTUBE_ANALYTICS_MAX_ROWS - 1;
// Top videos reports need maxResults of 200 or less
const YOUTUBE_ANALYTICS_MAX_VIDEOS = 200;
// Google publishes no per-minute figure for this API; these match GA4.
const YOUTUBE_ANALYTICS_LIMITS = {
    concurrentCalls: 5,
    callsPerMinute: 60,
    callsPerHour: 1_000,
    callsPerQuery: 1,
};

/**
 * reports.query ANDs a short list of equals filters and can't filter metrics.
 * It groups by day or month only.
 */
export const YOUTUBE_ANALYTICS_CAPABILITIES: ApiConnectorCapabilities = {
    filters: {
        operators: {
            string: YOUTUBE_ANALYTICS_EXACT_FILTERS,
            date: YOUTUBE_ANALYTICS_DATE_FILTERS,
            metric: [],
        },
        multipleValues: true,
        or: false,
        nestedGroups: false,
    },
    metricFilters: false,
    dates: {
        rangeRequired: true,
        operators: YOUTUBE_ANALYTICS_DATE_FILTERS,
        grains: [TimeFrames.DAY, TimeFrames.MONTH],
        timezone: 'fixed',
    },
    pushdown: ALL_PUSHDOWN_REFUSED,
};

const NAME_LIST = /^[A-Za-z]+(,[A-Za-z]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILTERS = /^[A-Za-z]+==[A-Za-z0-9_,-]+(;[A-Za-z]+==[A-Za-z0-9_,-]+)*$/;
const SORT = /^-?[A-Za-z]+(,-?[A-Za-z]+)*$/;

// The channel is never part of the request: it comes from the connection.
const requestSchema = z
    .object({
        startDate: z.string().regex(DATE, 'Use YYYY-MM-DD'),
        endDate: z.string().regex(DATE, 'Use YYYY-MM-DD'),
        metrics: z.string().regex(NAME_LIST, 'List metrics by API name'),
        dimensions: z
            .string()
            .regex(NAME_LIST, 'List dimensions by API name')
            .optional(),
        filters: z
            .string()
            .regex(FILTERS, 'Use name==value joined with ;')
            .optional(),
        sort: z.string().regex(SORT, 'Use name or -name').optional(),
        maxResults: z.number().int().positive().optional(),
    })
    .strict();

const responseSchema = z.object({
    columnHeaders: z.array(
        z.object({ name: z.string(), columnType: z.string() }),
    ),
    rows: z.array(z.array(z.unknown())).optional(),
});

export type YoutubeAnalyticsConnectorArgs = {
    channelId: string;
    /** Sends to the YouTube Analytics API with the connection's Google sign-in attached. */
    send: ApiConnectorTransport;
};

const parseRequest = (query: string): z.infer<typeof requestSchema> => {
    let json: unknown;
    try {
        json = JSON.parse(query);
    } catch {
        throw new ParameterError(
            'The YouTube Analytics report request must be a JSON object',
        );
    }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        throw new ParameterError(
            `Invalid YouTube Analytics report request at ${
                issue.path.join('.') || 'the top level'
            }: ${issue.message}`,
        );
    }
    return parsed.data;
};

const toNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

// YouTube reports months as YYYY-MM; the column reads as the month's first day
const toCell = (name: string, value: unknown) =>
    name === 'month' && typeof value === 'string' ? `${value}-01` : value;

const getColumnType = (name: string, columnType: string): DimensionType => {
    if (columnType === 'METRIC') return DimensionType.NUMBER;
    return name === 'day' || name === 'month'
        ? DimensionType.DATE
        : DimensionType.STRING;
};

export class YoutubeAnalyticsConnector implements ApiConnector {
    private readonly channelId: string;

    private readonly send: ApiConnectorTransport;

    constructor({ channelId, send }: YoutubeAnalyticsConnectorArgs) {
        this.channelId = channelId;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.YOUTUBE_ANALYTICS,
            label: 'YouTube Analytics',
            level: 3,
            queryLanguage: 'YouTube Analytics reports.query JSON',
            maxRows: YOUTUBE_ANALYTICS_MAX_QUERY_ROWS,
            timeoutMs: YOUTUBE_ANALYTICS_TIMEOUT_MS,
            limits: YOUTUBE_ANALYTICS_LIMITS,
            capabilities: YOUTUBE_ANALYTICS_CAPABILITIES,
        };
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new ParameterError('limit must be a positive number of rows');
        }
        const { maxResults, ...request } = parseRequest(payload.query);
        const requestedRows = Math.min(limit, maxResults ?? limit);
        const isTopVideos =
            request.dimensions?.split(',').includes('video') ?? false;
        const maxRows = isTopVideos
            ? YOUTUBE_ANALYTICS_MAX_VIDEOS
            : YOUTUBE_ANALYTICS_MAX_QUERY_ROWS;
        const rowLimit = Math.min(requestedRows, maxRows);
        // One extra row reveals more rows, except at the Top videos ceiling
        const askedRows = isTopVideos
            ? Math.min(rowLimit + 1, YOUTUBE_ANALYTICS_MAX_VIDEOS)
            : rowLimit + 1;

        const response = await this.send({
            method: 'GET',
            path: YOUTUBE_ANALYTICS_REPORTS_PATH,
            query: {
                ids: `channel==${this.channelId}`,
                ...request,
                maxResults: String(askedRows),
            },
            body: null,
        });
        if (response.status < 200 || response.status >= 300) {
            throw toGoogleApiError(response, {
                label: 'YouTube Analytics',
                resource: `channel ${this.channelId}`,
            });
        }
        const parsed = responseSchema.safeParse(response.body);
        if (!parsed.success) {
            throw new UnexpectedServerError(
                'YouTube Analytics returned a response in an unexpected shape',
            );
        }

        const apiRows = parsed.data.rows ?? [];
        // Cutting off rows the caller asked for would read as a smaller total
        const hitsCeiling = isTopVideos
            ? requestedRows > YOUTUBE_ANALYTICS_MAX_VIDEOS &&
              apiRows.length >= YOUTUBE_ANALYTICS_MAX_VIDEOS
            : requestedRows > maxRows && apiRows.length > maxRows;
        if (hitsCeiling) {
            throw new ParameterError(
                `This query has more than ${maxRows} rows, the most one YouTube Analytics query can return. Narrow it with filters, a shorter time range, or a row limit of ${maxRows} or fewer.`,
            );
        }

        const headers = parsed.data.columnHeaders;
        const columns: ApiConnectorColumn[] = headers.map(
            ({ name, columnType }) => ({
                name,
                type: getColumnType(name, columnType),
            }),
        );
        const rows = apiRows
            .slice(0, rowLimit)
            .map((row) =>
                Object.fromEntries(
                    headers.map(({ name, columnType }, index) => [
                        name,
                        columnType === 'METRIC'
                            ? toNumber(row[index])
                            : toCell(name, row[index] ?? null),
                    ]),
                ),
            );
        return {
            columns,
            rows,
            hasMoreRows:
                apiRows.length > rowLimit ||
                (isTopVideos && apiRows.length >= askedRows),
            bytesRead: null,
        };
    }
}
