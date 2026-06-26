import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { AnalyticsModel } from './AnalyticsModel';

describe('AnalyticsModel.getViewsRawData', () => {
    const model = new AnalyticsModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    test('selects the space identifier columns and builds the space_paths recursive CTE', async () => {
        tracker.on
            .select(() => true)
            .response([
                {
                    type: 'chart',
                    timestamp: '2026-06-15T00:00:00Z',
                    uuid: 'chart-uuid',
                    name: 'My Chart',
                    user_uuid: 'user-uuid',
                    user_first_name: 'Ada',
                    user_last_name: 'Lovelace',
                    space_name: 'Commercial',
                    space_uuid: 'space-uuid',
                    space_path: 'LCT / Commercial',
                    project_uuid: 'project-uuid',
                },
            ]);

        const results = await model.getViewsRawData('project-uuid');

        // Row shape includes the three new columns (pass-through).
        expect(results[0]).toEqual(
            expect.objectContaining({
                space_uuid: 'space-uuid',
                space_path: 'LCT / Commercial',
                project_uuid: 'project-uuid',
            }),
        );

        // Generated SQL selects the new columns and builds the recursive CTE.
        const sql = tracker.history.select[0].sql.toLowerCase();
        expect(sql).toContain('with recursive');
        expect(sql).toContain('space_paths');
        expect(sql).toContain('space_uuid');
        expect(sql).toContain('space_path');
        expect(sql).toContain('project_uuid');
    });
});
