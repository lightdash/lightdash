import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    classification,
    down,
    up,
} from '../20260902130000_add_provider_metadata_to_ai_agent_tool_call';

describe('AI agent tool-call provider metadata migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('classifies the nullable column addition', () => {
        expect(classification).toEqual({
            kind: 'safe',
            reason: 'Adds a nullable provider_metadata jsonb column to ai_agent_tool_call so provider thought signatures can be replayed; no default, no backfill.',
        });
    });

    it('adds a nullable jsonb column without a default', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        const migrationSql = tracker.history.all
            .map(({ sql }) => sql)
            .join('\n');
        expect(migrationSql).toContain(
            'alter table "ai_agent_tool_call" add column "provider_metadata" jsonb null',
        );
        expect(migrationSql).not.toContain('default');
    });

    it('drops the column with a finite lock timeout', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toEqual([
            "SET LOCAL lock_timeout = '5s'",
            'alter table "ai_agent_tool_call" drop column "provider_metadata"',
        ]);
    });
});
