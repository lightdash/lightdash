import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    classification,
    config,
    down,
    up,
} from '../20260903120000_add_oauth2_refresh_token_revoked_at';

describe('OAuth refresh token revoked_at migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('is safe for a rolling deployment and runs outside a transaction', () => {
        expect(classification).toEqual({
            kind: 'safe',
            reason: 'Adds a nullable revoked_at column and a concurrent lookup index to oauth2_refresh_tokens',
        });
        expect(config).toEqual({ transaction: false });
    });

    it('adds the column and builds the index concurrently', async () => {
        tracker.on.any(() => true).response({ rows: [] });

        await up(database);

        const migrationSql = tracker.history.all.map(({ sql }) => sql);
        expect(migrationSql).toContain('SET statement_timeout = 0');
        expect(migrationSql).toContain(`SET lock_timeout = '5s'`);
        expect(migrationSql).toContain(
            'ALTER TABLE oauth2_refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP NULL',
        );
        expect(migrationSql).toContain(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_refresh_tokens_user_id_client_id_idx ON oauth2_refresh_tokens (user_id, client_id)',
        );
        expect(migrationSql).toContain('RESET statement_timeout');
        expect(migrationSql).not.toContain(
            'DROP INDEX CONCURRENTLY IF EXISTS oauth2_refresh_tokens_user_id_client_id_idx',
        );
    });

    it('replaces an index a previous run left invalid', async () => {
        tracker.on
            .any((query) => query.sql.includes('indisvalid'))
            .response({ rows: [{ '?column?': 1 }] });
        tracker.on.any(() => true).response({ rows: [] });

        await up(database);

        const migrationSql = tracker.history.all.map(({ sql }) => sql);
        expect(migrationSql).toContain(
            'DROP INDEX CONCURRENTLY IF EXISTS oauth2_refresh_tokens_user_id_client_id_idx',
        );
        expect(migrationSql).toContain(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_refresh_tokens_user_id_client_id_idx ON oauth2_refresh_tokens (user_id, client_id)',
        );
    });

    it('reverses the index and the column', async () => {
        tracker.on.any(() => true).response({ rows: [] });

        await down(database);

        const migrationSql = tracker.history.all.map(({ sql }) => sql);
        expect(migrationSql).toContain(
            'DROP INDEX CONCURRENTLY IF EXISTS oauth2_refresh_tokens_user_id_client_id_idx',
        );
        expect(migrationSql).toContain(
            'ALTER TABLE oauth2_refresh_tokens DROP COLUMN IF EXISTS revoked_at',
        );
    });
});
