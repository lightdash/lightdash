import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { HomepageRecommendedActionSkipsTableName } from '../database/entities/homepageRecommendedActionSkips';
import { HomepageRecommendedActionSkipsModel } from './HomepageRecommendedActionSkipsModel';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';

describe('HomepageRecommendedActionSkipsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new HomepageRecommendedActionSkipsModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('merges organization and project action scopes for a project context', async () => {
        tracker.on
            .select(HomepageRecommendedActionSkipsTableName)
            .responseOnce([
                { action_key: 'connect-slack' },
                { action_key: 'add-semantic-layer' },
            ]);

        await expect(
            model.list({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
            }),
        ).resolves.toEqual(['connect-slack', 'add-semantic-layer']);

        const query = tracker.history.select[0];
        expect(query.sql).toContain('"project_uuid" is null');
        expect(query.sql).toContain('or');
        expect(query.bindings).toEqual(
            expect.arrayContaining([
                ORGANIZATION_UUID,
                'connect-source-control',
                'connect-slack',
                PROJECT_UUID,
                'add-semantic-layer',
            ]),
        );
    });

    it('selects only organization action scopes without a project context', async () => {
        tracker.on
            .select(HomepageRecommendedActionSkipsTableName)
            .responseOnce([{ action_key: 'connect-source-control' }]);

        await expect(
            model.list({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: null,
            }),
        ).resolves.toEqual(['connect-source-control']);

        const query = tracker.history.select[0];
        expect(query.sql).toContain('"project_uuid" is null');
        expect(query.bindings).not.toContain(PROJECT_UUID);
        expect(query.bindings).not.toContain('add-semantic-layer');
    });
});
