import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { LightdashMode } from 'common';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import { DashboardModel } from './DashboardModel';
import {
    addDashboardVersion,
    createDashboard,
    dashboardChartTileEntry,
    dashboardEntry,
    dashboardTileEntry,
    dashboardVersionEntry,
    dashboardWithVersionEntry,
    expectedAllDashboards,
    expectedDashboard,
    savedChartEntry,
    spaceEntry,
    updateDashboard,
} from './DashboardModel.mock';
import {
    DashboardsTableName,
    DashboardTileChartTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { SpaceTableName } from '../database/entities/spaces';
import { SavedQueriesTableName } from '../database/entities/savedQueries';
import { NotFoundError } from '../errors';

jest.mock('../config/lightdashConfig', () => ({
    lightdashConfig: {
        mode: LightdashMode.DEFAULT,
    },
}));

// Todo: Postgres work around. https://github.com/felixmosh/knex-mock-client/issues/7
class MockClientWithDistinctOn extends MockClient {
    queryCompiler(builder: any) {
        const queryCompiler = super.queryCompiler(builder);
        queryCompiler.distinctOn = (value: any) => '';
        return queryCompiler;
    }
}

function queryMatcher(
    tableName: string,
    params: any[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && bindings[index] === arg,
            true,
        );
}

describe('DashboardModel', () => {
    const model = new DashboardModel({
        database: knex({ client: MockClientWithDistinctOn }),
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });
    test('should get dashboard by uuid', async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [
                    expectedDashboard.dashboardUuid,
                    1,
                ]),
            )
            .response([dashboardWithVersionEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTilesTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardTileEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTileChartTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardChartTileEntry]);

        const dashboard = await model.getById(expectedDashboard.dashboardUuid);

        expect(dashboard).toEqual(expectedDashboard);
        expect(tracker.history.select).toHaveLength(3);
    });
    test("should error if dashboard isn't found", async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [
                    expectedDashboard.dashboardUuid,
                    1,
                ]),
            )
            .response([]);

        await expect(
            model.getById(expectedDashboard.dashboardUuid),
        ).rejects.toThrowError(NotFoundError);
    });
    test('should get all by project uuid', async () => {
        const projectUuid = 'project uuid';
        tracker.on
            .select(queryMatcher(SpaceTableName, [projectUuid, 1]))
            .response([spaceEntry]);
        tracker.on
            .select(queryMatcher(DashboardsTableName, [spaceEntry.space_id]))
            .response([dashboardWithVersionEntry]);

        const dashboard = await model.getAllByProject(projectUuid);

        expect(dashboard).toEqual(expectedAllDashboards);
        expect(tracker.history.select).toHaveLength(2);
    });
    test('should create dashboard', async () => {
        const projectUuid = 'project uuid';
        tracker.on
            .select(queryMatcher(SpaceTableName, [projectUuid, 1]))
            .response([spaceEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardsTableName, [
                    createDashboard.description,
                    createDashboard.name,
                    spaceEntry.space_id,
                ]),
            )
            .response([dashboardEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardVersionsTableName, [
                    dashboardEntry.dashboard_id,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTilesTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersion.tiles[0].h,
                    0,
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([]);
        tracker.on
            .select(
                queryMatcher(SavedQueriesTableName, [
                    addDashboardVersion.tiles[0].properties.savedChartUuid,
                    1,
                ]),
            )
            .response([savedChartEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTileChartTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    0,
                    savedChartEntry.saved_query_id,
                ]),
            )
            .response([]);

        const newDashboardUuid = await model.create(
            projectUuid,
            createDashboard,
        );

        expect(newDashboardUuid).toBe(dashboardEntry.dashboard_uuid);
        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(4);
    });
    test('should update dashboard', async () => {
        const dashboardUuid = 'dashboard uuid';
        tracker.on
            .update(
                queryMatcher(DashboardsTableName, [
                    updateDashboard.name,
                    updateDashboard.description,
                    dashboardUuid,
                ]),
            )
            .response([]);

        await model.update(dashboardUuid, updateDashboard);
        expect(tracker.history.update).toHaveLength(1);
    });
    test('should delete dashboard', async () => {
        const dashboardUuid = 'dashboard uuid';
        tracker.on
            .delete(queryMatcher(DashboardsTableName, [dashboardUuid]))
            .response([]);

        await model.delete(dashboardUuid);
        expect(tracker.history.delete).toHaveLength(1);
    });
    test("should error on create dashboard version if dashboard isn't found", async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [
                    expectedDashboard.dashboardUuid,
                    1,
                ]),
            )
            .response([]);

        await expect(
            model.addVersion(
                expectedDashboard.dashboardUuid,
                addDashboardVersion,
            ),
        ).rejects.toThrowError(NotFoundError);
    });
    test('should create dashboard version', async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [
                    expectedDashboard.dashboardUuid,
                    1,
                ]),
            )
            .response([dashboardEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardVersionsTableName, [
                    dashboardEntry.dashboard_id,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTilesTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersion.tiles[0].h,
                    0,
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([]);
        tracker.on
            .select(
                queryMatcher(SavedQueriesTableName, [
                    addDashboardVersion.tiles[0].properties.savedChartUuid,
                    1,
                ]),
            )
            .response([savedChartEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTileChartTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    0,
                    savedChartEntry.saved_query_id,
                ]),
            )
            .response([]);

        await model.addVersion(
            expectedDashboard.dashboardUuid,
            addDashboardVersion,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(3);
    });
    test("should error on create dashboard version if saved chart isn't found", async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [
                    expectedDashboard.dashboardUuid,
                    1,
                ]),
            )
            .response([dashboardEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardVersionsTableName, [
                    dashboardEntry.dashboard_id,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTilesTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersion.tiles[0].h,
                    0,
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([]);
        tracker.on
            .select(
                queryMatcher(SavedQueriesTableName, [
                    addDashboardVersion.tiles[0].properties.savedChartUuid,
                    1,
                ]),
            )
            .response([]);

        await expect(
            model.addVersion(
                expectedDashboard.dashboardUuid,
                addDashboardVersion,
            ),
        ).rejects.toThrowError(NotFoundError);
    });
});
