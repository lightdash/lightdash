import {
    AnyType,
    Change,
    CompiledDimension,
    CompiledMetric,
    CreatePostgresCredentials,
    DimensionType,
    ExploreType,
    FieldType,
    MetricType,
} from '@lightdash/common';
import knex from 'knex';
import { MockClient, RawQuery, Tracker, getTracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import isEqual from 'lodash/isEqual';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    CachedExploreTableName,
    CachedExploresTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { ChangesetModel } from '../ChangesetModel';
import { ProjectModel } from './ProjectModel';
import {
    CompletePostgresCredentials,
    IncompletePostgresCredentialsWithoutSecrets,
    encryptionUtilMock,
    expectedProject,
    expectedTablesConfiguration,
    exploreWithMetricFilters,
    exploresWithSameName,
    mockExploreWithOutdatedMetricFilters,
    projectMock,
    projectUuid,
    tableSelectionMock,
    updateTableSelectionMock,
} from './ProjectModel.mock';

function queryMatcher(
    tableName: string,
    params: AnyType[] = [],
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
    const database = knex({ client: MockClient, dialect: 'pg' });

    const model = new ProjectModel({
        database,
        changesetModel: new ChangesetModel({ database }),
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
        // TODO: this test is skipped because there is an issue in our version of knex-mock-client
        // which makes it not handle batch inserts correctly. If we upgrade to a newer version,
        // we can remove the skip. There are a lot of breaking changes in the new version though.
        test.skip('should discard explores with duplicate name', async () => {
            // Mock for selecting custom explores/virtual views
            tracker.on
                .select(
                    queryMatcher(CachedExploreTableName, [
                        projectUuid,
                        ExploreType.VIRTUAL,
                    ]),
                )
                .response([]);

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

            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(2);
        });
    });

    describe('mergeMissingWarehouseSecrets', () => {
        test('should merge secrets when key is missing', async () => {
            const result = ProjectModel.mergeMissingWarehouseSecrets(
                IncompletePostgresCredentialsWithoutSecrets as CreatePostgresCredentials,
                CompletePostgresCredentials,
            );
            expect(result.user).toEqual(CompletePostgresCredentials.user);
            expect(result.password).toEqual(
                CompletePostgresCredentials.password,
            );
        });
        test('should merge secrets when value is undefined or value is empty string', async () => {
            const newConfig = {
                ...IncompletePostgresCredentialsWithoutSecrets,
                user: undefined,
                password: '',
            };
            const result = ProjectModel.mergeMissingWarehouseSecrets(
                newConfig as unknown as CreatePostgresCredentials,
                CompletePostgresCredentials,
            );
            expect(result.user).toEqual(CompletePostgresCredentials.user);
            expect(result.password).toEqual(
                CompletePostgresCredentials.password,
            );
        });
        test('should NOT merge secrets when value is null or non empty string', async () => {
            const newConfig = {
                ...IncompletePostgresCredentialsWithoutSecrets,
                user: null,
                password: 'new_password',
            };
            const result = ProjectModel.mergeMissingWarehouseSecrets(
                newConfig as unknown as CreatePostgresCredentials,
                CompletePostgresCredentials,
            );
            expect(result.user).toEqual(null);
            expect(result.password).toEqual('new_password');
        });
    });

    describe('removing sensitive credentials from API', () => {
        test('should remove sensitive credentials like token and refreshToken', async () => {
            tracker.on
                .select(queryMatcher(ProjectTableName, [projectUuid]))
                .response([projectMock]);

            const project = await model.get(projectUuid);

            // Verify that sensitive fields are not present in the returned project
            expect(project.warehouseConnection).toBeDefined();
            expect(
                (project.warehouseConnection as AnyType).token,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).refreshToken,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).password,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).keyfileContents,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).personalAccessToken,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).privateKey,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).privateKeyPass,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).sshTunnelPrivateKey,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).sslcert,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).sslkey,
            ).toBeUndefined();
            expect(
                (project.warehouseConnection as AnyType).sslrootcert,
            ).toBeUndefined();
        });
    });
});
