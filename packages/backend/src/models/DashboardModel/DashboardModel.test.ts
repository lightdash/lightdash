import {
    CreateDashboardLoomTile,
    CreateDashboardMarkdownTile,
    DashboardChartTile,
    deepEqual,
    LightdashMode,
    NotFoundError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import {
    DashboardsTableName,
    DashboardTileChartTableName,
    DashboardTileLoomsTableName,
    DashboardTileMarkdownsTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
    DashboardViewsTableName,
} from '../../database/entities/dashboards';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';
import { DashboardModel } from './DashboardModel';
import {
    addDashboardVersion,
    addDashboardVersionWithAllTiles,
    addDashboardVersionWithoutChart,
    addDashboardVersionWithTileIds,
    createDashboard,
    dashboardEntry,
    dashboardTileEntry,
    dashboardTileWithSavedChartEntry,
    dashboardVersionEntry,
    dashboardViewEntry,
    dashboardWithVersionEntry,
    expectedAllDashboards,
    expectedDashboard,
    loomTileEntry,
    markdownTileEntry,
    savedChartEntry,
    spaceEntry,
    updateDashboard,
    user,
} from './DashboardModel.mock';

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
            (valid, arg, index) => valid && deepEqual(bindings[index], arg),
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
            .response([
                {
                    ...dashboardWithVersionEntry,
                    space_uuid: 'spaceUuid',
                    spaceName: 'space name',
                },
            ]);
        tracker.on
            .select(
                queryMatcher(DashboardViewsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardViewEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTilesTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([
                dashboardTileWithSavedChartEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);

        const dashboard = await model.getById(expectedDashboard.uuid);

        expect(dashboard).toEqual(expectedDashboard);
        expect(tracker.history.select).toHaveLength(3);
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
            .response([
                { ...dashboardWithVersionEntry, space_uuid: 'spaceUuid' },
            ]);

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
                    user.userUuid,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardViewsTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    createDashboard.filters,
                    'Default',
                ]),
            )
            .response([dashboardViewEntry]);
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
                queryMatcher(SavedChartsTableName, [
                    (addDashboardVersion.tiles[0] as DashboardChartTile)
                        .properties.savedChartUuid,
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
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
            )
            .response([dashboardWithVersionEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardViewsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardViewEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTilesTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([
                dashboardTileWithSavedChartEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);
        tracker.on
            .update(
                queryMatcher(DashboardViewsTableName, [
                    addDashboardVersionWithoutChart.filters,
                    dashboardVersionEntry.dashboard_version_id,
                ]),
            )
            .response([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.create(spaceUuid, createDashboard, user);

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(5);
        expect(tracker.history.update).toHaveLength(1);
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
        tracker.on
            .select(queryMatcher(DashboardsTableName, [dashboardUuid, 1]))
            .response([dashboardWithVersionEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardViewsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardViewEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTilesTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([
                dashboardTileWithSavedChartEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);

        await model.update(dashboardUuid, updateDashboard);
        expect(tracker.history.update).toHaveLength(1);
    });
    test('should delete dashboard', async () => {
        const dashboardUuid = 'dashboard uuid';
        tracker.on
            .select(queryMatcher(DashboardsTableName, [dashboardUuid, 1]))
            .response([dashboardWithVersionEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardViewsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([dashboardViewEntry]);
        tracker.on
            .select(
                queryMatcher(DashboardTilesTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                ]),
            )
            .response([
                dashboardTileWithSavedChartEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);
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
            model.addVersion(expectedDashboard.uuid, addDashboardVersion, user),
        ).rejects.toThrowError(NotFoundError);
    });
    test('should create dashboard version with all tile types', async () => {
        tracker.on
            .select(
                queryMatcher(DashboardsTableName, [expectedDashboard.uuid, 1]),
            )
            .response([dashboardEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardVersionsTableName, [
                    dashboardEntry.dashboard_id,
                    user.userUuid,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardViewsTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithAllTiles.filters,
                    'Default',
                ]),
            )
            .response([dashboardViewEntry]);
        // Create saved chart tile
        tracker.on
            .insert(
                queryMatcher(DashboardTilesTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithAllTiles.tiles[0].h,
                    addDashboardVersionWithAllTiles.tiles[0].type,
                    addDashboardVersionWithAllTiles.tiles[0].w,
                    addDashboardVersionWithAllTiles.tiles[0].x,
                    addDashboardVersionWithAllTiles.tiles[0].y,
                ]),
            )
            .response([dashboardTileEntry]);
        tracker.on
            .select(
                queryMatcher(SavedChartsTableName, [
                    (
                        addDashboardVersionWithAllTiles
                            .tiles[0] as DashboardChartTile
                    ).properties.savedChartUuid,
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

        // Create loom tile
        tracker.on
            .insert(
                queryMatcher(DashboardTilesTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithAllTiles.tiles[1].h,
                    addDashboardVersionWithAllTiles.tiles[1].type,
                    addDashboardVersionWithAllTiles.tiles[1].w,
                    addDashboardVersionWithAllTiles.tiles[1].x,
                    addDashboardVersionWithAllTiles.tiles[1].y,
                ]),
            )
            .response([loomTileEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTileLoomsTableName, [
                    dashboardTileEntry.dashboard_tile_uuid,
                    dashboardVersionEntry.dashboard_version_id,
                    (
                        addDashboardVersionWithAllTiles
                            .tiles[1] as CreateDashboardLoomTile
                    ).properties.title,
                    (
                        addDashboardVersionWithAllTiles
                            .tiles[1] as CreateDashboardLoomTile
                    ).properties.url,
                ]),
            )
            .response([]);

        // Create markddown tile
        tracker.on
            .insert(
                queryMatcher(DashboardTilesTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithAllTiles.tiles[2].h,
                    addDashboardVersionWithAllTiles.tiles[2].type,
                    addDashboardVersionWithAllTiles.tiles[2].w,
                    addDashboardVersionWithAllTiles.tiles[2].x,
                    addDashboardVersionWithAllTiles.tiles[2].y,
                ]),
            )
            .response([markdownTileEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardTileMarkdownsTableName, [
                    (
                        addDashboardVersionWithAllTiles
                            .tiles[2] as CreateDashboardMarkdownTile
                    ).properties.content,
                    dashboardTileEntry.dashboard_tile_uuid,
                    dashboardVersionEntry.dashboard_version_id,
                    (
                        addDashboardVersionWithAllTiles
                            .tiles[2] as CreateDashboardMarkdownTile
                    ).properties.title,
                ]),
            )
            .response([]);
        tracker.on
            .update(
                queryMatcher(DashboardViewsTableName, [
                    addDashboardVersionWithoutChart.filters,
                    dashboardVersionEntry.dashboard_version_id,
                ]),
            )
            .response([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithAllTiles,
            user,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(8);
        expect(tracker.history.update).toHaveLength(1);
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
                    user.userUuid,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardViewsTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithTileIds.filters,
                    'Default',
                ]),
            )
            .response([dashboardViewEntry]);
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
                queryMatcher(SavedChartsTableName, [
                    (addDashboardVersion.tiles[0] as DashboardChartTile)
                        .properties.savedChartUuid,
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
        tracker.on
            .update(
                queryMatcher(DashboardViewsTableName, [
                    addDashboardVersionWithoutChart.filters,
                    dashboardVersionEntry.dashboard_version_id,
                ]),
            )
            .response([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithTileIds,
            user,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(4);
        expect(tracker.history.update).toHaveLength(1);
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
                    user.userUuid,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardViewsTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersionWithoutChart.filters,
                    'Default',
                ]),
            )
            .response([dashboardViewEntry]);
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
            .update(
                queryMatcher(DashboardViewsTableName, [
                    addDashboardVersionWithoutChart.filters,
                    dashboardVersionEntry.dashboard_version_id,
                ]),
            )
            .response([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithoutChart,
            user,
        );

        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.insert).toHaveLength(3);
        expect(tracker.history.update).toHaveLength(1);
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
                    user.userUuid,
                ]),
            )
            .response([dashboardVersionEntry]);
        tracker.on
            .insert(
                queryMatcher(DashboardViewsTableName, [
                    dashboardVersionEntry.dashboard_version_id,
                    addDashboardVersion.filters,
                    'Default',
                ]),
            )
            .response([dashboardViewEntry]);
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
                queryMatcher(SavedChartsTableName, [
                    (addDashboardVersion.tiles[0] as DashboardChartTile)
                        .properties.savedChartUuid,
                    1,
                ]),
            )
            .response([]);

        await expect(
            model.addVersion(expectedDashboard.uuid, addDashboardVersion, user),
        ).rejects.toThrowError(NotFoundError);
    });
});
