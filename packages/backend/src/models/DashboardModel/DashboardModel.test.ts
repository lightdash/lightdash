import {
    CreateDashboardMarkdownTile,
    deepEqual,
    NotFoundError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import {
    DashboardsTableName,
    DashboardTabsTableName,
    DashboardTileChartTableName,
    DashboardTileLoomsTableName,
    DashboardTileMarkdownsTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
    DashboardViewsTableName,
} from '../../database/entities/dashboards';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';
import { projectUuid } from '../ProjectModel/ProjectModel.mock';
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
                    space_name: 'space name',
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
        tracker.on
            .select(
                queryMatcher(DashboardTabsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                    dashboardWithVersionEntry.dashboard_id,
                ]),
            )
            .response([]);

        const dashboard = await model.getById(expectedDashboard.uuid);

        expect(dashboard).toEqual(expectedDashboard);
        expect(tracker.history.select).toHaveLength(4);
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
        tracker.on
            .select(queryMatcher(DashboardsTableName, [projectUuid]))
            .response([
                {
                    ...dashboardWithVersionEntry,
                    space_uuid: 'spaceUuid',
                    validation_errors: [],
                },
            ]);

        const dashboard = await model.getAllByProject(projectUuid);

        expect(dashboard).toEqual(expectedAllDashboards);
        expect(tracker.history.select).toHaveLength(1);
    });

    test('should create dashboard with tile ids', async () => {
        tracker.on.select(SpaceTableName).responseOnce([spaceEntry]);
        tracker.on.insert(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on
            .insert(DashboardVersionsTableName)
            .responseOnce([dashboardVersionEntry]);
        tracker.on
            .insert(DashboardViewsTableName)
            .responseOnce([dashboardViewEntry]);
        tracker.on
            .insert(DashboardTilesTableName)
            .responseOnce([dashboardTileEntry]);
        tracker.on.select(SavedChartsTableName).responseOnce([savedChartEntry]);
        tracker.on.insert(DashboardTileChartTableName).responseOnce([]);
        tracker.on.update(DashboardViewsTableName).responseOnce([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.create('spaceUuid', createDashboard, user, projectUuid);

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(5);
        expect(tracker.history.insert[0]).toMatchObject({
            sql: expect.stringContaining(DashboardsTableName),
            bindings: expect.arrayContaining([
                createDashboard.description,
                createDashboard.name,
                createDashboard.slug,
                spaceEntry.space_id,
            ]),
        });
        expect(tracker.history.insert[1]).toMatchObject({
            sql: expect.stringContaining(DashboardVersionsTableName),
            bindings: expect.arrayContaining([
                dashboardEntry.dashboard_id,
                user.userUuid,
            ]),
        });
        expect(tracker.history.insert[2]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                JSON.stringify(createDashboard.filters),
                'Default',
            ]),
        });
        expect(tracker.history.insert[3]).toMatchObject({
            sql: expect.stringContaining(DashboardTilesTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                createDashboard.tiles[0].h,
                createDashboard.tiles[0].type,
                createDashboard.tiles[0].w,
                createDashboard.tiles[0].x,
                createDashboard.tiles[0].y,
            ]),
        });
        expect(tracker.history.insert[4]).toMatchObject({
            sql: expect.stringContaining(DashboardTileChartTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                savedChartEntry.saved_query_id,
            ]),
        });
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.update[0]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                addDashboardVersionWithoutChart.filters,
                dashboardVersionEntry.dashboard_version_id,
            ]),
        });
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
        tracker.on
            .select(
                queryMatcher(DashboardTabsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                    dashboardWithVersionEntry.dashboard_id,
                ]),
            )
            .response([]);
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
            .select(
                queryMatcher(DashboardTabsTableName, [
                    dashboardWithVersionEntry.dashboard_version_id,
                    dashboardWithVersionEntry.dashboard_id,
                ]),
            )
            .response([]);
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
            model.addVersion(
                expectedDashboard.uuid,
                addDashboardVersion,
                user,
                projectUuid,
            ),
        ).rejects.toThrowError(NotFoundError);
    });

    test('should create dashboard version with all tile types', async () => {
        tracker.on.select(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on.select(SpaceTableName).responseOnce([spaceEntry]);
        tracker.on.insert(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on
            .insert(DashboardVersionsTableName)
            .responseOnce([dashboardVersionEntry]);
        tracker.on
            .insert(DashboardViewsTableName)
            .responseOnce([dashboardViewEntry]);
        tracker.on
            .insert(DashboardTilesTableName)
            .responseOnce([
                dashboardTileEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);
        tracker.on.select(SavedChartsTableName).responseOnce([savedChartEntry]);
        tracker.on.insert(DashboardTileChartTableName).responseOnce([]);
        tracker.on.insert(DashboardTileLoomsTableName).responseOnce([]);
        tracker.on.insert(DashboardTileMarkdownsTableName).responseOnce([]);
        tracker.on.update(DashboardViewsTableName).responseOnce([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithAllTiles,
            user,
            projectUuid,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(6);
        expect(tracker.history.insert[0]).toMatchObject({
            sql: expect.stringContaining(DashboardVersionsTableName),
            bindings: expect.arrayContaining([
                dashboardEntry.dashboard_id,
                user.userUuid,
            ]),
        });
        expect(tracker.history.insert[1]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                JSON.stringify(addDashboardVersionWithAllTiles.filters),
                'Default',
            ]),
        });
        expect(tracker.history.insert[2]).toMatchObject({
            sql: expect.stringContaining(DashboardTilesTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                addDashboardVersionWithAllTiles.tiles[0].h,
                addDashboardVersionWithAllTiles.tiles[0].type,
                addDashboardVersionWithAllTiles.tiles[0].w,
                addDashboardVersionWithAllTiles.tiles[0].x,
                addDashboardVersionWithAllTiles.tiles[0].y,
                addDashboardVersionWithAllTiles.tiles[1].h,
                addDashboardVersionWithAllTiles.tiles[1].type,
                addDashboardVersionWithAllTiles.tiles[1].w,
                addDashboardVersionWithAllTiles.tiles[1].x,
                addDashboardVersionWithAllTiles.tiles[1].y,
                addDashboardVersionWithAllTiles.tiles[2].h,
                addDashboardVersionWithAllTiles.tiles[2].type,
                addDashboardVersionWithAllTiles.tiles[2].w,
                addDashboardVersionWithAllTiles.tiles[2].x,
                addDashboardVersionWithAllTiles.tiles[2].y,
            ]),
        });
        expect(tracker.history.insert[3]).toMatchObject({
            sql: expect.stringContaining(DashboardTileChartTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                savedChartEntry.saved_query_id,
            ]),
        });
        expect(tracker.history.insert[4]).toMatchObject({
            sql: expect.stringContaining(DashboardTileLoomsTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                savedChartEntry.saved_query_id,
            ]),
        });
        expect(tracker.history.insert[5]).toMatchObject({
            sql: expect.stringContaining(DashboardTileMarkdownsTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                (
                    addDashboardVersionWithAllTiles
                        .tiles[2] as CreateDashboardMarkdownTile
                ).properties.content,
                dashboardVersionEntry.dashboard_version_id,
                (
                    addDashboardVersionWithAllTiles
                        .tiles[2] as CreateDashboardMarkdownTile
                ).properties.title,
            ]),
        });
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.update[0]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                addDashboardVersionWithAllTiles.filters,
                dashboardVersionEntry.dashboard_version_id,
            ]),
        });
    });
    test('should create dashboard version with ids', async () => {
        tracker.on.select(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on.select(SpaceTableName).responseOnce([spaceEntry]);
        tracker.on.insert(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on
            .insert(DashboardVersionsTableName)
            .responseOnce([dashboardVersionEntry]);
        tracker.on
            .insert(DashboardViewsTableName)
            .responseOnce([dashboardViewEntry]);
        tracker.on
            .insert(DashboardTilesTableName)
            .responseOnce([
                dashboardTileEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);
        tracker.on.select(SavedChartsTableName).responseOnce([savedChartEntry]);
        tracker.on.insert(DashboardTileChartTableName).responseOnce([]);
        tracker.on.update(DashboardViewsTableName).responseOnce([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithTileIds,
            user,
            projectUuid,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(4);
        expect(tracker.history.insert[0]).toMatchObject({
            sql: expect.stringContaining(DashboardVersionsTableName),
            bindings: expect.arrayContaining([
                dashboardEntry.dashboard_id,
                user.userUuid,
            ]),
        });
        expect(tracker.history.insert[1]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                JSON.stringify(addDashboardVersionWithTileIds.filters),
                'Default',
            ]),
        });
        expect(tracker.history.insert[2]).toMatchObject({
            sql: expect.stringContaining(DashboardTilesTableName),
            bindings: expect.arrayContaining([
                addDashboardVersionWithTileIds.tiles[0].uuid,
                dashboardVersionEntry.dashboard_version_id,
                addDashboardVersionWithTileIds.tiles[0].h,
                addDashboardVersionWithTileIds.tiles[0].type,
                addDashboardVersionWithTileIds.tiles[0].w,
                addDashboardVersionWithTileIds.tiles[0].x,
                addDashboardVersionWithTileIds.tiles[0].y,
            ]),
        });
        expect(tracker.history.insert[3]).toMatchObject({
            sql: expect.stringContaining(DashboardTileChartTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                savedChartEntry.saved_query_id,
            ]),
        });
        expect(tracker.history.update[0]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                addDashboardVersionWithTileIds.filters,
                dashboardVersionEntry.dashboard_version_id,
            ]),
        });
    });

    test('should create dashboard version without a chart', async () => {
        tracker.on.select(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on.select(SpaceTableName).responseOnce([spaceEntry]);
        tracker.on.insert(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on
            .insert(DashboardVersionsTableName)
            .responseOnce([dashboardVersionEntry]);
        tracker.on
            .insert(DashboardViewsTableName)
            .responseOnce([dashboardViewEntry]);
        tracker.on
            .insert(DashboardTilesTableName)
            .responseOnce([
                dashboardTileEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);
        tracker.on.select(SavedChartsTableName).responseOnce([savedChartEntry]);
        tracker.on.insert(DashboardTileChartTableName).responseOnce([]);
        tracker.on.update(DashboardViewsTableName).responseOnce([]);

        jest.spyOn(model, 'getById').mockImplementationOnce(() =>
            Promise.resolve(expectedDashboard),
        );

        await model.addVersion(
            expectedDashboard.uuid,
            addDashboardVersionWithoutChart,
            user,
            projectUuid,
        );

        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(4);
        expect(tracker.history.insert[0]).toMatchObject({
            sql: expect.stringContaining(DashboardVersionsTableName),
            bindings: expect.arrayContaining([
                dashboardEntry.dashboard_id,
                user.userUuid,
            ]),
        });
        expect(tracker.history.insert[1]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                JSON.stringify(addDashboardVersionWithoutChart.filters),
                'Default',
            ]),
        });
        expect(tracker.history.insert[2]).toMatchObject({
            sql: expect.stringContaining(DashboardTilesTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                addDashboardVersionWithoutChart.tiles[0].h,
                addDashboardVersionWithoutChart.tiles[0].type,
                addDashboardVersionWithoutChart.tiles[0].w,
                addDashboardVersionWithoutChart.tiles[0].x,
                addDashboardVersionWithoutChart.tiles[0].y,
            ]),
        });
        expect(tracker.history.insert[3]).toMatchObject({
            sql: expect.stringContaining(DashboardTileChartTableName),
            bindings: expect.arrayContaining([
                dashboardVersionEntry.dashboard_version_id,
                null,
            ]),
        });
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.update[0]).toMatchObject({
            sql: expect.stringContaining(DashboardViewsTableName),
            bindings: expect.arrayContaining([
                addDashboardVersionWithoutChart.filters,
                dashboardVersionEntry.dashboard_version_id,
            ]),
        });
    });

    test("should error on create dashboard version if saved chart isn't found", async () => {
        tracker.on.select(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on.select(SpaceTableName).responseOnce([spaceEntry]);
        tracker.on.insert(DashboardsTableName).responseOnce([dashboardEntry]);
        tracker.on
            .insert(DashboardVersionsTableName)
            .responseOnce([dashboardVersionEntry]);
        tracker.on
            .insert(DashboardViewsTableName)
            .responseOnce([dashboardViewEntry]);
        tracker.on
            .insert(DashboardTilesTableName)
            .responseOnce([
                dashboardTileEntry,
                loomTileEntry,
                markdownTileEntry,
            ]);
        tracker.on.select(SavedChartsTableName).responseOnce([]); // simulate saved charts not found

        await expect(
            model.addVersion(
                expectedDashboard.uuid,
                addDashboardVersion,
                user,
                projectUuid,
            ),
        ).rejects.toThrowError(NotFoundError);
    });
});
