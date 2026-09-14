import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    classification,
    down,
    up,
} from '../20260903121000_add_oauth_client_id_to_mobile_push_installations';

describe('Mobile push installation oauth client migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('is safe for a rolling deployment', () => {
        expect(classification).toEqual({
            kind: 'safe',
            reason: 'Adds a nullable oauth_client_id column that existing installations leave empty',
        });
    });

    it('links an installation to its OAuth client and indexes the column', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        const migrationSql = tracker.history.all
            .map(({ sql }) => sql)
            .join('\n');
        expect(migrationSql).toContain(`SET LOCAL lock_timeout = '5s'`);
        expect(migrationSql).toContain('add column "oauth_client_id" text');
        expect(migrationSql).not.toContain('"oauth_client_id" text not null');
        expect(migrationSql).toContain(
            'foreign key ("oauth_client_id") references "oauth2_clients" ("client_id") on delete CASCADE',
        );
        expect(migrationSql).toContain(
            'create index "mobile_push_installations_oauth_client_id_idx" on "mobile_push_installations" ("oauth_client_id")',
        );
    });

    it('reverses the column', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        const migrationSql = tracker.history.all
            .map(({ sql }) => sql)
            .join('\n');
        expect(migrationSql).toContain('drop column "oauth_client_id"');
    });
});
