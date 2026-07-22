import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import { generateUniqueSlugScopedToProject } from './SlugUtils';

describe('generateUniqueSlugScopedToProject', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it.each([SavedChartsTableName, DashboardsTableName] as const)(
        'qualifies project_uuid when querying %s',
        async (tableName) => {
            tracker.on.select(tableName).responseOnce([]);

            await generateUniqueSlugScopedToProject(
                database,
                '22222222-2222-4222-8222-222222222222',
                tableName,
                'Orders',
            );

            const [query] = tracker.history.select;
            expect(query.sql).toContain(`"${ProjectTableName}"."project_uuid"`);
        },
    );

    it('uses native project ownership for saved SQL charts', async () => {
        tracker.on.select(SavedSqlTableName).responseOnce([]);

        await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedSqlTableName,
            'Orders',
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain(`"${SavedSqlTableName}"."project_uuid"`);
        expect(query.sql).not.toContain(`join "${ProjectTableName}"`);
    });
});
