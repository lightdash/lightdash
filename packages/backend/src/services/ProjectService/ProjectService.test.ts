import {
    defineUserAbility,
    FilterOperator,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    SessionUser,
    WarehouseTypes,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import { S3Client } from '../../clients/Aws/S3Client';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../models/ProjectParametersModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    METRIC_QUERY,
    warehouseClientMock,
} from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { metricQueryWithLimit } from '../../utils/csvLimitUtils';
import { UserService } from '../UserService';
import { ProjectService } from './ProjectService';
import {
    allExplores,
    buildAccount,
    defaultProject,
    expectedAllExploreSummary,
    expectedAllExploreSummaryWithoutErrors,
    expectedApiQueryResultsWith1Row,
    expectedApiQueryResultsWith501Rows,
    expectedCatalog,
    expectedExploreSummaryFilteredByName,
    expectedExploreSummaryFilteredByTags,
    exploreToSummaryWithAttributes,
    exploreWithRequiredAttributes,
    job,
    lightdashConfigWithNoSMTP,
    metricQueryMock,
    projectSummary,
    projectWithSensitiveFields,
    resultsWith1Row,
    resultsWith501Rows,
    sessionAccount,
    spacesWithSavedCharts,
    tablesConfiguration,
    tablesConfigurationWithNames,
    tablesConfigurationWithTags,
    user,
    validExplore,
    virtualExplore,
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
    getAllExploreSummaries: jest.fn(async () =>
        allExplores.map(exploreToSummaryWithAttributes),
    ),
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
        userWarehouseCredentialsModel: {
            findForProjectWithSecrets: jest.fn(async () => undefined),
        } as unknown as UserWarehouseCredentialsModel,
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
        userModel: {} as UserModel,
        featureFlagModel: {} as FeatureFlagModel,
        projectParametersModel: {
            find: jest.fn(async () => []),
        } as unknown as ProjectParametersModel,
        organizationWarehouseCredentialsModel:
            {} as unknown as OrganizationWarehouseCredentialsModel,
        projectCompileLogModel: {} as ProjectCompileLogModel,
    });

const account = buildAccount({
    accountType: 'session',
    userType: 'registered',
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
        const result = await service.getTablesConfiguration(
            account,
            projectUuid,
        );
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
                sessionAccount,
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
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );
            expect(result).toEqual(expectedApiQueryResultsWith501Rows);
        });

        test('should use user warehouse credentials when available for databricks', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            // Mock project credentials to be Databricks type
            // (user credentials are only fetched for Databricks or when requireUserCredentials is true)
            const databricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockImplementation(async () => databricksCredentials);

            // Reset mock to return 1 row results (previous test may have changed it)
            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                credentials: databricksCredentials,
                runQuery: jest.fn(async () => resultsWith1Row),
            }));

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    token: 'custom-token',
                },
            };

            // Mock findForProjectWithSecrets to return user credentials
            const findForProjectWithSecretsMock = jest.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            const result = await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            // Verify findForProjectWithSecrets was called with correct arguments
            expect(findForProjectWithSecretsMock).toHaveBeenCalledWith(
                projectUuid,
                sessionAccount.user.id,
                WarehouseTypes.DATABRICKS,
            );

            // Query should still execute successfully with user credentials
            expect(result).toEqual(expectedApiQueryResultsWith1Row);
        });
    });

    describe('user warehouse credentials override', () => {
        test('should use user refreshToken instead of project refreshToken when requireUserCredentials is true', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            // Mock the token generation to avoid actual Snowflake API calls
            jest.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue('mocked-access-token');

            // Project credentials with Snowflake SSO that has a refreshToken
            // The project's refreshToken should be cleared and NOT used
            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token-should-not-be-used',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // User credentials with refreshToken (correct field)
            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: 'sso',
                    refreshToken: 'user-refresh-token',
                },
            };

            const findForProjectWithSecretsMock = jest.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: jest.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            // Verify generateSnowflakeAccessToken was called with user's refreshToken
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledWith('user-refresh-token');
            // Project's refreshToken should NOT have been used
            expect(
                UserService.generateSnowflakeAccessToken,
            ).not.toHaveBeenCalledWith(
                'project-refresh-token-should-not-be-used',
            );
        });

        test('should throw error when user credentials have token instead of refreshToken', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            // Mock the token generation to avoid actual Snowflake API calls
            jest.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue('mocked-access-token');

            // Project credentials with Snowflake SSO
            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // User credentials with token instead of refreshToken (the bug scenario)
            // Older code stored refreshToken in the token field by mistake
            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: 'sso',
                    token: 'user-token-stored-incorrectly', // Bug: stored in wrong field
                },
            };

            const findForProjectWithSecretsMock = jest.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: jest.fn(async () => resultsWith1Row),
            }));

            // Should throw an error because user credentials have token instead of refreshToken
            await expect(
                service.runExploreQuery(
                    sessionAccount,
                    metricQueryMock,
                    projectUuid,
                    'valid_explore',
                    null,
                ),
            ).rejects.toThrow('Error refreshing snowflake token');
        });

        test('should use project refreshToken when requireUserCredentials is false for Snowflake', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            // Mock the token generation to avoid actual Snowflake API calls
            jest.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue('mocked-access-token');

            // Mock project credentials with Snowflake SSO - requireUserCredentials is false
            // so the project's credentials should be used directly
            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token',
                requireUserCredentials: false,
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // User credentials should NOT be fetched when requireUserCredentials is false
            const findForProjectWithSecretsMock = jest.fn(
                async () => undefined,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: jest.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            // Verify generateSnowflakeAccessToken was called with project's refreshToken
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledWith('project-refresh-token');

            // User credentials should NOT have been fetched
            expect(findForProjectWithSecretsMock).not.toHaveBeenCalled();
        });
    });

    describe('getAllExploresSummary', () => {
        test('should get all explores summary without filtering', async () => {
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummary);
        });
        test('should get all explores summary with filtering', async () => {
            const result = await service.getAllExploresSummary(
                account,
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
                account,
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
                account,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByName);
        });
        test('should get all explores summary that do not have errors', async () => {
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummaryWithoutErrors);
        });

        test('should include virtual explores when filtered by tags even if they do not match', async () => {
            const exploresWithVirtual = [...allExplores, virtualExplore];
            (
                projectModel.getAllExploreSummaries as jest.Mock
            ).mockImplementationOnce(async () =>
                exploresWithVirtual.map(exploreToSummaryWithAttributes),
            );
            (
                projectModel.getTablesConfiguration as jest.Mock
            ).mockImplementationOnce(async () => ({
                tableSelection: {
                    type: 'WITH_TAGS',
                    value: ['non_existent_tag'], // Tag that doesn't match any explore
                },
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );

            // Should only include virtual explore since no other explores have the tag
            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('virtual_explore');
            expect(result[0].type).toEqual('virtual');
        });

        test('should include virtual explores when filtered by names even if they do not match', async () => {
            const exploresWithVirtual = [...allExplores, virtualExplore];
            (
                projectModel.getAllExploreSummaries as jest.Mock
            ).mockImplementationOnce(async () =>
                exploresWithVirtual.map(exploreToSummaryWithAttributes),
            );
            (
                projectModel.getTablesConfiguration as jest.Mock
            ).mockImplementationOnce(async () => ({
                tableSelection: {
                    type: 'WITH_NAMES',
                    value: ['non_existent_explore'], // Name that doesn't match any explore
                },
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );

            // Should only include virtual explore since no other explores match the name
            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('virtual_explore');
            expect(result[0].type).toEqual('virtual');
        });

        test('should exclude explores when user does not have required attributes', async () => {
            const exploresWithRequiredAttrs = [
                validExplore,
                exploreWithRequiredAttributes,
            ];
            (
                projectModel.getAllExploreSummaries as jest.Mock
            ).mockImplementationOnce(async () =>
                exploresWithRequiredAttrs.map(exploreToSummaryWithAttributes),
            );

            // Mock user attributes to NOT have is_admin: 'true'
            (
                userAttributesModel.getAttributeValuesForOrgMember as jest.Mock
            ).mockImplementationOnce(async () => ({
                is_admin: 'false',
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );

            // Should only include validExplore, not exploreWithRequiredAttributes
            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('valid_explore');
            expect(
                result.find(
                    (e) => e.name === 'explore_with_required_attributes',
                ),
            ).toBeUndefined();
        });

        test('should include explores when user has required attributes', async () => {
            const exploresWithRequiredAttrs = [
                validExplore,
                exploreWithRequiredAttributes,
            ];
            (
                projectModel.getAllExploreSummaries as jest.Mock
            ).mockImplementationOnce(async () =>
                exploresWithRequiredAttrs.map(exploreToSummaryWithAttributes),
            );

            // Mock user attributes to have is_admin: 'true'
            (
                userAttributesModel.getAttributeValuesForOrgMember as jest.Mock
            ).mockImplementationOnce(async () => ({
                is_admin: 'true',
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );

            // Should include both explores
            expect(result).toHaveLength(2);
            expect(result.map((e) => e.name)).toContain('valid_explore');
            expect(result.map((e) => e.name)).toContain(
                'explore_with_required_attributes',
            );
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
            const csvCellsLimit = 100000;
            const maxLimit = 5000;

            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    undefined,
                    csvCellsLimit,
                    maxLimit,
                ),
            ).toEqual(METRIC_QUERY); // Returns same metricquery

            expect(
                metricQueryWithLimit(METRIC_QUERY, 5, csvCellsLimit, maxLimit)
                    .limit,
            ).toEqual(5);
            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    null,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(33333);
            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    9999,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(9999);
            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    9999999,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(33333);

            const metricWithoutRows = {
                ...METRIC_QUERY,
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            expect(() =>
                metricQueryWithLimit(
                    metricWithoutRows,
                    null,
                    csvCellsLimit,
                    maxLimit,
                ),
            ).toThrowError(ParameterError);

            const metricWithDimension = { ...METRIC_QUERY, metrics: [] };
            expect(
                metricQueryWithLimit(
                    metricWithDimension,
                    null,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
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
                                   WHERE (( true ) AND ( () IS NOT NULL ))
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
                            operator: FilterOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'a_dim1',
                            },
                        },
                        {
                            id: 'valid_joined',
                            operator: FilterOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'b_dim1',
                            },
                        },
                        {
                            id: 'invalid',
                            operator: FilterOperator.EQUALS,
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
                                        WHERE (( true ) AND ( () IS NOT NULL ) AND ( () IN ('test') ) AND ( () IN ('test') ))
                                        GROUP BY 1
                                        ORDER BY "a_dim1"
                                        LIMIT 10`),
            );
        });
    });
});
