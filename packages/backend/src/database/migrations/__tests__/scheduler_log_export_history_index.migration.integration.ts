import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import * as migration from '../20261109100000_index_scheduler_log_export_history';

const IndexName = 'scheduler_log_export_history_org_uuid_idx';
const organizationUuid = '00000000-0000-4000-8000-000000000001';
const otherOrganizationUuid = '00000000-0000-4000-8000-000000000002';
const exportTasks = ['downloadAsyncQueryResults', 'uploadGsheetFromQuery'];
const cutoff = '2026-11-09T00:00:00Z';

describe('scheduler export history index (real schema)', () => {
    let migrated: MigratedDatabase;

    const indexState = async () => {
        const { rows } = await migrated.database.raw<{
            rows: {
                valid: boolean;
                unique: boolean;
                definition: string;
                predicate: string;
            }[];
        }>(
            `SELECT indisvalid AS valid, indisunique AS unique,
                    pg_get_indexdef(indexrelid) AS definition,
                    pg_get_expr(indpred, indrelid) AS predicate
             FROM pg_index WHERE indexrelid = to_regclass(?)`,
            [IndexName],
        );
        return rows[0] ?? null;
    };
    const historyPage = (cursor: string | null) => {
        const query = migrated
            .database('scheduler_log as s')
            .select('s.scheduler_log_uuid')
            .whereRaw("s.details->>'organizationUuid' = ?", [organizationUuid])
            .whereIn('s.task', exportTasks)
            .where('s.created_at', '<', cutoff)
            .orderBy('s.scheduler_log_uuid')
            .limit(1000);
        if (cursor) query.where('s.scheduler_log_uuid', '>', cursor);
        return query;
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 1 });
        await migrated.database.raw(
            `INSERT INTO scheduler_log
                 (job_id, task, status, created_at, details)
             SELECT 'noise-' || n, 'unrelatedTask', 'completed',
                    '2026-11-01'::timestamp,
                    jsonb_build_object('organizationUuid', ?::text)
             FROM generate_series(1, 20000) n`,
            [organizationUuid],
        );
        for (const org of [organizationUuid, otherOrganizationUuid]) {
            // eslint-disable-next-line no-await-in-loop
            await migrated.database.raw(
                `INSERT INTO scheduler_log
                     (scheduler_log_uuid, job_id, task, status, created_at, details)
                 SELECT md5(?::text || n)::uuid, 'export-' || n,
                        CASE WHEN n % 2 = 0 THEN 'downloadAsyncQueryResults'
                             ELSE 'uploadGsheetFromQuery' END,
                        'completed', '2026-11-01'::timestamp,
                        jsonb_build_object('organizationUuid', ?::text)
                 FROM generate_series(1, 1005) n`,
                [org, org],
            );
        }
        await migrated.database('scheduler_log').insert({
            job_id: 'at-cutoff',
            task: exportTasks[0],
            status: 'completed',
            created_at: cutoff,
            details: { organizationUuid },
        });
        await migrated.database.raw('ANALYZE scheduler_log');
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('creates a valid partial index and can roll back and reapply without changing records', async () => {
        const count = () =>
            migrated.database('scheduler_log').count('* as count').first();
        const before = await count();
        await migration.up(migrated.database);
        await migration.up(migrated.database);
        const state = await indexState();
        expect(state).toMatchObject({ valid: true, unique: false });
        expect(state?.definition).toContain(
            "details ->> 'organizationUuid'::text",
        );
        expect(state?.definition).toContain('scheduler_log_uuid');
        for (const task of exportTasks)
            expect(state?.predicate).toContain(task);
        expect(migration.config.transaction).toBe(false);
        await migration.down(migrated.database);
        await migration.down(migrated.database);
        expect(await indexState()).toBeNull();
        await migration.up(migrated.database);
        expect((await indexState())?.valid).toBe(true);
        expect(await count()).toEqual(before);
    });

    it('uses the scoped index for first and continuation pages without losing exports', async () => {
        const first = await historyPage(null);
        const second = await historyPage(
            first[first.length - 1].scheduler_log_uuid,
        );
        expect(first).toHaveLength(1000);
        expect(second).toHaveLength(5);
        const ids = [...first, ...second].map((row) => row.scheduler_log_uuid);
        const expected = await migrated.database.raw<{
            rows: { id: string }[];
        }>(
            'SELECT md5(?::text || n)::uuid::text AS id FROM generate_series(1, 1005) n ORDER BY id',
            [organizationUuid],
        );
        expect(ids).toEqual(expected.rows.map(({ id }) => id));
        expect(
            await historyPage(second[second.length - 1].scheduler_log_uuid),
        ).toEqual([]);
        for (const cursor of [
            null,
            first[first.length - 1].scheduler_log_uuid,
        ]) {
            const query = historyPage(cursor).toSQL();
            // eslint-disable-next-line no-await-in-loop
            const { rows } = await migrated.database.raw(
                `EXPLAIN (FORMAT JSON) ${query.sql}`,
                query.bindings,
            );
            expect(JSON.stringify(rows[0]['QUERY PLAN'])).toContain(IndexName);
        }
    });

    it('replaces an invalid concurrent index left by an interrupted build', async () => {
        await migration.down(migrated.database);
        await expect(
            migrated.database.raw(
                `CREATE UNIQUE INDEX CONCURRENTLY ${IndexName} ON scheduler_log (task)`,
            ),
        ).rejects.toMatchObject({ code: '23505' });
        expect((await indexState())?.valid).toBe(false);
        await migration.up(migrated.database);
        expect(await indexState()).toMatchObject({
            valid: true,
            unique: false,
        });
    });

    it('restores inherited session timeouts after both migration directions', async () => {
        const settings = async () => {
            const { rows } = await migrated.database.raw(
                "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout",
            );
            return rows[0];
        };
        const previous = await settings();
        await migrated.database.raw("SET lock_timeout = '7s'");
        await migrated.database.raw("SET statement_timeout = '45s'");
        try {
            const configured = await settings();
            await migration.down(migrated.database);
            expect(await settings()).toEqual(configured);
            await migration.up(migrated.database);
            expect(await settings()).toEqual(configured);
        } finally {
            await migrated.database.raw(
                "SELECT set_config('lock_timeout', ?, false), set_config('statement_timeout', ?, false)",
                [previous.lock_timeout, previous.statement_timeout],
            );
        }
    });
});
