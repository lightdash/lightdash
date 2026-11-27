import { ApiConnectorType, DimensionType } from '@lightdash/common';
import { z } from 'zod';
import {
    tooManyRowsError,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../sdk';

export const YOUTUBE_ANALYTICS_ORIGIN =
    'https://youtubeanalytics.googleapis.com';
export const YOUTUBE_ANALYTICS_REPORTS_PATH = '/v2/reports';

// reports.query documents no row maximum; this keeps results near other api
// sources. The query asks for one more row to detect truncation.
const YOUTUBE_ANALYTICS_MAX_ROWS = 10_000;
/** The most rows one query can ask for; one fewer than a page, to detect truncation. */
export const YOUTUBE_ANALYTICS_MAX_QUERY_ROWS = YOUTUBE_ANALYTICS_MAX_ROWS - 1;
// Top videos reports need maxResults of 200 or less
const YOUTUBE_ANALYTICS_MAX_VIDEOS = 200;

const NAME_LIST = /^[A-Za-z]+(,[A-Za-z]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILTERS = /^[A-Za-z]+==[A-Za-z0-9_,-]+(;[A-Za-z]+==[A-Za-z0-9_,-]+)*$/;
const SORT = /^-?[A-Za-z]+(,-?[A-Za-z]+)*$/;

/**
 * A reports.query request, as compile writes it and agents send it. The
 * channel is never part of the request: it comes from the connection.
 */
export const youtubeAnalyticsRequestSchema = z
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

export type YoutubeAnalyticsRequest = z.infer<
    typeof youtubeAnalyticsRequestSchema
>;

const responseSchema = z.object({
    columnHeaders: z.array(
        z.object({ name: z.string(), columnType: z.string() }),
    ),
    rows: z.array(z.array(z.unknown())).optional(),
});

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

/** Runs one reports.query on the connection's channel, asking for one row more than the limit. */
export const runYoutubeAnalyticsQuery = async ({
    settings: { channelId },
    request: { maxResults, ...request },
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.YOUTUBE_ANALYTICS,
    YoutubeAnalyticsRequest
>): Promise<LiveRunResult> => {
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

    const { columnHeaders: headers, rows: apiRows = [] } = await runtime.fetch(
        {
            method: 'GET',
            path: YOUTUBE_ANALYTICS_REPORTS_PATH,
            query: {
                ids: `channel==${channelId}`,
                ...request,
                maxResults: String(askedRows),
            },
            body: null,
        },
        responseSchema,
    );

    // Cutting off rows the caller asked for would read as a smaller total
    const hitsCeiling = isTopVideos
        ? requestedRows > YOUTUBE_ANALYTICS_MAX_VIDEOS &&
          apiRows.length >= YOUTUBE_ANALYTICS_MAX_VIDEOS
        : requestedRows > maxRows && apiRows.length > maxRows;
    if (hitsCeiling) {
        throw tooManyRowsError({ label: 'YouTube Analytics', maxRows });
    }

    const columns: LiveColumn[] = headers.map(({ name, columnType }) => ({
        name,
        type: getColumnType(name, columnType),
    }));
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
    };
};
