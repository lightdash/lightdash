import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import type { ApiConnectorColumn } from '../../../api/ApiConnector';
import { readRowsWithinCap } from '../../../api/apiSourceRows';
import type { LiveRunArgs, LiveRunResult } from '../../defineLiveIntegration';
import { GOOGLE_ADS_MICROS_FIELDS } from './explores';

export const GOOGLE_ADS_ORIGIN = 'https://googleads.googleapis.com';
// Each version is sunset about a year after release; v26 runs to November 2027
// (https://developers.google.com/google-ads/api/docs/sunset-dates).
export const GOOGLE_ADS_API_VERSION = 'v26';
export const GOOGLE_ADS_LIST_CUSTOMERS_PATH = `/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;

// GoogleAdsService.Search returns 10,000 rows a page; asking for one more row
// than the limit keeps every query to one page and one operation.
const GOOGLE_ADS_MAX_ROWS = 10_000;
/** The most rows one query can ask for; one fewer than a page, to detect truncation. */
export const GOOGLE_ADS_MAX_QUERY_ROWS = GOOGLE_ADS_MAX_ROWS - 1;

const GAQL_FIELD = /^[a-z_]+(\.[a-z_]+)+$/;
const GAQL_SELECT = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+[a-z_]+\b/i;
const GAQL_TRAILING_LIMIT = /\s+LIMIT\s+(\d+)\s*$/i;
const GAQL_PARAMETERS = /\sPARAMETERS\s/i;
const DATE_COLUMNS = new Set([
    'segments.date',
    'segments.week',
    'segments.month',
    'segments.quarter',
]);

const responseSchema = z.object({
    results: z.array(z.record(z.string(), z.unknown())).optional(),
    nextPageToken: z.string().optional(),
});

export const getGoogleAdsSearchPath = (customerId: string) =>
    `/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;

/** One GAQL query, split into what `run` sends and reads back. */
export type GoogleAdsRequest = {
    /** The selected fields, in order; they name the result columns. */
    fields: string[];
    /** The query without its trailing LIMIT. */
    baseQuery: string;
    /** The query's own trailing LIMIT, when it has one. */
    queryLimit: number | undefined;
};

/** Reads one GAQL query, as compile writes it and as an agent may send it. */
export const parseGoogleAdsRequest = (query: string): GoogleAdsRequest => {
    const select = GAQL_SELECT.exec(query);
    if (!select) {
        throw new ParameterError(
            'The Google Ads request must be one GAQL query: SELECT fields FROM resource',
        );
    }
    if (GAQL_PARAMETERS.test(query)) {
        throw new ParameterError(
            'The PARAMETERS clause is not available on live data sources. Remove it from the query.',
        );
    }
    const fields = select[1].split(',').map((field) => field.trim());
    const invalid = fields.find((field) => !GAQL_FIELD.test(field));
    if (invalid !== undefined) {
        throw new ParameterError(
            `"${invalid}" isn't a GAQL field. List fields by name, for example metrics.clicks.`,
        );
    }
    const queryLimit = GAQL_TRAILING_LIMIT.exec(query)?.[1];
    return {
        fields,
        baseQuery: query.replace(GAQL_TRAILING_LIMIT, '').trimEnd(),
        queryLimit: queryLimit === undefined ? undefined : Number(queryLimit),
    };
};

const toCamelCase = (name: string) =>
    name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** `ad_group.id` reads `adGroup.id`: REST rows are nested and camelCased. */
const readField = (row: Record<string, unknown>, field: string): unknown =>
    field
        .split('.')
        .map(toCamelCase)
        .reduce<unknown>(
            (value, key) =>
                typeof value === 'object' && value !== null
                    ? (value as Record<string, unknown>)[key]
                    : undefined,
            row,
        );

/**
 * Metrics arrive as numbers or, for 64-bit ones, as strings. A missing value
 * stays missing rather than becoming a zero nobody reported.
 */
const toMetricValue = (field: string, value: unknown) => {
    if (value === undefined || value === null) {
        return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return null;
    }
    return GOOGLE_ADS_MICROS_FIELDS.has(field) ? number / 1_000_000 : number;
};

const getColumnType = (field: string): DimensionType => {
    if (field.startsWith('metrics.') || field === 'segments.year') {
        return DimensionType.NUMBER;
    }
    return DATE_COLUMNS.has(field) ? DimensionType.DATE : DimensionType.STRING;
};

/** Runs one GAQL search on the account, asking for one row more than the limit. */
export const runGoogleAdsQuery = async ({
    settings: { customerId },
    request: { fields, baseQuery, queryLimit },
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.GOOGLE_ADS,
    GoogleAdsRequest
>): Promise<LiveRunResult> => {
    const { rows: results, hasMoreRows } = await readRowsWithinCap({
        label: 'Google Ads',
        requestedRows: Math.min(limit, queryLimit ?? limit),
        maxRows: GOOGLE_ADS_MAX_QUERY_ROWS,
        pageSize: GOOGLE_ADS_MAX_ROWS,
        // Asking for one more row than the limit fits in one page
        maxPages: 1,
        fetchPage: async ({ limit: pageLimit }) => {
            const page = await calls.fetch(
                {
                    method: 'POST',
                    path: getGoogleAdsSearchPath(customerId),
                    body: { query: `${baseQuery} LIMIT ${pageLimit}` },
                },
                responseSchema,
            );
            return {
                rows: page.results ?? [],
                nextCursor: page.nextPageToken,
            };
        },
    });
    const rows = results.map((row) =>
        Object.fromEntries(
            fields.map((field) => {
                const value = readField(row, field);
                return [
                    field,
                    field.startsWith('metrics.')
                        ? toMetricValue(field, value)
                        : (value ?? null),
                ];
            }),
        ),
    );
    const columns: ApiConnectorColumn[] = fields.map((name) => ({
        name,
        type: getColumnType(name),
    }));
    return { columns, rows, hasMoreRows };
};
