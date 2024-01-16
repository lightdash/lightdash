import {
    defineUserAbility,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { s3CacheClient } from '../../clients/clients';
import EmailClient from '../../clients/EmailClient/EmailClient';
import {
    analyticsModel,
    dashboardModel,
    jobModel,
    onboardingModel,
    projectModel,
    savedChartModel,
    spaceModel,
    sshKeyPairModel,
    userAttributesModel,
} from '../../models/models';
import { METRIC_QUERY, warehouseClientMock } from '../../queryBuilder.mock';
import { projectService } from '../services';
import { ProjectService } from './ProjectService';
import {
    allExplores,
    defaultProject,
    expectedAllExploreSummary,
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

jest.mock('../../analytics/client', () => ({
    analytics: {
        track: jest.fn(),
    },
    s3Client: {},
    s3CacheClient: {},
}));

jest.mock('../../clients/clients', () => ({}));

jest.mock('../../models/models', () => ({
    projectModel: {
        getWithSensitiveFields: jest.fn(async () => projectWithSensitiveFields),
        get: jest.fn(async () => projectWithSensitiveFields),
        getSummary: jest.fn(async () => projectSummary),
        getTablesConfiguration: jest.fn(async () => tablesConfiguration),
        updateTablesConfiguration: jest.fn(),
        getExploresFromCache: jest.fn(async () => allExplores),
        getExploreFromCache: jest.fn(async () => validExplore),
        lockProcess: jest.fn((projectUuid, fun) => fun()),
        getWarehouseCredentialsForProject: jest.fn(
            async () => warehouseClientMock.credentials,
        ),
        getWarehouseClientFromCredentials: jest.fn(() => ({
            ...warehouseClientMock,
            runQuery: jest.fn(async () => resultsWith1Row),
        })),
    },
    onboardingModel: {
        getByOrganizationUuid: jest.fn(async () => ({
            ranQueryAt: new Date(),
            shownSuccessAt: new Date(),
        })),
    },
    savedChartModel: {
        getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
    },
    jobModel: {
        get: jest.fn(async () => job),
    },
    spaceModel: {
        getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
    },
    sshKeyPairModel: {},
    userAttributesModel: {
        getAttributeValuesForOrgMember: jest.fn(async () => ({})),
    },
    analyticsModel: {},
    dashboardModel: {},
}));

describe('ProjectService', () => {
    const { projectUuid } = defaultProject;
    const service = new ProjectService({
        projectModel,
        onboardingModel,
        savedChartModel,
        jobModel,
        emailClient: new EmailClient({
            lightdashConfig: lightdashConfigWithNoSMTP,
        }),
        spaceModel,
        sshKeyPairModel,
        userAttributesModel,
        s3CacheClient,
        analyticsModel,
        dashboardModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    test('should run sql query', async () => {
        const result = await service.runSqlQuery(user, projectUuid, 'fake sql');

        expect(result).toEqual(resultsWith1Row);
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'sql.executed',
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
        expect(projectModel.updateTablesConfiguration).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledWith(
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
                'table1',
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
                'table1',
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
    });
    describe('getJobStatus', () => {
        test('should get job with projectUuid if user belongs to org ', async () => {
            const result = await projectService.getJobStatus('jobUuid', user);
            expect(result).toEqual(job);
        });
        test('should get job without projectUuid if user created the job ', async () => {
            const jobWithoutProjectUuid = { ...job, projectUuid: undefined };
            (jobModel.get as jest.Mock).mockImplementationOnce(
                async () => jobWithoutProjectUuid,
            );

            const result = await projectService.getJobStatus('jobUuid', user);
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
                projectService.getJobStatus('jobUuid', anotherUser),
            ).rejects.toThrowError(NotFoundError);
        });

        test('should limit CSV results', async () => {
            expect(
                ProjectService.metricQueryWithLimit(METRIC_QUERY, undefined),
            ).toEqual(METRIC_QUERY); // Returns same metricquery

            expect(
                ProjectService.metricQueryWithLimit(METRIC_QUERY, 5).limit,
            ).toEqual(5);
            expect(
                ProjectService.metricQueryWithLimit(METRIC_QUERY, null).limit,
            ).toEqual(33333);
            expect(
                ProjectService.metricQueryWithLimit(METRIC_QUERY, 9999).limit,
            ).toEqual(9999);
            expect(
                ProjectService.metricQueryWithLimit(METRIC_QUERY, 9999999)
                    .limit,
            ).toEqual(33333);

            const metricWithoutRows = {
                ...METRIC_QUERY,
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            expect(() =>
                ProjectService.metricQueryWithLimit(metricWithoutRows, null),
            ).toThrowError(ParameterError);

            const metricWithDimension = { ...METRIC_QUERY, metrics: [] };
            expect(
                ProjectService.metricQueryWithLimit(metricWithDimension, null)
                    .limit,
            ).toEqual(50000);
        });
    });
});
