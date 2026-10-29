import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    UnexpectedServerError,
} from '@lightdash/common';
import { z } from 'zod';
import type {
    ApiConnector,
    ApiConnectorColumn,
    ApiConnectorDescription,
    ApiConnectorExecuteArgs,
    ApiConnectorResult,
    ApiConnectorTransport,
} from '../ApiConnector';
import { toGoogleApiError } from './googleApiError';

export const SEARCH_CONSOLE_ORIGIN = 'https://searchconsole.googleapis.com';
export const SEARCH_CONSOLE_SITES_PATH = '/webmasters/v3/sites/';

// One request returns at most 25,000 rows; the connector asks for one more
// than the limit to detect truncation itself.
const SEARCH_CONSOLE_MAX_ROWS = 25_000;
const SEARCH_CONSOLE_TIMEOUT_MS = 30_000;
// Search Analytics allows 1,200 queries a minute per site and per user.
const SEARCH_CONSOLE_LIMITS = {
    concurrentCalls: 5,
    callsPerMinute: 600,
    callsPerHour: 20_000,
    callsPerQuery: 1,
};

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

const requestSchema = z
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
    .strict();

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

export type SearchConsoleConnectorArgs = {
    siteUrl: string;
    /** Sends to the Search Console API with the connection's Google sign-in attached. */
    send: ApiConnectorTransport;
};

// The guarded fetch decodes the path once before sending it, so the site is
// encoded twice to reach Google encoded once.
export const getSearchConsoleQueryPath = (siteUrl: string) =>
    `${SEARCH_CONSOLE_SITES_PATH}${encodeURIComponent(
        encodeURIComponent(siteUrl),
    )}/searchAnalytics/query`;

const parseRequest = (query: string): z.infer<typeof requestSchema> => {
    let json: unknown;
    try {
        json = JSON.parse(query);
    } catch {
        throw new ParameterError(
            'The Search Console request must be a JSON object',
        );
    }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        throw new ParameterError(
            `Invalid Search Console request at ${
                issue.path.join('.') || 'the top level'
            }: ${issue.message}`,
        );
    }
    if (parsed.data.startDate > parsed.data.endDate) {
        throw new ParameterError('startDate must not be after endDate');
    }
    return parsed.data;
};

export class SearchConsoleConnector implements ApiConnector {
    private readonly siteUrl: string;

    private readonly send: ApiConnectorTransport;

    constructor({ siteUrl, send }: SearchConsoleConnectorArgs) {
        this.siteUrl = siteUrl;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            label: 'Search Console',
            level: 3,
            queryLanguage: 'Search Analytics JSON',
            maxRows: SEARCH_CONSOLE_MAX_ROWS - 1,
            timeoutMs: SEARCH_CONSOLE_TIMEOUT_MS,
            limits: SEARCH_CONSOLE_LIMITS,
        };
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit >= SEARCH_CONSOLE_MAX_ROWS
        ) {
            throw new ParameterError(
                `limit must be between 1 and ${SEARCH_CONSOLE_MAX_ROWS - 1} rows`,
            );
        }
        const { rowLimit: requestLimit, ...request } = parseRequest(
            payload.query,
        );
        const rowLimit = Math.min(limit, requestLimit ?? limit);
        const dimensions = request.dimensions ?? [];

        const response = await this.send({
            method: 'POST',
            path: getSearchConsoleQueryPath(this.siteUrl),
            body: { ...request, rowLimit: rowLimit + 1, startRow: 0 },
        });
        if (response.status < 200 || response.status >= 300) {
            throw toGoogleApiError(response, {
                label: 'Search Console',
                resource: this.siteUrl,
            });
        }
        const parsed = responseSchema.safeParse(response.body);
        if (!parsed.success) {
            throw new UnexpectedServerError(
                'Search Console returned a response in an unexpected shape',
            );
        }

        const apiRows = parsed.data.rows ?? [];
        const rows = apiRows.slice(0, rowLimit).map((row) => ({
            ...Object.fromEntries(
                dimensions.map((dimension, index) => [
                    dimension,
                    row.keys?.[index] ?? null,
                ]),
            ),
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
        }));
        const columns: ApiConnectorColumn[] = [
            ...dimensions.map((name) => ({
                name,
                type:
                    name === 'date' ? DimensionType.DATE : DimensionType.STRING,
            })),
            ...METRICS.map((name) => ({ name, type: DimensionType.NUMBER })),
        ];
        return {
            columns,
            rows,
            truncated: apiRows.length > rowLimit,
            apiCalls: 1,
            bytesRead: null,
        };
    }
}
