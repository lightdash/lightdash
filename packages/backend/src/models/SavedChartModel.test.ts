import { AnyType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { DashboardsTableName } from '../database/entities/dashboards';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { createSavedChart, SavedChartModel } from './SavedChartModel';
import { chartSummary } from './SavedChartModel.mock';

describe('createSavedChart', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const chartInput = {
        name: 'Orders',
        description: undefined,
        tableName: 'orders',
        metricQuery: {
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        tableConfig: { columnOrder: [] },
        chartConfig: { type: 'table', config: {} },
        slug: 'orders',
        updatedByUser: null,
    } as AnyType;
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        vi.spyOn(database, 'transaction').mockImplementation(((
            callback: AnyType,
        ) => callback(database)) as AnyType);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        tracker.reset();
    });

    test('writes project_uuid and validates the destination project', async () => {
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const spaceUuid = '33333333-3333-4333-8333-333333333333';

        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on.select(SpaceTableName).responseOnce([{ space_id: 7 }]);
        tracker.on
            .insert(SavedChartsTableName)
            .responseOnce([
                { saved_query_id: 11, saved_query_uuid: 'chart-uuid' },
            ]);
        tracker.on
            .insert('saved_queries_versions')
            .responseOnce([{ saved_queries_version_id: 13 }]);

        await createSavedChart(
            database,
            projectUuid,
            '11111111-1111-4111-8111-111111111111',
            {
                ...chartInput,
                spaceUuid,
                dashboardUuid: null,
            },
        );

        const spaceQuery = tracker.history.select.find((query) =>
            query.sql.includes(`from "${SpaceTableName}"`),
        );
        expect(spaceQuery?.bindings).toContain(spaceUuid);
        expect(spaceQuery?.bindings).toContain(projectUuid);

        const chartInsert = tracker.history.insert.find((query) =>
            query.sql.includes(`into "${SavedChartsTableName}"`),
        );
        expect(chartInsert?.sql).toContain('"project_uuid"');
        expect(chartInsert?.bindings).toContain(projectUuid);
    });

    test('writes project_uuid for charts created in dashboards', async () => {
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const dashboardUuid = '44444444-4444-4444-8444-444444444444';

        tracker.on.select(SavedChartsTableName).responseOnce([]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ dashboard_uuid: dashboardUuid }]);
        tracker.on
            .insert(SavedChartsTableName)
            .responseOnce([
                { saved_query_id: 11, saved_query_uuid: 'chart-uuid' },
            ]);
        tracker.on
            .insert('saved_queries_versions')
            .responseOnce([{ saved_queries_version_id: 13 }]);

        await createSavedChart(
            database,
            projectUuid,
            '11111111-1111-4111-8111-111111111111',
            {
                ...chartInput,
                dashboardUuid,
            },
        );

        const dashboardQuery = tracker.history.select.find((query) =>
            query.sql.includes(`from "${DashboardsTableName}"`),
        );
        expect(dashboardQuery?.bindings).toContain(dashboardUuid);
        expect(dashboardQuery?.bindings).toContain(projectUuid);

        const chartInsert = tracker.history.insert.find((query) =>
            query.sql.includes(`into "${SavedChartsTableName}"`),
        );
        expect(chartInsert?.sql).toContain('"project_uuid"');
        expect(chartInsert?.bindings).toContain(projectUuid);
        expect(chartInsert?.bindings).toContain(dashboardUuid);
    });
});

describe('getLatestVersionSummaries', () => {
    const model = new SavedChartModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    test('Should return all chart versions, however old', async () => {
        const dateDaysAgo = (days: number) =>
            new Date(new Date().setDate(new Date().getDate() - days));

        tracker.on.select(SavedChartsTableName).responseOnce([
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version1',
                created_at: dateDaysAgo(365),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version2',
                created_at: dateDaysAgo(30),
            },
            {
                ...chartSummary,
                saved_queries_version_uuid: 'version3',
                created_at: new Date(),
            },
        ]);

        const response = await model.getLatestVersionSummaries('chart_uuid');
        expect(response).toHaveLength(3);
        const versionIds = response.map((r) => r.versionUuid);

        expect(versionIds).toEqual(['version1', 'version2', 'version3']);
    });

    test('Should return a single version without a windowing fallback', async () => {
        // `responseOnce` only answers the first query; the removed "fetch one
        // extra older version" fallback would issue a second (unmocked) query
        // and throw, so this implicitly guards against that regression.
        tracker.on.select(SavedChartsTableName).responseOnce([chartSummary]);

        const response = await model.getLatestVersionSummaries('chart_uuid');

        expect(response).toHaveLength(1);
        expect(response[0].chartUuid).toEqual(chartSummary.saved_query_uuid);
    });
});

describe('updateMultiple', () => {
    const model = new SavedChartModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('requires the destination space to belong to the requested project', async () => {
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const spaceUuid = '33333333-3333-4333-8333-333333333333';

        tracker.on.select(SpaceTableName).responseOnce([]);

        await expect(
            model.updateMultiple(projectUuid, [
                {
                    uuid: '11111111-1111-4111-8111-111111111111',
                    name: 'Chart name',
                    description: 'Chart description',
                    spaceUuid,
                },
            ]),
        ).rejects.toThrow('Space not found');

        const [spaceQuery] = tracker.history.select;
        expect(spaceQuery.bindings).toContain(projectUuid);
        expect(spaceQuery.bindings).toContain(spaceUuid);
        expect(tracker.history.update).toHaveLength(0);
    });

    test('updates only charts that already belong to the requested project', async () => {
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const spaceUuid = '33333333-3333-4333-8333-333333333333';
        const chartUuid = '11111111-1111-4111-8111-111111111111';

        tracker.on.select(SpaceTableName).responseOnce([{ space_id: 1 }]);
        tracker.on.update(SavedChartsTableName).responseOnce(0);

        await expect(
            model.updateMultiple(projectUuid, [
                {
                    uuid: chartUuid,
                    name: 'Chart name',
                    description: 'Chart description',
                    spaceUuid,
                },
            ]),
        ).rejects.toThrow('Saved query not found');

        const [updateQuery] = tracker.history.update;
        expect(updateQuery.bindings).toContain(chartUuid);
        expect(updateQuery.bindings).toContain(projectUuid);
    });
});

describe('update', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new SavedChartModel({
        database,
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        tracker.reset();
    });

    test('preserves dashboard linkage on name-only updates while writing the resolved project', async () => {
        const chartUuid = '11111111-1111-4111-8111-111111111111';
        const projectUuid = '22222222-2222-4222-8222-222222222222';

        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ project_uuid: projectUuid }]);
        tracker.on.update(SavedChartsTableName).responseOnce(1);
        vi.spyOn(model, 'get').mockResolvedValue(chartSummary as AnyType);

        await model.update(chartUuid, { name: 'Renamed chart' });

        expect(tracker.history.select).toHaveLength(1);
        const [updateQuery] = tracker.history.update;
        expect(updateQuery.sql).toContain('"project_uuid"');
        expect(updateQuery.sql).not.toContain('"space_id"');
        expect(updateQuery.sql).not.toContain('"dashboard_uuid"');
        expect(updateQuery.bindings).toContain(projectUuid);
        expect(updateQuery.bindings).toContain(chartUuid);
    });

    test('rejects moving a chart to a space in another project', async () => {
        const chartUuid = '11111111-1111-4111-8111-111111111111';
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const targetSpaceUuid = '33333333-3333-4333-8333-333333333333';

        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ project_uuid: projectUuid }]);
        tracker.on.select(SpaceTableName).responseOnce([]);

        await expect(
            model.update(chartUuid, {
                name: 'Moved chart',
                spaceUuid: targetSpaceUuid,
            }),
        ).rejects.toThrow('Space not found');

        expect(tracker.history.select[1].bindings).toEqual(
            expect.arrayContaining([targetSpaceUuid, projectUuid]),
        );
        expect(tracker.history.update).toHaveLength(0);
    });
});

describe('moveToSpace', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new SavedChartModel({
        database,
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('moves a chart within the requested project and writes project_uuid', async () => {
        const chartUuid = '11111111-1111-4111-8111-111111111111';
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const targetSpaceUuid = '33333333-3333-4333-8333-333333333333';

        tracker.on.select(SpaceTableName).responseOnce([{ space_id: 7 }]);
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_uuid: chartUuid }]);
        tracker.on.update(SavedChartsTableName).responseOnce(1);

        await model.moveToSpace({
            projectUuid,
            itemUuid: chartUuid,
            targetSpaceUuid,
        });

        const targetSpaceQuery = tracker.history.select.find((query) =>
            query.sql.includes(`from "${SpaceTableName}"`),
        );
        expect(targetSpaceQuery?.bindings).toContain(targetSpaceUuid);
        expect(targetSpaceQuery?.bindings).toContain(projectUuid);

        const sourceChartQuery = tracker.history.select.find((query) =>
            query.sql.includes(`from "${SavedChartsTableName}"`),
        );
        expect(sourceChartQuery?.bindings).toContain(chartUuid);
        expect(sourceChartQuery?.bindings).toContain(projectUuid);

        const [updateQuery] = tracker.history.update;
        expect(updateQuery.sql).toContain('"project_uuid"');
        expect(updateQuery.bindings).toContain(projectUuid);
        expect(updateQuery.bindings).toContain(7);
        expect(updateQuery.bindings).toContain(chartUuid);
    });

    test('rejects charts outside the requested project before updating', async () => {
        const chartUuid = '11111111-1111-4111-8111-111111111111';
        const projectUuid = '22222222-2222-4222-8222-222222222222';
        const targetSpaceUuid = '33333333-3333-4333-8333-333333333333';

        tracker.on.select(SpaceTableName).responseOnce([{ space_id: 7 }]);
        tracker.on.select(SavedChartsTableName).responseOnce([]);

        await expect(
            model.moveToSpace({
                projectUuid,
                itemUuid: chartUuid,
                targetSpaceUuid,
            }),
        ).rejects.toThrow('Saved chart not found');

        const sourceChartQuery = tracker.history.select.find((query) =>
            query.sql.includes(`from "${SavedChartsTableName}"`),
        );
        expect(sourceChartQuery?.bindings).toContain(chartUuid);
        expect(sourceChartQuery?.bindings).toContain(projectUuid);
        expect(tracker.history.update).toHaveLength(0);
    });
});
