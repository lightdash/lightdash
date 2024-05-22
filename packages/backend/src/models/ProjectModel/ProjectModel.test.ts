import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import isEqual from 'lodash/isEqual';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CatalogTableName } from '../../database/entities/catalog';
import {
    CachedExploresTableName,
    CachedExploreTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { ProjectModel } from './ProjectModel';
import {
    encryptionUtilMock,
    expectedProject,
    expectedTablesConfiguration,
    exploresWithSameName,
    exploreWithMetricFilters,
    mockExploreWithOutdatedMetricFilters,
    projectMock,
    projectUuid,
    tableSelectionMock,
    updateTableSelectionMock,
} from './ProjectModel.mock';

function queryMatcher(
    tableName: string,
    params: any[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && isEqual(bindings[index], arg),
            true,
        );
}

describe('ProjectModel', () => {
    const model = new ProjectModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: encryptionUtilMock,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });
    test('should get project with no sensitive properties', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([projectMock]);

        const project = await model.get(projectUuid);
        expect(project).toEqual(expectedProject);
        expect(tracker.history.select).toHaveLength(1);
    });
    test('should get project tables configuration', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([tableSelectionMock]);

        const result = await model.getTablesConfiguration(projectUuid);

        expect(result).toEqual(expectedTablesConfiguration);
        expect(tracker.history.select).toHaveLength(1);
    });
    test('should update project tables configuration', async () => {
        tracker.on
            .update(
                queryMatcher(ProjectTableName, [
                    updateTableSelectionMock.tableSelection.type,
                    updateTableSelectionMock.tableSelection.value,
                    projectUuid,
                ]),
            )
            .response([]);

        await model.updateTablesConfiguration(
            projectUuid,
            updateTableSelectionMock,
        );

        expect(tracker.history.update).toHaveLength(1);
    });

    describe('should convert outdated metric filters in explores', () => {
        test('should add fieldRef property when metric filters have fieldId', () => {
            expect(
                ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                    mockExploreWithOutdatedMetricFilters,
                ),
            ).toEqual(exploreWithMetricFilters);
        });
        test('should keep fieldRef property when metric filters have fieldRef', () => {
            expect(
                ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                    exploreWithMetricFilters,
                ),
            ).toEqual(exploreWithMetricFilters);
        });
    });

    describe('saveExploresToCache', () => {
        test('should discard explores with duplicate name', async () => {
            tracker.on
                .delete(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([]);
            tracker.on
                .insert(
                    queryMatcher(CachedExploreTableName, [
                        JSON.stringify(exploresWithSameName[0]),
                        exploresWithSameName[0].name,
                        projectUuid,
                        [],
                    ]),
                )
                .response([]);
            tracker.on
                .insert(
                    queryMatcher(CachedExploresTableName, [
                        JSON.stringify([exploresWithSameName[0]]),
                        projectUuid,
                    ]),
                )
                .response([]);

            await model.saveExploresToCache(projectUuid, exploresWithSameName);
            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(2);
        });
    });
});
