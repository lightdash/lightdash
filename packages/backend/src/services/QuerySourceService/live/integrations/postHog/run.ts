import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    UnexpectedServerError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../sdk';
import { getPostHogQueryPath, WRAP_PREFIX } from './api';

/**
 * PostHog silently returns at most 50k rows, so a query asks for one more
 * than the limit to detect truncation itself.
 */
export const POSTHOG_MAX_QUERY_ROWS = 49_999;
const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

const successSchema = z.object({
    columns: z.array(z.string()),
    types: z.array(z.tuple([z.string(), z.string()])),
    results: z.array(z.array(z.unknown())),
    error: z.string().nullable().optional(),
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
    runtime,
}: LiveRunArgs<ApiConnectorType.POSTHOG, string>): Promise<LiveRunResult> => {
    assertMaxRows(limit, POSTHOG_MAX_QUERY_ROWS);
    const response = await runtime.send({
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
