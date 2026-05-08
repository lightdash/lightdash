import { Ability } from '@casl/ability';
import {
    defineUserAbility,
    FilterOperator,
    ForbiddenError,
    MetricType,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    PreAggregateMissReason,
    ProjectType,
    SessionUser,
    WarehouseTypes,
    type ChartSummary,
    type Explore,
    type PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { PreAggregateModel } from '../../ee/models/PreAggregateModel';
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
import { OrganizationModel } from '../../models/OrganizationModel';
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
import { metricQueryWithLimit } from '../../utils/csvLimitUtils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    METRIC_QUERY,
    warehouseClientMock,
} from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
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
    preAggregateExplore,
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

// Mock worker_threads so the >500 rows test doesn't need a compiled
// dist/services/ProjectService/formatRows.js artifact. In production,
// formatRows runs in a Worker thread for large result sets, but the Worker
// constructor requires the built JS file which only exists after `pnpm build`.
// This mock runs formatRows synchronously in the main thread instead.
jest.mock('worker_threads', () => {
    const { formatRows } = jest.requireActual('@lightdash/common');
    return {
        Worker: jest.fn().mockImplementation(
            (
                _path: string,
                options: {
                    workerData: { rows: unknown[]; itemMap: unknown };
                },
            ) => {
                const { rows, itemMap } = options.workerData;
                const result = formatRows(rows, itemMap);
                return {
                    on: jest.fn(
                        (
                            event: string,
                            callback: (...args: unknown[]) => void,
                        ) => {
                            if (event === 'message') {
                                setTimeout(() => callback(result), 0);
                            }
                        },
                    ),
                    terminate: jest.fn(),
                };
            },
        ),
    };
});

jest.mock('@lightdash/warehouses', () => ({
    SshTunnel: jest.fn(() => ({
        connect: jest.fn(() => warehouseClientMock.credentials),
        disconnect: jest.fn(),
    })),
    exchangeDatabricksOAuthCredentials: jest.fn(),
    refreshDatabricksOAuthToken: jest.fn(),
    DATABRICKS_DEFAULT_OAUTH_CLIENT_ID: 'default-client-id',
}));

const projectModel = {
    getWithSensitiveFields: jest.fn(async () => projectWithSensitiveFields),
    get: jest.fn(async () => projectWithSensitiveFields),
    getSummary: jest.fn(async () => projectSummary),
    getTablesConfiguration: jest.fn(async () => tablesConfiguration),
    updateTablesConfiguration: jest.fn(),
    getExploreFromCache: jest.fn(async () => validExplore),
    getQueryTimezone: jest.fn(async () => null),
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
    getAllExploresFromCache: jest.fn(async () => ({})),
    saveExploresToCache: jest.fn(async () => ({ cachedExploreUuids: [] })),
    updateDefaultUserSpaces: jest.fn(async () => undefined),
};
const preAggregateModel = {
    upsertPreAggregateDefinitions: jest.fn(),
    getPreAggregateDefinitionsForProject: jest.fn(async () => []),
    getPreAggregateDefinitionByDefinitionName: jest.fn(async () => undefined),
    getActiveMaterialization: jest.fn(async () => undefined),
};
const onboardingModel = {
    getByOrganizationUuid: jest.fn(async () => ({
        ranQueryAt: new Date(),
        shownSuccessAt: new Date(),
    })),
};
const savedChartModel = {
    getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
    find: jest.fn(async () => [] as ChartSummary[]),
};
const jobModel = {
    get: jest.fn(async () => job),
};
const spaceModel = {
    getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
    find: jest.fn(async () => spacesWithSavedCharts),
};

const userAttributesModel = {
    getAttributeValuesForOrgMember: jest.fn(async () => ({})),
};

const schedulerClient = {
    deleteScheduledPreAggregateCronJobsForProject: jest.fn(
        async () => undefined,
    ),
    indexCatalog: jest.fn(async () => ({ jobId: 'catalog-job-1' })),
    materializePreAggregate: jest.fn(async () => ({ jobId: 'job-1' })),
    schedulePreAggregateCronJobs: jest.fn(async () => []),
};

const catalogModel = {
    getCatalogItemsWithTags: jest.fn(async () => []),
    getCatalogItemsWithIcons: jest.fn(async () => []),
    getAllMetricsTreeEdges: jest.fn(async () => []),
    getAllMetricsTreeNodes: jest.fn(async () => []),
};

const projectCompileLogModel = {
    insert: jest.fn(async () => undefined),
};

const getMockedProjectService = (
    lightdashConfig: LightdashConfig,
    overrides: { spacePermissionService?: SpacePermissionService } = {},
) =>
    new ProjectService({
        lightdashConfig,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        preAggregateModel: preAggregateModel as unknown as PreAggregateModel,
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
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        downloadFileModel: {} as unknown as DownloadFileModel,
        fileStorageClient: {} as FileStorageClient,
        groupsModel: {} as GroupsModel,
        tagsModel: {} as TagsModel,
        catalogModel: catalogModel as unknown as CatalogModel,
        contentModel: {} as ContentModel,
        encryptionUtil: {} as EncryptionUtil,
        userModel: {} as UserModel,
        featureFlagModel: {
            get: jest.fn(async () => ({
                id: '',
                enabled: false,
            })),
        } as unknown as FeatureFlagModel,
        projectParametersModel: {
            find: jest.fn(async () => []),
        } as unknown as ProjectParametersModel,
        organizationWarehouseCredentialsModel:
            {} as unknown as OrganizationWarehouseCredentialsModel,
        organizationModel: {} as unknown as OrganizationModel,
        projectCompileLogModel:
            projectCompileLogModel as unknown as ProjectCompileLogModel,
        adminNotificationService: {
            notifyConnectionSettingsChange: jest.fn(async () => undefined),
        } as unknown as AdminNotificationService,
        spacePermissionService:
            overrides.spacePermissionService ?? ({} as SpacePermissionService),
    });

const account = buildAccount({
    accountType: 'session',
    userType: 'registered',
});
const developerAccount = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: ['update', 'view'] },
            { subject: 'Job', action: ['view'] },
            { subject: 'SqlRunner', action: ['manage'] },
            { subject: 'Explore', action: ['manage'] },
            { subject: 'PreAggregation', action: ['manage'] },
        ]),
    },
} as typeof account;

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
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'mocked-refresh-token',
            });

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
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'mocked-refresh-token',
            });

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
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'mocked-refresh-token',
            });

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

        test('should persist rotated Snowflake refresh token to user_warehouse_credentials when Snowflake rotates it', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            jest.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'rotated-refresh-token',
            });

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
            const rotateRefreshTokenMock = jest.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

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

            expect(rotateRefreshTokenMock).toHaveBeenCalledTimes(1);
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                'user-creds-uuid',
                'user-refresh-token',
                'rotated-refresh-token',
            );
        });

        test('should not call rotateRefreshToken when Snowflake returns the same refresh token', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            jest.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'user-refresh-token',
            });

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
            const rotateRefreshTokenMock = jest.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

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

            expect(rotateRefreshTokenMock).not.toHaveBeenCalled();
        });

        test('should persist rotated Databricks OAuth U2M refresh token to user_warehouse_credentials when Databricks rotates it', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            const { refreshDatabricksOAuthToken } = jest.requireMock(
                '@lightdash/warehouses',
            );
            (refreshDatabricksOAuthToken as jest.Mock).mockResolvedValue({
                accessToken: 'fresh-u2m-access-token',
                refreshToken: 'rotated-u2m-refresh-token',
            });

            const projectDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockImplementation(async () => projectDatabricksCredentials);

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType: 'oauth_u2m',
                    serverHostName: 'test.databricks.com',
                    refreshToken: 'user-u2m-refresh-token',
                    oauthClientId: 'user-client-id',
                },
            };

            const findForProjectWithSecretsMock = jest.fn(
                async () => userCredentials,
            );
            const rotateRefreshTokenMock = jest.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

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

            expect(rotateRefreshTokenMock).toHaveBeenCalledTimes(1);
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                'user-creds-uuid',
                'user-u2m-refresh-token',
                'rotated-u2m-refresh-token',
            );
        });

        test('should not call rotateRefreshToken when Databricks returns the same refresh token', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClients = {};

            const { refreshDatabricksOAuthToken } = jest.requireMock(
                '@lightdash/warehouses',
            );
            (refreshDatabricksOAuthToken as jest.Mock).mockResolvedValue({
                accessToken: 'fresh-u2m-access-token',
                refreshToken: 'user-u2m-refresh-token',
            });

            const projectDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockImplementation(async () => projectDatabricksCredentials);

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType: 'oauth_u2m',
                    serverHostName: 'test.databricks.com',
                    refreshToken: 'user-u2m-refresh-token',
                    oauthClientId: 'user-client-id',
                },
            };

            const findForProjectWithSecretsMock = jest.fn(
                async () => userCredentials,
            );
            const rotateRefreshTokenMock = jest.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: jest.Mock;
                        rotateRefreshToken: jest.Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

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

            expect(rotateRefreshTokenMock).not.toHaveBeenCalled();
        });
    });

    describe('getWarehouseCredentialsForEmbed', () => {
        test('should refresh Databricks oauth_m2m credentials so the access token is populated', async () => {
            const { exchangeDatabricksOAuthCredentials } = jest.requireMock(
                '@lightdash/warehouses',
            );

            // Project credentials as stored in DB: m2m client id/secret but no token yet.
            const projectCredentials = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_m2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                catalog: 'test_catalog',
                oauthClientId: 'client-id',
                oauthClientSecret: 'client-secret',
            };
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockResolvedValueOnce(projectCredentials);

            (
                exchangeDatabricksOAuthCredentials as jest.Mock
            ).mockResolvedValueOnce({
                accessToken: 'fresh-m2m-access-token',
                refreshToken: 'fresh-m2m-refresh-token',
            });

            const embedAccount = buildAccount({
                accountType: 'jwt',
                userType: 'anonymous',
            });

            const credentials = await service.getWarehouseCredentialsForEmbed({
                projectUuid,
                // The mock buildAccount returns Account; AnonymousAccount is structurally compatible.
                account: embedAccount as never,
            });

            expect(exchangeDatabricksOAuthCredentials).toHaveBeenCalledWith(
                'test.databricks.com',
                'client-id',
                'client-secret',
            );
            // Token must be present, otherwise DatabricksWarehouseClient throws
            // "Databricks OAuth access token is required for OAuth oauth_m2m authentication"
            expect(credentials).toMatchObject({
                token: 'fresh-m2m-access-token',
                authenticationType: 'oauth_m2m',
            });
        });

        test('should throw when project requires user credentials', async () => {
            (
                projectModel.getWarehouseCredentialsForProject as jest.Mock
            ).mockResolvedValueOnce({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                requireUserCredentials: true,
            });

            const embedAccount = buildAccount({
                accountType: 'jwt',
                userType: 'anonymous',
            });

            await expect(
                service.getWarehouseCredentialsForEmbed({
                    projectUuid,
                    account: embedAccount as never,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
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

        test('should include pre-aggregate explores for developer users when requested', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const exploresWithPreAggregates = [
                ...allExplores,
                preAggregateExplore,
            ];
            (
                projectModel.getAllExploreSummaries as jest.Mock
            ).mockImplementationOnce(async () =>
                exploresWithPreAggregates.map(exploreToSummaryWithAttributes),
            );

            const result =
                await serviceWithPreAggregatesEnabled.getAllExploresSummary(
                    developerAccount,
                    projectUuid,
                    true,
                    true,
                    true,
                );

            expect(result.map((explore) => explore.name)).toContain(
                preAggregateExplore.name,
            );
        });

        test('should exclude pre-aggregate explores for non-developer users even when requested', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const exploresWithPreAggregates = [
                ...allExplores,
                preAggregateExplore,
            ];
            (
                projectModel.getAllExploreSummaries as jest.Mock
            ).mockImplementationOnce(async () =>
                exploresWithPreAggregates.map(exploreToSummaryWithAttributes),
            );

            const result =
                await serviceWithPreAggregatesEnabled.getAllExploresSummary(
                    account,
                    projectUuid,
                    true,
                    true,
                    true,
                );

            expect(result.map((explore) => explore.name)).not.toContain(
                preAggregateExplore.name,
            );
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

    describe('getExplore', () => {
        test('should allow developer users to get a pre-aggregate explore', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (
                projectModel.findExploresFromCache as jest.Mock
            ).mockImplementationOnce(async () => [preAggregateExplore]);

            const result = await serviceWithPreAggregatesEnabled.getExplore(
                developerAccount,
                projectUuid,
                preAggregateExplore.name,
            );

            expect(result.name).toEqual(preAggregateExplore.name);
        });

        test('should not allow non-developer users to get a pre-aggregate explore', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (
                projectModel.findExploresFromCache as jest.Mock
            ).mockImplementationOnce(async () => [preAggregateExplore]);

            await expect(
                serviceWithPreAggregatesEnabled.getExplore(
                    account,
                    projectUuid,
                    preAggregateExplore.name,
                ),
            ).rejects.toThrow(
                `Explore "${preAggregateExplore.name}" does not exist.`,
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

        const buildS3CacheMock = (
            lookups: string[],
            store: Map<string, string>,
        ) => ({
            getIfFresh: jest.fn(async (key: string) => {
                lookups.push(key);
                return store.get(key);
            }),
            uploadResults: jest.fn(async (key: string, buffer: Buffer) => {
                store.set(key, buffer.toString());
            }),
        });

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

        test('should use different cache keys for users with per-user warehouse credentials', async () => {
            const userA: SessionUser = {
                ...user,
                userUuid: 'user-aaaa-1111',
            };

            const userB: SessionUser = {
                ...user,
                userUuid: 'user-bbbb-2222',
            };

            // Enable autocomplete caching
            const serviceWithCache = getMockedProjectService({
                ...lightdashConfigMock,
                results: {
                    ...lightdashConfigMock.results,
                    autocompleteEnabled: true,
                    cacheStateTimeSeconds: 86400,
                },
            });
            serviceWithCache.warehouseClients = {};

            const runQueryMock = jest.fn(
                async (_sql: string) => resultsWith1Row,
            );
            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            // Mock getWarehouseCredentials to simulate per-user credentials
            jest.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                serviceWithCache as any,
                'getWarehouseCredentials',
            ).mockImplementation(async (...args: unknown[]) => {
                const { userId } = args[0] as { userId: string };
                return {
                    ...warehouseClientMock.credentials,
                    userWarehouseCredentialsUuid: `cred-${userId}`,
                };
            });

            // Mock S3 cache: track all cache key lookups
            const cacheKeyLookups: string[] = [];
            const cachedResults = new Map<string, string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (serviceWithCache as any).s3CacheClient = buildS3CacheMock(
                cacheKeyLookups,
                cachedResults,
            );

            // User A queries — populates the cache
            await serviceWithCache.searchFieldUniqueValues(
                userA,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            // User B queries the same field
            await serviceWithCache.searchFieldUniqueValues(
                userB,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            // Cache keys must differ when users have per-user warehouse credentials
            expect(cacheKeyLookups[0]).not.toEqual(cacheKeyLookups[1]);

            // Each user should query the warehouse independently
            expect(runQueryMock).toHaveBeenCalledTimes(2);
        });

        test('should share cache key when users have shared warehouse credentials', async () => {
            const userA: SessionUser = {
                ...user,
                userUuid: 'user-aaaa-1111',
            };

            const userB: SessionUser = {
                ...user,
                userUuid: 'user-bbbb-2222',
            };

            const serviceWithCache = getMockedProjectService({
                ...lightdashConfigMock,
                results: {
                    ...lightdashConfigMock.results,
                    autocompleteEnabled: true,
                    cacheStateTimeSeconds: 86400,
                },
            });
            serviceWithCache.warehouseClients = {};

            const runQueryMock = jest.fn(
                async (_sql: string) => resultsWith1Row,
            );
            (
                projectModel.getWarehouseClientFromCredentials as jest.Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            // No userWarehouseCredentialsUuid — shared project credentials
            jest.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                serviceWithCache as any,
                'getWarehouseCredentials',
            ).mockImplementation(async () => ({
                ...warehouseClientMock.credentials,
            }));

            const cacheKeyLookups: string[] = [];
            const cachedResults = new Map<string, string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (serviceWithCache as any).s3CacheClient = buildS3CacheMock(
                cacheKeyLookups,
                cachedResults,
            );

            await serviceWithCache.searchFieldUniqueValues(
                userA,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            await serviceWithCache.searchFieldUniqueValues(
                userB,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            // Cache keys must be the same — shared credentials, no per-user scoping
            expect(cacheKeyLookups[0]).toEqual(cacheKeyLookups[1]);

            // Warehouse should only be queried once — second call hits the cache
            expect(runQueryMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('updateDefaultUserSpaces', () => {
        test('should throw ForbiddenError when user cannot manage the project', async () => {
            const viewerUser: SessionUser = {
                ...user,
                userUuid: 'viewer-uuid',
                role: OrganizationMemberRole.VIEWER,
                ability: defineUserAbility(
                    {
                        userUuid: 'viewer-uuid',
                        role: OrganizationMemberRole.VIEWER,
                        organizationUuid: 'organizationUuid',
                    },
                    [],
                ),
            };

            await expect(
                service.updateDefaultUserSpaces(viewerUser, projectUuid, {
                    hasDefaultUserSpaces: true,
                }),
            ).rejects.toThrowError(ForbiddenError);
        });

        test('should delegate to projectModel when admin enables the feature', async () => {
            const adminUser: SessionUser = {
                ...user,
                role: OrganizationMemberRole.ADMIN,
                ability: defineUserAbility(
                    {
                        userUuid: user.userUuid,
                        role: OrganizationMemberRole.ADMIN,
                        organizationUuid: 'organizationUuid',
                    },
                    [],
                ),
            };

            await service.updateDefaultUserSpaces(adminUser, projectUuid, {
                hasDefaultUserSpaces: true,
            });

            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledTimes(
                1,
            );
            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledWith(
                projectUuid,
                true,
            );
        });

        test('should delegate to projectModel when admin disables the feature', async () => {
            const adminUser: SessionUser = {
                ...user,
                role: OrganizationMemberRole.ADMIN,
                ability: defineUserAbility(
                    {
                        userUuid: user.userUuid,
                        role: OrganizationMemberRole.ADMIN,
                        organizationUuid: 'organizationUuid',
                    },
                    [],
                ),
            };

            await service.updateDefaultUserSpaces(adminUser, projectUuid, {
                hasDefaultUserSpaces: false,
            });

            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledTimes(
                1,
            );
            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledWith(
                projectUuid,
                false,
            );
        });
    });

    describe('pre-aggregate refreshes', () => {
        const adminUser: SessionUser = {
            ...user,
            role: OrganizationMemberRole.ADMIN,
            ability: defineUserAbility(
                {
                    userUuid: user.userUuid,
                    role: OrganizationMemberRole.ADMIN,
                    organizationUuid: 'organizationUuid',
                },
                [],
            ),
        };

        test('saveExploresToCacheAndIndexCatalog skips preview project materialization jobs', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });

            (projectModel.get as jest.Mock).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                type: ProjectType.PREVIEW,
            });

            await serviceWithPreAggregatesEnabled.saveExploresToCacheAndIndexCatalog(
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    explores: [validExplore],
                    compilationSource: 'cli_deploy',
                },
            );

            expect(
                preAggregateModel.upsertPreAggregateDefinitions,
            ).toHaveBeenCalledTimes(1);
            expect(
                preAggregateModel.getPreAggregateDefinitionsForProject,
            ).not.toHaveBeenCalled();
            expect(
                schedulerClient.materializePreAggregate,
            ).not.toHaveBeenCalled();
            expect(
                schedulerClient.schedulePreAggregateCronJobs,
            ).not.toHaveBeenCalled();
        });

        test('checkPreAggregateMatch returns a miss when the pre-aggregate is not materialized', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const sourceExplore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        metrics: {
                            ...validExplore.tables.a.metrics,
                            met1: {
                                ...validExplore.tables.a.metrics.met1,
                                type: MetricType.COUNT,
                            },
                        },
                    },
                },
                preAggregates: [
                    {
                        name: 'rollup',
                        dimensions: ['dim1'],
                        metrics: ['met1'],
                    },
                ],
            } as Explore;

            (
                projectModel.findExploresFromCache as jest.Mock
            ).mockImplementation(
                async (
                    _projectUuid: string,
                    _field: string,
                    exploreNames: string[],
                ) =>
                    Object.fromEntries(
                        exploreNames
                            .map((exploreName) => [
                                exploreName,
                                {
                                    [sourceExplore.name]: sourceExplore,
                                    [preAggregateExplore.name]:
                                        preAggregateExplore,
                                }[exploreName],
                            ])
                            .filter(([, explore]) => explore !== undefined),
                    ),
            );
            (
                preAggregateModel.getActiveMaterialization as jest.Mock
            ).mockResolvedValueOnce(undefined);

            const result =
                await serviceWithPreAggregatesEnabled.checkPreAggregateMatch({
                    account: developerAccount,
                    projectUuid,
                    exploreName: sourceExplore.name,
                    metricQuery: {
                        ...metricQueryMock,
                        tableCalculations: [],
                    },
                    usePreAggregateCache: true,
                });

            expect(result).toEqual({
                hit: false,
                reason: {
                    reason: PreAggregateMissReason.NO_ACTIVE_MATERIALIZATION,
                },
            });
            expect(
                preAggregateModel.getActiveMaterialization,
            ).toHaveBeenCalledWith(projectUuid, preAggregateExplore.name);
        });

        test('refreshPreAggregates schedules only materializable definitions', async () => {
            (
                preAggregateModel.getPreAggregateDefinitionsForProject as jest.Mock
            ).mockResolvedValue([
                {
                    preAggregateDefinitionUuid: 'def-valid',
                    projectUuid,
                    sourceCachedExploreUuid: 'source-1',
                    preAggCachedExploreUuid: 'preagg-1',
                    preAggregateDefinition: {
                        name: 'valid',
                        dimensions: ['orders.status'],
                        metrics: ['orders.count'],
                    },
                    materializationMetricQuery: {
                        metricQuery: METRIC_QUERY,
                        metricComponents: {},
                        timeDimensionFieldId: null,
                        resolvedMaxRows: null,
                    },
                    materializationQueryError: null,
                    refreshCron: null,
                    createdAt: new Date('2024-01-01'),
                    updatedAt: new Date('2024-01-01'),
                },
                {
                    preAggregateDefinitionUuid: 'def-invalid',
                    projectUuid,
                    sourceCachedExploreUuid: 'source-1',
                    preAggCachedExploreUuid: 'preagg-2',
                    preAggregateDefinition: {
                        name: 'invalid',
                        dimensions: ['orders.status'],
                        metrics: ['orders.count'],
                    },
                    materializationMetricQuery: null,
                    materializationQueryError: 'Unknown metric "orders.count"',
                    refreshCron: null,
                    createdAt: new Date('2024-01-01'),
                    updatedAt: new Date('2024-01-01'),
                },
            ]);
            (
                schedulerClient.materializePreAggregate as jest.Mock
            ).mockResolvedValueOnce({ jobId: 'job-valid' });

            const result = await service.refreshPreAggregates(
                adminUser,
                projectUuid,
            );

            expect(result).toEqual({ jobIds: ['job-valid'] });
            expect(
                schedulerClient.materializePreAggregate,
            ).toHaveBeenCalledTimes(1);
            expect(
                schedulerClient.materializePreAggregate,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    preAggregateDefinitionUuid: 'def-valid',
                    trigger: 'manual',
                }),
            );
        });

        test('refreshPreAggregateByDefinitionName throws actionable error when definition is invalid', async () => {
            (
                preAggregateModel.getPreAggregateDefinitionByDefinitionName as jest.Mock
            ).mockResolvedValue({
                preAggregateDefinitionUuid: 'def-invalid',
                projectUuid,
                sourceCachedExploreUuid: 'source-1',
                preAggCachedExploreUuid: 'preagg-2',
                preAggregateDefinition: {
                    name: 'invalid',
                    dimensions: ['orders.status'],
                    metrics: ['orders.count'],
                },
                materializationMetricQuery: null,
                materializationQueryError: 'Unknown metric "orders.count"',
                refreshCron: null,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
                preAggExploreName: 'orders__invalid',
            });

            await expect(
                service.refreshPreAggregateByDefinitionName(
                    adminUser,
                    projectUuid,
                    'invalid',
                ),
            ).rejects.toThrowError(
                'Pre-aggregate definition "invalid" cannot be materialized: Unknown metric "orders.count"',
            );
        });
    });

    describe('combineParameters', () => {
        test('should include savedParameterValues from explore', async () => {
            const explore = {
                name: 'my_virtual_view',
                baseTable: 'my_virtual_view',
                tables: {},
                savedParameterValues: {
                    order_status: 'completed',
                },
            } as Pick<
                Explore,
                'name' | 'baseTable' | 'tables' | 'savedParameterValues'
            >;

            const result = await service.combineParameters(
                projectUuid,
                explore as Explore,
            );

            expect(result).toEqual(
                expect.objectContaining({
                    order_status: 'completed',
                }),
            );
        });

        test('savedParameterValues should be overridden by request parameters', async () => {
            const explore = {
                name: 'my_virtual_view',
                baseTable: 'my_virtual_view',
                tables: {},
                savedParameterValues: {
                    order_status: 'completed',
                    region: 'US',
                },
            } as Pick<
                Explore,
                'name' | 'baseTable' | 'tables' | 'savedParameterValues'
            >;

            const result = await service.combineParameters(
                projectUuid,
                explore as Explore,
                { order_status: 'pending' }, // request parameters override
            );

            // Request param overrides saved value
            expect(result.order_status).toBe('pending');
            // Saved param without request override is still included
            expect(result.region).toBe('US');
        });
    });

    describe('getChartsByExploreName', () => {
        const exploreName = 'orders';
        const spaceUuid = 'uuid';
        const chartSummaryMock: ChartSummary = {
            uuid: 'chart-uuid',
            name: 'Orders chart',
            description: undefined,
            spaceUuid,
            spaceName: 'space',
            projectUuid: defaultProject.projectUuid,
            organizationUuid: projectSummary.organizationUuid,
            pinnedListUuid: null,
            chartKind: undefined,
            dashboardUuid: null,
            dashboardName: null,
            slug: 'orders-chart',
        };

        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('returns charts from accessible spaces for a valid explore name', async () => {
            const spacePermissionService = {
                getAccessibleSpaceUuids: jest.fn(async () => [spaceUuid]),
            } as unknown as SpacePermissionService;
            const serviceWithPermissions = getMockedProjectService(
                lightdashConfigMock,
                { spacePermissionService },
            );
            (savedChartModel.find as jest.Mock).mockResolvedValueOnce([
                chartSummaryMock,
            ]);

            const result = await serviceWithPermissions.getChartsByExploreName(
                user,
                defaultProject.projectUuid,
                exploreName,
            );

            expect(savedChartModel.find).toHaveBeenCalledWith({
                projectUuid: defaultProject.projectUuid,
                spaceUuids: [spaceUuid],
                exploreName,
            });
            expect(result).toEqual([chartSummaryMock]);
        });

        test('returns empty array when no charts use the given explore', async () => {
            const spacePermissionService = {
                getAccessibleSpaceUuids: jest.fn(async () => [spaceUuid]),
            } as unknown as SpacePermissionService;
            const serviceWithPermissions = getMockedProjectService(
                lightdashConfigMock,
                { spacePermissionService },
            );
            (savedChartModel.find as jest.Mock).mockResolvedValueOnce([]);

            const result = await serviceWithPermissions.getChartsByExploreName(
                user,
                defaultProject.projectUuid,
                'nonexistent_explore',
            );

            expect(result).toEqual([]);
        });

        test('throws ForbiddenError when user cannot view the project', async () => {
            const restrictedUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([]),
            } as unknown as SessionUser;

            await expect(
                service.getChartsByExploreName(
                    restrictedUser,
                    defaultProject.projectUuid,
                    exploreName,
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });
});
