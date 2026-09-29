import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { down, up } from '../20260914180000_create_mobile_setup_codes';

describe('mobile setup codes migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('creates a hashed single-use credential with indexed ownership', async () => {
        tracker.on.any(() => true).response({});
        await up(database);
        const statements = tracker.history.all.map(({ sql }) => sql).join('\n');
        expect(statements).toContain('"mobile_setup_code_uuid" uuid');
        expect(statements).toContain('primary key ("mobile_setup_code_uuid")');
        expect(statements).toContain('unique ("code_hash")');
        expect(statements).toContain('"code_hash" varchar(64) not null');
        for (const column of [
            'user_uuid',
            'organization_uuid',
            'project_uuid',
        ]) {
            expect(statements).toContain(`foreign key ("${column}")`);
            expect(statements).toContain(`("${column}")`);
            expect(statements).toContain(
                `"mobile_setup_codes_${column}_index"`,
            );
        }
        expect(statements).toContain('"redeemed_at" timestamptz null');
        expect(statements).toContain('"revoked_at" timestamptz null');
        expect(statements).not.toContain('"code"');
    });

    it('drops the table on rollback', async () => {
        tracker.on.any(() => true).response({});
        await down(database);
        expect(tracker.history.all.map(({ sql }) => sql)).toContain(
            'drop table if exists "mobile_setup_codes"',
        );
    });
});
