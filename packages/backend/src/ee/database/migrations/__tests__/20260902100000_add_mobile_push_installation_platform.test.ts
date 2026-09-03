import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    classification,
    down,
    up,
} from '../20260902100000_add_mobile_push_installation_platform';

describe('Mobile push installation platform migration', () => {
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
            reason: 'Adds a platform column with a default that matches every existing row',
        });
    });

    it('defaults every existing installation to ios', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        const migrationSql = tracker.history.all
            .map(({ sql }) => sql)
            .join('\n');
        expect(migrationSql).toContain(`SET LOCAL lock_timeout = '5s'`);
        expect(migrationSql).toContain(
            `add column "platform" text not null default 'ios'`,
        );
        expect(migrationSql).toContain(
            `constraint mobile_push_installations_platform_check check ("platform" in ('ios','android'))`,
        );
    });

    it('reverses the column', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        const migrationSql = tracker.history.all
            .map(({ sql }) => sql)
            .join('\n');
        expect(migrationSql).toContain('drop column "platform"');
    });
});
