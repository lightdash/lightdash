import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { EmailModel } from './EmailModel';

describe('EmailModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new EmailModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('preserves the attempt counter when re-issuing an OTP before the reset cutoff', async () => {
        tracker.on
            .any(({ method }) => method === 'select')
            .response([
                {
                    email: 'email',
                    is_verified: true,
                    created_at: new Date(),
                    number_of_attempts: 0,
                },
            ]);
        tracker.on.any(() => true).response({ rows: [] });

        const resetAttemptsIfOtpCreatedBefore = new Date(
            Date.now() - 15 * 60 * 1000,
        );
        await model.createPrimaryEmailOtp({
            passcode: '123456',
            userUuid: 'user-uuid',
            resetAttemptsIfOtpCreatedBefore,
        });

        const [upsert] = tracker.history.all;
        expect(upsert.sql).toContain('number_of_attempts = CASE');
        expect(upsert.sql).toContain(
            'WHEN email_one_time_passcodes.created_at < $3 THEN 0',
        );
        expect(upsert.sql).toContain(
            'ELSE email_one_time_passcodes.number_of_attempts',
        );
        expect(upsert.bindings).toContain(resetAttemptsIfOtpCreatedBefore);
    });
});
