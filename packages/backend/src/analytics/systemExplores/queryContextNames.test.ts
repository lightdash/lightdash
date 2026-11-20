import { DuckDBInstance } from '@duckdb/node-api';
import { QueryExecutionContext } from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { queryContextNames, queryContextNameSql } from './queryContextNames';
import { analyticsContentAsCode } from './sampleContent';

describe('plain names for where a query ran from', () => {
    it('names every context without code-style words', () => {
        expect(Object.keys(queryContextNames).sort()).toEqual(
            Object.values(QueryExecutionContext).sort(),
        );
        Object.values(queryContextNames).forEach((name) => {
            // Sentence case, no camelCase, dots or underscores
            expect(name).toMatch(/^[A-Z][A-Za-z -]*$/);
            expect(name).not.toMatch(/[a-z][A-Z]/);
        });
        expect(queryContextNames).toMatchObject({
            dashboardView: 'Dashboard view',
            exploreView: 'Explore',
            filterAutocomplete: 'Filter autocomplete',
            autorefreshedDashboard: 'Auto-refreshed dashboard',
            api: 'API',
            ai: 'AI',
            chartView: 'Chart view',
            embed: 'Embed',
            scheduledDelivery: 'Scheduled delivery',
            csvDownload: 'CSV download',
        });
    });

    it('maps recorded values in SQL and passes unknown ones through', async () => {
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            const rows = (
                await db.runAndReadAll(
                    `SELECT c, ${queryContextNameSql('c')} AS name FROM (VALUES ('dashboardView'), ('mcp.run_sql'), ('somethingNew'), (NULL)) t(c) ORDER BY c NULLS LAST`,
                )
            ).getRowObjectsJS();
            expect(rows).toEqual([
                { c: 'dashboardView', name: 'Dashboard view' },
                { c: 'mcp.run_sql', name: 'MCP SQL query' },
                { c: 'somethingNew', name: 'somethingNew' },
                { c: null, name: null },
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    it('adds the plain name to the Queries explore beside the recorded value', () => {
        const { dimensions } = createAnalyticsExplores().find(
            ({ name }) => name === 'query_events',
        )!.tables.query_events;
        expect(dimensions.context_name).toMatchObject({
            label: 'Run from',
            type: dimensions.context.type,
        });
        expect(dimensions.context_name.compiledSql).toContain(
            "WHEN 'dashboardView' THEN 'Dashboard view'",
        );
        // The recorded value stays as it was, for filters
        expect(dimensions.context.compiledSql).not.toContain('CASE');
    });

    it('shows plain names wherever the Queries dashboard groups by context', () => {
        const { charts } = analyticsContentAsCode.find(
            ({ dashboard }) =>
                dashboard.slug === 'lightdash-analytics-query-activity',
        )!;
        const grouped = charts.filter(({ metricQuery }) =>
            metricQuery.dimensions.some((field) =>
                field.startsWith('query_events_context'),
            ),
        );
        expect(grouped.map(({ slug }) => slug)).toEqual(
            expect.arrayContaining([
                'lightdash-analytics-query-activity-queries-by-context',
                'lightdash-analytics-query-activity-query-origin-and-initiating-actor',
            ]),
        );
        grouped.forEach(({ metricQuery }) =>
            expect(metricQuery.dimensions).not.toContain(
                'query_events_context',
            ),
        );
    });
});
