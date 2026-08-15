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

    it('repeats reconciliation batches until a pass updates zero rows', async () => {
        tracker.on.any(isReconciliation).responseOnce({ rowCount: 2 });
        tracker.on.any(isReconciliation).responseOnce({ rowCount: 1 });
        tracker.on.any(isReconciliation).response({ rowCount: 0 });
        tracker.on.any(() => true).response({});

        await up(database);

        expect(tracker.history.all.filter(isReconciliation)).toHaveLength(3);
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
