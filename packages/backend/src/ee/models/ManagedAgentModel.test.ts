import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { ManagedAgentModel } from './ManagedAgentModel';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';

describe('ManagedAgentModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ManagedAgentModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('skips the inactivity query when the project population is empty', async () => {
        tracker.on
            .any(/DISTINCT ON \(users\.user_uuid\)/i)
            .response({ rows: [] });
        tracker.on.any(() => true).response({ rows: [] });

        await expect(
            model.getInactiveUsers(projectUuid, organizationUuid, 30),
        ).resolves.toEqual([]);

        const executedSql = tracker.history.all.map((query) => query.sql);
        expect(executedSql).toHaveLength(1);
        expect(executedSql[0]).not.toContain("user_uuid in ('')");
    });
});
