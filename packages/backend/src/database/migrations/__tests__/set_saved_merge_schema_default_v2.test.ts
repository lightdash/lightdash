import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    classification,
    down,
    up,
} from '../20260814120000_set_saved_merge_schema_default_v2';

describe('saved merge schema default migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('sets a finite lock timeout and changes the default to version 2', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toEqual([
            "SET LOCAL lock_timeout = '5s'",
            'ALTER TABLE saved_queries_version_merges ALTER COLUMN schema_version SET DEFAULT 2',
        ]);
        expect(classification.kind).toBe('safe');
    });

    it('restores the version 1 default on rollback', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all[1].sql).toBe(
            'ALTER TABLE saved_queries_version_merges ALTER COLUMN schema_version SET DEFAULT 1',
        );
    });
});
