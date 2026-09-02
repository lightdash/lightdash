import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { down, up } from '../20260826120000_add_ai_prompt_needs_user_input';

describe('AI prompt needs-user-input migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('adds nullable classification and retry freshness columns', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toContain(
            'alter table "ai_prompt" add column "needs_user_input" boolean null, add column "needs_user_input_metadata" jsonb null, add column "retried_at" timestamptz null',
        );
    });

    it('drops the classification and retry freshness columns', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'alter table "ai_prompt" drop column "needs_user_input"',
                ),
                expect.stringContaining(
                    'alter table "ai_prompt" drop column "needs_user_input_metadata"',
                ),
                expect.stringContaining(
                    'alter table "ai_prompt" drop column "retried_at"',
                ),
            ]),
        );
    });
});
