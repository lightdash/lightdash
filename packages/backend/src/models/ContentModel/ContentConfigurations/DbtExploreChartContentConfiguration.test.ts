import knex from 'knex';
import { dbtExploreChartContentConfiguration } from './DbtExploreChartContentConfiguration';

describe('chart metadata lookup', () => {
    const database = knex({ client: 'pg' });
    afterAll(async () => {
        await database.destroy();
    });
    it('keeps browse listings space-owned by default', () => {
        const { sql } = dbtExploreChartContentConfiguration
            .getSummaryQuery(database, {})
            .toSQL();
        expect(sql).toContain(
            '"spaces"."space_id" = "saved_queries"."space_id"',
        );
        expect(sql).not.toContain('COALESCE(saved_queries.space_id');
    });
    it('resolves an explicitly requested dashboard-owned chart through a non-deleted parent space', () => {
        const sql = dbtExploreChartContentConfiguration
            .getSummaryQuery(database, {
                uuids: ['chart'],
                chart: { includeDashboardCharts: true },
            })
            .toSQL();
        expect(sql.sql).toContain(
            'COALESCE(saved_queries.space_id, dashboards.space_id)',
        );
        expect(sql.sql).toContain('"dashboards"."deleted_at" is null');
        expect(sql.sql).toContain('"spaces"."deleted_at" is null');
        expect(sql.bindings).toContain('chart');
    });
});
