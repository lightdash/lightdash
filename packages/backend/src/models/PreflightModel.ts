import {
    PreflightActivityRow,
    PreflightLockState,
    PreflightTableStats,
} from '@lightdash/common';
import { Knex } from 'knex';

const POSTGRES_UNDEFINED_TABLE = '42P01';

export class PreflightModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async getLockState(): Promise<PreflightLockState | null> {
        let isLocked: boolean;
        try {
            const result = await this.database.raw<{
                rows: Array<{ is_locked: number }>;
            }>('SELECT is_locked FROM knex_migrations_lock');
            isLocked = result.rows.some((row) => Number(row.is_locked) === 1);
        } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === POSTGRES_UNDEFINED_TABLE
            ) {
                return null;
            }
            throw error;
        }
        const lastMigration = await this.database.raw<{
            rows: Array<{ age_seconds: number | null }>;
        }>(
            `SELECT EXTRACT(EPOCH FROM now() - max(migration_time))::integer AS age_seconds
             FROM knex_migrations`,
        );
        return {
            isLocked,
            lastMigrationAgeSeconds:
                lastMigration.rows[0]?.age_seconds === null ||
                lastMigration.rows[0]?.age_seconds === undefined
                    ? null
                    : Number(lastMigration.rows[0].age_seconds),
        };
    }

    async getTableStats(tables: string[]): Promise<PreflightTableStats[]> {
        if (tables.length === 0) return [];
        const result = await this.database.raw<{
            rows: Array<{
                relname: string;
                n_tup_ins: string;
                n_tup_upd: string;
                n_tup_del: string;
                n_live_tup: string;
            }>;
        }>(
            `SELECT relname, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup
             FROM pg_stat_user_tables
             WHERE schemaname = current_schema() AND relname = ANY(?)`,
            [tables],
        );
        return result.rows.map((row) => ({
            table: row.relname,
            inserts: Number(row.n_tup_ins),
            updates: Number(row.n_tup_upd),
            deletes: Number(row.n_tup_del),
            liveTuples: Number(row.n_live_tup),
        }));
    }

    async getActivity(options: {
        includeQueryText: boolean;
    }): Promise<PreflightActivityRow[]> {
        const result = await this.database.raw<{
            rows: Array<{
                pid: number;
                usename: string | null;
                application_name: string | null;
                state: string | null;
                xact_age_s: number | null;
                query: string | null;
                blocked_by: number[] | null;
            }>;
        }>(
            `SELECT pid, usename, application_name, state,
                    EXTRACT(EPOCH FROM now() - xact_start)::integer AS xact_age_s,
                    left(query, 160) AS query,
                    CASE WHEN cardinality(pg_blocking_pids(pid)) > 0 THEN pg_blocking_pids(pid) END AS blocked_by
             FROM pg_stat_activity
             WHERE pid <> pg_backend_pid()
               AND datname = current_database()
               AND xact_start IS NOT NULL
               AND state <> 'idle'`,
        );
        return result.rows.map((row) => ({
            pid: row.pid,
            userName: row.usename,
            applicationName: row.application_name,
            state: row.state,
            xactAgeSeconds:
                row.xact_age_s === null ? null : Number(row.xact_age_s),
            query: options.includeQueryText ? row.query : null,
            blockedBy: row.blocked_by ?? [],
        }));
    }

    /**
     * Plans the statement without running it — plain EXPLAIN never executes, so
     * volatile functions in the statement do not fire, and a read-only
     * transaction plus a statement timeout bound it further.
     *
     * The shape check is repeated here rather than left to the caller: a READ
     * ONLY transaction does NOT refuse to PLAN a write, so it is not the thing
     * keeping writes out.
     */
    async explain(
        sql: string,
        statementTimeoutSeconds: number,
    ): Promise<unknown> {
        if (sql.includes(';') || !/^\s*(SELECT|WITH)\s/i.test(sql)) {
            throw new Error(
                'preflight EXPLAIN accepts a single read-only SELECT statement',
            );
        }
        return this.database.transaction(async (trx) => {
            await trx.raw('SET TRANSACTION READ ONLY');
            await trx.raw("SELECT set_config('statement_timeout', ?, true)", [
                `${statementTimeoutSeconds}s`,
            ]);
            const result = await trx.raw<{
                rows: Array<{ 'QUERY PLAN': unknown }>;
            }>(`EXPLAIN (FORMAT JSON) ${sql}`);
            // No explicit rollback: the transaction is READ ONLY, so committing
            // it writes nothing, and knex rejects a callback transaction that
            // rolls itself back.
            return result.rows[0]?.['QUERY PLAN'];
        });
    }
}
