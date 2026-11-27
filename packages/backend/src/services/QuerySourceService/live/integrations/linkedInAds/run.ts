import { ApiConnectorType, DimensionType } from '@lightdash/common';
import { z } from 'zod';
import {
    tooManyRowsError,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../sdk';
import {
    LINKEDIN_ADS_ANALYTICS_PATH,
    LINKEDIN_ADS_CAMPAIGN_COLUMNS,
    LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS,
    LINKEDIN_ADS_DATE_COLUMNS,
} from './api';

// A response has at most 15,000 elements and adAnalytics has no pagination
const LINKEDIN_ADS_MAX_ELEMENTS = 15_000;
/** The most rows one query can ask for; one fewer than a response holds, to detect truncation. */
export const LINKEDIN_ADS_MAX_QUERY_ROWS = LINKEDIN_ADS_MAX_ELEMENTS - 1;
/** One adAnalytics report. */
export const LINKEDIN_ADS_CALLS_PER_QUERY = 1;

export const LINKEDIN_ADS_PIVOTS = [
    'ACCOUNT',
    'CAMPAIGN_GROUP',
    'CAMPAIGN',
] as const;
export type LinkedInAdsPivot = (typeof LINKEDIN_ADS_PIVOTS)[number];

const COLUMNS: readonly string[] = [
    ...LINKEDIN_ADS_DATE_COLUMNS,
    ...LINKEDIN_ADS_CAMPAIGN_COLUMNS,
    ...LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS,
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_ID = /^\d{1,20}$/;
const FIELD_NAME = /^[A-Za-z]+$/;

const idsSchema = z.array(z.string().regex(NUMERIC_ID)).min(1).max(100);

/**
 * An adAnalytics report, as compile writes it and agents send it. The ad
 * account is never part of the request: it comes from the connection.
 */
export const linkedInAdsRequestSchema = z
    .object({
        pivot: z.enum(LINKEDIN_ADS_PIVOTS),
        timeGranularity: z.enum(['ALL', 'DAILY', 'MONTHLY', 'YEARLY']),
        dateRange: z
            .object({
                start: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
                end: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
            })
            .strict(),
        fields: z
            .array(z.string().regex(FIELD_NAME, 'Use a metric API name'))
            .min(1)
            .max(18),
        dimensions: z
            .array(
                z
                    .string()
                    .refine((name) => COLUMNS.includes(name), 'Unknown column'),
            )
            .default([]),
        campaigns: idsSchema.optional(),
        campaignGroups: idsSchema.optional(),
    })
    .strict();

export type LinkedInAdsRequest = z.infer<typeof linkedInAdsRequestSchema>;

const dateSchema = z.object({
    year: z.number(),
    month: z.number(),
    day: z.number(),
});

const analyticsSchema = z.object({
    elements: z
        .array(
            z
                .object({
                    pivotValues: z.array(z.string()).optional(),
                    dateRange: z.object({ start: dateSchema }).optional(),
                })
                .passthrough(),
        )
        .optional(),
});

const toRestliDate = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return `(year:${year},month:${month},day:${day})`;
};

const urnList = (kind: string, ids: string[]) =>
    `List(${ids
        .map((id) => encodeURIComponent(`urn:li:${kind}:${id}`))
        .join(',')})`;

const toNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const pad = (value: number) => String(value).padStart(2, '0');

const toDateCell = (
    column: string,
    { year, month, day }: z.infer<typeof dateSchema>,
) => {
    if (column === 'year') return `${year}-01-01`;
    if (column === 'month') return `${year}-${pad(month)}-01`;
    return `${year}-${pad(month)}-${pad(day)}`;
};

const lastSegment = (urn: unknown) =>
    typeof urn === 'string' ? (urn.split(':').pop() ?? null) : null;

const getColumnType = (name: string): DimensionType =>
    (LINKEDIN_ADS_DATE_COLUMNS as readonly string[]).includes(name)
        ? DimensionType.DATE
        : DimensionType.STRING;

/** Runs one adAnalytics report: one call, no pagination. */
export const runLinkedInAdsQuery = async ({
    settings: { adAccountId },
    request,
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.LINKEDIN_ADS,
    LinkedInAdsRequest
>): Promise<LiveRunResult> => {
    const rowLimit = Math.min(limit, LINKEDIN_ADS_MAX_QUERY_ROWS);
    const facets = [
        `accounts=${urnList('sponsoredAccount', [adAccountId])}`,
        ...(request.campaigns
            ? [`campaigns=${urnList('sponsoredCampaign', request.campaigns)}`]
            : []),
        ...(request.campaignGroups
            ? [
                  `campaignGroups=${urnList(
                      'sponsoredCampaignGroup',
                      request.campaignGroups,
                  )}`,
              ]
            : []),
    ];
    const rawQuery = [
        'q=analytics',
        `pivot=${request.pivot}`,
        `timeGranularity=${request.timeGranularity}`,
        `dateRange=(start:${toRestliDate(request.dateRange.start)},end:${toRestliDate(request.dateRange.end)})`,
        ...facets,
        `fields=${[...request.fields, 'dateRange', 'pivotValues'].join(',')}`,
    ].join('&');

    const { elements = [] } = await runtime.fetch(
        {
            method: 'GET',
            path: LINKEDIN_ADS_ANALYTICS_PATH,
            rawQuery,
            body: null,
        },
        analyticsSchema,
    );
    // The API stops at 15,000 with no way to read the rest
    if (elements.length >= LINKEDIN_ADS_MAX_ELEMENTS) {
        throw tooManyRowsError({
            label: 'LinkedIn Ads',
            maxRows: LINKEDIN_ADS_MAX_QUERY_ROWS,
        });
    }

    const rows = elements.slice(0, rowLimit).map((element) => {
        const pivotId = lastSegment(element.pivotValues?.[0]);
        const toCell = (name: string): unknown => {
            switch (name) {
                case 'day':
                case 'month':
                case 'year':
                    return element.dateRange
                        ? toDateCell(name, element.dateRange.start)
                        : null;
                case 'campaign.id':
                    return request.pivot === 'CAMPAIGN' ? pivotId : null;
                case 'campaignGroup.id':
                    return request.pivot === 'CAMPAIGN_GROUP' ? pivotId : null;
                default:
                    return null;
            }
        };
        return {
            ...Object.fromEntries(
                request.dimensions.map((name) => [name, toCell(name)]),
            ),
            ...Object.fromEntries(
                request.fields.map((name) => [name, toNumber(element[name])]),
            ),
        };
    });
    const columns: LiveColumn[] = [
        ...request.dimensions.map((name) => ({
            name,
            type: getColumnType(name),
        })),
        ...request.fields.map((name) => ({
            name,
            type: DimensionType.NUMBER,
        })),
    ];
    return {
        columns,
        rows,
        hasMoreRows: elements.length > rowLimit,
    };
};
