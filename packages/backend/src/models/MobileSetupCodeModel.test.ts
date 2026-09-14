import { TooManyRequestsError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { MobileSetupCodeModel } from './MobileSetupCodeModel';

describe('MobileSetupCodeModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new MobileSetupCodeModel(database);
    let tracker: Tracker;
    const code = {
        code_hash: 'a'.repeat(64),
        user_uuid: 'user',
        organization_uuid: 'org',
        project_uuid: 'project',
        expires_at: new Date(Date.now() + 300_000),
    };

    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('allows the tenth code and revokes earlier pending codes under the user lock', async () => {
        tracker.on.select('users').response({ user_uuid: 'user' });
        tracker.on.select('mobile_setup_codes').response({ count: '9' });
        tracker.on.update('mobile_setup_codes').response(1);
        tracker.on
            .insert('mobile_setup_codes')
            .response([{ ...code, mobile_setup_code_uuid: 'code-id' }]);
        await expect(model.create(code)).resolves.toMatchObject({
            mobile_setup_code_uuid: 'code-id',
        });
        const queries = tracker.history.all;
        expect(queries[0].sql).toContain('for update');
        expect(queries[1].sql).toContain("now() - interval '1 minute'");
        expect(queries[2].sql).toContain('"redeemed_at" is null');
        expect(queries[2].sql).toContain('"revoked_at" is null');
        expect(queries[2].bindings).toContain('user');
    });

    it('rejects the eleventh code before changing existing codes', async () => {
        tracker.on.select('users').response({ user_uuid: 'user' });
        tracker.on.select('mobile_setup_codes').response({ count: '10' });
        await expect(model.create(code)).rejects.toBeInstanceOf(
            TooManyRequestsError,
        );
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('claims only an unexpired pending code in one update', async () => {
        tracker.on
            .update('mobile_setup_codes')
            .response([{ ...code, redeemed_platform: 'android' }]);
        await expect(
            model.redeem(code.code_hash, 'client', 'android'),
        ).resolves.toMatchObject({ redeemed_platform: 'android' });
        expect(tracker.history.all).toHaveLength(1);
        const [query] = tracker.history.update;
        expect(query.sql).toContain('"redeemed_at" is null');
        expect(query.sql).toContain('"revoked_at" is null');
        expect(query.sql).toContain('"expires_at" > CURRENT_TIMESTAMP');
        expect(query.bindings).toEqual(
            expect.arrayContaining([code.code_hash, 'client', 'android']),
        );
    });

    it('returns no claim when another redemption wins', async () => {
        tracker.on.update('mobile_setup_codes').response([]);
        await expect(
            model.redeem(code.code_hash, 'client', 'ios'),
        ).resolves.toBeUndefined();
    });
});
