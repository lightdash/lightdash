import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import type {
    ApiConnector,
    ApiConnectorColumn,
    ApiConnectorDescription,
    ApiConnectorExecuteArgs,
    ApiConnectorResponse,
    ApiConnectorResult,
    ApiConnectorTransport,
} from '../ApiConnector';

// PostHog silently returns at most 50k rows, so the connector asks for one
// more than the limit to detect truncation itself.
const POSTHOG_MAX_ROWS = 50_000;
const POSTHOG_TIMEOUT_MS = 10_000;
const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const WRAP_PREFIX = 'SELECT * FROM (\n';

export type PostHogConnectorArgs = {
    projectId: string;
    /** Sends to the PostHog host with a personal API key that has the Query Read scope. */
    send: ApiConnectorTransport;
};

export const getPostHogQueryPath = (projectId: string) =>
    `/api/projects/${projectId}/query/`;

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

export class PostHogConnector implements ApiConnector {
    private readonly projectId: string;

    private readonly send: ApiConnectorTransport;

    constructor({ projectId, send }: PostHogConnectorArgs) {
        this.projectId = projectId;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.POSTHOG,
            label: 'PostHog',
            level: 5,
            queryLanguage: 'HogQL',
            maxRows: POSTHOG_MAX_ROWS - 1,
            timeoutMs: POSTHOG_TIMEOUT_MS,
        };
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit >= POSTHOG_MAX_ROWS
        ) {
            throw new ParameterError(
                `limit must be between 1 and ${POSTHOG_MAX_ROWS - 1} rows`,
            );
        }
        const query = payload.query.trim().replace(/;+\s*$/, '');
        if (query.length === 0) {
            throw new ParameterError('The HogQL query is empty');
        }

        const response = await this.send({
            method: 'POST',
            path: getPostHogQueryPath(this.projectId),
            body: {
                query: {
                    kind: 'HogQLQuery',
                    query: `${WRAP_PREFIX}${query}\n) LIMIT ${limit + 1}`,
                },
                name: 'api-query-source',
            },
        });
        if (response.status < 200 || response.status >= 300) {
            throw this.toError(response);
        }

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

        const columns = this.toColumns(parsed.data.columns, parsed.data.types);
        const rows = parsed.data.results
            .slice(0, limit)
            .map((row) =>
                Object.fromEntries(
                    columns.map((column, index) => [
                        column.name,
                        toResultValue(row[index]),
                    ]),
                ),
            );
        const bytesReadHeader =
            response.headers['x-posthog-query-bytes-read'] ?? null;
        const bytesRead = Number(bytesReadHeader);
        return {
            columns,
            rows,
            truncated: parsed.data.results.length > limit,
            apiCalls: 1,
            bytesRead:
                bytesReadHeader !== null && Number.isFinite(bytesRead)
                    ? bytesRead
                    : null,
        };
    }

    private toError(response: ApiConnectorResponse): Error {
        const parsed = errorSchema.safeParse(response.body);
        const detail = parsed.success ? parsed.data.detail : undefined;
        switch (response.status) {
            case 400: {
                // Positions point into the wrapped query; shift them back to the caller's.
                const position =
                    parsed.success &&
                    parsed.data.extra?.hogql_metadata?.errors[0];
                return new WarehouseQueryError(
                    `PostHog rejected the query: ${detail ?? 'invalid HogQL'}`,
                    {
                        code: parsed.success
                            ? (parsed.data.code ?? null)
                            : null,
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
                    `PostHog rejected the API key for project ${this.projectId}. Check that the key has the Query Read scope and belongs to the connection's region (US or EU).`,
                );
            case 404:
                return new WarehouseConnectionError(
                    `PostHog project ${this.projectId} was not found in the connection's region`,
                );
            case 429: {
                const retryAfter = Number(
                    response.headers['retry-after'] ?? Number.NaN,
                );
                return new TooManyRequestsError(
                    `PostHog query budget exceeded${
                        detail ? `: ${detail}` : ''
                    }`,
                    {
                        retryAfterSeconds: Number.isFinite(retryAfter)
                            ? retryAfter
                            : null,
                    },
                );
            }
            case 504:
                return new TimeoutError(
                    `PostHog stopped the query after ${
                        POSTHOG_TIMEOUT_MS / 1000
                    } seconds. Narrow the date range or aggregate further.`,
                );
            default:
                return new UnexpectedServerError(
                    `PostHog returned ${response.status}${
                        detail ? `: ${detail}` : ''
                    }`,
                );
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private toColumns(
        names: string[],
        types: [string, string][],
    ): ApiConnectorColumn[] {
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
    }
}
