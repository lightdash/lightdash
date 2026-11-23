import {
    AMPLITUDE_PATHS,
    ApiConnectorType,
    DimensionType,
    LIVE_INTEGRATION_CATALOG,
} from '@lightdash/common';
import { z } from 'zod';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../types';

const LABEL = LIVE_INTEGRATION_CATALOG[ApiConnectorType.AMPLITUDE].messageLabel;

/** Rows one query may return; Amplitude returns every row in one call. */
export const AMPLITUDE_MAX_QUERY_ROWS = 5_000;
/** One call per event and metric; segmentation takes up to 10 events. */
export const AMPLITUDE_MAX_EVENTS = 10;
export const AMPLITUDE_CALLS_PER_QUERY = 20;
/** Group values Amplitude returns per segmentation call; its own maximum is 20,000. */
const SEGMENTATION_GROUP_LIMIT = 1_000;
export const AMPLITUDE_MAX_FUNNEL_STEPS = 10;
const DEFAULT_CONVERSION_WINDOW_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const intervalSchema = z.union([z.literal(1), z.literal(7), z.literal(30)]);
const eventSchema = z.string().min(1).max(1_024);
const propertySchema = z
    .string()
    .regex(/^(gp:)?[A-Za-z0-9_ .$-]{1,200}$/, 'Unknown user property');

const segmentSchema = z
    .object({
        prop: propertySchema,
        op: z.enum(['is', 'is not']),
        values: z.array(z.string()).min(1),
    })
    .strict();

const rangeFields = {
    start: dateSchema,
    end: dateSchema,
    segments: z.array(segmentSchema).max(10).optional(),
};

export const AMPLITUDE_SEGMENTATION_METRICS = {
    totals: 'event_count',
    uniques: 'unique_users',
    average: 'events_per_user',
    pct_dau: 'percent_of_active_users',
} as const;
export type AmplitudeSegmentationMetric =
    keyof typeof AMPLITUDE_SEGMENTATION_METRICS;

export const AMPLITUDE_USER_METRICS = {
    active: 'active_users',
    new: 'new_users',
} as const;

export const AMPLITUDE_SESSION_METRICS = {
    average: 'average_session_length_seconds',
    peruser: 'sessions_per_user',
} as const;

/** One Amplitude Dashboard API report, as compile writes it and agents send it. */
export const amplitudeRequestSchema = z
    .discriminatedUnion('endpoint', [
        z
            .object({
                endpoint: z.literal('segmentation'),
                ...rangeFields,
                /** Null reads totals over the whole range. */
                interval: intervalSchema.nullable(),
                /** `_all` counts every event, `_active` every active one. */
                events: z.array(eventSchema).min(1).max(AMPLITUDE_MAX_EVENTS),
                metrics: z
                    .array(
                        z.enum(
                            Object.keys(AMPLITUDE_SEGMENTATION_METRICS) as [
                                AmplitudeSegmentationMetric,
                                ...AmplitudeSegmentationMetric[],
                            ],
                        ),
                    )
                    .min(1),
                groupBy: propertySchema.nullable(),
            })
            .strict(),
        z
            .object({
                endpoint: z.literal('users'),
                ...rangeFields,
                interval: intervalSchema,
                metrics: z.array(z.enum(['active', 'new'])).min(1),
                groupBy: propertySchema.nullable(),
            })
            .strict(),
        z
            .object({
                endpoint: z.literal('funnel'),
                ...rangeFields,
                steps: z
                    .array(eventSchema)
                    .min(2, 'A funnel needs at least two steps')
                    .max(AMPLITUDE_MAX_FUNNEL_STEPS),
                conversionWindowDays: z.number().int().min(1).max(366),
            })
            .strict(),
        z
            .object({
                endpoint: z.literal('retention'),
                ...rangeFields,
                interval: intervalSchema,
                /** An event, or `_new` for new users and `_active` for any active user. */
                startEvent: eventSchema,
                /** An event, or `_all` or `_active` for any event. */
                returnEvent: eventSchema,
                /** True reads one row per cohort and period; false the combined curve. */
                byCohort: z.boolean(),
            })
            .strict(),
        z
            .object({
                endpoint: z.literal('sessions'),
                start: dateSchema,
                end: dateSchema,
                metrics: z.array(z.enum(['average', 'peruser'])).min(1),
            })
            .strict(),
    ])
    .refine((request) => request.start <= request.end, {
        message: 'The date range starts after it ends',
    });

export type AmplitudeRequest = z.infer<typeof amplitudeRequestSchema>;

/** Amplitude takes dates as YYYYMMDD. */
const toAmplitudeDate = (date: string) => date.replaceAll('-', '');

const toEventObject = (eventType: string, groupBy?: string | null) => ({
    event_type: eventType,
    ...(groupBy ? { group_by: [{ type: 'user', value: groupBy }] } : {}),
});

/** Every Dashboard API parameter is a query parameter; funnels repeat `e`. */
const toRawQuery = (params: [string, string | number][]) =>
    params
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join('&');

const rangeParams = (request: {
    start: string;
    end: string;
    segments?: z.infer<typeof segmentSchema>[];
}): [string, string][] => [
    ['start', toAmplitudeDate(request.start)],
    ['end', toAmplitudeDate(request.end)],
    ...(request.segments?.length
        ? [['s', JSON.stringify(request.segments)] as [string, string]]
        : []),
];

const get = <T>(
    calls: LiveCalls,
    path: string,
    params: [string, string | number][],
    schema: z.ZodType<T>,
) =>
    calls.fetch(
        { method: 'GET', path, rawQuery: toRawQuery(params), body: undefined },
        schema,
    );

const numberSchema = z.number().nullable().catch(null);

const seriesResponseSchema = z.object({
    data: z.object({
        series: z.array(z.array(numberSchema)),
        seriesLabels: z.array(z.unknown()).optional(),
        seriesMeta: z.array(z.unknown()).optional(),
        seriesCollapsed: z
            .array(z.array(z.object({ value: numberSchema })))
            .optional(),
        xValues: z.array(z.string()),
    }),
});
type SeriesData = z.infer<typeof seriesResponseSchema>['data'];

const funnelResponseSchema = z.object({
    data: z.array(
        z.object({
            events: z.array(z.string()).optional(),
            cumulativeRaw: z.array(numberSchema),
            cumulative: z.array(numberSchema).optional(),
            stepByStep: z.array(numberSchema).optional(),
            avgTransTimes: z.array(numberSchema).optional(),
        }),
    ),
});

const retentionEntrySchema = z.object({
    count: numberSchema,
    outof: numberSchema,
});
const retentionResponseSchema = z.object({
    data: z.object({
        series: z.array(
            z.object({
                dates: z.array(z.string()).optional(),
                values: z
                    .record(z.string(), z.array(retentionEntrySchema))
                    .optional(),
                combined: z.array(retentionEntrySchema).optional(),
            }),
        ),
    }),
});

/**
 * A group's label: the docs show plain strings, so a string anywhere in
 * the label (a [segment, value] pair, say) is the group value.
 */
const toGroupLabel = (label: unknown): string | null => {
    if (typeof label === 'string') return label;
    if (Array.isArray(label)) {
        const value = [...label].reverse().find((v) => typeof v === 'string');
        return typeof value === 'string' ? value : null;
    }
    return null;
};

const getGroupLabels = (data: SeriesData) =>
    data.series.map((_, index) =>
        toGroupLabel(data.seriesLabels?.[index] ?? data.seriesMeta?.[index]),
    );

const toIsoDate = (value: string): string | null => {
    const iso = value.slice(0, 10);
    return ISO_DATE.test(iso) ? iso : null;
};

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const addDays = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};

/**
 * Retention labels its cohorts like "Aug 15", without a year: the year is
 * the one that puts the cohort inside the queried range.
 */
export const toRetentionCohortDate = (
    label: string,
    start: string,
    end: string,
): string | null => {
    const iso = toIsoDate(label);
    if (iso) return iso;
    const match = /^([A-Z][a-z]{2})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(
        label.trim(),
    );
    const month = match ? MONTHS.indexOf(match[1]) : -1;
    if (!match || month < 0) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    const toDate = (year: number) =>
        `${year}-${pad(month + 1)}-${pad(Number(match[2]))}`;
    if (match[3]) return toDate(Number(match[3]));
    const endYear = Number(end.slice(0, 4));
    // A week or month cohort may start a little before the range does
    const candidates = [endYear, endYear - 1, endYear - 2].map(toDate);
    return (
        candidates.find((date) => date <= end && date >= addDays(start, -31)) ??
        null
    );
};

export const AMPLITUDE_DATE_COLUMNS = { 1: 'date', 7: 'week', 30: 'month' };

type Row = Record<string, unknown>;

/** Rows keyed by their dimensions, so each call's metric lands on the same row. */
const mergeRows = () => {
    const rows = new Map<string, Row>();
    return {
        set: (dimensions: Row, metric: string, value: number | null) => {
            const key = JSON.stringify(dimensions);
            const row = rows.get(key) ?? { ...dimensions };
            row[metric] = value;
            rows.set(key, row);
        },
        rows: () => [...rows.values()],
    };
};

const runSegmentation = async (
    request: Extract<AmplitudeRequest, { endpoint: 'segmentation' }>,
    calls: LiveCalls,
) => {
    const dateColumn =
        request.interval === null
            ? null
            : AMPLITUDE_DATE_COLUMNS[request.interval];
    const merged = mergeRows();
    const pairs = request.events.flatMap((event) =>
        request.metrics.map((metric) => ({ event, metric })),
    );
    const responses = await Promise.all(
        pairs.map(({ event, metric }) =>
            get(
                calls,
                AMPLITUDE_PATHS.segmentation,
                [
                    [
                        'e',
                        JSON.stringify(toEventObject(event, request.groupBy)),
                    ],
                    ['m', metric],
                    ...rangeParams(request),
                    // Without a date grain, read daily and keep the collapsed totals
                    ['i', request.interval ?? 1],
                    ...(request.groupBy
                        ? [
                              ['limit', SEGMENTATION_GROUP_LIMIT] as [
                                  string,
                                  number,
                              ],
                          ]
                        : []),
                ],
                seriesResponseSchema,
            ),
        ),
    );
    responses.forEach(({ data }, index) => {
        const { event, metric } = pairs[index];
        const column = AMPLITUDE_SEGMENTATION_METRICS[metric];
        const labels = getGroupLabels(data);
        data.series.forEach((values, seriesIndex) => {
            const base: Row = {
                event_type: event,
                ...(request.groupBy
                    ? { [request.groupBy]: labels[seriesIndex] }
                    : {}),
            };
            if (!dateColumn) {
                merged.set(
                    base,
                    column,
                    data.seriesCollapsed?.[seriesIndex]?.[0]?.value ?? null,
                );
                return;
            }
            values.forEach((value, x) => {
                merged.set(
                    { [dateColumn]: toIsoDate(data.xValues[x] ?? ''), ...base },
                    column,
                    value,
                );
            });
        });
    });
    return {
        columns: [
            ...(dateColumn
                ? [{ name: dateColumn, type: DimensionType.DATE }]
                : []),
            { name: 'event_type', type: DimensionType.STRING },
            ...(request.groupBy
                ? [{ name: request.groupBy, type: DimensionType.STRING }]
                : []),
            ...request.metrics.map((metric) => ({
                name: AMPLITUDE_SEGMENTATION_METRICS[metric],
                type: DimensionType.NUMBER,
            })),
        ],
        rows: merged.rows(),
    };
};

const runUsers = async (
    request: Extract<AmplitudeRequest, { endpoint: 'users' }>,
    calls: LiveCalls,
) => {
    const dateColumn = AMPLITUDE_DATE_COLUMNS[request.interval];
    const merged = mergeRows();
    const responses = await Promise.all(
        request.metrics.map((metric) =>
            get(
                calls,
                AMPLITUDE_PATHS.users,
                [
                    ['m', metric],
                    ...rangeParams(request),
                    ['i', request.interval],
                    ...(request.groupBy
                        ? [['g', request.groupBy] as [string, string]]
                        : []),
                ],
                seriesResponseSchema,
            ),
        ),
    );
    responses.forEach(({ data }, index) => {
        const column = AMPLITUDE_USER_METRICS[request.metrics[index]];
        const labels = getGroupLabels(data);
        data.series.forEach((values, seriesIndex) => {
            values.forEach((value, x) => {
                merged.set(
                    {
                        [dateColumn]: toIsoDate(data.xValues[x] ?? ''),
                        ...(request.groupBy
                            ? { [request.groupBy]: labels[seriesIndex] }
                            : {}),
                    },
                    column,
                    value,
                );
            });
        });
    });
    return {
        columns: [
            { name: dateColumn, type: DimensionType.DATE },
            ...(request.groupBy
                ? [{ name: request.groupBy, type: DimensionType.STRING }]
                : []),
            ...request.metrics.map((metric) => ({
                name: AMPLITUDE_USER_METRICS[metric],
                type: DimensionType.NUMBER,
            })),
        ],
        rows: merged.rows(),
    };
};

const FUNNEL_COLUMNS: LiveColumn[] = [
    { name: 'step_number', type: DimensionType.NUMBER },
    { name: 'step_event', type: DimensionType.STRING },
    { name: 'users', type: DimensionType.NUMBER },
    { name: 'conversion_rate', type: DimensionType.NUMBER },
    { name: 'step_conversion_rate', type: DimensionType.NUMBER },
    { name: 'average_time_to_convert_seconds', type: DimensionType.NUMBER },
];

const toSeconds = (milliseconds: number | null | undefined) =>
    milliseconds === null || milliseconds === undefined
        ? null
        : milliseconds / 1_000;

const runFunnel = async (
    request: Extract<AmplitudeRequest, { endpoint: 'funnel' }>,
    calls: LiveCalls,
) => {
    const { data } = await get(
        calls,
        AMPLITUDE_PATHS.funnels,
        [
            ...request.steps.map((step): [string, string] => [
                'e',
                JSON.stringify(toEventObject(step)),
            ]),
            ...rangeParams(request),
            ['mode', 'ordered'],
            ['n', 'active'],
            ['cs', request.conversionWindowDays * 86_400],
        ],
        funnelResponseSchema,
    );
    const [funnel] = data;
    const rows = request.steps.map((step, index) => ({
        step_number: index + 1,
        step_event: step,
        users: funnel?.cumulativeRaw[index] ?? null,
        conversion_rate: funnel?.cumulative?.[index] ?? null,
        step_conversion_rate: funnel?.stepByStep?.[index] ?? null,
        // Amplitude reports milliseconds; the first step has no time to it
        average_time_to_convert_seconds:
            index === 0 ? null : toSeconds(funnel?.avgTransTimes?.[index]),
    }));
    return { columns: FUNNEL_COLUMNS, rows };
};

const RETENTION_METRIC_COLUMNS: LiveColumn[] = [
    { name: 'retained_users', type: DimensionType.NUMBER },
    { name: 'cohort_users', type: DimensionType.NUMBER },
    { name: 'retention_rate', type: DimensionType.NUMBER },
];

/** Index 0 is the cohort's size; index N + 1 is N periods after the start. */
const toRetentionRows = (
    entries: z.infer<typeof retentionEntrySchema>[],
    base: Row,
): Row[] =>
    entries.slice(1).map(({ count, outof }, period) => ({
        ...base,
        period,
        retained_users: count,
        cohort_users: outof,
        retention_rate:
            count !== null && outof !== null && outof > 0
                ? count / outof
                : null,
    }));

const runRetention = async (
    request: Extract<AmplitudeRequest, { endpoint: 'retention' }>,
    calls: LiveCalls,
) => {
    const { data } = await get(
        calls,
        AMPLITUDE_PATHS.retention,
        [
            ['se', JSON.stringify(toEventObject(request.startEvent))],
            ['re', JSON.stringify(toEventObject(request.returnEvent))],
            ['rm', 'nday'],
            ...rangeParams(request),
            ['i', request.interval],
        ],
        retentionResponseSchema,
    );
    const [series] = data.series;
    const cohortColumn = AMPLITUDE_DATE_COLUMNS[request.interval];
    const rows = request.byCohort
        ? Object.entries(series?.values ?? {})
              .map(([label, entries]) => ({
                  cohort: toRetentionCohortDate(
                      label,
                      request.start,
                      request.end,
                  ),
                  entries,
              }))
              .sort((a, b) => (a.cohort ?? '').localeCompare(b.cohort ?? ''))
              .flatMap(({ cohort, entries }) =>
                  toRetentionRows(entries, { [cohortColumn]: cohort }),
              )
        : toRetentionRows(series?.combined ?? [], {});
    return {
        columns: [
            ...(request.byCohort
                ? [{ name: cohortColumn, type: DimensionType.DATE }]
                : []),
            { name: 'period', type: DimensionType.NUMBER },
            ...RETENTION_METRIC_COLUMNS,
        ],
        rows,
    };
};

const runSessions = async (
    request: Extract<AmplitudeRequest, { endpoint: 'sessions' }>,
    calls: LiveCalls,
) => {
    const merged = mergeRows();
    const responses = await Promise.all(
        request.metrics.map((metric) =>
            get(
                calls,
                metric === 'average'
                    ? AMPLITUDE_PATHS.sessionLength
                    : AMPLITUDE_PATHS.sessionsPerUser,
                rangeParams(request),
                seriesResponseSchema,
            ),
        ),
    );
    responses.forEach(({ data }, index) => {
        const column = AMPLITUDE_SESSION_METRICS[request.metrics[index]];
        (data.series[0] ?? []).forEach((value, x) => {
            merged.set(
                { date: toIsoDate(data.xValues[x] ?? '') },
                column,
                value,
            );
        });
    });
    return {
        columns: [
            { name: 'date', type: DimensionType.DATE },
            ...request.metrics.map((metric) => ({
                name: AMPLITUDE_SESSION_METRICS[metric],
                type: DimensionType.NUMBER,
            })),
        ],
        rows: merged.rows(),
    };
};

const runRequest = (request: AmplitudeRequest, calls: LiveCalls) => {
    switch (request.endpoint) {
        case 'segmentation':
            return runSegmentation(request, calls);
        case 'users':
            return runUsers(request, calls);
        case 'funnel':
            return runFunnel(request, calls);
        case 'retention':
            return runRetention(request, calls);
        case 'sessions':
            return runSessions(request, calls);
        default:
            throw new Error(`Unknown ${LABEL} endpoint`);
    }
};

/**
 * Runs one report: a call per event and metric for segmentation and active
 * users, one call otherwise. Amplitude returns every row at once, so rows
 * past the limit are dropped here.
 */
export const runAmplitudeQuery = async ({
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.AMPLITUDE,
    AmplitudeRequest
>): Promise<LiveRunResult> => {
    const { columns, rows } = await runRequest(request, calls);
    const rowLimit = Math.min(limit, AMPLITUDE_MAX_QUERY_ROWS);
    return {
        columns,
        rows: rows.slice(0, rowLimit),
        hasMoreRows: rows.length > rowLimit,
    };
};

export { DEFAULT_CONVERSION_WINDOW_DAYS };
