import {
    AnyType,
    AthenaAuthenticationType,
    Change,
    CompiledDimension,
    CompiledMetric,
    CreateAthenaCredentials,
    CreatePostgresCredentials,
    DimensionType,
    ExploreType,
    FieldType,
    MetricType,
    SpaceMemberRole,
    WarehouseTypes,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import isEqual from 'lodash/isEqual';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    CachedExploresTableName,
    CachedExploreTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import {
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../../database/entities/spaces';
import { ChangesetModel } from '../ChangesetModel';
import { ProjectModel } from './ProjectModel';
import {
    CompletePostgresCredentials,
    encryptionUtilMock,
    expectedProject,
    expectedTablesConfiguration,
    exploresWithSameName,
    exploreWithMetricFilters,
    IncompletePostgresCredentialsWithoutSecrets,
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

        test('should NOT merge Athena access keys when authenticationType is iam_role', async () => {
            const incompleteAthenaCredentials: CreateAthenaCredentials = {
                type: WarehouseTypes.ATHENA,
                region: 'us-east-1',
                database: 'AwsDataCatalog',
                schema: 'default',
                s3StagingDir: 's3://test-results/',
                authenticationType: AthenaAuthenticationType.IAM_ROLE,
            };

            const completeAthenaCredentials: CreateAthenaCredentials = {
                ...incompleteAthenaCredentials,
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                accessKeyId: 'AKIATEST',
                secretAccessKey: 'SECRETTEST',
            };

            const result = ProjectModel.mergeMissingWarehouseSecrets(
                incompleteAthenaCredentials,
                completeAthenaCredentials,
            );

            expect(result.accessKeyId).toBeUndefined();
            expect(result.secretAccessKey).toBeUndefined();
            expect(result.authenticationType).toEqual(
                AthenaAuthenticationType.IAM_ROLE,
            );
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

    describe('updateDefaultUserSpaces', () => {
        test('should only set the flag when disabling', async () => {
            tracker.on
                .update(queryMatcher(ProjectTableName, [false, projectUuid]))
                .response(1);

            await model.updateDefaultUserSpaces(projectUuid, false);

            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.update[0].sql).toContain(ProjectTableName);
            // No inserts or selects for spaces
            expect(tracker.history.insert).toHaveLength(0);
        });

        test('should create parent space when enabling and none exists', async () => {
            const matchSql =
                (table: string) =>
                ({ sql }: RawQuery) =>
                    sql.includes(table);

            // 1. Update project flag (returning project_id)
            tracker.on
                .update(matchSql(ProjectTableName))
                .response([{ project_id: 1, organization_id: 10 }]);

            // 2. Look for existing "Default User Spaces" parent — not found
            tracker.on.select(matchSql(SpaceTableName)).responseOnce(undefined);

            // 3. Slug uniqueness check
            tracker.on.select(matchSql(SpaceTableName)).responseOnce([]);

            // 4. Insert the new parent space
            tracker.on.insert(matchSql(SpaceTableName)).response([
                {
                    space_uuid: 'new-parent-uuid',
                    path: 'default_user_spaces',
                },
            ]);

            await model.updateDefaultUserSpaces(projectUuid, true);

            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].sql).toContain(SpaceTableName);
        });

        test('should not create parent when one already exists', async () => {
            const matchSql =
                (table: string) =>
                ({ sql }: RawQuery) =>
                    sql.includes(table);

            // 1. Update project flag
            tracker.on
                .update(matchSql(ProjectTableName))
                .response([{ project_id: 1, organization_id: 10 }]);

            // 2. Existing parent found
            tracker.on.select(matchSql(SpaceTableName)).response({
                space_uuid: 'existing-parent-uuid',
                path: 'default_user_spaces',
            });

            await model.updateDefaultUserSpaces(projectUuid, true);

            expect(tracker.history.update).toHaveLength(1);
            // No insert because parent already exists
            expect(tracker.history.insert).toHaveLength(0);
        });
    });

    describe('ensureDefaultUserSpace', () => {
        const parentSpaceUuid = 'parent-space-uuid';
        const parentPath = 'default_user_spaces';
        const testUser = {
            userId: 42,
            userUuid: 'user-uuid-1234',
            firstName: 'Jane',
            lastName: 'Doe',
        };

        const matchSql =
            (table: string) =>
            ({ sql }: RawQuery) =>
                sql.includes(table);

        test('should return early if user already has a default space', async () => {
            tracker.on
                .select(matchSql(SpaceTableName))
                .response({ space_uuid: 'existing-space-uuid' });

            await model.ensureDefaultUserSpace(
                1,
                parentSpaceUuid,
                parentPath,
                testUser,
            );

            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(0);
        });

        test('should create space and grant ADMIN access for new user', async () => {
            // 1. No existing default space
            tracker.on.select(matchSql(SpaceTableName)).responseOnce(undefined);

            // 2. Slug uniqueness check
            tracker.on.select(matchSql(SpaceTableName)).responseOnce([]);

            // 3. Insert the user space
            tracker.on
                .insert(matchSql(SpaceTableName))
                .response([{ space_uuid: 'new-space-uuid' }]);

            // 4. Grant ADMIN access
            tracker.on.insert(matchSql(SpaceUserAccessTableName)).response([]);

            await model.ensureDefaultUserSpace(
                1,
                parentSpaceUuid,
                parentPath,
                testUser,
            );

            expect(tracker.history.insert).toHaveLength(2);

            // Verify space insert contains expected values
            expect(tracker.history.insert[0].sql).toContain(SpaceTableName);
            expect(tracker.history.insert[0].bindings).toEqual(
                expect.arrayContaining([
                    'Jane Doe', // space name
                    true, // is_default_user_space
                    false, // is_private
                    parentSpaceUuid,
                ]),
            );

            // Verify access grant
            expect(tracker.history.insert[1].sql).toContain(
                SpaceUserAccessTableName,
            );
            expect(tracker.history.insert[1].bindings).toEqual(
                expect.arrayContaining([
                    'new-space-uuid',
                    testUser.userUuid,
                    SpaceMemberRole.ADMIN,
                ]),
            );
        });

        test('should use UUID fallback when user has no name', async () => {
            const namelessUser = {
                userId: 43,
                userUuid: 'abcdef12-0000-0000-0000-000000000000',
                firstName: '',
                lastName: '',
            };

            // 1. No existing default space
            tracker.on.select(matchSql(SpaceTableName)).responseOnce(undefined);

            // 2. Slug uniqueness check
            tracker.on.select(matchSql(SpaceTableName)).responseOnce([]);

            // 3. Insert the user space
            tracker.on
                .insert(matchSql(SpaceTableName))
                .response([{ space_uuid: 'new-space-uuid' }]);

            // 4. Grant ADMIN access
            tracker.on.insert(matchSql(SpaceUserAccessTableName)).response([]);

            await model.ensureDefaultUserSpace(
                1,
                parentSpaceUuid,
                parentPath,
                namelessUser,
            );

            // Verify the name fallback: "User abcdef12"
            expect(tracker.history.insert[0].bindings).toEqual(
                expect.arrayContaining(['User abcdef12']),
            );
        });

        test('should not grant access if insert was a no-op (race condition)', async () => {
            // 1. No existing default space
            tracker.on.select(matchSql(SpaceTableName)).responseOnce(undefined);

            // 2. Slug uniqueness check
            tracker.on.select(matchSql(SpaceTableName)).responseOnce([]);

            // 3. Insert returns empty (onConflict().ignore())
            tracker.on.insert(matchSql(SpaceTableName)).response([]);

            await model.ensureDefaultUserSpace(
                1,
                parentSpaceUuid,
                parentPath,
                testUser,
            );

            // Only the space insert, no access grant
            expect(tracker.history.insert).toHaveLength(1);
        });
    });
});
