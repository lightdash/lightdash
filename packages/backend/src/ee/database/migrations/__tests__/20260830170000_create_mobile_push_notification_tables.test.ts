import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    down,
    up,
} from '../20260830170000_create_mobile_push_notification_tables';

describe('mobile push notification tables migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('creates encrypted installation and Live Activity token tables', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        const statements = tracker.history.all.map(({ sql }) => sql);
        const installationSql = statements.find((sql) =>
            sql.includes('create table "mobile_push_installations"'),
        );
        const liveActivitySql = statements.find((sql) =>
            sql.includes('create table "ai_agent_live_activities"'),
        );
        const migrationSql = statements.join('\n');

        expect(installationSql).toContain(
            '"encrypted_device_token" bytea not null',
        );
        expect(migrationSql).toContain(
            'unique ("environment", "device_token_fingerprint")',
        );
        expect(liveActivitySql).toContain(
            '"encrypted_push_token" bytea not null',
        );
        expect(liveActivitySql).toContain(
            '"push_token_fingerprint" varchar(64) not null',
        );
        expect(liveActivitySql).toContain(
            '"completion_alert_completed_at" timestamp null',
        );
        expect(migrationSql).toContain('on delete CASCADE');
    });

    it('drops Live Activities before installations', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toEqual([
            "SET LOCAL lock_timeout = '5s'",
            'drop table if exists "ai_agent_live_activities"',
            'drop table if exists "mobile_push_installations"',
        ]);
    });
});
