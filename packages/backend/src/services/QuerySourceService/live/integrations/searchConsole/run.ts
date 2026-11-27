import { ApiConnectorType, DimensionType } from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    refuseLiveQuery,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../sdk';

export const SEARCH_CONSOLE_ORIGIN = 'https://searchconsole.googleapis.com';
export const SEARCH_CONSOLE_SITES_PATH = '/webmasters/v3/sites/';

/**
 * The most rows one query can ask for: one fewer than the API's 25,000, so
 * asking for one more row detects truncation.
 */
export const SEARCH_CONSOLE_MAX_QUERY_ROWS = 24_999;

const DIMENSIONS = [
    'date',
    'query',
    'page',
    'country',
    'device',
    'searchAppearance',
] as const;
const METRICS = ['clicks', 'impressions', 'ctr', 'position'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A Search Analytics query, as compile writes it and agents send it. */
export const searchConsoleRequestSchema = z
    .object({
        startDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
        endDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
        dimensions: z
            .array(z.enum(DIMENSIONS))
            .max(DIMENSIONS.length)
            .optional(),
        type: z
            .enum(['web', 'image', 'video', 'news', 'discover', 'googleNews'])
            .optional(),
        dimensionFilterGroups: z
            .array(
                z
                    .object({
                        groupType: z.literal('and').optional(),
                        filters: z.array(
                            z
                                .object({
                                    dimension: z.enum(DIMENSIONS),
                                    operator: z
                                        .enum([
                                            'equals',
                                            'notEquals',
                                            'contains',
                                            'notContains',
                                            'includingRegex',
                                            'excludingRegex',
                                        ])
                                        .optional(),
                                    expression: z.string(),
                                })
                                .strict(),
                        ),
                    })
                    .strict(),
            )
            .optional(),
        aggregationType: z.enum(['auto', 'byPage', 'byProperty']).optional(),
        dataState: z.enum(['final', 'all']).optional(),
        // Agents often copy the API's own row limit; the smaller limit wins.
        rowLimit: z.number().int().positive().optional(),
    })
    .strict()
    .refine((request) => request.startDate <= request.endDate, {
        message: 'startDate must not be after endDate',
    });

export type SearchConsoleRequest = z.infer<typeof searchConsoleRequestSchema>;

const responseSchema = z.object({
    rows: z
        .array(
            z.object({
                keys: z.array(z.string()).optional(),
                clicks: z.number(),
                impressions: z.number(),
                ctr: z.number(),
                position: z.number(),
            }),
        )
        .optional(),
});

// The guarded fetch decodes the path once before sending it, so the site is
// encoded twice to reach Google encoded once.
export const getSearchConsoleQueryPath = (siteUrl: string) =>
    `${SEARCH_CONSOLE_SITES_PATH}${encodeURIComponent(
        encodeURIComponent(siteUrl),
    )}/searchAnalytics/query`;

/** Runs one Search Analytics query, asking for one row more than the limit. */
export const runSearchConsoleQuery = async ({
    settings,
    request: { rowLimit: requestLimit, ...request },
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.SEARCH_CONSOLE,
    SearchConsoleRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, SEARCH_CONSOLE_MAX_QUERY_ROWS);
    const rowLimit = Math.min(limit, requestLimit ?? limit);
    const dimensions = request.dimensions ?? [];
    const { rows = [] } = await runtime.fetch(
        {
            method: 'POST',
            path: getSearchConsoleQueryPath(settings.siteUrl),
            body: { ...request, rowLimit: rowLimit + 1, startRow: 0 },
        },
        responseSchema,
    );
    // Compile reads every row it can only when it sorts on our side, which a
    // date grouping forces for any sort: the API returns those rows by date
    if (
        dimensions.includes('date') &&
        rowLimit === SEARCH_CONSOLE_MAX_QUERY_ROWS &&
        rows.length > rowLimit
    ) {
        throw refuseLiveQuery(
            'live_source.refused.row_limit',
            'Search Console returns rows grouped by date in date order, so sorting them has to read every row, and this query has more than 24,999. Narrow the date range or filters, remove the date to get the top rows by clicks in one call, or get the top pages first and then query those pages by day.',
        );
    }
    return {
        columns: [
            ...dimensions.map((name) => ({
                name,
                type:
                    name === 'date' ? DimensionType.DATE : DimensionType.STRING,
            })),
            { name: 'search_type', type: DimensionType.STRING },
            ...METRICS.map((name) => ({ name, type: DimensionType.NUMBER })),
        ],
        rows: rows.slice(0, rowLimit).map((row) => ({
            ...Object.fromEntries(
                dimensions.map((dimension, index) => [
                    dimension,
                    row.keys?.[index] ?? null,
                ]),
            ),
            // Not an API dimension: every row has the type the request read
            search_type: request.type ?? 'web',
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
        })),
        hasMoreRows: rows.length > rowLimit,
    };
};
