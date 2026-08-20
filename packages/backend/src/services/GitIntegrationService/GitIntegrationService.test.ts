import {
    DbtProjectType,
    NotFoundError,
    SupportedDbtVersions,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import {
    createBranch,
    createPullRequest,
    getFileContent,
    getLastCommit,
    updateFile,
} from '../../clients/github/Github';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { GithubAppService } from '../GithubAppService/GithubAppService';
import { user } from '../ProjectService/ProjectService.mock';
import { GitIntegrationService } from './GitIntegrationService';
import {
    CUSTOM_DIMENSION,
    CUSTOM_METRIC,
    EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION,
    EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
    GITHUB_APP_MODEL,
    PROJECT_DBT_SOURCES_MODEL,
    PROJECT_MODEL,
    SAVED_CHART_MODEL,
    SCHEMA_YML,
    SPACE_MODEL,
} from './GitIntegrationService.mock';

vi.mock('../../clients/github/Github.ts', () => ({
    getFileContent: vi.fn(),
    updateFile: vi.fn().mockResolvedValue(undefined),
    getLastCommit: vi.fn().mockResolvedValue({ sha: 'main-sha' }),
    createBranch: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({
        html_url: 'https://example.com/pull/1',
        title: 'Adds custom metric',
        number: 1,
    }),
    getOrRefreshToken: vi.fn().mockImplementation((token, refreshToken) => ({
        token,
        refreshToken,
    })),
}));

describe('GitIntegrationService', () => {
    const service = new GitIntegrationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        savedChartModel: SAVED_CHART_MODEL as unknown as SavedChartModel,
        projectModel: PROJECT_MODEL as unknown as ProjectModel,
        projectDbtSourcesModel:
            PROJECT_DBT_SOURCES_MODEL as unknown as ProjectDbtSourcesModel,
        spaceModel: SPACE_MODEL as unknown as SpaceModel,
        githubAppInstallationsModel:
            GITHUB_APP_MODEL as unknown as GithubAppInstallationsModel,
        githubAppService: {
            getValidUserToken: vi.fn().mockResolvedValue(undefined),
        } as unknown as GithubAppService,
        pullRequestsModel: {
            create: vi.fn(),
        } as unknown as PullRequestsModel,
    });

    beforeEach(() => {
        vi.mocked(getFileContent).mockResolvedValue({
            content: SCHEMA_YML,
            sha: 'sha',
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('updateFile', () => {
        it('should update the file for custom metrics', async () => {
            await service.updateFile({
                owner: 'owner',
                repo: 'repo',
                path: 'path',
                projectUuid: 'projectUuid',
                fieldType: 'customMetrics',
                fields: [CUSTOM_METRIC],
                branch: 'branch',
                token: 'token',
                quoteChar: `'`,
                mainBranch: 'main',
                type: DbtProjectType.GITHUB,
            });
            expect(updateFile).toHaveBeenCalledTimes(1);
            expect(updateFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
                }),
            );
        });
        it('should update the file for custom dimensions', async () => {
            await service.updateFile({
                owner: 'owner',
                repo: 'repo',
                path: 'path',
                projectUuid: 'projectUuid',
                fieldType: 'customDimensions',
                fields: [CUSTOM_DIMENSION],
                branch: 'branch',
                token: 'token',
                quoteChar: `'`,
                mainBranch: 'main',
                type: DbtProjectType.GITHUB,
            });
            expect(updateFile).toHaveBeenCalledTimes(1);
            // @ts-expect-error
            expect(updateFile.mock.calls[0][0].content).toEqual(
                EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION,
            );
        });
    });

    describe('createPullRequest', () => {
        const writebackUser = {
            ...user,
            organizationUuid: 'organizationUuid',
        };

        const additionalSource = {
            projectDbtSourceUuid: 'additional-source-uuid',
            name: 'Additional source',
            dbtConnection: {
                type: DbtProjectType.GITHUB,
            },
        };

        it('refuses write-back for an explore from an additional source without calling Git', async () => {
            PROJECT_DBT_SOURCES_MODEL.getSources.mockResolvedValueOnce([
                additionalSource,
            ]);

            await expect(
                service.createPullRequest(writebackUser, 'projectUuid', "'", {
                    type: 'customMetrics',
                    fields: [CUSTOM_METRIC],
                }),
            ).rejects.toThrow(
                'Explore write-back cannot determine which dbt source owns this model on a project with multiple git-backed dbt sources: "Project dbt connection", "Additional source"',
            );

            expect(createBranch).not.toHaveBeenCalled();
            expect(getFileContent).not.toHaveBeenCalled();
            expect(updateFile).not.toHaveBeenCalled();
            expect(createPullRequest).not.toHaveBeenCalled();
        });

        it('keeps single-source Explore write-back unchanged', async () => {
            const result = await service.createPullRequest(
                writebackUser,
                'projectUuid',
                "'",
                {
                    type: 'customMetrics',
                    fields: [CUSTOM_METRIC],
                },
            );

            expect(PROJECT_DBT_SOURCES_MODEL.getSources).toHaveBeenCalledWith(
                'projectUuid',
            );
            expect(createBranch).toHaveBeenCalledTimes(1);
            expect(getFileContent).toHaveBeenCalledTimes(1);
            expect(updateFile).toHaveBeenCalledTimes(1);
            expect(createPullRequest).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                prTitle: 'Adds custom metric',
                prUrl: 'https://example.com/pull/1',
            });
        });

        it('keeps the existing non-git primary connection error', async () => {
            PROJECT_MODEL.get.mockResolvedValueOnce({
                projectUuid: 'projectUuid',
                name: 'Project',
                dbtVersion: SupportedDbtVersions.V1_9,
                dbtConnection: {
                    type: DbtProjectType.DBT,
                    repository: '',
                    branch: '',
                    project_sub_path: '',
                },
            });

            await expect(
                service.createPullRequest(writebackUser, 'projectUuid', "'", {
                    type: 'customMetrics',
                    fields: [CUSTOM_METRIC],
                }),
            ).rejects.toThrow(
                'invalid dbt connection type dbt for project Project',
            );

            expect(PROJECT_DBT_SOURCES_MODEL.getSources).toHaveBeenCalledWith(
                'projectUuid',
            );
            expect(createBranch).not.toHaveBeenCalled();
            expect(getFileContent).not.toHaveBeenCalled();
            expect(updateFile).not.toHaveBeenCalled();
            expect(createPullRequest).not.toHaveBeenCalled();
        });

        it('refuses write-back for a primary-source explore on a multi-source project', async () => {
            PROJECT_DBT_SOURCES_MODEL.getSources.mockResolvedValueOnce([
                additionalSource,
            ]);

            await expect(
                service.createPullRequest(writebackUser, 'projectUuid', "'", {
                    type: 'customMetrics',
                    fields: [{ ...CUSTOM_METRIC, table: 'primary_table' }],
                }),
            ).rejects.toThrow(
                'Explore write-back cannot determine which dbt source owns this model on a project with multiple git-backed dbt sources: "Project dbt connection", "Additional source"',
            );

            expect(createBranch).not.toHaveBeenCalled();
            expect(getFileContent).not.toHaveBeenCalled();
            expect(updateFile).not.toHaveBeenCalled();
            expect(createPullRequest).not.toHaveBeenCalled();
        });

        it('explains a missing project branch instead of a generic server error', async () => {
            vi.mocked(getLastCommit).mockRejectedValueOnce(
                new NotFoundError('Branch "main" not found in owner/repo'),
            );

            const promise = service.createPullRequest(
                writebackUser,
                'projectUuid',
                "'",
                { type: 'customMetrics', fields: [CUSTOM_METRIC] },
            );

            await expect(promise).rejects.toBeInstanceOf(NotFoundError);
            await expect(promise).rejects.toThrow(
                'Branch "main" not found in owner/repo',
            );
            await expect(promise).rejects.toThrow(
                "Check the branch configured in the project's dbt connection settings.",
            );

            expect(createBranch).not.toHaveBeenCalled();
            expect(getFileContent).not.toHaveBeenCalled();
            expect(updateFile).not.toHaveBeenCalled();
            expect(createPullRequest).not.toHaveBeenCalled();
        });
    });
});
