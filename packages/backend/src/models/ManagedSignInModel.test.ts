import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { ManagedSignInModel } from './ManagedSignInModel';

describe('ManagedSignInModel.claimTokenUse', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ManagedSignInModel({
        database: database as unknown as Knex,
    });
    const tokenHash = 'a'.repeat(64);
    const expiresAt = new Date('2026-12-01T00:00:00.000Z');
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('claims a token hash that has not been seen', async () => {
        tracker.on.delete('managed_sign_in_token_uses').responseOnce(0);
        tracker.on
            .insert('managed_sign_in_token_uses')
            .responseOnce([{ token_hash: tokenHash }]);

        await expect(model.claimTokenUse(tokenHash, expiresAt)).resolves.toBe(
            true,
        );
    });

    it('refuses a token hash that is already recorded', async () => {
        tracker.on.delete('managed_sign_in_token_uses').responseOnce(0);
        tracker.on.insert('managed_sign_in_token_uses').responseOnce([]);

        await expect(model.claimTokenUse(tokenHash, expiresAt)).resolves.toBe(
            false,
        );
    });

    it('leaves an unexpired row alone and bounds the prune', async () => {
        tracker.on.delete('managed_sign_in_token_uses').responseOnce(0);
        tracker.on
            .insert('managed_sign_in_token_uses')
            .responseOnce([{ token_hash: tokenHash }]);

        await model.claimTokenUse(tokenHash, expiresAt);

        expect(tracker.history.delete).toHaveLength(1);
        const [prune] = tracker.history.delete;
        expect(prune.sql).toContain('expires_at');
        expect(prune.sql).toContain('limit');
        expect(prune.bindings).toContain(1000);
    });

    it('still claims when the prune fails', async () => {
        tracker.on
            .delete('managed_sign_in_token_uses')
            .simulateErrorOnce('lock timeout');
        tracker.on
            .insert('managed_sign_in_token_uses')
            .responseOnce([{ token_hash: tokenHash }]);

        await expect(model.claimTokenUse(tokenHash, expiresAt)).resolves.toBe(
            true,
        );
    });
});
