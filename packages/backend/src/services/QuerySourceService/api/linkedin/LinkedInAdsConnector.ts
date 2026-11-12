import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TimeFrames,
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
import { tooManyRowsError } from '../apiSourceRows';
import {
    LINKEDIN_ADS_CAMPAIGN_COLUMNS,
    LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS,
    LINKEDIN_ADS_DATE_COLUMNS,
    LINKEDIN_ADS_DATE_FILTERS,
    LINKEDIN_ADS_ID_FILTERS,
} from './linkedinAdsSemanticLayer';

export const LINKEDIN_ADS_ORIGIN = 'https://api.linkedin.com';
export const LINKEDIN_ADS_TOKEN_URL =
    'https://www.linkedin.com/oauth/v2/accessToken';
// Versions are supported for about a year; 202611 and 202610 are the newest
// documented (https://learn.microsoft.com/linkedin/marketing/versioning).
export const LINKEDIN_ADS_API_VERSION = '202610';
export const LINKEDIN_ADS_REQUEST_HEADERS = {
    'Linkedin-Version': LINKEDIN_ADS_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
};
export const LINKEDIN_ADS_ANALYTICS_PATH = '/rest/adAnalytics';
export const LINKEDIN_ADS_TIMEOUT_MS = 60_000;

export const getLinkedInAdsAccountPath = (adAccountId: string) =>
    `/rest/adAccounts/${adAccountId}`;
export const getLinkedInAdsCampaignsPath = (adAccountId: string) =>
    `${getLinkedInAdsAccountPath(adAccountId)}/adCampaigns`;
export const getLinkedInAdsCampaignGroupsPath = (adAccountId: string) =>
    `${getLinkedInAdsAccountPath(adAccountId)}/adCampaignGroups`;

// A response has at most 15,000 elements and adAnalytics has no pagination
const LINKEDIN_ADS_MAX_ELEMENTS = 15_000;
/** The most rows one query can ask for; one fewer than a response holds, to detect truncation. */
export const LINKEDIN_ADS_MAX_QUERY_ROWS = LINKEDIN_ADS_MAX_ELEMENTS - 1;
const PAGE_SIZE = 1_000;
// An account has at most 5,000 campaigns, and campaign groups have no limit
const MAX_CAMPAIGN_PAGES = 5;
const MAX_CAMPAIGN_GROUP_PAGES = 3;
const LINKEDIN_ADS_LIMITS = {
    concurrentCalls: 5,
    callsPerMinute: 60,
    callsPerHour: 1_000,
    // One report plus the campaign and campaign group lookups
    callsPerQuery: 1 + MAX_CAMPAIGN_PAGES + MAX_CAMPAIGN_GROUP_PAGES,
};

export const LINKEDIN_ADS_PIVOTS = [
    'ACCOUNT',
    'CAMPAIGN_GROUP',
    'CAMPAIGN',
] as const;
export type LinkedInAdsPivot = (typeof LINKEDIN_ADS_PIVOTS)[number];

/**
 * adAnalytics filters by campaign and campaign group only, ANDed, and can't
 * filter metrics. Dates are in UTC, grouped by day, month or year.
 */
export const LINKEDIN_ADS_CAPABILITIES: ApiConnectorCapabilities = {
    filters: {
        operators: {
            string: LINKEDIN_ADS_ID_FILTERS,
            date: LINKEDIN_ADS_DATE_FILTERS,
            metric: [],
        },
        multipleValues: true,
        or: false,
        nestedGroups: false,
    },
    metricFilters: false,
    dates: {
        rangeRequired: true,
        operators: LINKEDIN_ADS_DATE_FILTERS,
        grains: [TimeFrames.DAY, TimeFrames.MONTH, TimeFrames.YEAR],
        timezone: 'fixed',
    },
    pushdown: ALL_PUSHDOWN_REFUSED,
};

const COLUMNS: readonly string[] = [
    ...LINKEDIN_ADS_DATE_COLUMNS,
    ...LINKEDIN_ADS_CAMPAIGN_COLUMNS,
    ...LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS,
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_ID = /^\d{1,20}$/;
const FIELD_NAME = /^[A-Za-z]+$/;

const idsSchema = z.array(z.string().regex(NUMERIC_ID)).min(1).max(100);

// The ad account is never part of the request: it comes from the connection.
const requestSchema = z
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

type LinkedInAdsRequest = z.infer<typeof requestSchema>;

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

const searchSchema = z.object({
    elements: z.array(z.record(z.string(), z.unknown())).optional(),
    metadata: z.object({ nextPageToken: z.string().optional() }).optional(),
});

const errorSchema = z.object({ message: z.string().optional() });

const parseRequest = (query: string): LinkedInAdsRequest => {
    let json: unknown;
    try {
        json = JSON.parse(query);
    } catch {
        throw new ParameterError(
            'The LinkedIn Ads report request must be a JSON object',
        );
    }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        throw new ParameterError(
            `Invalid LinkedIn Ads report request at ${
                issue.path.join('.') || 'the top level'
            }: ${issue.message}`,
        );
    }
    return parsed.data;
};

const toRestliDate = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return `(year:${year},month:${month},day:${day})`;
};

const urnList = (kind: string, ids: string[]) =>
    `List(${ids
        .map((id) => encodeURIComponent(`urn:li:${kind}:${id}`))
        .join(',')})`;

/** Turns a LinkedIn API error response into an error that says what to change. */
export const toLinkedInApiError = (
    response: ApiConnectorResponse,
    adAccountId: string,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const detail =
        parsed.success && parsed.data.message ? `: ${parsed.data.message}` : '';
    switch (response.status) {
        case 400:
            return new WarehouseQueryError(
                `LinkedIn Ads rejected the request${detail}`,
            );
        case 401:
            return new WarehouseConnectionError(
                `LinkedIn sign-in has expired${detail}. Reconnect the source.`,
            );
        case 403:
            return new WarehouseConnectionError(
                `LinkedIn denied access to ad account ${adAccountId}${detail}. Check that the signed-in member still has a role on the account, or reconnect the source.`,
            );
        case 404:
            return new WarehouseConnectionError(
                `LinkedIn could not find ad account ${adAccountId}${detail}`,
            );
        case 429:
            return new TooManyRequestsError(
                `LinkedIn Ads rate limit reached${detail}. Retry in a few minutes.`,
                { retryAfterSeconds: null },
            );
        default:
            return new UnexpectedServerError(
                `LinkedIn Ads returned ${response.status}${detail}`,
            );
    }
};

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

export type LinkedInAdsConnectorArgs = {
    adAccountId: string;
    /** Sends to the LinkedIn Marketing API with the connection's sign-in attached. */
    send: ApiConnectorTransport;
};

export class LinkedInAdsConnector implements ApiConnector {
    private readonly adAccountId: string;

    private readonly send: ApiConnectorTransport;

    constructor({ adAccountId, send }: LinkedInAdsConnectorArgs) {
        this.adAccountId = adAccountId;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.LINKEDIN_ADS,
            label: 'LinkedIn Ads',
            level: 3,
            queryLanguage: 'LinkedIn Ads adAnalytics JSON',
            maxRows: LINKEDIN_ADS_MAX_QUERY_ROWS,
            timeoutMs: LINKEDIN_ADS_TIMEOUT_MS,
            limits: LINKEDIN_ADS_LIMITS,
            capabilities: LINKEDIN_ADS_CAPABILITIES,
        };
    }

    private async getOk(
        path: string,
        rawQuery: string,
    ): Promise<ApiConnectorResponse> {
        const response = await this.send({
            method: 'GET',
            path,
            rawQuery,
            body: null,
        });
        if (response.status < 200 || response.status >= 300) {
            throw toLinkedInApiError(response, this.adAccountId);
        }
        return response;
    }

    /** Every entity of an account-level search, so rows show names as they are now. */
    private async searchAll(
        path: string,
        statuses: string,
        maxPages: number,
        label: string,
    ): Promise<Record<string, unknown>[]> {
        const baseQuery = `q=search&search=(status:(values:List(${statuses})))&pageSize=${PAGE_SIZE}`;
        const collect = async (
            page: number,
            pageToken: string | undefined,
        ): Promise<Record<string, unknown>[]> => {
            const response = await this.getOk(
                path,
                pageToken
                    ? `${baseQuery}&pageToken=${encodeURIComponent(pageToken)}`
                    : baseQuery,
            );
            const parsed = searchSchema.safeParse(response.body);
            if (!parsed.success) {
                throw new UnexpectedServerError(
                    'LinkedIn Ads returned a response in an unexpected shape',
                );
            }
            const elements = parsed.data.elements ?? [];
            const nextToken = parsed.data.metadata?.nextPageToken;
            if (!nextToken) return elements;
            if (page >= maxPages) {
                throw new ParameterError(
                    `This ad account has more ${label} than one query can look up. Remove the ${label} name, status or type from the query.`,
                );
            }
            return [...elements, ...(await collect(page + 1, nextToken))];
        };
        return collect(1, undefined);
    }

    private async getCampaigns(needed: boolean) {
        if (!needed) return new Map<string, Record<string, unknown>>();
        const campaigns = await this.searchAll(
            getLinkedInAdsCampaignsPath(this.adAccountId),
            'ACTIVE,PAUSED,ARCHIVED,COMPLETED,CANCELED,DRAFT,PENDING_DELETION,REMOVED',
            MAX_CAMPAIGN_PAGES,
            'campaigns',
        );
        return new Map(campaigns.map((item) => [String(item.id), item]));
    }

    private async getCampaignGroups(needed: boolean) {
        if (!needed) return new Map<string, Record<string, unknown>>();
        const groups = await this.searchAll(
            getLinkedInAdsCampaignGroupsPath(this.adAccountId),
            'ACTIVE,ARCHIVED,CANCELED,DRAFT,PAUSED,PENDING_DELETION,REMOVED',
            MAX_CAMPAIGN_GROUP_PAGES,
            'campaign groups',
        );
        return new Map(groups.map((item) => [String(item.id), item]));
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new ParameterError('limit must be a positive number of rows');
        }
        const request = parseRequest(payload.query);
        const rowLimit = Math.min(limit, LINKEDIN_ADS_MAX_QUERY_ROWS);
        const facets = [
            `accounts=${urnList('sponsoredAccount', [this.adAccountId])}`,
            ...(request.campaigns
                ? [
                      `campaigns=${urnList('sponsoredCampaign', request.campaigns)}`,
                  ]
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

        const response = await this.getOk(
            LINKEDIN_ADS_ANALYTICS_PATH,
            rawQuery,
        );
        const parsed = analyticsSchema.safeParse(response.body);
        if (!parsed.success) {
            throw new UnexpectedServerError(
                'LinkedIn Ads returned a response in an unexpected shape',
            );
        }
        const elements = parsed.data.elements ?? [];
        // The API stops at 15,000 with no way to read the rest
        if (elements.length >= LINKEDIN_ADS_MAX_ELEMENTS) {
            throw tooManyRowsError({
                label: 'LinkedIn Ads',
                maxRows: LINKEDIN_ADS_MAX_QUERY_ROWS,
            });
        }

        const dimensions = new Set(request.dimensions);
        const usesCampaign = (name: string) =>
            dimensions.has(name) && name !== 'campaign.id';
        const needsCampaigns =
            LINKEDIN_ADS_CAMPAIGN_COLUMNS.some(usesCampaign) ||
            (request.pivot === 'CAMPAIGN' &&
                LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS.some((name) =>
                    dimensions.has(name),
                ));
        const [campaigns, campaignGroups] = await Promise.all([
            this.getCampaigns(needsCampaigns),
            this.getCampaignGroups(dimensions.has('campaignGroup.name')),
        ]);

        const rows = elements.slice(0, rowLimit).map((element) => {
            const pivotId = lastSegment(element.pivotValues?.[0]);
            const campaign =
                request.pivot === 'CAMPAIGN' && pivotId !== null
                    ? campaigns.get(pivotId)
                    : undefined;
            let groupId: string | null = null;
            if (request.pivot === 'CAMPAIGN_GROUP') {
                groupId = pivotId;
            } else if (campaign) {
                groupId = lastSegment(campaign.campaignGroup);
            }
            const group =
                groupId !== null ? campaignGroups.get(groupId) : undefined;
            const toCell = (name: string): unknown => {
                switch (name) {
                    case 'day':
                    case 'month':
                    case 'year':
                        return element.dateRange
                            ? toDateCell(name, element.dateRange.start)
                            : null;
                    case 'campaign.id':
                        return pivotId;
                    case 'campaign.name':
                        return campaign?.name ?? null;
                    case 'campaign.status':
                        return campaign?.status ?? null;
                    case 'campaign.type':
                        return campaign?.type ?? null;
                    case 'campaign.objectiveType':
                        return campaign?.objectiveType ?? null;
                    case 'campaignGroup.id':
                        return groupId;
                    case 'campaignGroup.name':
                        return group?.name ?? null;
                    default:
                        return null;
                }
            };
            return {
                ...Object.fromEntries(
                    request.dimensions.map((name) => [name, toCell(name)]),
                ),
                ...Object.fromEntries(
                    request.fields.map((name) => [
                        name,
                        toNumber(element[name]),
                    ]),
                ),
            };
        });
        const columns: ApiConnectorColumn[] = [
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
            bytesRead: null,
        };
    }
}
