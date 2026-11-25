import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    classification,
    down,
    up,
} from '../20261124095226_untag_repointed_playground_projects';

describe('Untag repointed sample data projects migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('is safe for a rolling deployment', () => {
        expect(classification.kind).toBe('safe');
    });

    it('clears the tag and bundle version only where the warehouse is no longer DuckDB', async () => {
        tracker.on.any(() => true).response({ rows: [] });

        await up(database);

        const statements = tracker.history.all.map(({ sql }) =>
            sql.replace(/\s+/g, ' ').trim(),
        );
        expect(statements).toHaveLength(1);
        expect(statements[0]).toContain(
            'SET provisioning_source = NULL, playground_bundle_version = NULL',
        );
        expect(statements[0]).toContain(
            "WHERE provisioning_source = 'playground'",
        );
        expect(statements[0]).toContain(
            "warehouse_credentials.warehouse_type <> 'duckdb'",
        );
    });

    it('cannot be reversed', async () => {
        await expect(down()).rejects.toThrow(/^irreversible:/);
    });
});
