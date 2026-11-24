import {
    ApiConnectorType,
    DimensionType,
    getGooglePlayMetricSetPath,
    LIVE_INTEGRATION_CATALOG,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap } from '../../query/rows';
import { type LiveRunArgs, type LiveRunResult } from '../../types';
import {
    getGooglePlayDimensions,
    getGooglePlayMetrics,
    getGooglePlayRequiredDimension,
    GOOGLE_PLAY_METRIC_SET_NAMES,
} from './explores';

export const GOOGLE_PLAY_TIME_ZONE = 'America/Los_Angeles';
const PAGE_SIZE = 10_000;
const MAX_PAGES = 5;
export const GOOGLE_PLAY_MAX_QUERY_ROWS = PAGE_SIZE * MAX_PAGES - 1;
export const GOOGLE_PLAY_CALLS_PER_QUERY = MAX_PAGES + 1;

const LABEL =
    LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_PLAY].messageLabel;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_DIMENSIONS = ['versionCode', 'deviceRamBucket'];

/** A Play Developer Reporting query, as compile writes it and agents send it. */
export const googlePlayRequestSchema = z
    .object({
        metricSet: z.enum(GOOGLE_PLAY_METRIC_SET_NAMES),
        startDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
        endDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
        dimensions: z.array(z.string()).optional(),
        filter: z.string().optional(),
        rowLimit: z.number().int().positive().optional(),
    })
    .strict()
    .superRefine((request, context) => {
        const allowed = getGooglePlayDimensions(request.metricSet);
        (request.dimensions ?? []).forEach((dimension, index) => {
            if (!allowed.includes(dimension)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['dimensions', index],
                    message: `"${dimension}" isn't a dimension of ${request.metricSet}. Use one of: ${allowed.join(', ')}`,
                });
            }
        });
        if (request.startDate > request.endDate) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'startDate must not be after endDate',
            });
        }
    });

export type GooglePlayRequest = z.infer<typeof googlePlayRequestSchema>;

const dateTimeSchema = z.object({
    year: z.number(),
    month: z.number(),
    day: z.number(),
});

export const googlePlayMetricSetSchema = z.object({
    name: z.string(),
    freshnessInfo: z
        .object({
            freshnesses: z
                .array(
                    z.object({
                        aggregationPeriod: z.string(),
                        latestEndTime: dateTimeSchema,
                    }),
                )
                .optional(),
        })
        .optional(),
});

const queryResponseSchema = z.object({
    rows: z
        .array(
            z.object({
                startTime: dateTimeSchema,
                dimensions: z
                    .array(
                        z.object({
                            dimension: z.string(),
                            stringValue: z.string().optional(),
                            int64Value: z.string().optional(),
                        }),
                    )
                    .optional(),
                metrics: z
                    .array(
                        z.object({
                            metric: z.string(),
                            decimalValue: z
                                .object({ value: z.string() })
                                .optional(),
                        }),
                    )
                    .optional(),
            }),
        )
        .optional(),
    nextPageToken: z.string().optional(),
});

const pad = (value: number) => String(value).padStart(2, '0');
const toIsoDate = ({ year, month, day }: z.infer<typeof dateTimeSchema>) =>
    `${year}-${pad(month)}-${pad(day)}`;
const addDays = (isoDate: string, days: number) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};
const toDateTime = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return { year, month, day, timeZone: { id: GOOGLE_PLAY_TIME_ZONE } };
};

/** The exclusive end of a metric set's daily data, or null when it has none yet. */
export const getGooglePlayFreshEnd = (
    metricSet: z.infer<typeof googlePlayMetricSetSchema>,
): string | null => {
    const daily = metricSet.freshnessInfo?.freshnesses?.find(
        ({ aggregationPeriod }) => aggregationPeriod === 'DAILY',
    );
    return daily ? toIsoDate(daily.latestEndTime) : null;
};

/**
 * Runs one query over a metric set's daily rows. Without `date` it reads
 * only the latest day with data in the range.
 */
export const runGooglePlayQuery = async ({
    settings,
    request: { rowLimit: requestLimit, ...request },
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.GOOGLE_PLAY,
    GooglePlayRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, GOOGLE_PLAY_MAX_QUERY_ROWS);
    const rowLimit = Math.min(limit, requestLimit ?? limit);
    const { metricSet } = request;
    const path = getGooglePlayMetricSetPath(settings.packageName, metricSet);
    const requested = request.dimensions ?? [];
    const byDay = requested.includes('date');
    const required = getGooglePlayRequiredDimension(metricSet);
    const dimensions = [
        ...requested.filter((name) => name !== 'date'),
        ...(required && !requested.includes(required) ? [required] : []),
    ];
    const metrics = getGooglePlayMetrics(metricSet);
    const columns = [
        ...(byDay ? [{ name: 'date', type: DimensionType.DATE }] : []),
        ...dimensions.map((name) => ({
            name,
            type: NUMBER_DIMENSIONS.includes(name)
                ? DimensionType.NUMBER
                : DimensionType.STRING,
        })),
        ...metrics.map((name) => ({ name, type: DimensionType.NUMBER })),
    ];
    const noRows: LiveRunResult = { columns, rows: [], hasMoreRows: false };

    const freshEnd = getGooglePlayFreshEnd(
        await calls.fetch(
            { method: 'GET', path, body: undefined },
            googlePlayMetricSetSchema,
        ),
    );
    if (!freshEnd) return noRows;
    const requestedEnd = addDays(request.endDate, 1);
    const endExclusive = requestedEnd < freshEnd ? requestedEnd : freshEnd;
    const start = byDay ? request.startDate : addDays(endExclusive, -1);
    if (start >= endExclusive || start < request.startDate) return noRows;

    // Every page repeats the first call's parameters, page size included
    const pageSize = Math.min(PAGE_SIZE, rowLimit + 1);
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows: rowLimit,
        maxRows: GOOGLE_PLAY_MAX_QUERY_ROWS,
        pageSize,
        maxPages: MAX_PAGES,
        fetchPage: async ({ cursor }) => {
            const page = await calls.fetch(
                {
                    method: 'POST',
                    path: `${path}:query`,
                    body: {
                        timelineSpec: {
                            aggregationPeriod: 'DAILY',
                            startTime: toDateTime(start),
                            endTime: toDateTime(endExclusive),
                        },
                        dimensions,
                        // A partial metric list can return no rows where the full list returns some
                        metrics,
                        ...(request.filter ? { filter: request.filter } : {}),
                        pageSize,
                        ...(cursor ? { pageToken: cursor } : {}),
                    },
                },
                queryResponseSchema,
            );
            return {
                rows: (page.rows ?? []).map((row) => {
                    const values = new Map(
                        (row.dimensions ?? []).map((value) => [
                            value.dimension,
                            value.stringValue ?? value.int64Value ?? null,
                        ]),
                    );
                    const decimals = new Map(
                        (row.metrics ?? []).map((value) => [
                            value.metric,
                            value.decimalValue?.value ?? null,
                        ]),
                    );
                    return {
                        ...(byDay ? { date: toIsoDate(row.startTime) } : {}),
                        ...Object.fromEntries(
                            dimensions.map((name) => {
                                const value = values.get(name) ?? null;
                                return [
                                    name,
                                    value !== null &&
                                    NUMBER_DIMENSIONS.includes(name)
                                        ? Number(value)
                                        : value,
                                ];
                            }),
                        ),
                        ...Object.fromEntries(
                            metrics.map((name) => {
                                const value = decimals.get(name) ?? null;
                                return [
                                    name,
                                    value === null ? null : Number(value),
                                ];
                            }),
                        ),
                    };
                }),
                nextCursor: page.nextPageToken || undefined,
            };
        },
    });
    return { columns, rows, hasMoreRows };
};
