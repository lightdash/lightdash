import {
    AnyType,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    CompiledDimension,
    CompiledMetric,
    CreateAthenaCredentials,
    CreateBigqueryCredentials,
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
import { DashboardsTableName } from '../../database/entities/dashboards';
import { DashboardSlugMappingsTableName } from '../../database/entities/dashboardSlugMappings';
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
import { newExploreCacheReadContext } from '../../logging/exploreCacheReadMetrics';
import {
    ProjectModel,
    reduceExploreTableSummaryRows,
    toExploreTableSummaryRecord,
    type ExploreTableSummaryRecord,
} from './ProjectModel';
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

const { chunkAsyncRowsByBytesMock } = vi.hoisted(() => ({
    chunkAsyncRowsByBytesMock: vi.fn(),
}));

vi.mock('../../utils/chunkRowsByBytes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/chunkRowsByBytes')>()),
    chunkAsyncRowsByBytes: chunkAsyncRowsByBytesMock,
}));

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
    describe('getCachedExploreStorageBytes', () => {
        test('returns the matched explore count and stored bytes together', async () => {
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([{ exploreCount: '2', totalBytes: '4096' }]);

            await expect(
                model.getCachedExploreStorageStats(projectUuid),
            ).resolves.toEqual({ exploreCount: 2, totalBytes: 4096 });
            expect(tracker.history.select[0].sql).toContain('COUNT(*)');
            expect(tracker.history.select[0].sql).toContain('pg_column_size');
        });

        test('sums pg_column_size across the matched rows', async () => {
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([{ totalBytes: '4096' }]);

            await expect(
                model.getCachedExploreStorageBytes(projectUuid),
            ).resolves.toBe(4096);
            expect(tracker.history.select).toHaveLength(1);
        });
        test('scopes to deduplicated explore names when provided', async () => {
            tracker.on
                .select(
                    queryMatcher(CachedExploreTableName, [
                        projectUuid,
                        'orders',
                    ]),
                )
                .response([{ totalBytes: '0' }]);

            await expect(
                model.getCachedExploreStorageBytes(projectUuid, [
                    'orders',
                    'orders',
                ]),
            ).resolves.toBe(0);
        });
    });
    describe('findExploreTableSummariesFromCache', () => {
        const summaryRow = (
            exploreName: string,
            tableKey: string | null,
            overrides: AnyType = {},
        ) => ({
            exploreName,
            exploreType: ExploreType.DEFAULT,
            baseTable: tableKey,
            hasErrors: false,
            tableKey,
            tableName: tableKey,
            originalName: null,
            database: 'database',
            schema: 'schema',
            description: null,
            hasDescription: false,
            sqlTable: 'database.schema.table',
            ymlPath: null,
            dbtSourceUuid: null,
            ...overrides,
        });

        const createModel = (threshold: number) =>
            new ProjectModel({
                database,
                lightdashConfig: {
                    ...lightdashConfigMock,
                    query: {
                        ...lightdashConfigMock.query,
                        exploreSummaryProjectionMinStoredBytesPerExplore:
                            threshold,
                    },
                },
                encryptionUtil: encryptionUtilMock,
            });

        beforeEach(() => {
            vi.spyOn(model, 'getCachedExploreStorageStats').mockResolvedValue({
                exploreCount: 1,
                totalBytes: 4096,
            });
        });

        test('keeps prototype-like explore and table names as own keys', async () => {
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([
                    summaryRow('constructor', '__proto__'),
                    summaryRow('toString', 'constructor'),
                ]);

            const result =
                await model.findExploreTableSummariesFromCache(projectUuid);

            expect(Object.keys(result)).toEqual(['constructor', 'toString']);
            const [constructorExplore, toStringExplore] = Object.values(result);
            expect(Object.keys(constructorExplore.tables)).toEqual([
                '__proto__',
            ]);
            expect(Object.keys(toStringExplore.tables)).toEqual([
                'constructor',
            ]);
        });

        test('guards JSONB expansion and binds deduplicated names', async () => {
            tracker.on
                .select(CachedExploreTableName)
                .response([summaryRow('json_name', null)]);

            const result = await model.findExploreTableSummariesFromCache(
                projectUuid,
                ['column_name', 'column_name'],
            );

            expect(result.json_name.tables).toEqual({});
            expect(Object.hasOwn(result, 'column_name')).toBe(false);
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.select[0].bindings).toEqual([
                projectUuid,
                'column_name',
            ]);
            expect(tracker.history.select[0].sql).toContain(
                "jsonb_exists(cached_explore.explore, 'errors')",
            );
            expect(tracker.history.select[0].sql).toContain('OFFSET 0');
            expect(tracker.history.select[0].sql).toContain(
                "jsonb_typeof(explore_summary.tables) = 'object'",
            );
            expect(tracker.history.select[0].sql).toContain(
                "jsonb_typeof(table_entry.value) = 'object'",
            );
            expect(tracker.history.select[0].sql).toContain(
                "jsonb_typeof(cached_explore.explore->'name') = 'string'",
            );
        });

        test('preserves error presence and malformed scalar truthiness', async () => {
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([
                    summaryRow('broken', null, { hasErrors: true }),
                    summaryRow('coercions', 'orders', {
                        hasDescription: true,
                        description: null,
                        originalName: 0,
                        ymlPath: false,
                    }),
                ]);

            const result =
                await model.findExploreTableSummariesFromCache(projectUuid);

            expect(result.broken).toHaveProperty('errors', true);
            expect(result.coercions.tables.orders).toHaveProperty(
                'description',
                null,
            );
            expect(result.coercions.tables.orders).not.toHaveProperty(
                'originalName',
            );
            expect(result.coercions.tables.orders).not.toHaveProperty(
                'ymlPath',
            );
        });

        test('always projects when the threshold is zero', async () => {
            const zeroThresholdModel = createModel(0);
            vi.spyOn(
                zeroThresholdModel,
                'getCachedExploreStorageStats',
            ).mockResolvedValue({ exploreCount: 1, totalBytes: 1 });
            const fullRead = vi.spyOn(
                zeroThresholdModel,
                'findExploresFromCache',
            );
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([summaryRow('orders', 'orders')]);
            const context = newExploreCacheReadContext('catalog', undefined);

            const result =
                await zeroThresholdModel.findExploreTableSummariesFromCache(
                    projectUuid,
                    undefined,
                    context,
                );

            expect(result.orders.name).toBe('orders');
            expect(fullRead).not.toHaveBeenCalled();
            expect(context).toMatchObject({
                readStrategy: 'table-summary-projection',
                storedExploreBytes: 1,
                storedBytesPerExplore: 1,
                projectionThresholdBytesPerExplore: 0,
            });
        });

        test('falls back below the threshold', async () => {
            const thresholdModel = createModel(2048);
            vi.spyOn(
                thresholdModel,
                'getCachedExploreStorageStats',
            ).mockResolvedValue({ exploreCount: 2, totalBytes: 3000 });
            const fullRead = vi
                .spyOn(thresholdModel, 'findExploresFromCache')
                .mockResolvedValue({
                    orders: {
                        ...exploreWithMetricFilters,
                        name: 'orders',
                        type: ExploreType.DEFAULT,
                        baseTable: 'orders',
                        tables: {},
                    },
                });
            const context = newExploreCacheReadContext('catalog', undefined);

            const result =
                await thresholdModel.findExploreTableSummariesFromCache(
                    projectUuid,
                    undefined,
                    context,
                );

            expect(result.orders.name).toBe('orders');
            expect(fullRead).toHaveBeenCalledWith(
                projectUuid,
                'name',
                undefined,
            );
            expect(tracker.history.select).toHaveLength(0);
            expect(context).toMatchObject({
                readStrategy: 'full-explore-read',
                storedExploreBytes: 3000,
                storedBytesPerExplore: 1500,
                projectionThresholdBytesPerExplore: 2048,
            });
        });

        test('projects at or above the threshold', async () => {
            const thresholdModel = createModel(2048);
            vi.spyOn(
                thresholdModel,
                'getCachedExploreStorageStats',
            ).mockResolvedValue({ exploreCount: 2, totalBytes: 4096 });
            const fullRead = vi.spyOn(thresholdModel, 'findExploresFromCache');
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([summaryRow('orders', 'orders')]);
            const context = newExploreCacheReadContext('catalog', undefined);

            await thresholdModel.findExploreTableSummariesFromCache(
                projectUuid,
                undefined,
                context,
            );

            expect(fullRead).not.toHaveBeenCalled();
            expect(context).toMatchObject({
                readStrategy: 'table-summary-projection',
                storedExploreBytes: 4096,
                storedBytesPerExplore: 2048,
                projectionThresholdBytesPerExplore: 2048,
            });
        });

        test('returns without a read when no explores match', async () => {
            vi.mocked(model.getCachedExploreStorageStats).mockResolvedValue({
                exploreCount: 0,
                totalBytes: 0,
            });
            const fullRead = vi.spyOn(model, 'findExploresFromCache');
            const context = newExploreCacheReadContext('catalog', undefined);

            const result = await model.findExploreTableSummariesFromCache(
                projectUuid,
                undefined,
                context,
            );

            expect(result).toEqual({});
            expect(fullRead).not.toHaveBeenCalled();
            expect(tracker.history.select).toHaveLength(0);
            expect(Object.getPrototypeOf(result)).toBeNull();
            expect(context).toMatchObject({
                readStrategy: 'table-summary-projection',
                storedExploreBytes: 0,
                storedBytesPerExplore: undefined,
                projectionThresholdBytesPerExplore: 2048,
            });
        });

        test.each([
            {
                name: 'errors',
                fixture: {
                    name: 'errors',
                    errors: null,
                },
            },
            {
                name: 'description absent',
                fixture: {
                    name: 'description_absent',
                    type: ExploreType.DEFAULT,
                    baseTable: 'orders',
                    tables: {
                        orders: {
                            name: 'orders',
                            database: 'database',
                            schema: 'schema',
                            sqlTable: 'database.schema.orders',
                        },
                    },
                },
            },
            {
                name: 'description null',
                fixture: {
                    name: 'description_null',
                    type: ExploreType.DEFAULT,
                    baseTable: 'orders',
                    tables: {
                        orders: {
                            name: 'orders',
                            database: 'database',
                            schema: 'schema',
                            sqlTable: 'database.schema.orders',
                            description: null,
                        },
                    },
                },
            },
            {
                name: 'prototype-like names and malformed table entry',
                fixture: {
                    name: 'constructor',
                    type: ExploreType.DEFAULT,
                    baseTable: '__proto__',
                    tables: Object.fromEntries([
                        [
                            '__proto__',
                            {
                                name: '__proto__',
                                database: 'database',
                                schema: 'schema',
                                sqlTable: 'database.schema.prototype',
                            },
                        ],
                        [
                            'constructor',
                            {
                                name: 'constructor',
                                database: 'database',
                                schema: 'schema',
                                sqlTable: 'database.schema.constructor',
                            },
                        ],
                        ['invalid', 1],
                    ]),
                },
            },
            {
                name: 'non-object tables value',
                fixture: {
                    name: 'non_object_tables',
                    type: ExploreType.DEFAULT,
                    baseTable: '',
                    tables: 1,
                },
            },
            {
                name: 'numeric base table',
                fixture: {
                    name: 'numeric_base_table',
                    type: ExploreType.DEFAULT,
                    baseTable: 123,
                    tables: {},
                },
            },
            {
                name: 'numeric explore type',
                fixture: {
                    name: 'numeric_explore_type',
                    type: 123,
                    baseTable: '',
                    tables: {},
                },
            },
        ])('maps $name like the projection reducer', ({ fixture }) => {
            const tableEntries =
                typeof fixture.tables === 'object' &&
                fixture.tables !== null &&
                !Array.isArray(fixture.tables)
                    ? Object.entries(fixture.tables).filter(
                          ([, table]) =>
                              typeof table === 'object' &&
                              table !== null &&
                              !Array.isArray(table),
                      )
                    : [];
            const rows = (
                tableEntries.length === 0 ? [[null, null]] : tableEntries
            ).map(([tableKey, table]) => {
                const tableRecord = table as Record<string, unknown> | null;
                return summaryRow(fixture.name, tableKey, {
                    exploreType:
                        fixture.type == null ? null : String(fixture.type),
                    baseTable:
                        fixture.baseTable == null
                            ? null
                            : String(fixture.baseTable),
                    hasErrors: Object.hasOwn(fixture, 'errors'),
                    tableName: tableRecord?.name ?? null,
                    originalName: tableRecord?.originalName ?? null,
                    database: tableRecord?.database ?? null,
                    schema: tableRecord?.schema ?? null,
                    description: tableRecord?.description ?? null,
                    hasDescription:
                        tableRecord !== null &&
                        Object.hasOwn(tableRecord, 'description'),
                    sqlTable: tableRecord?.sqlTable ?? null,
                    ymlPath: tableRecord?.ymlPath ?? null,
                    dbtSourceUuid: tableRecord?.dbtSourceUuid ?? null,
                });
            });
            const mapped = toExploreTableSummaryRecord(fixture);
            const reduced = reduceExploreTableSummaryRows(rows);

            expect(mapped).toEqual(reduced[fixture.name]);
        });

        test('skips a non-object explore like an empty projection result', () => {
            expect(toExploreTableSummaryRecord(1)).toBeUndefined();
            expect(reduceExploreTableSummaryRows([])).toEqual({});
        });
    });
    describe('getAllExploreSummaries', () => {
        // Each fixture carries the stored explore JSON, the row the previous
        // 19-projection query returned for it, the row the lateral
        // jsonb_to_record query returns for it, and the expected summary.
        // The two row shapes were verified byte-identical on PostgreSQL 18
        // with EXCEPT in both directions over these fixtures.
        const summaryRowCases = [
            {
                name: 'standard explore',
                explore: {
                    name: 'orders',
                    label: 'Orders',
                    tags: ['mart'],
                    groupLabel: 'Sales',
                    groups: ['g1'],
                    type: 'default',
                    baseTable: 'orders',
                    aiHint: 'hint',
                    customMeta: { owner: 'x' },
                    tables: {
                        orders: {
                            database: 'db',
                            schema: 'sch',
                            description: 'desc',
                            requiredAttributes: { region: 'emea' },
                            anyAttributes: { team: ['a'] },
                        },
                    },
                },
                row: {
                    name: 'orders',
                    label: 'Orders',
                    tags: ['mart'],
                    groupLabel: 'Sales',
                    groups: ['g1'],
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: 'orders',
                    baseTableDatabase: 'db',
                    baseTableSchema: 'sch',
                    baseTableDescription: 'desc',
                    baseTableRequiredAttributes: { region: 'emea' },
                    baseTableAnyAttributes: { team: ['a'] },
                    aiHint: 'hint',
                    customMeta: { owner: 'x' },
                },
                expected: {
                    name: 'orders',
                    label: 'Orders',
                    tags: ['mart'],
                    groupLabel: 'Sales',
                    groups: ['g1'],
                    type: 'default',
                    databaseName: 'db',
                    schemaName: 'sch',
                    description: 'desc',
                    baseTableRequiredAttributes: { region: 'emea' },
                    baseTableAnyAttributes: { team: ['a'] },
                    aiHint: 'hint',
                    customMeta: { owner: 'x' },
                },
            },
            {
                name: 'explore with errors',
                explore: {
                    name: 'broken',
                    label: 'Broken',
                    tags: [],
                    type: 'default',
                    baseTable: 'missing_base',
                    errors: [{ message: 'boom' }],
                },
                row: {
                    name: 'broken',
                    label: 'Broken',
                    tags: [],
                    groupLabel: null,
                    groups: null,
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: [{ message: 'boom' }],
                    warnings: null,
                    baseTable: 'missing_base',
                    baseTableDatabase: null,
                    baseTableSchema: null,
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'broken',
                    label: 'Broken',
                    tags: [],
                    type: 'default',
                    databaseName: null,
                    schemaName: null,
                    errors: [{ message: 'boom' }],
                },
            },
            {
                name: 'explore with warnings',
                explore: {
                    name: 'warned',
                    type: 'default',
                    baseTable: 'orders',
                    warnings: [{ message: 'w' }],
                    tables: {
                        orders: { database: 'db', schema: 'sch' },
                    },
                },
                row: {
                    name: 'warned',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: [{ message: 'w' }],
                    baseTable: 'orders',
                    baseTableDatabase: 'db',
                    baseTableSchema: 'sch',
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'warned',
                    label: null,
                    tags: null,
                    type: 'default',
                    databaseName: 'db',
                    schemaName: 'sch',
                    warnings: [{ message: 'w' }],
                },
            },
            {
                name: 'missing baseTable',
                explore: {
                    name: 'no_base',
                    type: 'default',
                    tables: {
                        orders: { database: 'db', schema: 'sch' },
                    },
                },
                row: {
                    name: 'no_base',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: null,
                    baseTableDatabase: null,
                    baseTableSchema: null,
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'no_base',
                    label: null,
                    tags: null,
                    type: 'default',
                    databaseName: null,
                    schemaName: null,
                },
            },
            {
                name: 'non-object tables value',
                explore: {
                    name: 'tables_scalar',
                    type: 'default',
                    baseTable: 'x',
                    tables: 1,
                },
                row: {
                    name: 'tables_scalar',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: 'x',
                    baseTableDatabase: null,
                    baseTableSchema: null,
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'tables_scalar',
                    label: null,
                    tags: null,
                    type: 'default',
                    databaseName: null,
                    schemaName: null,
                },
            },
            {
                name: 'prototype-like table key',
                explore: {
                    name: 'proto',
                    type: 'default',
                    baseTable: '__proto__',
                    tables: Object.fromEntries([
                        [
                            '__proto__',
                            {
                                database: 'protdb',
                                schema: 'prots',
                                description: 'p',
                                requiredAttributes: { k: 'v' },
                                anyAttributes: {},
                            },
                        ],
                    ]),
                },
                row: {
                    name: 'proto',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: '__proto__',
                    baseTableDatabase: 'protdb',
                    baseTableSchema: 'prots',
                    baseTableDescription: 'p',
                    baseTableRequiredAttributes: { k: 'v' },
                    baseTableAnyAttributes: {},
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'proto',
                    label: null,
                    tags: null,
                    type: 'default',
                    databaseName: 'protdb',
                    schemaName: 'prots',
                    description: 'p',
                    baseTableRequiredAttributes: { k: 'v' },
                    baseTableAnyAttributes: {},
                },
            },
            {
                name: 'baseTable missing from tables',
                explore: {
                    name: 'dangling_base',
                    type: 'default',
                    baseTable: 'nope',
                    tables: { orders: { database: 'db' } },
                },
                row: {
                    name: 'dangling_base',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: 'default',
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: 'nope',
                    baseTableDatabase: null,
                    baseTableSchema: null,
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'dangling_base',
                    label: null,
                    tags: null,
                    type: 'default',
                    databaseName: null,
                    schemaName: null,
                },
            },
            {
                name: 'json nulls in projected fields',
                explore: {
                    name: 'nulls',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    type: null,
                    errors: null,
                    warnings: null,
                    baseTable: 'orders',
                    aiHint: null,
                    customMeta: null,
                    tables: {
                        orders: {
                            database: 'db',
                            schema: 'sch',
                            description: null,
                            requiredAttributes: null,
                            anyAttributes: null,
                        },
                    },
                },
                row: {
                    name: 'nulls',
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: null,
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: 'orders',
                    baseTableDatabase: 'db',
                    baseTableSchema: 'sch',
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: 'nulls',
                    label: null,
                    tags: null,
                    databaseName: 'db',
                    schemaName: 'sch',
                },
            },
            {
                name: 'top-level scalar explore',
                explore: 1,
                row: {
                    name: null,
                    label: null,
                    tags: null,
                    groupLabel: null,
                    groups: null,
                    type: null,
                    preAggregateSource: null,
                    externalSource: null,
                    errors: null,
                    warnings: null,
                    baseTable: null,
                    baseTableDatabase: null,
                    baseTableSchema: null,
                    baseTableDescription: null,
                    baseTableRequiredAttributes: null,
                    baseTableAnyAttributes: null,
                    aiHint: null,
                    customMeta: null,
                },
                expected: {
                    name: null,
                    label: null,
                    tags: null,
                    databaseName: null,
                    schemaName: null,
                },
            },
        ];

        test.each(summaryRowCases)(
            'maps $name identically from both query shapes',
            async ({ row, expected }) => {
                // The old 19-projection query and the new lateral
                // jsonb_to_record query return this same row for the fixture,
                // so feeding it through the method covers both shapes.
                tracker.on
                    .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                    .response([row]);

                const result = await model.getAllExploreSummaries(projectUuid);

                expect(result).toEqual([expected]);
            },
        );

        test('extracts each field once per row via a lateral jsonb_to_record', async () => {
            tracker.on
                .select(queryMatcher(CachedExploreTableName, [projectUuid]))
                .response([]);

            const result = await model.getAllExploreSummaries(projectUuid);

            expect(result).toEqual([]);
            expect(tracker.history.select).toHaveLength(1);
            const { sql } = tracker.history.select[0];
            expect(sql).toContain('LEFT JOIN LATERAL jsonb_to_record');
            expect(sql).toContain(
                "jsonb_typeof(cached_explore.explore) = 'object'",
            );
            expect(sql).not.toContain(
                "explore->'tables'->(explore->>'baseTable')",
            );
            expect(sql).not.toContain("explore->'name'");
        });
    });
    describe('getExploreFromCache', () => {
        const createQualifiedExplore = (
            name: string,
        ): ExploreTableSummaryRecord => ({
            name,
            type: ExploreType.DEFAULT,
            baseTable: name,
            tables: {
                [name]: {
                    name,
                    originalName: 'orders',
                    database: exploreWithMetricFilters.tables.payments.database,
                    schema: exploreWithMetricFilters.tables.payments.schema,
                    sqlTable: exploreWithMetricFilters.tables.payments.sqlTable,
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
                .mockResolvedValueOnce({});
            const findExploreTableSummariesFromCache = vi
                .spyOn(model, 'findExploreTableSummariesFromCache')
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
            expect(findExploresFromCache).toHaveBeenCalledTimes(1);
            expect(findExploreTableSummariesFromCache).toHaveBeenCalledTimes(1);
        });

        test('keeps the plain not found error when no split candidates exist', async () => {
            const findExploresFromCache = vi
                .spyOn(model, 'findExploresFromCache')
                .mockResolvedValueOnce({});
            const findExploreTableSummariesFromCache = vi
                .spyOn(model, 'findExploreTableSummariesFromCache')
                .mockResolvedValueOnce({
                    payments: createQualifiedExplore('payments'),
                });

            await expect(
                model.getExploreFromCache(projectUuid, 'orders'),
            ).rejects.toEqual(
                new NotFoundError('Explore "orders" does not exist.'),
            );
            expect(findExploresFromCache).toHaveBeenCalledTimes(1);
            expect(findExploreTableSummariesFromCache).toHaveBeenCalledTimes(1);
        });

        test('keeps the plain not found error for one original-name match', async () => {
            const sourceAExplore = createQualifiedExplore('sourceA__orders');
            vi.spyOn(model, 'findExploresFromCache').mockResolvedValueOnce({});
            vi.spyOn(
                model,
                'findExploreTableSummariesFromCache',
            ).mockResolvedValueOnce({
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

    test('stores listing fields in columns and omits them from ciphertext', async () => {
        const encrypt = vi
            .spyOn(encryptionUtilMock, 'encrypt')
            .mockReturnValue(Buffer.from('encrypted'));
        tracker.on
            .insert(({ sql }) => sql.includes('warehouse_credentials'))
            .response([]);

        await (
            model as unknown as {
                upsertWarehouseConnection: (
                    trx: typeof database,
                    projectId: number,
                    data: CreateWarehouseCredentials,
                ) => Promise<void>;
            }
        ).upsertWarehouseConnection(database, 7, {
            type: WarehouseTypes.ATHENA,
            region: 'eu-west-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            s3StagingDir: 's3://query-results',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            listAllDatabases: false,
            additionalDatabases: [' sales ', '', 'finance', 'sales'],
        });

        const encrypted = JSON.parse(encrypt.mock.calls[0][0] as string);
        expect(encrypted).not.toHaveProperty('listAllDatabases');
        expect(encrypted).not.toHaveProperty('additionalDatabases');
        expect(tracker.history.insert[0].sql).toContain('"list_all_databases"');
        expect(tracker.history.insert[0].sql).toContain(
            '"additional_databases"',
        );
        expect(tracker.history.insert[0].bindings).toEqual(
            expect.arrayContaining([false, ['sales', 'finance']]),
        );
    });

    test('keeps dormant ciphertext when attaching an organization connection', async () => {
        tracker.on
            .insert(({ sql }) => sql.includes('warehouse_credentials'))
            .response([]);

        await (
            model as unknown as {
                upsertWarehouseConnection: (
                    trx: typeof database,
                    projectId: number,
                    data: CreateWarehouseCredentials,
                    organizationWarehouseCredentialsUuid?: string,
                ) => Promise<void>;
            }
        ).upsertWarehouseConnection(
            database,
            7,
            {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'user',
                password: 'password',
                database: 'database',
                warehouse: 'warehouse',
                schema: 'schema',
            },
            'organization-credential-uuid',
        );

        const updateClause =
            tracker.history.insert[0].sql.split('do update set')[1];
        expect(updateClause).not.toContain('encrypted_credentials');
        expect(tracker.history.insert[0].bindings).toContain(
            'organization-credential-uuid',
        );
    });

    test('merges row listing fields into organization credentials', async () => {
        tracker.on
            .select(({ sql }) => sql.includes('warehouse_credentials'))
            .response([
                {
                    encrypted_credentials: null,
                    organization_warehouse_credentials_uuid:
                        'organization-credential-uuid',
                    organization_uuid: 'organization-uuid',
                    list_all_databases: true,
                    additional_databases: ['finance'],
                },
            ]);
        vi.spyOn(
            model as unknown as {
                getOrganizationWarehouseCredentials: () => Promise<CreateWarehouseCredentials>;
            },
            'getOrganizationWarehouseCredentials',
        ).mockResolvedValue({
            type: WarehouseTypes.ATHENA,
            region: 'eu-west-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            s3StagingDir: 's3://query-results',
        });

        await expect(
            model.getWarehouseCredentialsForProject(projectUuid),
        ).resolves.toMatchObject({
            listAllDatabases: true,
            additionalDatabases: ['finance'],
        });
    });

    test('skips superseded warehouse credential rows', async () => {
        tracker.on
            .select(({ sql }) => sql.includes('warehouse_credentials'))
            .response([]);

        await expect(
            model.getWarehouseCredentialsForProject(projectUuid),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(tracker.history.select[0].sql).toContain(
            '"warehouse_credentials"."superseded_at" is null',
        );
    });

    test('rotates a refresh token by warehouse credential row id', async () => {
        tracker.on
            .select(({ sql }) => sql.includes('warehouse_credentials'))
            .response([
                {
                    warehouse_credentials_id: 42,
                    encrypted_credentials: Buffer.from(
                        JSON.stringify({
                            type: WarehouseTypes.SNOWFLAKE,
                            refreshToken: 'old-token',
                        }),
                    ),
                },
            ]);
        tracker.on
            .update(({ sql }) => sql.includes('warehouse_credentials'))
            .response(1);

        await expect(
            model.rotateRefreshToken(projectUuid, 'old-token', 'new-token'),
        ).resolves.toBe(true);
        expect(tracker.history.select[0].sql).toContain(
            '"warehouse_credentials"."superseded_at" is null',
        );
        expect(tracker.history.update[0].sql).toContain(
            '"warehouse_credentials_id" =',
        );
        expect(tracker.history.update[0].bindings).toContain(42);
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

    test('training trees get new tree and metric IDs without copying locks', async () => {
        tracker.on.select('metrics_trees').response([
            {
                metrics_tree_uuid: 'source-tree',
                name: 'Completed orders',
                slug: 'completed-orders',
                description: null,
                source: 'ui',
            },
        ]);
        tracker.on
            .select(
                ({ sql, bindings }: RawQuery) =>
                    sql.includes('from "catalog_search"') &&
                    bindings.includes('source-project'),
            )
            .response([
                {
                    catalog_search_uuid: 'source-metric',
                    table_name: 'orders',
                    name: 'amount',
                    type: 'field',
                },
            ]);
        tracker.on
            .select(
                ({ sql, bindings }: RawQuery) =>
                    sql.includes('from "catalog_search"') &&
                    bindings.includes('target-project'),
            )
            .response([
                {
                    catalog_search_uuid: 'target-metric',
                    table_name: 'orders',
                    name: 'amount',
                    type: 'field',
                },
            ]);
        tracker.on.select('metrics_tree_nodes').response([
            {
                catalog_search_uuid: 'source-metric',
                x_position: 0,
                y_position: 200,
                source: 'ui',
            },
        ]);
        tracker.on
            .insert('metrics_trees')
            .response([{ metrics_tree_uuid: 'target-tree' }]);
        tracker.on.insert('metrics_tree_nodes').response([]);
        tracker.on.select('metrics_tree_edges').response([]);
        await model.copyMetricsTreesForTrainingCopy(
            'source-project',
            'target-project',
            'learner',
        );
        const treeInsert = tracker.history.insert.find(({ sql }) =>
            sql.includes('metrics_trees'),
        )!;
        expect(treeInsert.bindings).toContain('target-project');
        expect(treeInsert.bindings).toContain('learner');
        expect(treeInsert.bindings).not.toContain('source-project');
        const nodeInsert = tracker.history.insert.find(({ sql }) =>
            sql.includes('metrics_tree_nodes'),
        )!;
        expect(nodeInsert.bindings).toContain('target-metric');
        expect(nodeInsert.bindings).toContain('target-tree');
        expect(nodeInsert.bindings).not.toContain('source-metric');
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
        expect(
            tracker.history.insert.some(({ sql }) => sql.includes('locks')),
        ).toBe(false);
    });

    test('training tree copying fails before writing a tree with unresolved metrics', async () => {
        tracker.on
            .select('metrics_trees')
            .response([{ metrics_tree_uuid: 'source-tree' }]);
        tracker.on.select('catalog_search').response([]);
        tracker.on
            .select('metrics_tree_nodes')
            .response([{ catalog_search_uuid: 'missing-metric' }]);
        await expect(
            model.copyMetricsTreesForTrainingCopy(
                'source',
                'target',
                'learner',
            ),
        ).rejects.toThrow('missing a tree metric');
        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(0);
    });

    test('training tree copying rejects the source project as its target', async () => {
        await expect(
            model.copyMetricsTreesForTrainingCopy(
                'source',
                'source',
                'learner',
            ),
        ).rejects.toThrow('different project');
        expect(tracker.history.insert).toHaveLength(0);
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

    test('copies dashboard aliases to the mapped preview dashboard UUIDs only', async () => {
        tracker.on.select(DashboardSlugMappingsTableName).responseOnce([
            { dashboard_uuid: 'source-dashboard-1', slug: 'old-dashboard-1' },
            { dashboard_uuid: 'source-dashboard-2', slug: 'old-dashboard-2' },
        ]);
        tracker.on.insert(DashboardSlugMappingsTableName).responseOnce([]);

        await model.copyDashboardSlugMappingsToPreview(
            database,
            'source-project',
            'preview-project',
            [
                {
                    sourceDashboardUuid: 'source-dashboard-1',
                    previewDashboardUuid: 'preview-dashboard-1',
                },
                {
                    sourceDashboardUuid: 'source-dashboard-2',
                    previewDashboardUuid: 'preview-dashboard-2',
                },
            ],
        );

        const [insertQuery] = tracker.history.insert;
        expect(insertQuery.bindings).toEqual(
            expect.arrayContaining([
                'preview-project',
                'preview-dashboard-1',
                'old-dashboard-1',
                'preview-dashboard-2',
                'old-dashboard-2',
            ]),
        );
        expect(insertQuery.bindings).not.toContain('source-dashboard-1');
        expect(insertQuery.bindings).not.toContain('source-dashboard-2');
    });

    test('resolves the original dashboard UUID from preview content mapping', async () => {
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ dashboard_id: 22 }]);
        tracker.on.select('preview_content').responseOnce([
            {
                project_uuid: 'source-project',
                content_mapping: {
                    dashboards: [{ id: 11, newId: 22 }],
                    chartVersions: [],
                    spaces: [],
                    charts: [],
                    dashboardVersions: [],
                    savedSql: [],
                    savedSqlVersions: [],
                    aiAgents: [],
                },
            },
        ]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ dashboard_uuid: 'source-dashboard-uuid' }]);

        await expect(
            model.getUpstreamDashboardUuidFromPreview(
                'preview-project',
                'preview-dashboard-uuid',
            ),
        ).resolves.toBe('source-dashboard-uuid');

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

    describe('findExploreNamesContainingTables', () => {
        test('requires every requested table in the cached explore', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes('from "cached_explore"') &&
                        sql.includes('ANY(table_names)'),
                )
                .response([{ name: 'payments' }]);

            await expect(
                model.findExploreNamesContainingTables(projectUuid, [
                    'orders',
                    'payments',
                ]),
            ).resolves.toEqual(['payments']);

            expect(tracker.history.select.at(-1)?.bindings).toEqual([
                projectUuid,
                'orders',
                'payments',
            ]);
        });
    });

    describe('saveExploresToCache', () => {
        test('prunes deleted models while preserving unselected and user-managed explores', async () => {
            const incoming = { ...exploresWithSameName[0], name: 'selected' };
            const cached = [
                { ...incoming, name: 'deleted' },
                { ...incoming, name: 'retained' },
                { ...incoming, name: 'virtual', type: ExploreType.VIRTUAL },
                {
                    ...incoming,
                    name: 'external',
                    type: ExploreType.EXTERNAL_SOURCE,
                },
            ];
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response(cached.map((explore) => ({ explore })));
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explore"'))
                .response([{ cached_explore_uuid: 'selected-uuid' }]);
            tracker.on
                .delete(({ sql }) => sql.includes('"cached_explore"'))
                .response(1);

            await model.saveExploresToCache(projectUuid, [incoming], false, [
                'retained',
                'selected',
            ]);

            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.delete[0].bindings).toEqual([
                projectUuid,
                'deleted',
            ]);
        });

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

        test.each([
            { inventory: [], expectedDeleted: ['retained', 'deleted'] },
            { inventory: ['retained'], expectedDeleted: ['deleted'] },
        ])(
            'prunes with an empty selection and inventory $inventory',
            async ({ inventory, expectedDeleted }) => {
                tracker.on
                    .select(({ sql }) => sql.includes('"cached_explores"'))
                    .response([]);
                tracker.on
                    .select(({ sql }) => sql.includes('"cached_explore"'))
                    .response(
                        ['retained', 'deleted'].map((name) => ({
                            explore: { ...exploresWithSameName[0], name },
                        })),
                    );
                tracker.on
                    .insert(({ sql }) => sql.includes('"cached_explores"'))
                    .response([]);
                tracker.on
                    .delete(({ sql }) => sql.includes('"cached_explore"'))
                    .response(expectedDeleted.length);
                await expect(
                    model.saveExploresToCache(
                        projectUuid,
                        [],
                        false,
                        inventory,
                    ),
                ).resolves.toEqual({ cachedExploreUuids: [] });
                expect(tracker.history.delete[0].bindings).toEqual([
                    projectUuid,
                    ...expectedDeleted,
                ]);
            },
        );

        test('preserves generated explores for surviving unselected models', async () => {
            const base = exploresWithSameName[0];
            const cached = [
                {
                    ...base,
                    name: 'retained_preagg',
                    type: ExploreType.PRE_AGGREGATE,
                    preAggregateSource: {
                        sourceExploreName: 'retained',
                        preAggregateName: 'summary',
                    },
                },
                {
                    ...base,
                    name: 'deleted_preagg',
                    type: ExploreType.PRE_AGGREGATE,
                    preAggregateSource: {
                        sourceExploreName: 'deleted',
                        preAggregateName: 'summary',
                    },
                },
                {
                    ...base,
                    name: 'nested',
                    baseTable: 'nested',
                    tables: {
                        nested: {
                            ...Object.values(base.tables ?? {})[0],
                            nestedFrom: {
                                parentTable: 'retained',
                                columnPath: 'items',
                            },
                        },
                    },
                },
            ];
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response(cached.map((explore) => ({ explore })));
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .delete(({ sql }) => sql.includes('"cached_explore"'))
                .response(1);
            await model.saveExploresToCache(projectUuid, [], false, [
                'retained',
            ]);
            expect(tracker.history.delete[0].bindings).toEqual([
                projectUuid,
                'deleted_preagg',
            ]);
        });

        test('preserves cached combined-source explores when an inventory is supplied', async () => {
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore"'))
                .response([
                    {
                        explore: {
                            ...exploresWithSameName[0],
                            name: 'other_source',
                            tables: {
                                source: { dbtSourceUuid: 'source-uuid' },
                            },
                        },
                    },
                    {
                        explore: {
                            name: 'source_error',
                            label: 'Error',
                            errors: [],
                        },
                    },
                ]);
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response([]);
            await model.saveExploresToCache(projectUuid, [], false, []);
            expect(tracker.history.delete).toHaveLength(0);
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

    describe('saveExploreStreamToCache', () => {
        const oneRowChunks = () => {
            vi.mocked(chunkAsyncRowsByBytesMock).mockImplementation(
                async function* singleRowChunks(rows) {
                    for await (const row of rows) {
                        yield { rows: [row.row], bytes: row.bytes };
                    }
                },
            );
        };

        const stream = async function* exploreStream<T>(items: T[]) {
            for (const item of items) {
                yield item;
            }
        };

        const mockStagedCacheQueries = ({
            getUserManagedExplores = () => [],
            getLockedNames,
            onLock,
            stageError,
            swapError,
        }: {
            getUserManagedExplores?: () => {
                explore: { name: string; label?: string };
            }[];
            getLockedNames?: () => string[];
            onLock?: () => void;
            stageError?: Error;
            swapError?: Error;
        } = {}) => {
            const stagedRows = new Map<
                string,
                {
                    name: string;
                    cached_explore_uuid: string;
                    label?: string;
                }
            >();
            const stageExplore = (explore: {
                name: string;
                label?: string;
            }) => {
                const existing = stagedRows.get(explore.name);
                stagedRows.set(explore.name, {
                    name: explore.name,
                    cached_explore_uuid:
                        existing?.cached_explore_uuid ??
                        `${explore.name}-${explore.label}`,
                    label: explore.label,
                });
            };
            const stageInsert = tracker.on.insert(
                ({ sql }) =>
                    sql.includes('"cached_explore_staging"') &&
                    sql.includes('values'),
            );
            if (stageError) {
                stageInsert.simulateError(stageError);
            } else {
                stageInsert.response(({ bindings }) => {
                    bindings
                        .filter(
                            (binding): binding is string =>
                                typeof binding === 'string' &&
                                binding.startsWith('{'),
                        )
                        .map(
                            (binding) =>
                                JSON.parse(binding) as {
                                    name: string;
                                    label?: string;
                                },
                        )
                        .forEach(stageExplore);
                    return [];
                });
            }
            tracker.on
                .insert(({ sql }) => sql.includes('"cached_explores"'))
                .response(() => {
                    onLock?.();
                    return [];
                });
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explores"'))
                .response([{}]);
            tracker.on
                .delete(({ sql }) => sql.includes('"cached_explore"'))
                .response([]);
            tracker.on
                .delete(({ sql }) => sql.includes('"cached_explore_staging"'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('"cached_explore_staging"'))
                .response(() => {
                    const names =
                        getLockedNames?.() ?? Array.from(stagedRows.keys());
                    return names.map((name) => ({ name }));
                });
            tracker.on
                .any(
                    ({ sql }) =>
                        sql.startsWith('INSERT INTO') &&
                        sql.includes('"cached_explore_staging"') &&
                        sql.includes("explore->>'type'"),
                )
                .response(() => {
                    const managedRows = getUserManagedExplores();
                    managedRows.forEach(({ explore }) => stageExplore(explore));
                    return {
                        rows: managedRows.map(({ explore }) =>
                            stagedRows.get(explore.name),
                        ),
                    };
                });
            const promotion = tracker.on.any(
                ({ sql }) =>
                    sql.startsWith('INSERT INTO "cached_explore"') &&
                    sql.includes('SELECT cached_explore_uuid'),
            );
            if (swapError) {
                promotion.simulateError(swapError);
            } else {
                promotion.response(() => ({
                    rows: Array.from(stagedRows.values()),
                }));
            }
            return { stagedRows };
        };

        test('fully consumes the generator before taking the transaction lock', async () => {
            oneRowChunks();
            let consumed = false;
            mockStagedCacheQueries({
                onLock: () => expect(consumed).toBe(true),
            });
            async function* observedStream() {
                yield exploreWithMetricFilters;
                consumed = true;
            }

            await model.saveExploreStreamToCache(projectUuid, observedStream());

            expect(consumed).toBe(true);
        });

        test('locks the project before the exact staged name set and promotion', async () => {
            oneRowChunks();
            mockStagedCacheQueries();

            await model.saveExploreStreamToCache(
                projectUuid,
                stream([exploreWithMetricFilters]),
            );

            const transactionQueries = tracker.history.transactions[0].queries;
            const projectLockIndex = transactionQueries.findIndex(
                ({ sql }) =>
                    sql.includes('"cached_explores"') &&
                    sql.includes('for update'),
            );
            const stagedLockIndex = transactionQueries.findIndex(
                ({ sql }) =>
                    sql.includes('"cached_explore_staging"') &&
                    sql.includes('for update'),
            );
            const liveDeleteIndex = transactionQueries.findIndex(({ sql }) =>
                sql.startsWith('delete from "cached_explore"'),
            );
            const promotionIndex = transactionQueries.findIndex(
                ({ sql }) =>
                    sql.startsWith('INSERT INTO "cached_explore"') &&
                    sql.includes('SELECT cached_explore_uuid'),
            );
            expect(projectLockIndex).toBeGreaterThanOrEqual(0);
            expect(stagedLockIndex).toBeGreaterThan(projectLockIndex);
            expect(liveDeleteIndex).toBeGreaterThan(stagedLockIndex);
            expect(promotionIndex).toBeGreaterThan(liveDeleteIndex);
        });

        test('keeps managed overrides, late managed writes, and result order', async () => {
            oneRowChunks();
            const managedOverride = {
                ...exploreWithMetricFilters,
                name: 'managed_override',
                label: 'managed',
                type: ExploreType.VIRTUAL,
            };
            const managedAppend = {
                ...exploreWithMetricFilters,
                name: 'managed_append',
                label: 'append',
                type: ExploreType.VIRTUAL,
            };
            const incomingOverride = {
                ...exploreWithMetricFilters,
                name: 'managed_override',
                label: 'incoming',
            };
            const incoming = {
                ...exploreWithMetricFilters,
                name: 'incoming',
                label: 'incoming',
            };
            let userManagedExplores: { explore: typeof managedOverride }[] = [];
            const { stagedRows } = mockStagedCacheQueries({
                getUserManagedExplores: () => userManagedExplores,
                onLock: () => {
                    userManagedExplores = [
                        { explore: managedOverride },
                        { explore: managedAppend },
                    ];
                },
            });

            await expect(
                model.saveExploreStreamToCache(
                    projectUuid,
                    stream([incomingOverride, incoming]),
                ),
            ).resolves.toEqual({
                cachedExploreUuids: [
                    'managed_override-incoming',
                    'incoming-incoming',
                    'managed_append-append',
                ],
            });
            expect(stagedRows.get('managed_override')?.label).toBe('managed');
        });

        test('keeps the last duplicate within and across streamed batches while preserving first-name order', async () => {
            vi.mocked(chunkAsyncRowsByBytesMock).mockImplementation(
                async function* twoRowChunks(rows) {
                    let pending: { row: AnyType; bytes: number }[] = [];
                    for await (const row of rows) {
                        pending.push(row);
                        if (pending.length === 2) {
                            yield {
                                rows: pending.map((item) => item.row),
                                bytes: pending.reduce(
                                    (total, item) => total + item.bytes,
                                    0,
                                ),
                            };
                            pending = [];
                        }
                    }
                    if (pending.length > 0) {
                        yield {
                            rows: pending.map((item) => item.row),
                            bytes: pending.reduce(
                                (total, item) => total + item.bytes,
                                0,
                            ),
                        };
                    }
                },
            );
            const first = {
                ...exploreWithMetricFilters,
                name: 'duplicate',
                label: 'first',
            };
            const second = { ...first, label: 'second' };
            const other = {
                ...exploreWithMetricFilters,
                name: 'other',
                label: 'other',
            };
            const third = { ...first, label: 'third' };
            const { stagedRows } = mockStagedCacheQueries();

            await expect(
                model.saveExploreStreamToCache(
                    projectUuid,
                    stream([first, second, other, third]),
                ),
            ).resolves.toEqual({
                cachedExploreUuids: ['duplicate-second', 'other-other'],
            });
            expect(stagedRows.get('duplicate')?.label).toBe('third');
        });

        test('rejects an empty stream', async () => {
            oneRowChunks();
            mockStagedCacheQueries();

            await expect(
                model.saveExploreStreamToCache(projectUuid, stream([])),
            ).rejects.toThrow('No explores to save');
        });

        test('propagates source stream failures', async () => {
            oneRowChunks();
            mockStagedCacheQueries();
            async function* failingStream() {
                yield exploreWithMetricFilters;
                throw new Error('stream failed');
            }

            await expect(
                model.saveExploreStreamToCache(projectUuid, failingStream()),
            ).rejects.toThrow('stream failed');
            expect(
                tracker.history.delete.filter(({ sql }) =>
                    sql.includes('"cached_explore"'),
                ),
            ).toHaveLength(0);
            expect(
                tracker.history.insert.some(({ sql }) =>
                    sql.includes('"cached_explores"'),
                ),
            ).toBe(false);
            expect(
                tracker.history.all.some(({ sql }) =>
                    sql.startsWith('delete from "cached_explore_staging"'),
                ),
            ).toBe(true);
        });

        test('propagates staging insert failures without entering the swap', async () => {
            oneRowChunks();
            mockStagedCacheQueries({
                stageError: new Error('stage insert failed'),
            });

            await expect(
                model.saveExploreStreamToCache(
                    projectUuid,
                    stream([exploreWithMetricFilters]),
                ),
            ).rejects.toThrow('stage insert failed');
            expect(
                tracker.history.delete.filter(({ sql }) =>
                    sql.includes('"cached_explore"'),
                ),
            ).toHaveLength(0);
            expect(
                tracker.history.insert.some(({ sql }) =>
                    sql.includes('"cached_explores"'),
                ),
            ).toBe(false);
        });

        test('propagates swap failures after deletion', async () => {
            oneRowChunks();
            mockStagedCacheQueries({
                swapError: new Error('swap insert failed'),
            });

            await expect(
                model.saveExploreStreamToCache(
                    projectUuid,
                    stream([exploreWithMetricFilters]),
                ),
            ).rejects.toThrow('swap insert failed');
            expect(
                tracker.history.delete.filter(({ sql }) =>
                    sql.includes('"cached_explore"'),
                ),
            ).toHaveLength(1);
        });

        test('rejects a changed staged name set before deleting live rows', async () => {
            oneRowChunks();
            mockStagedCacheQueries({ getLockedNames: () => [] });

            await expect(
                model.saveExploreStreamToCache(
                    projectUuid,
                    stream([exploreWithMetricFilters]),
                ),
            ).rejects.toThrow('Cached explore staging name set mismatch');
            expect(
                tracker.history.delete.filter(({ sql }) =>
                    sql.includes('"cached_explore"'),
                ),
            ).toHaveLength(0);
        });
    });

    describe('mergeMissingProjectConfigSecrets', () => {
        test.each([
            [true, undefined, true],
            [false, undefined, false],
            [undefined, undefined, undefined],
            [true, false, false],
            [false, true, true],
        ])(
            'preserves BigQuery opt-in unless explicitly changed (%s, %s -> %s)',
            (savedValue, incomingValue, expectedValue) => {
                const connection: CreateBigqueryCredentials = {
                    type: WarehouseTypes.BIGQUERY,
                    authenticationType: BigqueryAuthenticationType.ADC,
                    project: 'project',
                    dataset: 'dataset',
                    keyfileContents: {},
                    timeoutSeconds: undefined,
                    priority: undefined,
                    retries: undefined,
                    location: undefined,
                    maximumBytesBilled: undefined,
                };
                const result = ProjectModel.mergeMissingProjectConfigSecrets(
                    {
                        ...expectedProject,
                        warehouseConnection: {
                            ...connection,
                            allowUserCredentials: incomingValue,
                        },
                    },
                    {
                        ...expectedProject,
                        warehouseConnection: {
                            ...connection,
                            allowUserCredentials: savedValue,
                        },
                    },
                );

                expect(result.warehouseConnection).toMatchObject({
                    allowUserCredentials: expectedValue,
                });
            },
        );
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
        const bitbucketConfig = {
            type: DbtProjectType.BITBUCKET as const,
            username: 'user',
            personal_access_token: 'saved-token',
            repository: 'workspace/repository',
            branch: 'main',
            project_sub_path: '/',
            host_domain: 'bitbucket.org',
        };

        test.each([
            { repository: 'workspace/another-repository' },
            { repository: 'another-workspace/repository' },
            { username: 'another-user' },
            { host_domain: 'bitbucket.example.com' },
        ])(
            'does not restore a Bitbucket token after destination change %j',
            (change) => {
                const incoming = {
                    ...bitbucketConfig,
                    ...change,
                    personal_access_token: '',
                };
                expect(
                    ProjectModel.mergeMissingDbtConfigSecrets(
                        incoming,
                        bitbucketConfig,
                    ),
                ).toEqual(incoming);
            },
        );

        test.each([
            {},
            { branch: 'another-branch' },
            { project_sub_path: '/dbt' },
            { host_domain: 'BITBUCKET.ORG.' },
        ])(
            'restores a Bitbucket token for the same destination %j',
            (change) => {
                const incoming = {
                    ...bitbucketConfig,
                    ...change,
                    personal_access_token: '',
                };
                expect(
                    ProjectModel.mergeMissingDbtConfigSecrets(
                        incoming,
                        bitbucketConfig,
                    ),
                ).toEqual({
                    ...incoming,
                    personal_access_token: 'saved-token',
                });
            },
        );

        test('preserves an explicitly supplied token when the Bitbucket destination changes', () => {
            const incoming = {
                ...bitbucketConfig,
                repository: 'workspace/another-repository',
                personal_access_token: 'replacement-token',
            };
            expect(
                ProjectModel.mergeMissingDbtConfigSecrets(
                    incoming,
                    bitbucketConfig,
                ),
            ).toEqual(incoming);
        });

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
