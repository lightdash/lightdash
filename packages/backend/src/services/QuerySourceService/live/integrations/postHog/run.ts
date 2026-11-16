import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type ApiSourceOf,
} from '@lightdash/common';
import { z } from 'zod';
import type { LiveColumn, LiveHttpResponse } from '../../connector';
import {
    assertMaxRows,
    type LiveCalls,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../defineLiveIntegration';
import type { LiveScanResult } from '../../integration';
import {
    POSTHOG_MAX_SCANNED_PROPERTIES,
    type PostHogPropertyKind,
} from './explores';

/**
 * PostHog silently returns at most 50k rows, so a query asks for one more
 * than the limit to detect truncation itself.
 */
export const POSTHOG_MAX_QUERY_ROWS = 49_999;
// PostHog runs a query for up to 10s once it leaves the queue.
const POSTHOG_QUERY_RUN_MS = 10_000;
const PROPERTY_DEFINITIONS_PAGE_SIZE = 500;
const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const WRAP_PREFIX = 'SELECT * FROM (\n';

type PostHogSettings = ApiSourceOf<ApiConnectorType.POSTHOG>;

export const getPostHogQueryPath = (projectId: string) =>
    `/api/projects/${projectId}/query/`;

export const getPostHogPropertyDefinitionsPrefix = (projectId: string) =>
    `/api/projects/${projectId}/property_definitions/`;

export const getPostHogOAuthEndpoints = (origin: string) => ({
    authorizeUrl: new URL('/oauth/authorize/', origin).href,
    tokenUrl: new URL('/oauth/token/', origin).href,
});

const propertyDefinitionsPageSchema = z.object({
    next: z.string().nullish(),
    results: z.array(z.unknown()),
});

const successSchema = z.object({
    columns: z.array(z.string()),
    types: z.array(z.tuple([z.string(), z.string()])),
    results: z.array(z.array(z.unknown())),
    error: z.string().nullable().optional(),
});

const errorSchema = z.object({
    detail: z.string().optional(),
    code: z.string().optional(),
    extra: z
        .object({
            hogql_metadata: z
                .object({
                    errors: z.array(
                        z.object({ start: z.number(), end: z.number() }),
                    ),
                })
                .optional(),
        })
        .optional(),
});

const unwrapType = (type: string): string => {
    const match = /^(?:Nullable|LowCardinality)\((.*)\)$/.exec(type.trim());
    return match ? unwrapType(match[1]) : type.trim();
};

export const clickHouseTypeToDimensionType = (type: string): DimensionType => {
    const base = unwrapType(type);
    if (/^Date(32)?$/.test(base)) return DimensionType.DATE;
    if (/^DateTime/.test(base)) return DimensionType.TIMESTAMP;
    if (/^(U?Int\d+|Float\d+|Decimal)/.test(base)) return DimensionType.NUMBER;
    if (base === 'Bool') return DimensionType.BOOLEAN;
    return DimensionType.STRING;
};

// Arrays, maps and tuples arrive as JSON values; results store them as strings.
const toResultValue = (value: unknown): unknown =>
    value !== null && typeof value === 'object' ? JSON.stringify(value) : value;

const toColumns = (
    names: string[],
    types: [string, string][],
): LiveColumn[] => {
    const unsafe = names.filter((name) => !COLUMN_NAME.test(name));
    if (unsafe.length > 0) {
        throw new WarehouseQueryError(
            `Name every column with AS, using letters, digits and underscores: ${unsafe.join(
                ', ',
            )}`,
        );
    }
    const typeByName = new Map(types);
    return names.map((name) => ({
        name,
        type: clickHouseTypeToDimensionType(typeByName.get(name) ?? ''),
    }));
};

/** Reads one HogQL query, dropping trailing semicolons. */
export const parsePostHogQuery = (query: string): string => {
    const hogql = query.trim().replace(/;+\s*$/, '');
    if (hogql.length === 0) {
        throw new ParameterError('The HogQL query is empty');
    }
    return hogql;
};

const toBytesRead = (header: string | undefined) => {
    const bytesRead = Number(header ?? null);
    return header !== undefined && Number.isFinite(bytesRead)
        ? { bytesRead }
        : {};
};

/** Runs one HogQL query, wrapped to ask for one row more than the limit. */
export const runPostHogQuery = async ({
    settings: { projectId },
    request: query,
    limit,
    calls,
}: LiveRunArgs<ApiConnectorType.POSTHOG, string>): Promise<LiveRunResult> => {
    assertMaxRows(limit, POSTHOG_MAX_QUERY_ROWS);
    const response = await calls.send({
        method: 'POST',
        path: getPostHogQueryPath(projectId),
        body: {
            query: {
                kind: 'HogQLQuery',
                query: `${WRAP_PREFIX}${query}\n) LIMIT ${limit + 1}`,
            },
            name: 'api-query-source',
        },
    });
    const parsed = successSchema.safeParse(response.body);
    if (!parsed.success) {
        throw new UnexpectedServerError(
            'PostHog returned a query response in an unexpected shape',
        );
    }
    if (parsed.data.error) {
        throw new WarehouseQueryError(
            `PostHog query failed: ${parsed.data.error}`,
        );
    }
    const columns = toColumns(parsed.data.columns, parsed.data.types);
    return {
        columns,
        rows: parsed.data.results
            .slice(0, limit)
            .map((row) =>
                Object.fromEntries(
                    columns.map((column, index) => [
                        column.name,
                        toResultValue(row[index]),
                    ]),
                ),
            ),
        hasMoreRows: parsed.data.results.length > limit,
        ...toBytesRead(response.headers['x-posthog-query-bytes-read']),
    };
};

/** Every property definition of one kind, a page at a time, up to the scan cap. */
const readPropertyDefinitions = async (
    projectId: string,
    type: PostHogPropertyKind,
    calls: LiveCalls,
): Promise<{ results: unknown[] }> => {
    const readPage = async (offset: number) => {
        const response = await calls.send({
            method: 'GET',
            path: getPostHogPropertyDefinitionsPrefix(projectId),
            query: {
                type,
                limit: String(PROPERTY_DEFINITIONS_PAGE_SIZE),
                ...(offset > 0 ? { offset: String(offset) } : {}),
            },
            body: null,
        });
        const page = propertyDefinitionsPageSchema.safeParse(response.body);
        return page.success ? page.data : { results: [], next: null };
    };
    const readFrom = async (offset: number): Promise<unknown[]> => {
        const page = await readPage(offset);
        const nextOffset = offset + page.results.length;
        const hasMore =
            Boolean(page.next) &&
            page.results.length > 0 &&
            nextOffset < POSTHOG_MAX_SCANNED_PROPERTIES;
        return hasMore
            ? [...page.results, ...(await readFrom(nextOffset))]
            : page.results;
    };
    return { results: await readFrom(0) };
};

/** Reads the event and person property definitions the explore adds fields for. */
export const scanPostHogProperties = async ({
    settings: { projectId },
    calls,
}: {
    settings: PostHogSettings;
    calls: LiveCalls;
}): Promise<LiveScanResult> => {
    const [event, person] = await Promise.all([
        readPropertyDefinitions(projectId, 'event', calls),
        readPropertyDefinitions(projectId, 'person', calls),
    ]);
    return { posthogProperties: { event, person } };
};

export const toPostHogError = (
    response: LiveHttpResponse,
    { projectId }: PostHogSettings,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const detail = parsed.success ? parsed.data.detail : undefined;
    switch (response.status) {
        case 400: {
            // Positions point into the wrapped query; shift them back to the caller's.
            const position =
                parsed.success && parsed.data.extra?.hogql_metadata?.errors[0];
            return new WarehouseQueryError(
                `PostHog rejected the query: ${detail ?? 'invalid HogQL'}`,
                {
                    code: parsed.success ? (parsed.data.code ?? null) : null,
                    ...(position && position.start >= WRAP_PREFIX.length
                        ? {
                              start: position.start - WRAP_PREFIX.length,
                              end: position.end - WRAP_PREFIX.length,
                          }
                        : {}),
                },
            );
        }
        case 401:
        case 403:
            return new WarehouseConnectionError(
                `PostHog rejected the API key for project ${projectId}. Check that the key has the Query Read scope and belongs to the connection's region (US or EU).`,
            );
        case 404:
            return new WarehouseConnectionError(
                `PostHog project ${projectId} was not found in the connection's region`,
            );
        case 429: {
            const retryAfter = Number(
                response.headers['retry-after'] ?? Number.NaN,
            );
            const retryAfterSeconds = Number.isFinite(retryAfter)
                ? retryAfter
                : null;
            return new TooManyRequestsError(
                `PostHog query budget exceeded${detail ? `: ${detail}` : ''}. ${
                    retryAfterSeconds !== null
                        ? `Retry after ${retryAfterSeconds} seconds.`
                        : 'Retry in a minute.'
                }`,
                { retryAfterSeconds },
            );
        }
        case 504:
            return new TimeoutError(
                `PostHog stopped the query after ${
                    POSTHOG_QUERY_RUN_MS / 1000
                } seconds. Narrow the date range or aggregate further.`,
            );
        default:
            return new UnexpectedServerError(
                `PostHog returned ${response.status}${
                    detail ? `: ${detail}` : ''
                }`,
            );
    }
};
