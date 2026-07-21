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

    it('uses the saved chart project UUID directly', async () => {
        tracker.on.select(SavedChartsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            'Orders',
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain(`"${SavedChartsTableName}"."project_uuid"`);
        expect(query.sql).not.toContain(`join "${ProjectTableName}"`);
        expect(slug).toBe('orders');
    });

    it('preserves a unique long chart slug', async () => {
        const longName = 'a'.repeat(300);
        tracker.on.select(SavedChartsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            longName,
        );

        expect(slug).toBe(longName);
    });

    it('finds a free bounded chart slug using exact candidate probes', async () => {
        const longName = 'a'.repeat(255);
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_id: 1 }]);
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_id: 2 }]);
        tracker.on.select(SavedChartsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            longName,
        );

        expect(slug).toHaveLength(255);
        expect(slug.endsWith('-2')).toBe(true);
        expect(tracker.history.select).toHaveLength(3);
        expect(tracker.history.select[1].sql).toContain('"slug" = $2');
        expect(tracker.history.select[1].bindings).toContain(
            `${'a'.repeat(253)}-1`,
        );
    });

    it('detects collisions for long names with the same bounded prefix', async () => {
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_id: 1 }]);
        tracker.on.select(SavedChartsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            `${'a'.repeat(255)}-different-tail`,
        );

        expect(slug).toBe(`${'a'.repeat(253)}-1`);
    });

    it('uses the nested project UUID for dashboards', async () => {
        tracker.on.select(DashboardsTableName).responseOnce([]);

        await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            DashboardsTableName,
            'Orders',
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain(`"${ProjectTableName}"."project_uuid"`);
    });

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
