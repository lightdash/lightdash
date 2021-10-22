import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { LightdashMode } from 'common';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import { DashboardModel } from './DashboardModel';
import {
    addDashboardVersion,
    addDashboardVersionWithoutChart,
    addDashboardVersionWithTileIds,
    createDashboard,
    dashboardEntry,
    dashboardTileEntry,
    dashboardTileWithSavedChartEntry,
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
} from '../../database/entities/dashboards';
import { SpaceTableName } from '../../database/entities/spaces';
import { SavedQueriesTableName } from '../../database/entities/savedQueries';
import { NotFoundError } from '../../errors';

jest.mock('../../config/lightdashConfig', () => ({
    lightdashConfig: {
        mode: LightdashMode.DEFAULT,
    },
}));

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
        database: knex({ client: MockClient, dialect: 'pg' }),
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
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
            )
            .response([dashboardWithVersionEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTilesTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardTileWithSavedChartEntry]);

        const dashboard = await model.getById(expectedDashboard.uuid);

        expect(dashboard).toEqual(expectedDashboard);
        expect(tracker.history.select).toHaveLength(2);
    });
    test("should error if dashboard isn't found", async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
            )
            .response([]);

        await expect(
            model.getById(expectedDashboard.uuid),
        ).rejects.toThrowError(NotFoundError);
    });
    test('should get all by project uuid', async () => {
        const projectUuid = 'project uuid';
        tracker.on
            .select(queryMatcher(DashboardsTableName, [projectUuid]))
            .response([dashboardWithVersionEntry]);

        const dashboard = await model.getAllByProject(projectUuid);

        expect(dashboard).toEqual(expectedAllDashboards);
        expect(tracker.history.select).toHaveLength(1);
    });
    test('should create dashboard with tile ids', async () => {
        const spaceUuid = 'space uuid';
        tracker.on
            .select(queryMatcher(SpaceTableName, [spaceUuid, 1]))
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
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([dashboardTileEntry]);
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
                    dashboardTileEntry.dashboard_tile_uuid,
                    dashboardVersionEntry.dashboard_version_id,
                    savedChartEntry.saved_query_id,
                ]),
            )
            .response([]);

        const newDashboardUuid = await model.create(spaceUuid, createDashboard);

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
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
            )
            .response([]);

        await expect(
            model.addVersion(expectedDashboard.uuid, addDashboardVersion),
        ).rejects.toThrowError(NotFoundError);
    });
    test('should create dashboard version', async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
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
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([dashboardTileEntry]);
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
                    dashboardTileEntry.dashboard_tile_uuid,
                    dashboardVersionEntry.dashboard_version_id,
                    savedChartEntry.saved_query_id,
                ]),
            )
            .response([]);

        await model.addVersion(expectedDashboard.uuid, addDashboardVersion);

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(3);
    });
    test('should create dashboard version with ids', async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
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
                    addDashboardVersionWithTileIds.tiles[0].uuid,
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithTileIds.tiles[0].h,
                    addDashboardVersionWithTileIds.tiles[0].type,
                    addDashboardVersionWithTileIds.tiles[0].w,
                    addDashboardVersionWithTileIds.tiles[0].x,
                    addDashboardVersionWithTileIds.tiles[0].y,
                ]),
            )
            .response([dashboardTileEntry]);
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
                    dashboardTileEntry.dashboard_tile_uuid,
                    dashboardVersionEntry.dashboard_version_id,
                    savedChartEntry.saved_query_id,
                ]),
            )
            .response([]);

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithTileIds,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(3);
    });
    test('should create dashboard version without a chart', async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
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
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([dashboardTileEntry]);

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithoutChart,
        );

        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.insert).toHaveLength(2);
    });
    test("should error on create dashboard version if saved chart isn't found", async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
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
                    addDashboardVersion.tiles[0].type,
                    addDashboardVersion.tiles[0].w,
                    addDashboardVersion.tiles[0].x,
                    addDashboardVersion.tiles[0].y,
                ]),
            )
            .response([dashboardTileEntry]);
        tracker.on
            .select(
                queryMatcher(SavedQueriesTableName, [
                    addDashboardVersion.tiles[0].properties.savedChartUuid,
                    1,
                ]),
            )
            .response([]);

        await expect(
            model.addVersion(expectedDashboard.uuid, addDashboardVersion),
        ).rejects.toThrowError(NotFoundError);
    });
});
