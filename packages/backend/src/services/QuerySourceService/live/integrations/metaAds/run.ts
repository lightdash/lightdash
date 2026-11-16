import {
    ApiConnectorType,
    DimensionType,
    getMetaAdsInsightsPath,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap } from '../../query/rows';
import {
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../types';
import { META_ADS_BREAKDOWNS } from './explores';

const LABEL = 'Meta Ads';
const INSIGHTS_PAGE_SIZE = 500;
export const META_ADS_CALLS_PER_QUERY = 10;
/** The most rows one query can read: every page it may fetch. */
export const META_ADS_MAX_QUERY_ROWS =
    INSIGHTS_PAGE_SIZE * META_ADS_CALLS_PER_QUERY;

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

/** An Insights query, as compile writes it and agents send it. */
export const metaAdsRequestSchema = z
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
    .strict()
    .refine((request) => request.time_range.since <= request.time_range.until, {
        message: 'The date range starts after it ends',
    });

export type MetaAdsRequest = z.infer<typeof metaAdsRequestSchema>;

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
    columns: LiveColumn[],
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
}: MetaAdsRequest): LiveColumn[] => [
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

/** Reads the Insights edge page by page, one row past the limit. */
export const runMetaAdsQuery = async ({
    settings: { adAccountId },
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.META_ADS,
    MetaAdsRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, META_ADS_MAX_QUERY_ROWS);
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
        ...(request.sort?.length ? { sort: JSON.stringify(request.sort) } : {}),
    };

    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows: Math.min(limit, request.limit ?? limit),
        maxRows: META_ADS_MAX_QUERY_ROWS,
        pageSize: INSIGHTS_PAGE_SIZE,
        maxPages: META_ADS_CALLS_PER_QUERY,
        fetchPage: async ({ limit: pageLimit, cursor }) => {
            const { data, paging } = await calls.fetch(
                {
                    method: 'GET',
                    path: getMetaAdsInsightsPath(adAccountId),
                    query: {
                        ...baseQuery,
                        limit: String(pageLimit),
                        ...(cursor ? { after: cursor } : {}),
                    },
                    body: undefined,
                },
                responseSchema,
            );
            return {
                rows: data,
                nextCursor: paging?.next ? paging.cursors?.after : undefined,
            };
        },
    });

    return {
        columns,
        rows: rows.map((row) => toRow(row, columns, request.time_increment)),
        hasMoreRows,
    };
};
