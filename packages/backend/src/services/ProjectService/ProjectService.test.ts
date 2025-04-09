import {
    ConditionalOperator,
    CreateWarehouseCredentials,
    defineUserAbility,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    SessionUser,
    type ExecuteAsyncMetricQueryRequestParams,
} from '@lightdash/common';
import { SshTunnel, WarehouseClient } from '@lightdash/warehouses';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import { S3Client } from '../../clients/Aws/S3Client';
import EmailClient from '../../clients/EmailClient/EmailClient';
import type { S3ResultsCacheStorageClient } from '../../clients/ResultsCacheStorageClients/S3ResultsCacheStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    LightdashConfig as ParseConfigLightdashConfig,
    type LightdashConfig,
} from '../../config/parseConfig';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel';
import type { ResultsCacheModel } from '../../models/ResultsCacheModel/ResultsCacheModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { METRIC_QUERY, warehouseClientMock } from '../../queryBuilder.mock';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ProjectService } from './ProjectService';
import {
    allExplores,
    defaultProject,
    expectedAllExploreSummary,
    expectedAllExploreSummaryWithoutErrors,
    expectedApiQueryResultsWith1Row,
    expectedApiQueryResultsWith501Rows,
    expectedCatalog,
    expectedExploreSummaryFilteredByName,
    expectedExploreSummaryFilteredByTags,
    job,
    lightdashConfigWithNoSMTP,
    metricQueryMock,
    projectSummary,
    projectWithSensitiveFields,
    resultsWith1Row,
    resultsWith501Rows,
    spacesWithSavedCharts,
    tablesConfiguration,
    tablesConfigurationWithNames,
    tablesConfigurationWithTags,
    user,
    validExplore,
} from './ProjectService.mock';

jest.mock('@lightdash/warehouses', () => ({
    SshTunnel: jest.fn(() => ({
        connect: jest.fn(() => warehouseClientMock.credentials),
        disconnect: jest.fn(),
    })),
}));

const projectModel = {
    getWithSensitiveFields: jest.fn(async () => projectWithSensitiveFields),
    get: jest.fn(async () => projectWithSensitiveFields),
    getSummary: jest.fn(async () => projectSummary),
    getTablesConfiguration: jest.fn(async () => tablesConfiguration),
    updateTablesConfiguration: jest.fn(),
    getExploreFromCache: jest.fn(async () => validExplore),
    findExploresFromCache: jest.fn(async () => allExplores),
    lockProcess: jest.fn((projectUuid, fun) => fun()),
    getWarehouseCredentialsForProject: jest.fn(
        async () => warehouseClientMock.credentials,
    ),
    getWarehouseClientFromCredentials: jest.fn(() => ({
        ...warehouseClientMock,
        runQuery: jest.fn(async () => resultsWith1Row),
    })),
    findExploreByTableName: jest.fn(async () => validExplore),
};
const onboardingModel = {
    getByOrganizationUuid: jest.fn(async () => ({
        ranQueryAt: new Date(),
        shownSuccessAt: new Date(),
    })),
};
const savedChartModel = {
    getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
};
const jobModel = {
    get: jest.fn(async () => job),
};
const spaceModel = {
    getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
};

const userAttributesModel = {
    getAttributeValuesForOrgMember: jest.fn(async () => ({})),
};

const getMockedProjectService = (lightdashConfig: LightdashConfig) =>
    new ProjectService({
        lightdashConfig,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        onboardingModel: onboardingModel as unknown as OnboardingModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        jobModel: jobModel as unknown as JobModel,
        emailClient: new EmailClient({
            lightdashConfig: lightdashConfigWithNoSMTP,
        }),
        spaceModel: spaceModel as unknown as SpaceModel,
        sshKeyPairModel: {} as SshKeyPairModel,
        userAttributesModel:
            userAttributesModel as unknown as UserAttributesModel,
        s3CacheClient: {} as S3CacheClient,
        analyticsModel: {} as AnalyticsModel,
        dashboardModel: {} as DashboardModel,
        userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        emailModel: {
            getPrimaryEmailStatus: (userUuid: string) => ({
                isVerified: true,
            }),
        } as unknown as EmailModel,
        schedulerClient: {} as SchedulerClient,
        downloadFileModel: {} as unknown as DownloadFileModel,
        s3Client: {} as S3Client,
        groupsModel: {} as GroupsModel,
        tagsModel: {} as TagsModel,
        catalogModel: {} as CatalogModel,
        contentModel: {} as ContentModel,
        encryptionUtil: {} as EncryptionUtil,
        queryHistoryModel: {
            create: jest.fn(async () => ({ queryUuid: 'queryUuid' })),
            get: jest.fn(async () => undefined),
            update: jest.fn(),
        } as unknown as QueryHistoryModel,
        userModel: {} as UserModel,
        resultsCacheModel: {} as ResultsCacheModel,
        resultsCacheStorageClient: {} as S3ResultsCacheStorageClient,
    });

describe('ProjectService', () => {
    const { projectUuid } = defaultProject;
    const service = getMockedProjectService(lightdashConfigMock);

    afterEach(() => {
        jest.clearAllMocks();
    });
    test('should run sql query', async () => {
        jest.spyOn(analyticsMock, 'track');
        const result = await service.runSqlQuery(user, projectUuid, 'fake sql');

        expect(result).toEqual(resultsWith1Row);
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'query.executed',
            }),
        );
    });
    test('should get project catalog', async () => {
        const results = await service.getCatalog(user, projectUuid);

        expect(results).toEqual(expectedCatalog);
    });
    test('should get tables configuration', async () => {
        const result = await service.getTablesConfiguration(user, projectUuid);
        expect(result).toEqual(tablesConfiguration);
    });
    test('should update tables configuration', async () => {
        await service.updateTablesConfiguration(
            user,
            projectUuid,
            tablesConfigurationWithNames,
        );
        jest.spyOn(analyticsMock, 'track');
        expect(projectModel.updateTablesConfiguration).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'project_tables_configuration.updated',
            }),
        );
    });
    describe('runExploreQuery', () => {
        test('should get results with 1 row', async () => {
            const result = await service.runExploreQuery(
                user,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );
            expect(result).toEqual(expectedApiQueryResultsWith1Row);
        });
        test('should get results with 501 rows', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};
            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: jest.fn(async () => resultsWith501Rows),
            }));

            const result = await service.runExploreQuery(
                user,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );
            expect(result).toEqual(expectedApiQueryResultsWith501Rows);
        });
    });
    describe('getAllExploresSummary', () => {
        test('should get all explores summary without filtering', async () => {
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummary);
        });
        test('should get all explores summary with filtering', async () => {
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedAllExploreSummary);
        });
        test('should get explores summary filtered by tag', async () => {
            (
                projectModel.getTablesConfiguration as jest.Mock
            ).mockImplementationOnce(async () => tablesConfigurationWithTags);
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByTags);
        });
        test('should get explores summary filtered by name', async () => {
            (
                projectModel.getTablesConfiguration as jest.Mock
            ).mockImplementationOnce(async () => tablesConfigurationWithNames);
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByName);
        });
        test('should get all explores summary that do not have errors', async () => {
            const result = await service.getAllExploresSummary(
                user,
                projectUuid,
                false,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummaryWithoutErrors);
        });
    });
    describe('getJobStatus', () => {
        test('should get job with projectUuid if user belongs to org ', async () => {
            const result = await service.getJobStatus('jobUuid', user);
            expect(result).toEqual(job);
        });
        test('should get job without projectUuid if user created the job ', async () => {
            const jobWithoutProjectUuid = { ...job, projectUuid: undefined };
            (jobModel.get as jest.Mock).mockImplementationOnce(
                async () => jobWithoutProjectUuid,
            );

            const result = await service.getJobStatus('jobUuid', user);
            expect(result).toEqual(jobWithoutProjectUuid);
        });

        test('should not get job without projectUuid if user is different', async () => {
            const jobWithoutProjectUuid = { ...job, projectUuid: undefined };
            (jobModel.get as jest.Mock).mockImplementationOnce(
                async () => jobWithoutProjectUuid,
            );
            const anotherUser: SessionUser = {
                ...user,
                userUuid: 'another-user-uuid',
                role: OrganizationMemberRole.VIEWER,

                ability: defineUserAbility(
                    {
                        ...user,
                        role: OrganizationMemberRole.VIEWER,
                        userUuid: 'another-user-uuid',
                    },
                    [],
                ),
            };
            await expect(
                service.getJobStatus('jobUuid', anotherUser),
            ).rejects.toThrowError(NotFoundError);
        });

        test('should limit CSV results', async () => {
            expect(
                // @ts-ignore
                service.metricQueryWithLimit(METRIC_QUERY, undefined),
            ).toEqual(METRIC_QUERY); // Returns same metricquery

            expect(
                // @ts-ignore
                service.metricQueryWithLimit(METRIC_QUERY, 5).limit,
            ).toEqual(5);
            expect(
                // @ts-ignore
                service.metricQueryWithLimit(METRIC_QUERY, null).limit,
            ).toEqual(33333);
            expect(
                // @ts-ignore
                service.metricQueryWithLimit(METRIC_QUERY, 9999).limit,
            ).toEqual(9999);
            expect(
                // @ts-ignore
                service.metricQueryWithLimit(METRIC_QUERY, 9999999).limit,
            ).toEqual(33333);

            const metricWithoutRows = {
                ...METRIC_QUERY,
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            expect(() =>
                // @ts-ignore
                service.metricQueryWithLimit(metricWithoutRows, null),
            ).toThrowError(ParameterError);

            const metricWithDimension = { ...METRIC_QUERY, metrics: [] };
            expect(
                // @ts-ignore
                service.metricQueryWithLimit(metricWithDimension, null).limit,
            ).toEqual(50000);
        });
    });
    describe('searchFieldUniqueValues', () => {
        const replaceWhitespace = (str: string) =>
            str.replace(/\s+/g, ' ').trim();

        beforeEach(() => {
            // Clear the warehouse clients cache
            service.warehouseClients = {};
        });

        afterEach(() => {
            jest.clearAllMocks();
        });
        test('should query unique values', async () => {
            const runQueryMock = jest.fn(
                async (_sql: string) => resultsWith1Row,
            );
            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));
            await service.searchFieldUniqueValues(
                user,
                projectUuid,
                'a',
                'a_dim1',
                '',
                10,
                undefined,
            );
            expect(runQueryMock).toHaveBeenCalledTimes(1);
            expect(replaceWhitespace(runQueryMock.mock.calls[0][0])).toEqual(
                replaceWhitespace(`SELECT AS "a_dim1"
                                   FROM test.table AS "a"
                                   WHERE (( LOWER() LIKE LOWER('%%') ))
                                   GROUP BY 1
                                   ORDER BY "a_dim1" 
                                   LIMIT 10`),
            );
        });
        test('should query unique values with valid filters', async () => {
            const runQueryMock = jest.fn(
                async (_sql: string) => resultsWith1Row,
            );
            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));
            await service.searchFieldUniqueValues(
                user,
                projectUuid,
                'a',
                'a_dim1',
                '',
                10,
                {
                    id: '1',
                    and: [
                        {
                            id: 'valid',
                            operator: ConditionalOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'a_dim1',
                            },
                        },
                        {
                            id: 'valid_joined',
                            operator: ConditionalOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'b_dim1',
                            },
                        },
                        {
                            id: 'invalid',
                            operator: ConditionalOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'c_dim1',
                            },
                        },
                    ],
                },
            );
            expect(runQueryMock).toHaveBeenCalledTimes(1);
            expect(replaceWhitespace(runQueryMock.mock.calls[0][0])).toEqual(
                replaceWhitespace(`SELECT AS "a_dim1" 
                                        FROM test.table AS "a" 
                                        LEFT OUTER JOIN public.b AS "b" ON ("a".dim1) = ("b".dim1) 
                                        WHERE (( LOWER() LIKE LOWER('%%') ) AND ( () IN ('test') ) AND ( () IN ('test') )) 
                                        GROUP BY 1 
                                        ORDER BY "a_dim1" 
                                        LIMIT 10`),
            );
        });
    });
    describe('executeAsyncQuery', () => {
        describe('when cache is enabled', () => {
            const write = jest.fn();
            const close = jest.fn();
            const serviceWithCache = getMockedProjectService({
                ...lightdashConfigMock,
                resultsCache: {
                    ...lightdashConfigMock.resultsCache,
                    resultsEnabled: true,
                },
            });

            beforeEach(() => {
                jest.clearAllMocks();
                // Mock the resultsCacheModel.createOrGetExistingCache method
                serviceWithCache.resultsCacheModel.createOrGetExistingCache =
                    jest.fn().mockImplementation(async () => ({
                        cacheHit: false,
                        cacheKey: 'test-cache-key',
                        write,
                        close,
                    }));
            });

            test('should return queryUuid when cache is hit', async () => {
                // Mock the resultsCacheModel to return a cache hit
                const mockCacheResult = {
                    cacheHit: true,
                    cacheKey: 'test-cache-key',
                    totalRowCount: 10,
                };

                (
                    serviceWithCache.resultsCacheModel
                        .createOrGetExistingCache as jest.Mock
                ).mockResolvedValueOnce(mockCacheResult);

                // Mock the queryHistoryModel.create to return a queryUuid
                (
                    serviceWithCache.queryHistoryModel.create as jest.Mock
                ).mockResolvedValue({
                    queryUuid: 'test-query-uuid',
                });

                // Spy on the warehouse client executeAsyncQuery method
                const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                    warehouseClientMock,
                    'executeAsyncQuery',
                );

                const result = await serviceWithCache.executeAsyncQuery(
                    {
                        user,
                        projectUuid,
                        metricQuery: metricQueryMock,
                        context: QueryExecutionContext.EXPLORE,
                        granularity: undefined,
                        queryTags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                        exploreName: 'valid_explore',
                        invalidateCache: false,
                    },
                    { query: metricQueryMock },
                );

                expect(result).toEqual({
                    queryUuid: 'test-query-uuid',
                });

                // Verify that the query history was updated with READY status
                expect(
                    serviceWithCache.queryHistoryModel.update,
                ).toHaveBeenCalledWith(
                    'test-query-uuid',
                    projectUuid,
                    user.userUuid,
                    {
                        status: QueryHistoryStatus.READY,
                        error: null,
                        total_row_count: 10,
                    },
                );

                // Verify that the warehouse client executeAsyncQuery method was not called
                expect(
                    warehouseClientExecuteAsyncQuerySpy,
                ).not.toHaveBeenCalled();
            });

            test('should trigger background query when cache is not hit', async () => {
                // Mock the resultsCacheModel to return a cache miss
                const mockCacheResult = {
                    cacheHit: false,
                    cacheKey: 'test-cache-key',
                    write,
                    close,
                };

                (
                    serviceWithCache.resultsCacheModel
                        .createOrGetExistingCache as jest.Mock
                ).mockResolvedValueOnce(mockCacheResult);

                // Mock the queryHistoryModel.create to return a queryUuid
                (
                    serviceWithCache.queryHistoryModel.create as jest.Mock
                ).mockResolvedValue({
                    queryUuid: 'test-query-uuid',
                });

                // Spy on the warehouse client executeAsyncQuery method
                const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                    warehouseClientMock,
                    'executeAsyncQuery',
                );

                const result = await serviceWithCache.executeAsyncQuery(
                    {
                        user,
                        projectUuid,
                        metricQuery: metricQueryMock,
                        context: QueryExecutionContext.EXPLORE,
                        granularity: undefined,
                        queryTags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                        exploreName: 'valid_explore',
                        invalidateCache: false,
                    },
                    { query: metricQueryMock },
                );

                expect(result).toEqual({
                    queryUuid: 'test-query-uuid',
                });

                // Verify that the query history was not updated with READY status
                expect(
                    serviceWithCache.queryHistoryModel.update,
                ).not.toHaveBeenCalledWith(
                    'test-query-uuid',
                    projectUuid,
                    user.userUuid,
                    {
                        status: QueryHistoryStatus.READY,
                        error: null,
                        total_row_count: expect.any(Number),
                    },
                );

                // Verify that the warehouse client executeAsyncQuery method was not called
                expect(
                    warehouseClientExecuteAsyncQuerySpy,
                ).toHaveBeenCalledWith(
                    {
                        sql: expect.any(String),
                        tags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                    },
                    write,
                );
            });

            test('should invalidate cache when invalidateCache is true', async () => {
                // Mock the resultsCacheModel to return a cache miss
                const mockCacheResult = {
                    cacheHit: false,
                    cacheKey: 'test-cache-key',
                    write,
                    close,
                };

                (
                    serviceWithCache.resultsCacheModel
                        .createOrGetExistingCache as jest.Mock
                ).mockResolvedValueOnce(mockCacheResult);

                // Mock the queryHistoryModel.create to return a queryUuid
                (
                    serviceWithCache.queryHistoryModel.create as jest.Mock
                ).mockResolvedValue({
                    queryUuid: 'test-query-uuid',
                });

                // Spy on the warehouse client executeAsyncQuery method
                const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                    warehouseClientMock,
                    'executeAsyncQuery',
                );

                await serviceWithCache.executeAsyncQuery(
                    {
                        user,
                        projectUuid,
                        metricQuery: metricQueryMock,
                        context: QueryExecutionContext.EXPLORE,
                        granularity: undefined,
                        queryTags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                        exploreName: 'valid_explore',
                        invalidateCache: true,
                    },
                    { query: metricQueryMock },
                );

                // Verify that createOrGetExistingCache was called with invalidateCache: true
                expect(
                    serviceWithCache.resultsCacheModel.createOrGetExistingCache,
                ).toHaveBeenCalledWith(
                    projectUuid,
                    expect.any(Object),
                    expect.any(Object),
                    true,
                );

                // Verify that the query history was not updated with READY status
                expect(
                    serviceWithCache.queryHistoryModel.update,
                ).not.toHaveBeenCalledWith(
                    'test-query-uuid',
                    projectUuid,
                    user.userUuid,
                    {
                        status: QueryHistoryStatus.READY,
                        error: null,
                        total_row_count: expect.any(Number),
                    },
                );

                // Verify that the warehouse client executeAsyncQuery method was called
                expect(
                    warehouseClientExecuteAsyncQuerySpy,
                ).toHaveBeenCalledWith(
                    {
                        sql: expect.any(String),
                        tags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                    },
                    write,
                );
            });
        });

        describe('when cache is disabled', () => {
            const serviceWithoutCache = getMockedProjectService({
                ...lightdashConfigMock,
                resultsCache: {
                    ...lightdashConfigMock.resultsCache,
                    resultsEnabled: false,
                },
            });

            beforeEach(() => {
                jest.clearAllMocks();
                // Mock the resultsCacheModel.createOrGetExistingCache method
                serviceWithoutCache.resultsCacheModel.createOrGetExistingCache =
                    jest.fn();
            });

            test('should trigger background query without checking cache', async () => {
                // Mock the queryHistoryModel.create to return a queryUuid
                (
                    serviceWithoutCache.queryHistoryModel.create as jest.Mock
                ).mockResolvedValue({
                    queryUuid: 'test-query-uuid',
                });

                const result = await serviceWithoutCache.executeAsyncQuery(
                    {
                        user,
                        projectUuid,
                        metricQuery: metricQueryMock,
                        context: QueryExecutionContext.EXPLORE,
                        granularity: undefined,
                        queryTags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                        exploreName: 'valid_explore',
                        invalidateCache: false,
                    },
                    { query: metricQueryMock },
                );

                expect(result).toEqual({
                    queryUuid: 'test-query-uuid',
                });

                // Verify that resultsCacheModel.createOrGetExistingCache was not called
                expect(
                    serviceWithoutCache.resultsCacheModel
                        .createOrGetExistingCache,
                ).not.toHaveBeenCalled();

                // Verify that the query history was not updated with READY status
                expect(
                    serviceWithoutCache.queryHistoryModel.update,
                ).not.toHaveBeenCalledWith(
                    'test-query-uuid',
                    projectUuid,
                    user.userUuid,
                    {
                        status: QueryHistoryStatus.READY,
                        error: null,
                        total_row_count: expect.any(Number),
                    },
                );
            });
        });
    });
});
