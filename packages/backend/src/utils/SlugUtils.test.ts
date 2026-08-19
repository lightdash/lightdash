import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { AppsTableName } from '../database/entities/apps';
import { DashboardsTableName } from '../database/entities/dashboards';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedChartSlugMappingsTableName } from '../database/entities/savedChartSlugMappings';
import { SavedSqlTableName } from '../database/entities/savedSql';
import { SpaceTableName } from '../database/entities/spaces';
import { generateUniqueSlugScopedToProject } from './SlugUtils';

describe('generateUniqueSlugScopedToProject', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        tracker.on.select('pg_advisory_xact_lock').response({});
    });

    afterEach(() => {
        tracker.reset();
    });

    it('uses the saved chart project UUID directly', async () => {
        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on.select(SavedChartSlugMappingsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            'Orders',
        );

        const query = tracker.history.select.find(({ sql }) =>
            sql.includes(SavedChartsTableName),
        );
        expect(query?.sql).toContain(
            `"${SavedChartsTableName}"."project_uuid"`,
        );
        expect(query?.sql).not.toContain('join');
        expect(slug).toBe('orders');
    });

    it('preserves a unique long chart slug', async () => {
        const longName = 'a'.repeat(300);
        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on.select(SavedChartSlugMappingsTableName).responseOnce([]);

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
        tracker.on.select(SavedChartSlugMappingsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            longName,
        );

        expect(slug).toHaveLength(255);
        expect(slug.endsWith('-2')).toBe(true);
        const slugQueries = tracker.history.select.filter(
            ({ sql }) => !sql.includes('pg_advisory_xact_lock'),
        );
        expect(slugQueries).toHaveLength(4);
        expect(slugQueries[1].sql).toContain('"slug" = $2');
        expect(slugQueries[1].bindings).toContain(`${'a'.repeat(253)}-1`);
    });

    it('detects collisions for long names with the same bounded prefix', async () => {
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_id: 1 }]);
        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on.select(SavedChartSlugMappingsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            `${'a'.repeat(255)}-different-tail`,
        );

        expect(slug).toBe(`${'a'.repeat(253)}-1`);
    });

    it('skips historical chart slugs', async () => {
        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on
            .select(SavedChartSlugMappingsTableName)
            .responseOnce([{ slug: 'orders' }]);
        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on.select(SavedChartSlugMappingsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            SavedChartsTableName,
            'Orders',
        );

        expect(slug).toBe('orders-1');
        const historyQueries = tracker.history.select.filter((query) =>
            query.sql.includes(SavedChartSlugMappingsTableName),
        );
        expect(historyQueries).toHaveLength(2);
        expect(historyQueries[0].bindings).toContain('orders');
        expect(historyQueries[1].bindings).toContain('orders-1');
    });

    it('uses direct project ownership and exact probes for dashboards', async () => {
        tracker.on.select(DashboardsTableName).responseOnce([]);

        await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            DashboardsTableName,
            'Orders',
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain(`"${DashboardsTableName}"."project_uuid"`);
        expect(query.sql).toContain('"slug" = $2');
        expect(query.sql).not.toContain('join');
    });

    it.each([SavedSqlTableName, AppsTableName] as const)(
        'uses native project ownership for %s',
        async (tableName) => {
            tracker.on.select(tableName).responseOnce([]);

            await generateUniqueSlugScopedToProject(
                database,
                '22222222-2222-4222-8222-222222222222',
                tableName,
                'Orders',
            );

            const [query] = tracker.history.select;
            expect(query.sql).toContain(`"${tableName}"."project_uuid"`);
            expect(query.sql).not.toContain('join');
        },
    );

    it('uses the indexed numeric project owner for spaces', async () => {
        tracker.on.select(SpaceTableName).responseOnce([]);

        await generateUniqueSlugScopedToProject(
            database,
            42,
            SpaceTableName,
            'Orders',
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain(`"${SpaceTableName}"."project_id"`);
        expect(query.sql).toContain('"slug" = $2');
        expect(query.bindings).toContain(42);
        expect(query.sql).not.toContain('join');
    });

    it('allocates numeric suffixes consistently for every resource', async () => {
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ slug: 'orders' }]);
        tracker.on.select(DashboardsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            DashboardsTableName,
            'Orders',
        );

        expect(slug).toBe('orders-1');
        expect(tracker.history.select).toHaveLength(2);
    });

    it('caps generated app slugs at 255 characters', async () => {
        tracker.on.select(AppsTableName).responseOnce([]);

        const slug = await generateUniqueSlugScopedToProject(
            database,
            '22222222-2222-4222-8222-222222222222',
            AppsTableName,
            'a'.repeat(300),
        );

        expect(slug).toHaveLength(255);
    });
});
