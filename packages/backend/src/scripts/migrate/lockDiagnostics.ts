import { type Knex } from 'knex';

const LOCK_DIAGNOSTICS_TIMEOUT_MS = 5_000;
const LOCK_DIAGNOSTICS_STATEMENT_TIMEOUT = '2s';
const LOCK_DIAGNOSTICS_LIMIT = 5;
const QUERY_PREVIEW_LENGTH = 200;

export type MigrationLockHolder = {
    pid: number;
    backendType: string | null;
    state: string | null;
    transactionAgeSeconds: number | null;
    relations: string;
    query: string | null;
};

type MigrationLockHolderRow = {
    pid: number;
    backend_type: string | null;
    state: string | null;
    xact_age_seconds: number | null;
    relations: string;
    query: string | null;
};

const LOCK_HOLDERS_SQL = `
SELECT
    activity.pid,
    activity.backend_type,
    activity.state,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - activity.xact_start))::integer AS xact_age_seconds,
    string_agg(DISTINCT format('%I.%I', namespace.nspname, relation_class.relname), ',') AS relations,
    LEFT(activity.query, ${QUERY_PREVIEW_LENGTH}) AS query
FROM pg_locks AS held_lock
JOIN pg_stat_activity AS activity ON activity.pid = held_lock.pid
JOIN pg_class AS relation_class ON relation_class.oid = held_lock.relation
JOIN pg_namespace AS namespace ON namespace.oid = relation_class.relnamespace
WHERE held_lock.locktype = 'relation'
    AND held_lock.granted
    AND held_lock.database = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND held_lock.pid <> pg_backend_pid()
    AND activity.xact_start IS NOT NULL
    AND relation_class.relkind IN ('r', 'p', 'm')
    AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY activity.pid, activity.backend_type, activity.state, activity.xact_start, activity.query
ORDER BY activity.xact_start ASC
LIMIT ${LOCK_DIAGNOSTICS_LIMIT}
`;

const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> => {
    let timeout: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            reject(
                new Error(`Lock diagnostics timed out after ${timeoutMs}ms`),
            );
        }, timeoutMs);
        timeout.unref();
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
    }
};

export const findMigrationLockHolders = async (
    database: Knex,
    timeoutMs = LOCK_DIAGNOSTICS_TIMEOUT_MS,
): Promise<MigrationLockHolder[]> => {
    const rows = await withTimeout(
        database.transaction(async (transaction) => {
            await transaction.raw(
                `SET LOCAL statement_timeout = '${LOCK_DIAGNOSTICS_STATEMENT_TIMEOUT}'`,
            );
            const result = (await transaction.raw(LOCK_HOLDERS_SQL)) as {
                rows: MigrationLockHolderRow[];
            };
            return result.rows;
        }),
        timeoutMs,
    );
    return rows.map((row) => ({
        pid: row.pid,
        backendType: row.backend_type,
        state: row.state,
        transactionAgeSeconds: row.xact_age_seconds,
        relations: row.relations,
        query: row.query,
    }));
};

const singleLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const formatMigrationLockHolder = (
    migration: string,
    holder: MigrationLockHolder,
): string =>
    [
        'MIGRATION_LOCK_HOLDER',
        `migration=${migration}`,
        `pid=${holder.pid}`,
        `backend_type=${JSON.stringify(holder.backendType ?? 'unknown')}`,
        `state=${JSON.stringify(holder.state ?? 'unknown')}`,
        `xact_age_seconds=${holder.transactionAgeSeconds ?? 'unknown'}`,
        `relations=${holder.relations}`,
        `query=${JSON.stringify(singleLine(holder.query ?? '').slice(0, QUERY_PREVIEW_LENGTH))}`,
    ].join(' ');
