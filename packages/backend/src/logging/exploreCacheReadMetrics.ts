import { type Explore } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    CachedExploreStagingTableName,
    CachedExploreTableName,
} from '../database/entities/projects';
import { getActiveSpanName } from '../tracing/tracing';
import { VERSION } from '../version';
import Logger from './logger';

const EXPLORE_CACHE_STATEMENT_METRICS_ENV_VAR =
    'LIGHTDASH_EXPLORE_CACHE_STATEMENT_METRICS_ENABLED';
const MAX_PENDING_EXPLORE_CACHE_STATEMENTS = 1_000;

type ExploreCacheOperation =
    | 'select'
    | 'insert'
    | 'update'
    | 'delete'
    | 'other';

type ExploreCacheTableName =
    | typeof CachedExploreTableName
    | typeof CachedExploreStagingTableName;

type KnexQueryEvent = {
    __knexQueryUid?: string;
    method?: string;
    sql?: string;
};

type PendingExploreCacheStatement = {
    caller: string | null;
    operation: ExploreCacheOperation;
    startedAt: number;
    tableName: ExploreCacheTableName;
};

type ExploreCacheStatementMetricDependencies = {
    getCaller: () => string | undefined;
    log: (
        message: string,
        metadata: {
            name: string;
            duration: number;
            context: Record<string, unknown>;
            serverVersion: string;
        },
    ) => void;
    maxPendingStatements: number;
    now: () => number;
};

const isIdentifierCharacter = (character: string | undefined): boolean =>
    character !== undefined && /[A-Za-z0-9_$]/u.test(character);

const getExploreCacheTableName = (
    sql: unknown,
): ExploreCacheTableName | undefined => {
    if (typeof sql !== 'string') return undefined;

    let tableNameIndex = sql.indexOf(CachedExploreTableName);
    while (tableNameIndex !== -1) {
        const before = sql[tableNameIndex - 1];
        for (const tableName of [
            CachedExploreStagingTableName,
            CachedExploreTableName,
        ] as const) {
            const after = sql[tableNameIndex + tableName.length];
            if (
                sql.startsWith(tableName, tableNameIndex) &&
                !isIdentifierCharacter(before) &&
                !isIdentifierCharacter(after)
            ) {
                return tableName;
            }
        }
        tableNameIndex = sql.indexOf(
            CachedExploreTableName,
            tableNameIndex + CachedExploreTableName.length,
        );
    }

    return undefined;
};

export const isCachedExploreStatement = (sql: unknown): boolean =>
    getExploreCacheTableName(sql) !== undefined;

const getExploreCacheSqlOperation = (sql: string): ExploreCacheOperation => {
    let depth = 0;
    let quote: "'" | '"' | undefined;
    let inLineComment = false;
    let inBlockComment = false;

    for (let index = 0; index < sql.length; index += 1) {
        const character = sql[index];
        const nextCharacter = sql[index + 1];

        if (inLineComment) {
            if (character === '\n') inLineComment = false;
        } else if (inBlockComment) {
            if (character === '*' && nextCharacter === '/') {
                inBlockComment = false;
                index += 1;
            }
        } else if (quote) {
            if (character === quote) {
                if (nextCharacter === quote) {
                    index += 1;
                } else {
                    quote = undefined;
                }
            }
        } else if (character === '-' && nextCharacter === '-') {
            inLineComment = true;
            index += 1;
        } else if (character === '/' && nextCharacter === '*') {
            inBlockComment = true;
            index += 1;
        } else if (character === "'" || character === '"') {
            quote = character;
        } else if (character === '(') {
            depth += 1;
        } else if (character === ')') {
            depth = Math.max(0, depth - 1);
        } else if (depth === 0 && /[A-Za-z]/u.test(character)) {
            let tokenEnd = index + 1;
            while (/[A-Za-z]/u.test(sql[tokenEnd] ?? '')) tokenEnd += 1;
            const token = sql.slice(index, tokenEnd).toLowerCase();
            if (
                token === 'select' ||
                token === 'insert' ||
                token === 'update' ||
                token === 'delete'
            ) {
                return token;
            }
            index = tokenEnd - 1;
        }
    }

    return 'other';
};

const getExploreCacheOperation = (
    method: string | undefined,
    sql: string,
): ExploreCacheOperation => {
    switch (method) {
        case 'select':
        case 'first':
        case 'pluck':
            return 'select';
        case 'insert':
            return 'insert';
        case 'update':
        case 'counter':
            return 'update';
        case 'del':
        case 'delete':
            return 'delete';
        default:
            return getExploreCacheSqlOperation(sql);
    }
};

const getReturnedRowCount = (response: unknown): number | undefined => {
    if (Array.isArray(response)) return response.length;
    if (typeof response !== 'object' || response === null) return undefined;

    if (
        'rowCount' in response &&
        typeof response.rowCount === 'number' &&
        Number.isFinite(response.rowCount)
    ) {
        return response.rowCount;
    }
    if ('rows' in response && Array.isArray(response.rows)) {
        return response.rows.length;
    }
    return undefined;
};

export const attachExploreCacheStatementMetrics = (
    database: Knex,
    {
        getCaller = getActiveSpanName,
        log = (message, metadata) => Logger.info(message, metadata),
        maxPendingStatements = MAX_PENDING_EXPLORE_CACHE_STATEMENTS,
        now = () => performance.now(),
    }: Partial<ExploreCacheStatementMetricDependencies> = {},
): void => {
    if (process.env[EXPLORE_CACHE_STATEMENT_METRICS_ENV_VAR] === 'false') {
        return;
    }

    const pendingStatements = new Map<string, PendingExploreCacheStatement>();

    database.on('query', (query: KnexQueryEvent) => {
        try {
            const tableName = getExploreCacheTableName(query.sql);
            if (!tableName || !query.__knexQueryUid || !query.sql) {
                return;
            }
            if (pendingStatements.size >= maxPendingStatements) {
                const oldestQueryUid = pendingStatements.keys().next().value;
                if (oldestQueryUid !== undefined) {
                    pendingStatements.delete(oldestQueryUid);
                }
            }
            pendingStatements.set(query.__knexQueryUid, {
                caller: getCaller() ?? null,
                operation: getExploreCacheOperation(query.method, query.sql),
                startedAt: now(),
                tableName,
            });
        } catch {
            return;
        }
    });

    const emitMetric = (
        query: KnexQueryEvent,
        outcome: 'success' | 'error',
        response?: unknown,
    ) => {
        if (!query.__knexQueryUid) return;

        const pendingStatement = pendingStatements.get(query.__knexQueryUid);
        if (!pendingStatement) return;
        pendingStatements.delete(query.__knexQueryUid);

        const duration = now() - pendingStatement.startedAt;
        const name = 'Knex.cachedExploreStatement';
        const context = {
            source: 'knex',
            caller: pendingStatement.caller,
            operation: pendingStatement.operation,
            outcome,
            returnedRowCount: getReturnedRowCount(response),
            serverVersion: String(VERSION),
            tableName: pendingStatement.tableName,
        };
        try {
            log(
                `${name} - operation completed in ${duration.toFixed(
                    2,
                )}ms - Context: ${JSON.stringify(context)}`,
                {
                    name,
                    duration,
                    context,
                    serverVersion: String(VERSION),
                },
            );
        } catch {
            return;
        }
    };

    database.on('query-response', (response: unknown, query: KnexQueryEvent) =>
        emitMetric(query, 'success', response),
    );
    database.on('query-error', (_error: unknown, query: KnexQueryEvent) =>
        emitMetric(query, 'error'),
    );
};

const isExploreCacheReadStorageBytesEnabled = () =>
    process.env.LIGHTDASH_EXPLORE_CACHE_READ_STORAGE_BYTES !== 'false';

/**
 * Identifies which PROD-10912 call site produced a cached-explore-read log
 * line, so the same field can be compared across the full-JSON read done
 * today and the table-summary projection PROD-10912 introduces.
 */
export type ExploreCacheReadCodePath =
    | 'catalog'
    | 'catalog-browse'
    | 'catalog-search'
    | 'dbt-exposures'
    | 'split-lookup'
    | 'review-writeback';

export type ExploreCacheReadContext = {
    codePath: ExploreCacheReadCodePath;
    readStrategy:
        | 'full-explore-read'
        | 'table-summary-projection'
        | 'catalog-search-count'
        | 'catalog-search-distinct-explore-hydration';
    exploreCount: number;
    tableFanOut: number;
    /** Length of the explore-name filter passed to the cache read, if any. */
    requestedExploreCount: number | undefined;
    /**
     * Sum of `pg_column_size(explore)` for the matched rows, in bytes.
     * Explore-summary reads populate this from their required strategy
     * probe. Other reads leave it undefined when optional measurement is
     * disabled or fails.
     */
    storedExploreBytes: number | undefined;
    storedBytesPerExplore: number | undefined;
    projectionThresholdBytesPerExplore: number | undefined;
    /**
     * Driver-read time for the cache read, in ms. This includes query
     * execution, transfer, protocol decoding, driver JSON parsing, scheduling
     * and GC. It is populated for catalog-browse page reads and catalog-search
     * count/page reads. Best-effort: measured with performance.now() around
     * the existing read, with no extra queries.
     */
    dbReadMs: number | undefined;
    /**
     * Node-side user-attribute filtering time, in ms
     * (`doesExploreMatchRequiredAttributes` + `getFilteredExplore` over every
     * explore). Only populated on codePath 'catalog-browse' (trigger 'page').
     */
    attributeFilterMs: number | undefined;
};

export type CatalogSearchExploreCacheReadContext = ExploreCacheReadContext & {
    page: number | undefined;
    pageSize: number | undefined;
    totalResultCount: number | undefined;
    returnedSqlRowCount: number | undefined;
    returnedCatalogRowCount: number | undefined;
    distinctExploreCount: number | undefined;
    selectedExploreJsonBytes: number | undefined;
};

export const newExploreCacheReadContext = (
    codePath: ExploreCacheReadCodePath,
    requestedExploreCount: number | undefined,
): ExploreCacheReadContext => ({
    codePath,
    readStrategy: 'full-explore-read',
    exploreCount: 0,
    tableFanOut: 0,
    requestedExploreCount,
    storedExploreBytes: undefined,
    storedBytesPerExplore: undefined,
    projectionThresholdBytesPerExplore: undefined,
    dbReadMs: undefined,
    attributeFilterMs: undefined,
});

export const newCatalogSearchExploreCacheReadContext = (
    page: number | undefined,
    pageSize: number | undefined,
): CatalogSearchExploreCacheReadContext => ({
    ...newExploreCacheReadContext('catalog-search', undefined),
    page,
    pageSize,
    totalResultCount: undefined,
    returnedSqlRowCount: undefined,
    returnedCatalogRowCount: undefined,
    distinctExploreCount: undefined,
    selectedExploreJsonBytes: undefined,
});

/**
 * Runs the storage-size lookup best-effort: a failure here (including the
 * method being unavailable) must never break or slow the underlying
 * cached-explore read, so it is swallowed and reported as `undefined`.
 */
export const safeGetCachedExploreStorageBytes = async (
    getStorageBytes: () => Promise<number>,
): Promise<number | undefined> => {
    if (!isExploreCacheReadStorageBytesEnabled()) {
        return undefined;
    }

    try {
        return await getStorageBytes();
    } catch {
        return undefined;
    }
};

/**
 * Counts explores and their combined table fan-out from an already-fetched
 * cached-explore map. Only iterates keys already resident in memory - does
 * not re-serialize or otherwise re-read the underlying JSONB payload.
 */
export const summarizeExploreCacheRead = (
    explores: Record<
        string,
        {
            errors?: unknown;
            isExploreError?: boolean;
            tables?: Record<string, unknown>;
        }
    >,
): Pick<ExploreCacheReadContext, 'exploreCount' | 'tableFanOut'> => {
    const values = Object.values(explores);
    const tableFanOut = values.reduce(
        (sum, explore) =>
            sum +
            (explore.isExploreError || 'errors' in explore
                ? 0
                : Object.keys(explore.tables ?? {}).length),
        0,
    );
    return { exploreCount: values.length, tableFanOut };
};

export const summarizeCatalogSearchExploreRead = (
    returnedSqlRowCount: number,
    explores: Record<string, Explore>,
): Pick<
    CatalogSearchExploreCacheReadContext,
    | 'exploreCount'
    | 'tableFanOut'
    | 'returnedSqlRowCount'
    | 'distinctExploreCount'
    | 'selectedExploreJsonBytes'
> => ({
    ...summarizeExploreCacheRead(explores),
    returnedSqlRowCount,
    distinctExploreCount: Object.keys(explores).length,
    selectedExploreJsonBytes: Object.values(explores).reduce(
        (totalBytes, explore) =>
            totalBytes + Buffer.byteLength(JSON.stringify(explore), 'utf8'),
        0,
    ),
});
