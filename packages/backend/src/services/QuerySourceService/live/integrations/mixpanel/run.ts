import {
    ApiConnectorType,
    DimensionType,
    LIVE_INTEGRATION_CATALOG,
    MIXPANEL_PATHS,
    UnexpectedServerError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../types';
import {
    getMixpanelPropertyName,
    MIXPANEL_PROPERTIES,
    type MixpanelProperty,
} from './explores';

const LABEL = LIVE_INTEGRATION_CATALOG[ApiConnectorType.MIXPANEL].messageLabel;

/** Rows one query may return; Mixpanel returns every row in one call. */
export const MIXPANEL_MAX_QUERY_ROWS = 5_000;
/** Segmentation reads one event per call. */
export const MIXPANEL_MAX_EVENTS = 3;
/** Mixpanel allows 60 queries an hour per project, so one query reads a few at most. */
export const MIXPANEL_CALLS_PER_QUERY = 6;
/** Property values Mixpanel returns per segmentation call; its own maximum is 10,000. */
export const MIXPANEL_SEGMENT_LIMIT = 1_000;

/** Periods after the start a retention query reads, per unit. */
export const MIXPANEL_MAX_RETENTION_PERIODS = {
    day: 90,
    week: 52,
    month: 24,
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const eventSchema = z.string().min(1).max(255);

const PROPERTY_KEYS = Object.keys(MIXPANEL_PROPERTIES) as [
    MixpanelProperty,
    ...MixpanelProperty[],
];
const propertySchema = z.enum(PROPERTY_KEYS);

const propertyFilterSchema = z
    .object({
        property: propertySchema,
        op: z.enum(['is', 'is not']),
        values: z.array(z.string()).min(1).max(100),
    })
    .strict();

export const MIXPANEL_SEGMENTATION_METRICS = {
    general: 'event_count',
    unique: 'unique_users',
    average: 'events_per_user',
} as const;
export type MixpanelSegmentationMetric =
    keyof typeof MIXPANEL_SEGMENTATION_METRICS;

/** One Mixpanel Query API report, as compile writes it and agents send it. */
export const mixpanelRequestSchema = z
    .discriminatedUnion('endpoint', [
        z.object({ endpoint: z.literal('top_events') }).strict(),
        z
            .object({
                endpoint: z.literal('segmentation'),
                start: dateSchema,
                end: dateSchema,
                /** Null reads one total over the whole range. */
                unit: z.enum(['day', 'month']).nullable(),
                events: z.array(eventSchema).min(1).max(MIXPANEL_MAX_EVENTS),
                metrics: z
                    .array(
                        z.enum(
                            Object.keys(MIXPANEL_SEGMENTATION_METRICS) as [
                                MixpanelSegmentationMetric,
                                ...MixpanelSegmentationMetric[],
                            ],
                        ),
                    )
                    .min(1),
                groupBy: propertySchema.nullable(),
                filters: z.array(propertyFilterSchema).max(10),
            })
            .strict(),
        z
            .object({
                endpoint: z.literal('funnel'),
                start: dateSchema,
                end: dateSchema,
                funnelId: z.number().int().positive(),
            })
            .strict(),
        z
            .object({
                endpoint: z.literal('retention'),
                start: dateSchema,
                end: dateSchema,
                unit: z.enum(['day', 'week', 'month']),
                /** Null counts everyone who did the return event in a period as its cohort. */
                startEvent: eventSchema.nullable(),
                /** Null counts any event as coming back. */
                returnEvent: eventSchema.nullable(),
            })
            .strict(),
    ])
    .refine(
        (request) => !('start' in request) || request.start <= request.end,
        {
            message: 'The date range starts after it ends',
        },
    )
    .refine(
        (request) =>
            request.endpoint !== 'segmentation' ||
            request.events.length * request.metrics.length <=
                MIXPANEL_CALLS_PER_QUERY,
        {
            message: `Mixpanel reads one event and metric per call: keep events × metrics to ${MIXPANEL_CALLS_PER_QUERY} or fewer`,
        },
    );

export type MixpanelRequest = z.infer<typeof mixpanelRequestSchema>;

type PropertyFilter = z.infer<typeof propertyFilterSchema>;

/** A property as a Mixpanel expression reads it. */
const toPropertyExpression = (property: MixpanelProperty) =>
    `properties[${JSON.stringify(getMixpanelPropertyName(property))}]`;

/**
 * Filters as one `where` expression: values of one filter are ORed (`is`)
 * or ANDed (`is not`), and filters are ANDed.
 */
export const toWhereExpression = (filters: PropertyFilter[]): string | null => {
    if (filters.length === 0) return null;
    return filters
        .map(({ property, op, values }) => {
            const left = toPropertyExpression(property);
            const operator = op === 'is' ? '==' : '!=';
            const join = op === 'is' ? ' or ' : ' and ';
            return `(${values
                .map((value) => `${left} ${operator} ${JSON.stringify(value)}`)
                .join(join)})`;
        })
        .join(' and ');
};

/** Days from start to end, both included. */
export const countDays = (start: string, end: string) =>
    Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
            86_400_000,
    ) + 1;

const toIsoDate = (value: string): string | null => {
    const iso = value.slice(0, 10);
    return ISO_DATE.test(iso) ? iso : null;
};

type Params = [string, string | number][];

/** Every Query API call names its project. */
const get = <T>(
    calls: LiveCalls,
    projectId: string,
    path: string,
    params: Params,
    schema: z.ZodType<T>,
) =>
    calls.fetch(
        {
            method: 'GET',
            path,
            query: Object.fromEntries(
                [['project_id', projectId] as [string, string], ...params].map(
                    ([key, value]) => [key, String(value)],
                ),
            ),
            body: undefined,
        },
        schema,
    );

/**
 * Runs calls one after another: Mixpanel allows 5 queries at once per
 * project, shared with every other client of it.
 */
const inSequence = <T>(tasks: (() => Promise<T>)[]): Promise<T[]> =>
    tasks.reduce<Promise<T[]>>(
        async (done, task) => [...(await done), await task()],
        Promise.resolve([]),
    );

const numberSchema = z.number().nullable().catch(null);

const segmentationResponseSchema = z.object({
    data: z.object({
        series: z.array(z.string()),
        /** By event name, or by property value with `on`; then by date. */
        values: z.record(z.string(), z.record(z.string(), numberSchema)),
    }),
});

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

const MONTH_COLUMN = 'month';

const runSegmentation = async (
    request: Extract<MixpanelRequest, { endpoint: 'segmentation' }>,
    projectId: string,
    calls: LiveCalls,
) => {
    const where = toWhereExpression(request.filters);
    const days = countDays(request.start, request.end);
    const pairs = request.events.flatMap((event) =>
        request.metrics.map((metric) => ({ event, metric })),
    );
    const responses = await inSequence(
        pairs.map(
            ({ event, metric }) =>
                () =>
                    get(
                        calls,
                        projectId,
                        MIXPANEL_PATHS.segmentation,
                        [
                            ['event', event],
                            ['from_date', request.start],
                            ['to_date', request.end],
                            ['type', metric],
                            // Without a grain, totals add up by day; uniques
                            // and averages need one bucket over the range
                            ...((request.unit === null && metric !== 'general'
                                ? [['interval', days]]
                                : [['unit', request.unit ?? 'day']]) as Params),
                            ...((where ? [['where', where]] : []) as Params),
                            ...((request.groupBy
                                ? [
                                      [
                                          'on',
                                          toPropertyExpression(request.groupBy),
                                      ],
                                      ['limit', MIXPANEL_SEGMENT_LIMIT],
                                  ]
                                : []) as Params),
                        ],
                        segmentationResponseSchema,
                    ),
        ),
    );
    const merged = mergeRows();
    responses.forEach(({ data }, index) => {
        const { event, metric } = pairs[index];
        const column = MIXPANEL_SEGMENTATION_METRICS[metric];
        Object.entries(data.values).forEach(([label, byDate]) => {
            const base: Row = {
                event,
                ...(request.groupBy ? { [request.groupBy]: label } : {}),
            };
            const entries = Object.entries(byDate);
            if (request.unit === null) {
                if (metric === 'general') {
                    merged.set(
                        base,
                        column,
                        entries.reduce(
                            (sum, [, value]) => sum + (value ?? 0),
                            0,
                        ),
                    );
                    return;
                }
                if (entries.length > 1) {
                    throw new UnexpectedServerError(
                        `${LABEL} split the range into ${entries.length} periods; add a date dimension.`,
                    );
                }
                merged.set(base, column, entries[0]?.[1] ?? null);
                return;
            }
            const dateColumn = request.unit === 'day' ? 'date' : MONTH_COLUMN;
            entries
                .map(([date, value]) => [toIsoDate(date), value] as const)
                .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
                .forEach(([date, value]) => {
                    merged.set({ [dateColumn]: date, ...base }, column, value);
                });
        });
    });
    return {
        // Mixpanel drops the values past its limit without saying so
        truncated:
            request.groupBy !== null &&
            responses.some(
                ({ data }) =>
                    Object.keys(data.values).length >= MIXPANEL_SEGMENT_LIMIT,
            ),
        columns: [
            ...(request.unit === null
                ? []
                : [
                      {
                          name: request.unit === 'day' ? 'date' : MONTH_COLUMN,
                          type: DimensionType.DATE,
                      },
                  ]),
            { name: 'event', type: DimensionType.STRING },
            ...(request.groupBy
                ? [{ name: request.groupBy, type: DimensionType.STRING }]
                : []),
            ...request.metrics.map((metric) => ({
                name: MIXPANEL_SEGMENTATION_METRICS[metric],
                type: DimensionType.NUMBER,
            })),
        ],
        rows: merged.rows(),
    };
};

const funnelStepSchema = z.object({
    count: numberSchema,
    step_conv_ratio: numberSchema.optional(),
    overall_conv_ratio: numberSchema.optional(),
    avg_time: numberSchema.optional(),
    event: z.string().optional(),
    goal: z.string().optional(),
    step_label: z.string().optional(),
});

const funnelResponseSchema = z.object({
    data: z.record(z.string(), z.object({ steps: z.array(funnelStepSchema) })),
});

const FUNNEL_COLUMNS: LiveColumn[] = [
    { name: 'step_number', type: DimensionType.NUMBER },
    { name: 'step_event', type: DimensionType.STRING },
    { name: 'users', type: DimensionType.NUMBER },
    { name: 'conversion_rate', type: DimensionType.NUMBER },
    { name: 'step_conversion_rate', type: DimensionType.NUMBER },
    { name: 'average_time_to_convert_seconds', type: DimensionType.NUMBER },
];

const runFunnel = async (
    request: Extract<MixpanelRequest, { endpoint: 'funnel' }>,
    projectId: string,
    calls: LiveCalls,
) => {
    const { data } = await get(
        calls,
        projectId,
        MIXPANEL_PATHS.funnels,
        [
            ['funnel_id', request.funnelId],
            ['from_date', request.start],
            ['to_date', request.end],
            // One bucket over the whole range, so each user counts once
            ['interval', countDays(request.start, request.end)],
        ],
        funnelResponseSchema,
    );
    const buckets = Object.values(data);
    if (buckets.length > 1) {
        throw new UnexpectedServerError(
            `${LABEL} split the funnel into ${buckets.length} periods instead of one.`,
        );
    }
    const steps = buckets[0]?.steps ?? [];
    const rows = steps.map((step, index) => ({
        step_number: index + 1,
        step_event: step.step_label ?? step.event ?? step.goal ?? null,
        users: step.count,
        conversion_rate: step.overall_conv_ratio ?? null,
        step_conversion_rate: step.step_conv_ratio ?? null,
        // The first step has no time to it
        average_time_to_convert_seconds:
            index === 0 ? null : (step.avg_time ?? null),
    }));
    return { columns: FUNNEL_COLUMNS, rows };
};

const retentionResponseSchema = z.record(
    z.string(),
    z.object({
        counts: z.array(numberSchema),
        first: numberSchema,
    }),
);

const UNIT_DAYS = { day: 1, week: 7, month: 30 } as const;
const COHORT_COLUMNS = { day: 'date', week: 'week', month: 'month' } as const;

/**
 * Periods to read: enough to reach the end of the range from its start, up
 * to the cap; `capped` says the earliest cohorts lose their later periods.
 */
export const getRetentionPeriods = (
    start: string,
    end: string,
    unit: keyof typeof UNIT_DAYS,
) => {
    const needed = Math.ceil(countDays(start, end) / UNIT_DAYS[unit]) + 1;
    const max = MIXPANEL_MAX_RETENTION_PERIODS[unit];
    return { count: Math.min(needed, max), capped: needed > max };
};

const runRetention = async (
    request: Extract<MixpanelRequest, { endpoint: 'retention' }>,
    projectId: string,
    calls: LiveCalls,
) => {
    const periods = getRetentionPeriods(
        request.start,
        request.end,
        request.unit,
    );
    const response = await get(
        calls,
        projectId,
        MIXPANEL_PATHS.retention,
        [
            ['from_date', request.start],
            ['to_date', request.end],
            ...((request.startEvent
                ? [
                      ['retention_type', 'birth'],
                      ['born_event', request.startEvent],
                  ]
                : [['retention_type', 'compounded']]) as Params),
            ...((request.returnEvent
                ? [['event', request.returnEvent]]
                : []) as Params),
            ['unit', request.unit],
            ['interval_count', periods.count],
        ],
        retentionResponseSchema,
    );
    const cohortColumn = COHORT_COLUMNS[request.unit];
    const rows = Object.entries(response)
        .map(([label, cohort]) => ({ date: toIsoDate(label), cohort }))
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        .flatMap(({ date, cohort }) =>
            cohort.counts.map((count, period) => ({
                [cohortColumn]: date,
                period,
                retained_users: count,
                cohort_users: cohort.first,
                retention_rate:
                    count !== null && cohort.first !== null && cohort.first > 0
                        ? count / cohort.first
                        : null,
            })),
        );
    return {
        // Periods past the cap are dropped from the earliest cohorts
        truncated: periods.capped,
        columns: [
            { name: cohortColumn, type: DimensionType.DATE },
            { name: 'period', type: DimensionType.NUMBER },
            { name: 'retained_users', type: DimensionType.NUMBER },
            { name: 'cohort_users', type: DimensionType.NUMBER },
            { name: 'retention_rate', type: DimensionType.NUMBER },
        ],
        rows,
    };
};

/** Events Mixpanel ranks for today; it returns at most this many. */
const TOP_EVENTS_LIMIT = 100;

const topEventsResponseSchema = z.object({
    events: z.array(
        z.object({
            event: z.string(),
            amount: numberSchema,
            percent_change: numberSchema.optional(),
        }),
    ),
});

const runTopEvents = async (projectId: string, calls: LiveCalls) => {
    const { events } = await get(
        calls,
        projectId,
        MIXPANEL_PATHS.topEvents,
        [
            ['type', 'general'],
            ['limit', TOP_EVENTS_LIMIT],
        ],
        topEventsResponseSchema,
    );
    return {
        columns: [
            { name: 'event', type: DimensionType.STRING },
            { name: 'event_count', type: DimensionType.NUMBER },
            { name: 'percent_change', type: DimensionType.NUMBER },
        ],
        rows: events.map(({ event, amount, percent_change: change }) => ({
            event,
            event_count: amount,
            percent_change: change ?? null,
        })),
    };
};

const runRequest = (
    request: MixpanelRequest,
    projectId: string,
    calls: LiveCalls,
): Promise<{ columns: LiveColumn[]; rows: Row[]; truncated?: boolean }> => {
    switch (request.endpoint) {
        case 'top_events':
            return runTopEvents(projectId, calls);
        case 'segmentation':
            return runSegmentation(request, projectId, calls);
        case 'funnel':
            return runFunnel(request, projectId, calls);
        case 'retention':
            return runRetention(request, projectId, calls);
        default:
            throw new Error(`Unknown ${LABEL} endpoint`);
    }
};

/**
 * Runs one report: a call per event and metric for segmentation, one call
 * otherwise. Mixpanel returns every row at once, so rows past the limit are
 * dropped here.
 */
export const runMixpanelQuery = async ({
    settings,
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.MIXPANEL,
    MixpanelRequest
>): Promise<LiveRunResult> => {
    const { columns, rows, truncated } = await runRequest(
        request,
        settings.projectId,
        calls,
    );
    const rowLimit = Math.min(limit, MIXPANEL_MAX_QUERY_ROWS);
    return {
        columns,
        rows: rows.slice(0, rowLimit),
        hasMoreRows: rows.length > rowLimit || truncated === true,
    };
};
