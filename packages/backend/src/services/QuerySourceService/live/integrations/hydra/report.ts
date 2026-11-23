import { z } from 'zod';
import { type HydraDataset } from './data';

/** What each of Hydra's reports groups by and totals. */
export const HYDRA_REPORTS = {
    events: {
        dimensions: [
            'date',
            'date_week',
            'date_month',
            'event_type',
            'user_id',
            'country',
            'plan',
        ],
        metrics: ['event_count', 'revenue', 'unique_users'],
        dates: ['date', 'date_week', 'date_month'],
    },
    users: {
        dimensions: ['user_id', 'plan', 'country', 'signup_date'],
        metrics: ['user_count', 'seats'],
        dates: ['signup_date'],
    },
} as const;

export type HydraReportName = keyof typeof HYDRA_REPORTS;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One Hydra report, as compile writes it and agents send it. */
export const hydraReportSchema = z
    .object({
        report: z.enum(['events', 'users']),
        dimensions: z.array(z.string()).default([]),
        metrics: z.array(z.string()).default([]),
        startDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD').optional(),
        endDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD').optional(),
        filters: z
            .array(
                z
                    .object({
                        field: z.string(),
                        operator: z.enum(['in', 'not_in']),
                        values: z.array(z.string()).min(1),
                    })
                    .strict(),
            )
            .default([]),
        orderBy: z
            .array(
                z
                    .object({
                        field: z.string(),
                        descending: z.boolean().default(false),
                    })
                    .strict(),
            )
            .default([]),
        // Agents often copy the API's own limit; the smaller limit wins.
        limit: z.number().int().positive().optional(),
    })
    .strict()
    .superRefine((request, context) => {
        const { dimensions, metrics } = HYDRA_REPORTS[request.report];
        const known: readonly string[] = [...dimensions, ...metrics];
        const unknown = [
            ...request.dimensions,
            ...request.metrics,
            ...request.filters.map(({ field }) => field),
            ...request.orderBy.map(({ field }) => field),
        ].filter((field) => !known.includes(field));
        if (unknown.length > 0) {
            context.addIssue({
                code: 'custom',
                message: `The ${request.report} report has no field ${unknown
                    .map((field) => `"${field}"`)
                    .join(', ')}. It has ${known.join(', ')}.`,
            });
        }
        if (request.metrics.length + request.dimensions.length === 0) {
            context.addIssue({
                code: 'custom',
                message: 'Ask for at least one dimension or metric',
            });
        }
        if (
            request.report === 'events' &&
            (!request.startDate || !request.endDate)
        ) {
            context.addIssue({
                code: 'custom',
                message: 'The events report needs a startDate and an endDate',
            });
        }
        if (
            request.startDate &&
            request.endDate &&
            request.startDate > request.endDate
        ) {
            context.addIssue({
                code: 'custom',
                message: 'startDate must not be after endDate',
            });
        }
    });

export type HydraReportRequest = z.infer<typeof hydraReportSchema>;

export type HydraReportRow = Record<string, string | number>;

const toMonday = (isoDate: string) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
};

const toMonthStart = (isoDate: string) => `${isoDate.slice(0, 7)}-01`;

type Source = Record<string, string | number>;

const readDimension = (row: Source, name: string): string => {
    if (name === 'date_week') return toMonday(String(row.date));
    if (name === 'date_month') return toMonthStart(String(row.date));
    return String(row[name]);
};

const totals: Record<string, (rows: Source[]) => number> = {
    event_count: (rows) => rows.length,
    revenue: (rows) =>
        Math.round(
            rows.reduce((sum, row) => sum + Number(row.revenue), 0) * 100,
        ) / 100,
    unique_users: (rows) => new Set(rows.map((row) => row.user_id)).size,
    user_count: (rows) => rows.length,
    seats: (rows) => rows.reduce((sum, row) => sum + Number(row.seats), 0),
};

const compare = (a: string | number, b: string | number) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
};

/**
 * Runs a report the way Hydra's API would: filters, groups, totals and
 * sorts every matching row. Returns every group; the caller cuts it.
 */
export const runHydraReport = (
    dataset: HydraDataset,
    request: HydraReportRequest,
): HydraReportRow[] => {
    const source: Source[] =
        request.report === 'events' ? dataset.events : dataset.users;
    const matching = source.filter(
        (row) =>
            (request.report !== 'events' ||
                ((!request.startDate ||
                    String(row.date) >= request.startDate) &&
                    (!request.endDate ||
                        String(row.date) <= request.endDate))) &&
            request.filters.every(({ field, operator, values }) => {
                const isIn = values.includes(readDimension(row, field));
                return operator === 'in' ? isIn : !isIn;
            }),
    );
    const groups = new Map<string, Source[]>();
    matching.forEach((row) => {
        const key = JSON.stringify(
            request.dimensions.map((name) => readDimension(row, name)),
        );
        groups.set(key, [...(groups.get(key) ?? []), row]);
    });
    // Totals with no dimension are one row, even when nothing matched
    if (request.dimensions.length === 0 && groups.size === 0) {
        groups.set('[]', []);
    }
    const rows = [...groups.entries()].map(([key, members]): HydraReportRow => {
        const values = JSON.parse(key) as string[];
        return {
            ...Object.fromEntries(
                request.dimensions.map((name, index) => [name, values[index]]),
            ),
            ...Object.fromEntries(
                request.metrics.map((name) => [name, totals[name](members)]),
            ),
        };
    });
    // Without an order: the first metric, largest first, else the dimensions
    const orderBy =
        request.orderBy.length > 0
            ? request.orderBy
            : [
                  ...request.metrics
                      .slice(0, 1)
                      .map((field) => ({ field, descending: true })),
                  ...request.dimensions.map((field) => ({
                      field,
                      descending: false,
                  })),
              ];
    return rows.sort((a, b) => {
        for (const { field, descending } of orderBy) {
            const order = compare(a[field] ?? '', b[field] ?? '');
            if (order !== 0) return descending ? -order : order;
        }
        return 0;
    });
};
