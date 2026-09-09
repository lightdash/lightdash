import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    AppsTableName,
    AppVersionsTableName,
    type DbApp,
} from '../database/entities/apps';
import { DashboardTileDataAppsTableName } from '../database/entities/dashboards';
import {
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { AppModel } from './AppModel';

const appId = '11111111-1111-4111-8111-111111111111';
const projectUuid = '22222222-2222-4222-8222-222222222222';

const appRow: DbApp = {
    app_id: appId,
    name: '',
    description: '',
    project_uuid: projectUuid,
    slug: 'app-1',
    space_uuid: null,
    sandbox_id: null,
    template: null,
    icon: null,
    design_uuid: null,
    upstream_app_uuid: null,
    registry_slug: null,
    registry_url: null,
    origin_app_uuid: null,
    origin_app_version: null,
    created_at: new Date(),
    created_by_user_uuid: '33333333-3333-4333-8333-333333333333',
    deleted_at: null,
    deleted_by_user_uuid: null,
    views_count: 0,
    search_vector: '',
};

describe('AppModel.recordVersionGenerationUsage', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AppModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('persists an unknown generation cost as null', async () => {
        tracker.on.update(AppVersionsTableName).responseOnce(1);

        await model.recordVersionGenerationUsage(appId, 1, {
            inputTokens: 100,
            outputTokens: 20,
            cacheReadInputTokens: 50,
            cacheCreationInputTokens: 0,
            numTurns: 2,
            durationApiMs: 0,
            costUsd: null,
        });

        expect(tracker.history.update[0].sql).toContain("'costUsd', NULL");
        expect(tracker.history.update[0].bindings).not.toContain(null);
    });
});

describe('AppModel.getOrganizationActivity', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AppModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('filters on the resolved Claude or Codex model', async () => {
        tracker.on.select(AppVersionsTableName).responseOnce([]);

        const result = await model.getOrganizationActivity(
            'organization-1',
            undefined,
            { models: ['sonnet', 'gpt-5.6-terra'] },
        );

        expect(result).toEqual({ data: [] });
        expect(tracker.history.select[0].sql).toContain(
            "COALESCE(app_versions.resources->>'codexModel', app_versions.resources->>'claudeModel'",
        );
        expect(tracker.history.select[0].bindings).toEqual(
            expect.arrayContaining([
                'organization-1',
                'sonnet',
                'gpt-5.6-terra',
            ]),
        );
    });
});

describe('AppModel.setMetadataIfUnset', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AppModel({ database });
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

    it('replaces the temporary slug with one derived from the generated name', async () => {
        const updatedApp = {
            ...appRow,
            name: 'Sales Performance Overview',
            description: 'A view of sales performance.',
            slug: 'sales-performance-overview',
        };
        tracker.on.select(AppsTableName).responseOnce(appRow);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.update(AppsTableName).responseOnce([updatedApp]);

        const result = await model.setMetadataIfUnset(appId, projectUuid, {
            name: 'Sales Performance Overview',
            description: 'A view of sales performance.',
        });

        expect(result).toEqual(updatedApp);
        expect(tracker.history.update[0].bindings).toContain(
            'sales-performance-overview',
        );
    });

    it('preserves project-scoped uniqueness for the generated slug', async () => {
        const updatedApp = {
            ...appRow,
            name: 'Sales Performance Overview',
            description: 'A view of sales performance.',
            slug: 'sales-performance-overview-1',
        };
        tracker.on.select(AppsTableName).responseOnce(appRow);
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ slug: 'sales-performance-overview' }]);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.update(AppsTableName).responseOnce([updatedApp]);

        const result = await model.setMetadataIfUnset(appId, projectUuid, {
            name: 'Sales Performance Overview',
            description: 'A view of sales performance.',
        });

        expect(result.slug).toBe('sales-performance-overview-1');
        expect(tracker.history.update[0].bindings).toContain(
            'sales-performance-overview-1',
        );
    });

    it('writes the suggested icon when the app has none', async () => {
        const updatedApp = {
            ...appRow,
            name: 'Radial Gauge',
            slug: 'radial-gauge',
            icon: 'gauge',
        };
        tracker.on.select(AppsTableName).responseOnce(appRow);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.update(AppsTableName).responseOnce([updatedApp]);

        const result = await model.setMetadataIfUnset(appId, projectUuid, {
            name: 'Radial Gauge',
            description: 'A radial gauge.',
            icon: 'gauge',
        });

        expect(result.icon).toBe('gauge');
        expect(tracker.history.update[0].bindings).toContain('gauge');
    });

    it('does not overwrite an icon the author already chose', async () => {
        const appWithIcon = { ...appRow, icon: 'chart-pie' };
        tracker.on.select(AppsTableName).responseOnce(appWithIcon);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.update(AppsTableName).responseOnce([appWithIcon]);

        await model.setMetadataIfUnset(appId, projectUuid, {
            name: 'Radial Gauge',
            description: 'A radial gauge.',
            icon: 'gauge',
        });

        expect(tracker.history.update[0].sql).not.toContain('"icon"');
        expect(tracker.history.update[0].bindings).not.toContain('gauge');
    });

    it('leaves the icon alone when the metadata suggests none', async () => {
        tracker.on.select(AppsTableName).responseOnce(appRow);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.update(AppsTableName).responseOnce([appRow]);

        await model.setMetadataIfUnset(appId, projectUuid, {
            name: 'Sales Performance Overview',
            description: 'A view of sales performance.',
        });

        expect(tracker.history.update[0].sql).not.toContain('"icon"');
    });

    it('does not change the name or slug after a user has named the app', async () => {
        const manuallyNamedApp = {
            ...appRow,
            name: 'My Revenue App',
            slug: 'my-revenue-app',
        };
        const updatedApp = {
            ...manuallyNamedApp,
            description: 'A generated description.',
        };
        tracker.on.select(AppsTableName).responseOnce(manuallyNamedApp);
        tracker.on.update(AppsTableName).responseOnce([updatedApp]);

        const result = await model.setMetadataIfUnset(appId, projectUuid, {
            name: 'Generated Revenue Overview',
            description: 'A generated description.',
        });

        expect(result).toEqual(updatedApp);
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.update[0].sql).not.toContain('"slug"');
        expect(tracker.history.update[0].sql).not.toContain('"name"');
    });
});

describe('AppModel.findDashboardsContainingApp', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AppModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('limits the latest-version lookup to the candidate dashboards', async () => {
        const dashboardUuid = '44444444-4444-4444-8444-444444444444';
        tracker.on
            .select(DashboardTileDataAppsTableName)
            .responseOnce([{ dashboard_uuid: dashboardUuid }]);

        const result = await model.findDashboardsContainingApp(
            appId,
            projectUuid,
            [dashboardUuid],
        );

        expect(result).toEqual([dashboardUuid]);
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).toContain(
            '"dashboards"."dashboard_uuid" in ($2)',
        );
        expect(tracker.history.select[0].bindings).toEqual(
            expect.arrayContaining([projectUuid, dashboardUuid, appId]),
        );
    });
});

describe('AppModel.remapPreviewChartVizBindings', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AppModel({ database });
    let tracker: Tracker;

    const previewProjectUuid = '55555555-5555-4555-8555-555555555555';
    const sourceAppUuid = '66666666-6666-4666-8666-666666666666';
    const previewAppUuid = '77777777-7777-4777-8777-777777777777';
    const otherSourceAppUuid = '88888888-8888-4888-8888-888888888888';
    const mappings = [
        { sourceAppUuid, previewAppUuid, previewAppVersion: 3 },
        {
            sourceAppUuid: otherSourceAppUuid,
            previewAppUuid: '99999999-9999-4999-8999-999999999999',
            previewAppVersion: 1,
        },
    ];
    const spaceChartsQuery =
        /"spaces"\."space_id" = "saved_queries"\."space_id"/;
    const dashboardChartsQuery =
        /"dashboards"\."dashboard_uuid" = "saved_queries"\."dashboard_uuid"/;
    const versionCandidatesQuery = /from "saved_queries_versions" where/;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('does nothing without mappings', async () => {
        await model.remapPreviewChartVizBindings(previewProjectUuid, []);

        expect(tracker.history.all).toHaveLength(0);
    });

    it('stops after the chart lookup when the preview has no charts', async () => {
        tracker.on.select(spaceChartsQuery).responseOnce([]);
        tracker.on.select(dashboardChartsQuery).responseOnce([]);

        await model.remapPreviewChartVizBindings(previewProjectUuid, mappings);

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.update).toHaveLength(0);
    });

    it('looks up candidate versions by chart id and skips updates when none match', async () => {
        tracker.on
            .select(spaceChartsQuery)
            .responseOnce([{ saved_query_id: 1 }, { saved_query_id: 2 }]);
        tracker.on
            .select(dashboardChartsQuery)
            .responseOnce([{ saved_query_id: 2 }, { saved_query_id: 3 }]);
        tracker.on.select(versionCandidatesQuery).responseOnce([]);

        await model.remapPreviewChartVizBindings(previewProjectUuid, mappings);

        expect(tracker.history.select).toHaveLength(3);
        const candidates = tracker.history.select[2];
        expect(candidates.sql).toContain(`"saved_query_id" = ANY($1::int[])`);
        expect(candidates.sql).toContain(`"chart_type" = $2`);
        expect(candidates.sql).not.toContain(`"${SavedChartsTableName}"`);
        expect(candidates.bindings).toEqual([[1, 2, 3], 'data_app_viz']);
        expect(tracker.history.update).toHaveLength(0);
    });

    it('updates only the versions bound to a mapped source app, by version id', async () => {
        tracker.on
            .select(spaceChartsQuery)
            .responseOnce([{ saved_query_id: 1 }]);
        tracker.on
            .select(dashboardChartsQuery)
            .responseOnce([{ saved_query_id: 2 }]);
        tracker.on.select(versionCandidatesQuery).responseOnce([
            { saved_queries_version_id: 10, source_app_uuid: sourceAppUuid },
            { saved_queries_version_id: 11, source_app_uuid: sourceAppUuid },
            {
                saved_queries_version_id: 12,
                source_app_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            },
            { saved_queries_version_id: 13, source_app_uuid: null },
        ]);
        tracker.on.update(SavedChartVersionsTableName).responseOnce(2);

        await model.remapPreviewChartVizBindings(previewProjectUuid, mappings);

        expect(tracker.history.update).toHaveLength(1);
        const update = tracker.history.update[0];
        expect(update.sql).toContain('jsonb_set');
        expect(update.sql).toMatch(
            /where "saved_queries_version_id" = ANY\(\$\d+::int\[\]\)/,
        );
        expect(update.sql).not.toContain('chart_config->>');
        expect(update.bindings).toEqual([previewAppUuid, 3, [10, 11]]);
    });
});
