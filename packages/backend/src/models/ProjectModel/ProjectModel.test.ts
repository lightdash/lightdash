import {
    AnyType,
    AthenaAuthenticationType,
    CompiledDimension,
    CompiledMetric,
    CreateAthenaCredentials,
    CreateDatabricksCredentials,
    CreateDuckdbMotherduckCredentials,
    CreatePostgresCredentials,
    CreateSnowflakeCredentials,
    CreateWarehouseCredentials,
    DatabricksAuthenticationType,
    DbtCloudIDEProjectConfig,
    DbtGithubProjectConfig,
    DbtProjectType,
    DimensionType,
    DuckdbConnectionType,
    ExploreType,
    FieldType,
    MetricType,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    ServiceAccountScope,
    SpaceMemberRole,
    USER_MANAGED_EXPLORE_TYPES,
    WarehouseTypes,
} from '@lightdash/common';
import { MotherduckInstanceCache } from '@lightdash/warehouses';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import isEqual from 'lodash/isEqual';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { OrganizationMembershipCustomRolesTableName } from '../../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import { ProjectGroupAccessTableName } from '../../database/entities/projectGroupAccess';
import { ProjectGroupAccessCustomRolesTableName } from '../../database/entities/projectGroupAccessCustomRoles';
import { ProjectMembershipCustomRolesTableName } from '../../database/entities/projectMembershipCustomRoles';
import { ProjectMembershipsTableName } from '../../database/entities/projectMemberships';
import { ProjectMergedManifestsTableName } from '../../database/entities/projectMergedManifests';
import {
    CachedExploresTableName,
    CachedExploreTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SavedChartSlugMappingsTableName } from '../../database/entities/savedChartSlugMappings';
import {
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../../database/entities/spaces';
import { ServiceAccountsTableName } from '../../ee/database/entities/serviceAccounts';
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
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: encryptionUtilMock,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
        vi.restoreAllMocks();
    });
    test('should get project with no sensitive properties', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([projectMock]);

        const project = await model.get(projectUuid);
        expect(project).toEqual(expectedProject);
        expect(tracker.history.select).toHaveLength(1);
    });
    test('should get the primary dbt source identity', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([
                {
                    dbt_source_uuid: 'dbt-source-uuid',
                    dbt_source_name: 'dbt_project',
                },
            ]);

        await expect(model.getDbtSourceIdentity(projectUuid)).resolves.toEqual({
            dbtSourceUuid: 'dbt-source-uuid',
            dbtSourceName: 'dbt_project',
        });
    });
    test('should use the project uuid when the primary dbt source uuid is null', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([
                {
                    project_uuid: projectUuid,
                    dbt_source_uuid: null,
                    dbt_source_name: 'dbt_project',
                },
            ]);

        await expect(model.getDbtSourceIdentity(projectUuid)).resolves.toEqual({
            dbtSourceUuid: projectUuid,
            dbtSourceName: 'dbt_project',
        });
    });
    test('should throw when getting the dbt source identity for a missing project', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([]);

        await expect(
            model.getDbtSourceIdentity(projectUuid),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
    test('should get project tables configuration', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([tableSelectionMock]);

        const result = await model.getTablesConfiguration(projectUuid);

        expect(result).toEqual(expectedTablesConfiguration);
        expect(tracker.history.select).toHaveLength(1);
    });
    describe('getExploreFromCache', () => {
        const createQualifiedExplore = (name: string) => ({
            ...exploreWithMetricFilters,
            name,
            label: name,
            baseTable: name,
            tables: {
                [name]: {
                    ...exploreWithMetricFilters.tables.payments,
                    name,
                    originalName: 'orders',
                },
            },
        });

        test('returns a structured error when an explore was split', async () => {
            const sourceAExplore = createQualifiedExplore('sourceA__orders');
            const sourceBExplore = createQualifiedExplore('sourceB__orders');
            const bystanderExplore = createQualifiedExplore(
                'orders_with_custom_dims',
            );
            const findExploresFromCache = vi
                .spyOn(model, 'findExploresFromCache')
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({
                    [sourceAExplore.name]: sourceAExplore,
                    [sourceBExplore.name]: sourceBExplore,
                    [bystanderExplore.name]: bystanderExplore,
                });

            await expect(
                model.getExploreFromCache(projectUuid, 'orders'),
            ).rejects.toMatchObject({
                name: 'NotFoundError',
                statusCode: 404,
                data: {
                    exploreName: 'orders',
                    candidateExploreNames: [
                        'sourceA__orders',
                        'sourceB__orders',
                    ],
                },
            });
            expect(findExploresFromCache).toHaveBeenCalledTimes(2);
        });

        test('keeps the plain not found error when no split candidates exist', async () => {
            const findExploresFromCache = vi
                .spyOn(model, 'findExploresFromCache')
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({
                    payments: exploreWithMetricFilters,
                });

            await expect(
                model.getExploreFromCache(projectUuid, 'orders'),
            ).rejects.toEqual(
                new NotFoundError('Explore "orders" does not exist.'),
            );
            expect(findExploresFromCache).toHaveBeenCalledTimes(2);
        });

        test('keeps the plain not found error for one original-name match', async () => {
            const sourceAExplore = createQualifiedExplore('sourceA__orders');
            vi.spyOn(model, 'findExploresFromCache')
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({
                    [sourceAExplore.name]: sourceAExplore,
                });

            await expect(
                model.getExploreFromCache(projectUuid, 'orders'),
            ).rejects.toEqual(
                new NotFoundError('Explore "orders" does not exist.'),
            );
        });
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

    describe('merged manifest', () => {
        test('inserts and atomically replaces the project artifact', async () => {
            const firstManifest = Buffer.from('first');
            const secondManifest = Buffer.from('second');
            tracker.on
                .insert(({ sql }) =>
                    sql.includes(ProjectMergedManifestsTableName),
                )
                .response([]);

            await model.upsertMergedManifest(projectUuid, firstManifest);
            await model.upsertMergedManifest(projectUuid, secondManifest);

            expect(tracker.history.insert).toHaveLength(2);
            expect(tracker.history.insert[0].sql).toContain(
                'on conflict ("project_uuid") do update',
            );
            expect(tracker.history.insert[0].bindings).toEqual(
                expect.arrayContaining([projectUuid, firstManifest]),
            );
            expect(tracker.history.insert[1].bindings).toEqual(
                expect.arrayContaining([projectUuid, secondManifest]),
            );
        });

        test('returns the stored gzip bytes', async () => {
            const storedManifest = Buffer.from('stored');
            tracker.on
                .select(({ sql }) =>
                    sql.includes(ProjectMergedManifestsTableName),
                )
                .response([{ manifest: storedManifest }]);

            await expect(model.getMergedManifest(projectUuid)).resolves.toEqual(
                storedManifest,
            );
        });

        test('reports when the project has no stored manifest', async () => {
            tracker.on
                .select(({ sql }) =>
                    sql.includes(ProjectMergedManifestsTableName),
                )
                .response([]);

            await expect(model.getMergedManifest(projectUuid)).rejects.toThrow(
                'No merged dbt manifest has been persisted for this project',
            );
        });

        test('deletes the stored manifest for a project', async () => {
            tracker.on
                .delete(({ sql }) =>
                    sql.includes(ProjectMergedManifestsTableName),
                )
                .response(1);

            await model.deleteMergedManifest(projectUuid);

            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.delete[0].bindings).toEqual([projectUuid]);
        });
    });

    test('invalidates the previous MotherDuck connection after a credential update', async () => {
        const previousCredentials: CreateDuckdbMotherduckCredentials = {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'analytics',
            schema: 'main',
            token: 'previous-token',
        };
        const nextCredentials = {
            ...previousCredentials,
            token: 'next-token',
        };
        vi.spyOn(model, 'getWarehouseCredentialsForProject').mockResolvedValue(
            previousCredentials,
        );
        const invalidate = vi
            .spyOn(MotherduckInstanceCache, 'invalidateByConnectionString')
            .mockImplementation(() => undefined);
        tracker.on
            .update(({ sql }) => sql.includes('projects'))
            .response([{ project_id: 1 }]);
        tracker.on
            .insert(({ sql }) => sql.includes('warehouse_credentials'))
            .response([]);

        await model.update(projectUuid, {
            name: expectedProject.name,
            dbtConnection: expectedProject.dbtConnection,
            dbtVersion: expectedProject.dbtVersion,
            warehouseConnection: nextCredentials,
        });

        expect(invalidate).toHaveBeenCalledWith(
            'md:analytics?motherduck_token=previous-token&saas_mode=true',
            'credentials_updated',
        );
    });

    test('updates a project that was created without warehouse credentials', async () => {
        vi.spyOn(model, 'getWarehouseCredentialsForProject').mockRejectedValue(
            new NotFoundError('Cannot find any warehouse credentials'),
        );
        const invalidate = vi
            .spyOn(MotherduckInstanceCache, 'invalidateByConnectionString')
            .mockImplementation(() => undefined);
        tracker.on
            .update(({ sql }) => sql.includes('projects'))
            .response([{ project_id: 1 }]);
        tracker.on
            .insert(({ sql }) => sql.includes('warehouse_credentials'))
            .response([]);

        await model.update(projectUuid, {
            name: expectedProject.name,
            dbtConnection: expectedProject.dbtConnection,
            dbtVersion: expectedProject.dbtVersion,
            warehouseConnection: {
                type: WarehouseTypes.BIGQUERY,
            } as CreateWarehouseCredentials,
        });

        expect(
            tracker.history.insert.some(({ sql }) =>
                sql.includes('warehouse_credentials'),
            ),
        ).toBe(true);
        expect(invalidate).not.toHaveBeenCalled();
    });

    test('checks project membership without requiring an email row', async () => {
        tracker.on
            .select(({ sql }) => sql.includes(ProjectMembershipsTableName))
            .response([{ user_id: 1 }]);

        await expect(
            model.hasProjectMembership(projectUuid, 'service-account-user'),
        ).resolves.toBe(true);
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).not.toContain('emails');
    });

    test('returns false when a user has no project membership', async () => {
        tracker.on
            .select(({ sql }) => sql.includes(ProjectMembershipsTableName))
            .response([]);

        await expect(
            model.hasProjectMembership(projectUuid, 'unassigned-user'),
        ).resolves.toBe(false);
    });

    test('copies only eligible project access in one idempotent transaction', async () => {
        const upstreamProjectUuid = 'upstream-project-uuid';
        const previewProjectUuid = 'preview-project-uuid';
        const matchSql =
            (table: string) =>
            ({ sql }: RawQuery) =>
                sql.includes(table);

        tracker.on.select(matchSql(ProjectTableName)).response([
            {
                project_id: 1,
                project_uuid: upstreamProjectUuid,
                organization_id: 10,
            },
            {
                project_id: 2,
                project_uuid: previewProjectUuid,
                organization_id: 10,
            },
        ]);
        tracker.on.select(matchSql(ProjectMembershipsTableName)).response([
            {
                user_id: 1,
                role: ProjectMemberRole.EDITOR,
                role_uuid: null,
                is_internal: false,
                organization_id: 10,
            },
            {
                user_id: 2,
                role: ProjectMemberRole.VIEWER,
                role_uuid: null,
                is_internal: false,
                organization_id: null,
            },
            {
                user_id: 3,
                role: ProjectMemberRole.VIEWER,
                role_uuid: null,
                is_internal: true,
                organization_id: 10,
            },
        ]);
        tracker.on.select(matchSql(ProjectGroupAccessTableName)).response([
            {
                group_uuid: 'group-uuid',
                role: ProjectMemberRole.VIEWER,
                role_uuid: null,
            },
        ]);
        tracker.on.insert(matchSql(ProjectMembershipsTableName)).response([]);
        tracker.on.insert(matchSql(ProjectGroupAccessTableName)).response([]);
        tracker.on
            .delete(matchSql(ProjectMembershipCustomRolesTableName))
            .response(0);
        tracker.on
            .delete(matchSql(ProjectGroupAccessCustomRolesTableName))
            .response(0);
        tracker.on
            .insert(matchSql(ProjectMembershipCustomRolesTableName))
            .response([]);
        tracker.on
            .insert(matchSql(ProjectGroupAccessCustomRolesTableName))
            .response([]);

        const copyAccess = () =>
            model.copyProjectAccess(upstreamProjectUuid, previewProjectUuid);
        const expectedResult = {
            userAccessCount: 1,
            skippedUserAccessCount: 2,
            groupAccessCount: 1,
        };

        await expect(copyAccess()).resolves.toEqual(expectedResult);
        await expect(copyAccess()).resolves.toEqual(expectedResult);

        const membershipInserts = tracker.history.insert.filter(({ sql }) =>
            sql.includes(`"${ProjectMembershipsTableName}"`),
        );
        const groupInserts = tracker.history.insert.filter(({ sql }) =>
            sql.includes(`"${ProjectGroupAccessTableName}"`),
        );
        const extraRoleInserts = tracker.history.insert.filter(
            ({ sql }) =>
                sql.includes(ProjectMembershipCustomRolesTableName) ||
                sql.includes(ProjectGroupAccessCustomRolesTableName),
        );
        expect(membershipInserts).toHaveLength(2);
        expect(groupInserts).toHaveLength(2);
        expect(extraRoleInserts).toHaveLength(4);
        expect(membershipInserts[0].bindings).toEqual(
            expect.arrayContaining([1, 2, ProjectMemberRole.EDITOR]),
        );
        expect(membershipInserts[0].bindings).not.toContain(3);
        expect(membershipInserts[0].sql).toContain('on conflict');
        expect(groupInserts[0].sql).toContain('on conflict');
        // extra custom roles are copied from upstream (1) into preview (2) for the eligible user only
        expect(extraRoleInserts[0].bindings).toEqual(
            expect.arrayContaining([2, 1, [1]]),
        );
        const groupAccessQuery = tracker.history.select.find(({ sql }) =>
            sql.includes(ProjectGroupAccessTableName),
        );
        expect(groupAccessQuery?.sql).toContain('groups');
        expect(groupAccessQuery?.bindings).toContain(10);
    });

    test('updateProjectAccess clears extra custom roles for every updated membership', async () => {
        tracker.on
            .any(/UPDATE project_memberships/)
            .response({ rows: [{ project_id: 5, user_id: 7 }] });
        tracker.on
            .delete(({ sql }: RawQuery) =>
                sql.includes(ProjectMembershipCustomRolesTableName),
            )
            .response(0);

        await model.updateProjectAccess(
            projectUuid,
            'user-uuid',
            ProjectMemberRole.EDITOR,
        );

        const [clear] = tracker.history.delete;
        expect(clear.sql).toContain(ProjectMembershipCustomRolesTableName);
        expect(clear.bindings).toEqual([5, 7]);
    });

    test('copies chart aliases to the mapped preview chart UUIDs only', async () => {
        tracker.on.select(SavedChartSlugMappingsTableName).responseOnce([
            { saved_query_uuid: 'source-chart-1', slug: 'old-chart-1' },
            { saved_query_uuid: 'source-chart-2', slug: 'old-chart-2' },
        ]);
        tracker.on.insert(SavedChartSlugMappingsTableName).responseOnce([]);

        await model.copyChartSlugMappingsToPreview(
            database,
            'source-project',
            'preview-project',
            [
                {
                    sourceChartUuid: 'source-chart-1',
                    previewChartUuid: 'preview-chart-1',
                },
                {
                    sourceChartUuid: 'source-chart-2',
                    previewChartUuid: 'preview-chart-2',
                },
            ],
        );

        const [selectQuery] = tracker.history.select;
        expect(selectQuery.bindings).toEqual(
            expect.arrayContaining([
                'source-project',
                'source-chart-1',
                'source-chart-2',
            ]),
        );
        const [insertQuery] = tracker.history.insert;
        expect(insertQuery.bindings).toEqual(
            expect.arrayContaining([
                'preview-project',
                'preview-chart-1',
                'old-chart-1',
                'preview-chart-2',
                'old-chart-2',
            ]),
        );
        expect(insertQuery.bindings).not.toContain('source-chart-1');
        expect(insertQuery.bindings).not.toContain('source-chart-2');
    });

    test('resolves the original chart UUID from preview content mapping', async () => {
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_id: 22 }]);
        tracker.on.select('preview_content').responseOnce([
            {
                project_uuid: 'source-project',
                content_mapping: {
                    charts: [{ id: 11, newId: 22 }],
                    chartVersions: [],
                    spaces: [],
                    dashboards: [],
                    dashboardVersions: [],
                    savedSql: [],
                    savedSqlVersions: [],
                    aiAgents: [],
                },
            },
        ]);
        tracker.on
            .select(SavedChartsTableName)
            .responseOnce([{ saved_query_uuid: 'source-chart-uuid' }]);

        await expect(
            model.getUpstreamChartUuidFromPreview(
                'preview-project',
                'preview-chart-uuid',
            ),
        ).resolves.toBe('source-chart-uuid');

        expect(tracker.history.select[2].bindings).toEqual(
            expect.arrayContaining(['source-project', 11]),
        );
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

    describe('findExploreContainingTable', () => {
        test('returns an explore containing a joined-only table', async () => {
            tracker.on
                .select(
                    queryMatcher(CachedExploreTableName, [
                        'orders',
                        'orders',
                        projectUuid,
                        1,
                    ]),
                )
                .response([
                    {
                        explore: exploreWithMetricFilters,
                        baseMatch: false,
                    },
                ]);

            await expect(
                model.findExploreContainingTable(projectUuid, 'orders'),
            ).resolves.toEqual(exploreWithMetricFilters);
        });
    });

    describe('saveExploresToCache', () => {
        test('preserves cached explores when the payload is not explicitly complete', async () => {
            const cachedExplore = exploresWithSameName[0];
            const incomingExplore = {
                ...cachedExplore,
                name: 'incoming_explore',
            };
            const virtualView = {
                ...cachedExplore,
                name: 'virtual_view',
                type: ExploreType.VIRTUAL,
            };

            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response([
                    { explore: cachedExplore },
                    { explore: virtualView },
                ]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explore"'))
                .response([{ cached_explore_uuid: 'incoming-uuid' }]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);

            await model.saveExploresToCache(projectUuid, [incomingExplore]);

            expect(tracker.history.delete).toHaveLength(0);
            expect(tracker.history.select).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ bindings: [projectUuid] }),
                ]),
            );
            expect(tracker.history.insert).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        sql: expect.stringContaining(
                            'on conflict ("name", "project_uuid")',
                        ),
                    }),
                    expect.objectContaining({
                        bindings: expect.arrayContaining([
                            JSON.stringify(incomingExplore),
                        ]),
                    }),
                ]),
            );
            // The cached explores are preserved by upserting the incoming row and deleting
            // nothing, rather than by rewriting a whole-set value. The only write to
            // cached_explores is the lock row, which carries an empty array.
            tracker.history.insert
                .filter(({ sql }) => sql.includes('"cached_explores"'))
                .forEach(({ bindings }) => {
                    expect(bindings).toEqual([[], projectUuid]);
                });
        });

        test('accepts an empty additive payload when cached explores exist', async () => {
            const cachedExplore = exploresWithSameName[0];

            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response([{ explore: cachedExplore }]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);

            await expect(
                model.saveExploresToCache(projectUuid, []),
            ).resolves.toEqual({ cachedExploreUuids: [] });
            expect(tracker.history.delete).toHaveLength(0);
        });

        test('rejects an empty additive payload when no cached explores exist', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response([]);

            await expect(
                model.saveExploresToCache(projectUuid, []),
            ).rejects.toThrow('No explores to save');
        });

        test('replaces absent cached explores only when explicitly complete', async () => {
            const cachedExplore = exploresWithSameName[0];
            const incomingExplore = {
                ...cachedExplore,
                name: 'incoming_explore',
            };
            const virtualView = {
                ...cachedExplore,
                name: 'incoming_explore',
                type: ExploreType.VIRTUAL,
            };

            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response([
                    { explore: cachedExplore },
                    { explore: virtualView },
                ]);
            tracker.on
                .delete(({ sql }) => sql.includes('"cached_explore"'))
                .response([]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explore"'))
                .response([{ cached_explore_uuid: 'virtual-uuid' }]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);

            await model.saveExploresToCache(
                projectUuid,
                [incomingExplore],
                true,
            );

            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.select).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        bindings: [
                            projectUuid,
                            [...USER_MANAGED_EXPLORE_TYPES],
                        ],
                    }),
                ]),
            );
            expect(tracker.history.insert).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        bindings: expect.arrayContaining([
                            JSON.stringify(virtualView),
                        ]),
                    }),
                ]),
            );
            tracker.history.insert
                .filter(({ sql }) => sql.includes('"cached_explores"'))
                .forEach(({ bindings }) => {
                    expect(bindings).toEqual([[], projectUuid]);
                });
        });

        // TODO: this test is skipped because there is an issue in our version of knex-mock-client
        // which makes it not handle batch inserts correctly. If we upgrade to a newer version,
        // we can remove the skip. There are a lot of breaking changes in the new version though.
        // oxlint-disable-next-line vitest-js/no-disabled-tests -- blocked on knex-mock-client upgrade, see TODO above
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

        test('should NOT merge Postgres secrets when the host changes', () => {
            const incompleteConfig = {
                ...CompletePostgresCredentials,
                host: 'attacker.example.com',
                user: undefined,
                password: undefined,
            } as unknown as CreatePostgresCredentials;

            const result = ProjectModel.mergeMissingWarehouseSecrets(
                incompleteConfig,
                CompletePostgresCredentials,
            );

            expect(result.user).toBeUndefined();
            expect(result.password).toBeUndefined();
        });

        test('should NOT merge Snowflake secrets when the access URL changes', () => {
            const completeConfig: CreateSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'saved-user',
                password: 'saved-password',
                database: 'database',
                warehouse: 'warehouse',
                schema: 'schema',
                accessUrl: 'https://account.snowflakecomputing.com',
            };
            const incompleteConfig = {
                ...completeConfig,
                user: undefined,
                password: undefined,
                accessUrl: 'https://attacker.example.com',
            } as unknown as CreateSnowflakeCredentials;

            const result = ProjectModel.mergeMissingWarehouseSecrets(
                incompleteConfig,
                completeConfig,
            );

            expect(result.user).toBeUndefined();
            expect(result.password).toBeUndefined();
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

        test('should NOT merge Databricks secrets when serverHostName changes', async () => {
            const completeDatabricksCredentials: CreateDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                database: 'default',
                serverHostName: 'adb-123.azuredatabricks.net',
                httpPath: '/sql/1.0/warehouses/abc',
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'client-id',
                oauthClientSecret: 'client-secret',
            };
            const incompleteDatabricksCredentials: CreateDatabricksCredentials =
                {
                    ...completeDatabricksCredentials,
                    serverHostName: 'other-host.example.com',
                    oauthClientId: undefined,
                    oauthClientSecret: undefined,
                };

            const result = ProjectModel.mergeMissingWarehouseSecrets(
                incompleteDatabricksCredentials,
                completeDatabricksCredentials,
            );

            expect(result.oauthClientId).toBeUndefined();
            expect(result.oauthClientSecret).toBeUndefined();
        });

        test('should merge Databricks secrets when serverHostName is unchanged', async () => {
            const completeDatabricksCredentials: CreateDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                database: 'default',
                serverHostName: 'adb-123.azuredatabricks.net',
                httpPath: '/sql/1.0/warehouses/abc',
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'client-id',
                oauthClientSecret: 'client-secret',
            };
            const incompleteDatabricksCredentials: CreateDatabricksCredentials =
                {
                    ...completeDatabricksCredentials,
                    serverHostName: 'https://ADB-123.AZUREDATABRICKS.NET/',
                    oauthClientId: undefined,
                    oauthClientSecret: undefined,
                };

            const result = ProjectModel.mergeMissingWarehouseSecrets(
                incompleteDatabricksCredentials,
                completeDatabricksCredentials,
            );

            expect(result.oauthClientId).toEqual('client-id');
            expect(result.oauthClientSecret).toEqual('client-secret');
        });
    });

    describe('mergeMissingDbtConfigSecrets', () => {
        test('should NOT merge the dbt Cloud API key when the discovery endpoint changes', () => {
            const completeConfig: DbtCloudIDEProjectConfig = {
                type: DbtProjectType.DBT_CLOUD_IDE,
                api_key: 'saved-api-key',
                environment_id: 'environment-id',
                discovery_api_endpoint: 'https://metadata.cloud.getdbt.com',
            };
            const incompleteConfig = {
                ...completeConfig,
                api_key: undefined,
                discovery_api_endpoint: 'https://attacker.example.com',
            } as unknown as DbtCloudIDEProjectConfig;

            const result = ProjectModel.mergeMissingDbtConfigSecrets(
                incompleteConfig,
                completeConfig,
            );

            if (result.type !== DbtProjectType.DBT_CLOUD_IDE) {
                throw new Error('Expected a dbt Cloud IDE config');
            }
            expect(result.api_key).toBeUndefined();
        });

        test('should NOT merge a GitHub token when the host domain changes', () => {
            const completeConfig: DbtGithubProjectConfig = {
                type: DbtProjectType.GITHUB,
                authorization_method: 'personal_access_token',
                personal_access_token: 'saved-token',
                installation_id: undefined,
                repository: 'lightdash/lightdash',
                branch: 'main',
                project_sub_path: '/',
                host_domain: 'github.com',
            };
            const incompleteConfig = {
                ...completeConfig,
                personal_access_token: undefined,
                host_domain: 'attacker.example.com',
            };

            const result = ProjectModel.mergeMissingDbtConfigSecrets(
                incompleteConfig,
                completeConfig,
            );

            if (result.type !== DbtProjectType.GITHUB) {
                throw new Error('Expected a GitHub config');
            }
            expect(result.personal_access_token).toBeUndefined();
        });

        test('should merge a GitHub token for a normalized-equivalent host domain', () => {
            const completeConfig: DbtGithubProjectConfig = {
                type: DbtProjectType.GITHUB,
                authorization_method: 'personal_access_token',
                personal_access_token: 'saved-token',
                installation_id: undefined,
                repository: 'lightdash/lightdash',
                branch: 'main',
                project_sub_path: '/',
                host_domain: 'github.com',
            };
            const incompleteConfig = {
                ...completeConfig,
                personal_access_token: undefined,
                host_domain: 'GITHUB.COM.',
            };

            const result = ProjectModel.mergeMissingDbtConfigSecrets(
                incompleteConfig,
                completeConfig,
            );

            if (result.type !== DbtProjectType.GITHUB) {
                throw new Error('Expected a GitHub config');
            }
            expect(result.personal_access_token).toEqual('saved-token');
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

        beforeEach(() => {
            tracker.on.select('pg_advisory_xact_lock').response({});
        });

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

    describe('getProjectGroupAccesses', () => {
        const groupUuid = 'group-uuid-1';
        const customRoleUuid = 'custom-role-uuid-1';

        test('returns custom role uuid in `role` when role_uuid is set', async () => {
            tracker.on
                .select(
                    queryMatcher(ProjectGroupAccessTableName, [projectUuid]),
                )
                .response([
                    {
                        projectUuid,
                        groupUuid,
                        role: 'viewer',
                        role_uuid: customRoleUuid,
                    },
                ]);

            const result = await model.getProjectGroupAccesses(projectUuid);

            expect(result).toEqual([
                {
                    projectUuid,
                    groupUuid,
                    role: customRoleUuid,
                },
            ]);
        });

        test('returns system role in `role` when role_uuid is null', async () => {
            tracker.on
                .select(
                    queryMatcher(ProjectGroupAccessTableName, [projectUuid]),
                )
                .response([
                    {
                        projectUuid,
                        groupUuid,
                        role: 'editor',
                        role_uuid: null,
                    },
                ]);

            const result = await model.getProjectGroupAccesses(projectUuid);

            expect(result).toEqual([
                {
                    projectUuid,
                    groupUuid,
                    role: 'editor',
                },
            ]);
        });
    });

    describe('setServiceAccountProjectAccess', () => {
        const matchSql =
            (table: string) =>
            ({ sql }: RawQuery) =>
                sql.includes(table);
        const SA_UUID = 'sa-1';

        test('throws NotFound when the service account does not exist', async () => {
            tracker.on.select(matchSql(ServiceAccountsTableName)).response([]);
            await expect(
                model.setServiceAccountProjectAccess(SA_UUID, [
                    { projectUuid: 'p-1', role: ProjectMemberRole.VIEWER },
                ]),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(tracker.history.delete).toHaveLength(0);
        });

        test('rejects duplicate projects before any write', async () => {
            tracker.on
                .select(matchSql(ServiceAccountsTableName))
                .response([{ user_id: 1, organization_uuid: 'org-1' }]);
            await expect(
                model.setServiceAccountProjectAccess(SA_UUID, [
                    { projectUuid: 'p-1', role: ProjectMemberRole.VIEWER },
                    { projectUuid: 'p-1', role: ProjectMemberRole.EDITOR },
                ]),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(tracker.history.delete).toHaveLength(0);
        });

        test('throws NotFound when a project does not exist', async () => {
            tracker.on
                .select(matchSql(ServiceAccountsTableName))
                .response([{ user_id: 1, organization_uuid: 'org-1' }]);
            tracker.on.select(matchSql(ProjectTableName)).response([]);
            await expect(
                model.setServiceAccountProjectAccess(SA_UUID, [
                    {
                        projectUuid: 'p-missing',
                        role: ProjectMemberRole.VIEWER,
                    },
                ]),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(tracker.history.delete).toHaveLength(0);
        });

        test('rejects a project from a different organization', async () => {
            tracker.on
                .select(matchSql(ServiceAccountsTableName))
                .response([{ user_id: 1, organization_uuid: 'org-1' }]);
            tracker.on
                .select(matchSql(ProjectTableName))
                .response([
                    { project_uuid: 'p-1', project_id: 10, org_uuid: 'org-2' },
                ]);
            await expect(
                model.setServiceAccountProjectAccess(SA_UUID, [
                    { projectUuid: 'p-1', role: ProjectMemberRole.VIEWER },
                ]),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(tracker.history.delete).toHaveLength(0);
        });

        test('replaces grants: deletes existing then inserts, with a Viewer placeholder for custom roles', async () => {
            tracker.on
                .select(matchSql(ServiceAccountsTableName))
                .response([{ user_id: 1, organization_uuid: 'org-1' }]);
            tracker.on.select(matchSql(ProjectTableName)).response([
                { project_uuid: 'p-1', project_id: 10, org_uuid: 'org-1' },
                { project_uuid: 'p-2', project_id: 20, org_uuid: 'org-1' },
            ]);
            tracker.on
                .delete(matchSql(ProjectMembershipsTableName))
                .response([]);
            tracker.on
                .insert(matchSql(ProjectMembershipsTableName))
                .response([]);

            await model.setServiceAccountProjectAccess(SA_UUID, [
                { projectUuid: 'p-1', role: ProjectMemberRole.EDITOR },
                { projectUuid: 'p-2', roleUuid: 'custom-role-1' },
            ]);

            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(1);
            const { bindings } = tracker.history.insert[0];
            // System grant keeps its role; custom-role grant gets the Viewer
            // placeholder plus the role_uuid.
            expect(bindings).toContain(ProjectMemberRole.EDITOR);
            expect(bindings).toContain(ProjectMemberRole.VIEWER);
            expect(bindings).toContain('custom-role-1');
        });

        test('updates grants, service-account scope, and organization role in one transaction', async () => {
            tracker.on
                .select(matchSql(ServiceAccountsTableName))
                .response([{ user_id: 1, organization_uuid: 'org-1' }]);
            tracker.on
                .select(matchSql(ProjectTableName))
                .response([
                    { project_uuid: 'p-1', project_id: 10, org_uuid: 'org-1' },
                ]);
            tracker.on
                .delete(matchSql(ProjectMembershipsTableName))
                .response([]);
            tracker.on
                .insert(matchSql(ProjectMembershipsTableName))
                .response([]);
            tracker.on.update(matchSql(ServiceAccountsTableName)).response([]);
            tracker.on
                .update(matchSql(OrganizationMembershipsTableName))
                .response([]);
            tracker.on
                .delete(matchSql(OrganizationMembershipCustomRolesTableName))
                .response(0);

            await model.setServiceAccountProjectAccess(
                SA_UUID,
                [{ projectUuid: 'p-1', role: ProjectMemberRole.EDITOR }],
                { makeProjectScoped: true },
            );

            expect(tracker.history.update).toHaveLength(2);
            expect(tracker.history.update[0].bindings).toContainEqual([
                ServiceAccountScope.SYSTEM_MEMBER,
            ]);
            expect(tracker.history.update[1].bindings).toContain(
                OrganizationMemberRole.MEMBER,
            );
            // singular org-role write also clears extra custom roles
            const extrasClear = tracker.history.delete.find(({ sql }) =>
                sql.includes(OrganizationMembershipCustomRolesTableName),
            );
            expect(extrasClear).toBeDefined();
        });
    });
});
