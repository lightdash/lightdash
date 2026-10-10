import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { up } from '../20261010065649_add_agent_capability_policies';

const database = knex({ client: MockClient, dialect: 'pg' });
afterAll(async () => database.destroy());
afterEach(() => {
    getTracker().reset();
    vi.restoreAllMocks();
});

test('propagates a failed scope backfill to the migration runner without an inner transaction', async () => {
    const tracker = getTracker();
    tracker.on
        .any(/INSERT INTO scoped_roles/)
        .simulateError('scope backfill failed');
    tracker.on.any(() => true).response([]);
    const transaction = vi.spyOn(database, 'transaction');
    await expect(up(database)).rejects.toThrow('scope backfill failed');
    expect(transaction).not.toHaveBeenCalled();
});
