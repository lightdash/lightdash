import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    classification,
    down,
    up,
} from '../20260831120000_add_live_activity_push_to_start';

describe('Live Activity push-to-start migration', () => {
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
            reason: 'Adds nullable push-to-start fields and an empty attempt table',
        });
    });

    it('adds encrypted token fields and a durable installation-prompt key', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        const migrationSql = tracker.history.all
            .map(({ sql }) => sql)
            .join('\n');
        expect(migrationSql).toContain(
            'add column "encrypted_push_to_start_token" bytea null',
        );
        expect(migrationSql).toContain(
            'add column "push_to_start_token_fingerprint" varchar(64) null',
        );
        expect(migrationSql).toContain(
            'create table "ai_agent_live_activity_start_attempts"',
        );
        expect(migrationSql).toContain(
            'constraint "live_activity_start_attempts_installation_prompt_uq" unique ("mobile_push_installation_uuid", "prompt_uuid")',
        );
        expect(migrationSql).toContain(
            'constraint "mobile_push_installations_push_start_token_uq" unique ("environment", "push_to_start_token_fingerprint")',
        );
        expect(migrationSql).toContain(
            'constraint "live_activity_start_attempts_installation_fk" foreign key ("mobile_push_installation_uuid")',
        );
        expect(migrationSql).toContain(
            'create index "live_activity_start_attempts_installation_idx"',
        );
        expect(migrationSql).toContain(
            'create index "live_activity_start_attempts_status_attempted_idx"',
        );
        expect(migrationSql).toContain(
            '"live_activity_uuid" uuid not null default uuid_generate_v4()',
        );
        expect(migrationSql).toContain(
            "check (\"status\" in ('excluded','pending','processing','retryable','sent','failed'))",
        );
        expect(migrationSql).toContain('on delete CASCADE');
    });

    it('drops the attempt table before token fields', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toEqual([
            "SET LOCAL lock_timeout = '5s'",
            'drop table if exists "ai_agent_live_activity_start_attempts"',
            'alter table "mobile_push_installations" drop column "push_to_start_token_fingerprint"',
            'alter table "mobile_push_installations" drop column "encrypted_push_to_start_token"',
        ]);
    });
});
