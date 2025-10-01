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
    describe('applyChange', () => {
        const mockDimension: CompiledDimension = {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'test_dimension',
            label: 'Test Dimension',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'test_column',
            hidden: false,
            compiledSql: 'orders.test_column',
            tablesReferences: ['orders'],
        };

        const mockMetric: CompiledMetric = {
            fieldType: FieldType.METRIC,
            type: MetricType.COUNT,
            name: 'test_metric',
            label: 'Test Metric',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'COUNT(*)',
            hidden: false,
            compiledSql: 'COUNT(*)',
            tablesReferences: ['orders'],
        };

        describe('create change', () => {
            test('should create a new dimension', () => {
                const createChange: Change = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'create',
                    entityType: 'dimension',
                    entityTableName: 'orders',
                    entityName: 'test_dimension',
                    payload: { value: mockDimension },
                };

                const result = ProjectModel.applyChange(
                    undefined,
                    createChange,
                );
                expect(result).toEqual(mockDimension);
            });

            test('should create a new metric', () => {
                const createChange: Change = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'create',
                    entityType: 'metric',
                    entityTableName: 'orders',
                    entityName: 'test_metric',
                    payload: { value: mockMetric },
                };

                const result = ProjectModel.applyChange(
                    undefined,
                    createChange,
                );
                expect(result).toEqual(mockMetric);
            });
        });

        describe('update change', () => {
            test('should update dimension label', () => {
                const updateChange: Change = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'update',
                    entityType: 'dimension',
                    entityTableName: 'orders',
                    entityName: 'test_dimension',
                    payload: {
                        patches: [
                            {
                                op: 'replace',
                                path: '/label',
                                value: 'Updated Test Dimension',
                            },
                        ],
                    },
                };

                const result = ProjectModel.applyChange(
                    mockDimension,
                    updateChange,
                );
                expect(result?.label).toBe('Updated Test Dimension');
                expect(result?.name).toBe(mockDimension.name);
            });

            test('should update field description', () => {
                const dimensionWithDescription: CompiledDimension = {
                    ...mockDimension,
                    description: 'Original description',
                };

                const updateChange: Change = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'update',
                    entityType: 'dimension',
                    entityTableName: 'orders',
                    entityName: 'test_dimension',
                    payload: {
                        patches: [
                            {
                                op: 'replace',
                                path: '/description',
                                value: 'Updated field description with more details',
                            },
                        ],
                    },
                };

                const result = ProjectModel.applyChange(
                    dimensionWithDescription,
                    updateChange,
                );
                expect(result?.description).toBe(
                    'Updated field description with more details',
                );
                expect(result?.name).toBe(mockDimension.name);
                expect(result?.label).toBe(mockDimension.label);
            });

            test('should throw error for invalid patch', () => {
                const invalidUpdateChange: Change = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'update',
                    entityType: 'dimension',
                    entityTableName: 'orders',
                    entityName: 'test_dimension',
                    payload: {
                        patches: [
                            {
                                op: 'replace',
                                path: '/nonexistent',
                                value: 'some value',
                            },
                        ],
                    },
                };

                expect(() => {
                    ProjectModel.applyChange(
                        mockDimension,
                        invalidUpdateChange,
                    );
                }).toThrow('Invalid patch');
            });
        });

        describe('delete change', () => {
            test('should return undefined for delete change', () => {
                const deleteChange: Change = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'delete',
                    entityType: 'dimension',
                    entityTableName: 'orders',
                    entityName: 'test_dimension',
                    payload: {},
                };

                const result = ProjectModel.applyChange(
                    mockDimension,
                    deleteChange,
                );
                expect(result).toBeUndefined();
            });
        });

        describe('invalid change type', () => {
            test('should throw error for invalid change type', () => {
                const invalidChange = {
                    changeUuid: 'test-uuid',
                    changesetUuid: 'changeset-uuid',
                    createdAt: new Date(),
                    createdByUserUuid: 'user-uuid',
                    sourcePromptUuid: null,
                    type: 'invalid',
                    entityType: 'dimension',
                    entityTableName: 'orders',
                    entityName: 'test_dimension',
                    payload: {},
                } as unknown as Change;

                expect(() => {
                    ProjectModel.applyChange(mockDimension, invalidChange);
                }).toThrow();
            });
        });
    });
});
