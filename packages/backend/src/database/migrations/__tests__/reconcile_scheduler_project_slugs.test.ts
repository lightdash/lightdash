import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    classification,
    config,
    down,
    up,
} from '../20260813120000_reconcile_scheduler_project_slugs';

const isReconciliation = ({ sql }: { sql: string }) =>
    sql.includes('WITH resource_projects AS');

describe('scheduler project slug reconciliation migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('is resumable and classified as a safe data repair', () => {
        expect(config).toEqual({ transaction: false });
        expect(classification).toEqual({
            kind: 'safe',
            reason: 'Fills missing scheduler ownership and slugs without changing complete rows',
        });
    });

    it('reconciles every scheduler ownership type in bounded batches', async () => {
        tracker.on.any(isReconciliation).responseOnce({ rowCount: 2 });
        tracker.on.any(isReconciliation).response({ rowCount: 0 });
        tracker.on.any(() => true).response({});

        await up(database);

        const reconciliations = tracker.history.all.filter(isReconciliation);
        expect(reconciliations).toHaveLength(2);

        const { sql } = reconciliations[0];
        expect(sql).toContain(
            'saved_queries.saved_query_uuid = scheduler.saved_chart_uuid',
        );
        expect(sql).toContain(
            'dashboards.dashboard_uuid = scheduler.dashboard_uuid',
        );
        expect(sql).toContain(
            'saved_sql.saved_sql_uuid = scheduler.saved_sql_uuid',
        );
        expect(sql).toContain('apps.app_id = scheduler.app_uuid');
        expect(sql).toContain(
            'WHERE resource_projects.project_uuid IS NOT NULL',
        );
        expect(sql).toContain('LIMIT 1000');
        expect(sql).toContain('REGEXP_REPLACE(');
        expect(sql).toContain("LEFT(ranked.base_slug, 218) || '-' ||");
        expect(sql).toContain('scheduler.project_uuid IS NULL');
        expect(sql).toContain('scheduler.slug IS NULL');
    });

    it('terminates after one attempt when no row is resolvable', async () => {
        tracker.on.any(isReconciliation).response({ rowCount: 0 });
        tracker.on.any(() => true).response({});

        await up(database);

        expect(tracker.history.all.filter(isReconciliation)).toHaveLength(1);
        expect(tracker.history.all.at(-1)?.sql).toBe('RESET statement_timeout');
    });

    it('resets the statement timeout when reconciliation fails', async () => {
        tracker.on
            .any(isReconciliation)
            .simulateErrorOnce('reconciliation failed');
        tracker.on.any(() => true).response({});

        await expect(up(database)).rejects.toThrow('reconciliation failed');

        expect(tracker.history.all.at(-1)?.sql).toBe('RESET statement_timeout');
    });

    it('refuses a destructive rollback', async () => {
        await expect(down()).rejects.toThrow(
            'irreversible: scheduler repair has no safe rollback',
        );
    });
});
