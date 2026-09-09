import { Ability } from '@casl/ability';
import {
    BinType,
    CustomDimensionType,
    DbtProjectType,
    ForbiddenError,
    GroupValueMatchType,
    NotFoundError,
    ParameterError,
    PossibleAbilities,
    SupportedDbtVersions,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import {
    createBranch,
    createPullRequest,
    findOpenPullRequestByHead,
    getFileContent,
    getLastCommit,
    updateFile,
} from '../../clients/github/Github';
import * as GitlabClient from '../../clients/gitlab/Gitlab';
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
    findOpenPullRequestByHead: vi.fn().mockResolvedValue(null),
    getOrRefreshToken: vi.fn().mockImplementation((token, refreshToken) => ({
        token,
        refreshToken,
    })),
}));

vi.mock('../../clients/gitlab/Gitlab.ts', () => ({
    createPullRequest: vi.fn(),
    getFileContent: vi.fn(),
    updateFile: vi.fn(),
}));

const updateFileResponse: Awaited<ReturnType<typeof updateFile>> = {
    status: 200,
    url: 'https://api.github.com/repos/owner/repo/contents/schema.yml',
    headers: {},
    data: { content: null, commit: {} },
};

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
        vi.mocked(updateFile).mockReset().mockResolvedValue(updateFileResponse);
        vi.mocked(GitlabClient.updateFile).mockReset();
        vi.mocked(getFileContent).mockResolvedValue({
            content: SCHEMA_YML,
            sha: 'sha',
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it.each(['preview', 'create'] as const)(
        'rejects native SQL Runner model %s before writing to Git',
        async (action) => {
            const project = await PROJECT_MODEL.get();
            const nativeProject = {
                ...project,
                dbtConnection: {
                    ...project.dbtConnection,
                    semanticLayer: 'lightdash',
                },
            };
            PROJECT_MODEL.get.mockResolvedValue(nativeProject);
            try {
                await expect(
                    action === 'preview'
                        ? service.writeBackPreview(user, 'projectUuid', 'model')
                        : service.createPullRequestFromSql(
                              user,
                              'projectUuid',
                              'model',
                              'select 1',
                              [],
                          ),
                ).rejects.toThrow(
                    'SQL Runner model creation is only supported for dbt projects',
                );
                expect(createBranch).not.toHaveBeenCalled();
                expect(updateFile).not.toHaveBeenCalled();
            } finally {
                PROJECT_MODEL.get.mockResolvedValue(project);
            }
        },
    );

    describe('updateFile', () => {
        it.each([
            { provider: DbtProjectType.GITHUB, fieldType: 'customMetrics' },
            { provider: DbtProjectType.GITHUB, fieldType: 'customDimensions' },
            { provider: DbtProjectType.GITLAB, fieldType: 'customMetrics' },
            { provider: DbtProjectType.GITLAB, fieldType: 'customDimensions' },
        ] as const)(
            'preserves both models in a shared dbt schema for $provider $fieldType',
            async ({ provider, fieldType }) => {
                let content = SCHEMA_YML;
                let sha = 'sha-0';
                let writes = 0;
                const read =
                    provider === DbtProjectType.GITHUB
                        ? getFileContent
                        : GitlabClient.getFileContent;
                const write =
                    provider === DbtProjectType.GITHUB
                        ? updateFile
                        : GitlabClient.updateFile;
                vi.mocked(read).mockImplementation(async () => ({
                    content,
                    sha,
                }));
                vi.mocked(write).mockImplementation(async (update) => {
                    if (update.fileSha !== sha)
                        throw new Error('File changed since it was read');
                    content = update.content;
                    writes += 1;
                    sha = `sha-${writes}`;
                    return updateFileResponse;
                });

                await service.updateFile({
                    owner: 'owner',
                    repo: 'repo',
                    path: 'path',
                    projectUuid: 'projectUuid',
                    branch: 'branch',
                    token: 'token',
                    quoteChar: "'",
                    mainBranch: 'main',
                    type: provider,
                    ...(fieldType === 'customMetrics'
                        ? {
                              fieldType,
                              fields: [
                                  CUSTOM_METRIC,
                                  {
                                      ...CUSTOM_METRIC,
                                      name: 'new_metric_b',
                                      table: 'table_b',
                                  },
                              ],
                          }
                        : {
                              fieldType,
                              fields: [
                                  CUSTOM_DIMENSION,
                                  {
                                      ...CUSTOM_DIMENSION,
                                      id: 'amount_size_b',
                                      table: 'table_b',
                                      sql: '${table_b.dim_a}',
                                  },
                              ],
                          }),
                });

                expect(writes).toBe(2);
                expect(content).toContain(
                    fieldType === 'customMetrics'
                        ? 'new_metric:'
                        : 'amount_size:',
                );
                expect(content).toContain(
                    fieldType === 'customMetrics'
                        ? 'new_metric_b:'
                        : 'amount_size_b:',
                );
            },
        );

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

    describe('native metric pull requests', () => {
        const source = `# original native file
type: model
name: table_a
sql_from: public.table_a
dimensions:
  - name: dim_a
    type: number
    sql: dim_a
`;
        it.each([false, true])(
            'prepares native YAML against the configured branch, invalid metric: %s',
            async (invalid) => {
                const project = await PROJECT_MODEL.get();
                const explores = await PROJECT_MODEL.getAllExploresFromCache();
                const nativeProject = {
                    ...project,
                    dbtConnection: {
                        ...project.dbtConnection,
                        branch: 'release',
                        semanticLayer: 'lightdash',
                    },
                };
                PROJECT_MODEL.get.mockResolvedValue(nativeProject);
                const nativeExplores = {
                    another_explore: {
                        tables: {
                            table_a: {
                                ymlPath: 'models/nested/original.yaml',
                            },
                            table_b: { ymlPath: 'models/table_b.yml' },
                        },
                    },
                };
                PROJECT_MODEL.getAllExploresFromCache.mockResolvedValue(
                    nativeExplores,
                );
                vi.mocked(getFileContent).mockImplementation(async (file) => ({
                    content: file.fileName.endsWith('table_b.yml')
                        ? source.replace('name: table_a', 'name: table_b')
                        : source,
                    sha: 'original-sha',
                }));
                try {
                    const request = service.createPullRequest(
                        { ...user, organizationUuid: 'organizationUuid' },
                        'projectUuid',
                        "'",
                        {
                            type: 'customMetrics',
                            fields: [
                                CUSTOM_METRIC,
                                ...(invalid
                                    ? [
                                          {
                                              ...CUSTOM_METRIC,
                                              name: 'unsupported',
                                              table: 'table_b',
                                              baseDimensionName: undefined,
                                          },
                                      ]
                                    : []),
                            ],
                        },
                    );
                    if (invalid) {
                        await expect(request).rejects.toThrow(
                            'Only metrics based on a native dimension',
                        );
                        expect(createBranch).not.toHaveBeenCalled();
                        expect(updateFile).not.toHaveBeenCalled();
                        expect(createPullRequest).not.toHaveBeenCalled();
                    } else {
                        await expect(request).resolves.toMatchObject({
                            prUrl: 'https://example.com/pull/1',
                        });
                        expect(getFileContent).toHaveBeenCalledWith(
                            expect.objectContaining({
                                branch: 'release',
                                fileName: 'path/models/nested/original.yaml',
                            }),
                        );
                        expect(updateFile).toHaveBeenCalledWith(
                            expect.objectContaining({
                                fileName: 'path/models/nested/original.yaml',
                                fileSha: 'original-sha',
                                content: expect.stringContaining('new_metric:'),
                                branch: expect.stringMatching(/^lightdash-/),
                            }),
                        );
                        expect(createPullRequest).toHaveBeenCalledWith(
                            expect.objectContaining({ base: 'release' }),
                        );
                    }
                } finally {
                    PROJECT_MODEL.get.mockResolvedValue(project);
                    PROJECT_MODEL.getAllExploresFromCache.mockResolvedValue(
                        explores,
                    );
                }
            },
        );
    });

    describe('findOpenPullRequestForBranch', () => {
        it('returns the open PR the provider has for the branch', async () => {
            vi.mocked(findOpenPullRequestByHead).mockResolvedValueOnce({
                number: 12,
                url: 'https://example.com/pull/12',
            });

            await expect(
                service.findOpenPullRequestForBranch(
                    { ...user, organizationUuid: 'organizationUuid' },
                    'projectUuid',
                    'lightdash/write-back/host/slug',
                ),
            ).resolves.toEqual({
                prNumber: 12,
                prUrl: 'https://example.com/pull/12',
            });
            expect(findOpenPullRequestByHead).toHaveBeenCalledWith(
                expect.objectContaining({
                    head: 'lightdash/write-back/host/slug',
                }),
            );
        });

        it('returns null when the branch has no open PR', async () => {
            await expect(
                service.findOpenPullRequestForBranch(
                    { ...user, organizationUuid: 'organizationUuid' },
                    'projectUuid',
                    'lightdash/write-back/host/slug',
                ),
            ).resolves.toBeNull();
        });
    });

    describe('previewCustomDimensions', () => {
        it('rejects invalid YAML quote characters before reading project files', async () => {
            await expect(
                service.previewCustomDimensions(
                    fromSession(
                        { ...user, organizationUuid: 'organizationUuid' },
                        'session-cookie',
                    ),
                    'projectUuid',
                    [CUSTOM_DIMENSION],
                    ';',
                ),
            ).rejects.toThrow(
                'YAML quote character must be either a single or double quote',
            );
            expect(getFileContent).not.toHaveBeenCalled();
        });

        it('uses the model SQL and project warehouse dialect without placeholders', async () => {
            vi.mocked(getFileContent).mockResolvedValueOnce({
                content: `version: 2
models:
  - name: table_a
    columns:
      - name: dim_a
        meta:
          dimension:
            sql: \${TABLE}.dim_a * 2`,
                sha: 'sha',
            });

            const result = await service.previewCustomDimensions(
                fromSession(
                    { ...user, organizationUuid: 'organizationUuid' },
                    'session-cookie',
                ),
                'projectUuid',
                [
                    {
                        id: 'amount_range',
                        name: 'Amount range',
                        table: 'table_a',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table_a_dim_a',
                        binType: BinType.FIXED_WIDTH,
                        binWidth: 10,
                    },
                    {
                        id: 'custom_range',
                        name: 'Custom range',
                        table: 'table_a',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table_a_dim_a',
                        binType: BinType.CUSTOM_RANGE,
                        customRange: [
                            { from: undefined, to: 10 },
                            { from: 10, to: undefined },
                        ],
                    },
                    {
                        id: 'custom_group',
                        name: 'Custom group',
                        table: 'table_a',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table_a_dim_a',
                        binType: BinType.CUSTOM_GROUP,
                        customGroups: [
                            {
                                name: 'High',
                                values: [
                                    {
                                        matchType: GroupValueMatchType.EXACT,
                                        value: '20',
                                    },
                                ],
                            },
                        ],
                    },
                ],
                '"',
            );

            expect(result.yaml).toContain('${TABLE}.dim_a * 2');
            expect(result.yaml).toContain("|| ' - ' ||");
            expect(result.yaml).toContain('custom_range:');
            expect(result.yaml).toContain('custom_group:');
            expect(result.yaml).not.toContain('${reference_column}');
            expect(getFileContent).toHaveBeenCalledWith(
                expect.objectContaining({ branch: 'main' }),
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

        it('refuses fixed-number bins before creating a branch', async () => {
            await expect(
                service.createPullRequest(writebackUser, 'projectUuid', "'", {
                    type: 'customDimensions',
                    fields: [
                        {
                            id: 'amount_range',
                            name: 'Amount range',
                            table: 'table_a',
                            type: CustomDimensionType.BIN,
                            dimensionId: 'table_a_dim_a',
                            binType: BinType.FIXED_NUMBER,
                            binNumber: 5,
                        },
                    ],
                }),
            ).rejects.toThrow(
                'Fixed-number bins cannot be written back because they require a dbt model CTE',
            );

            expect(createBranch).not.toHaveBeenCalled();
        });

        it('keeps saved-chart bin replacement disabled to preserve ordering', async () => {
            await service.createPullRequest(writebackUser, 'projectUuid', "'", {
                type: 'customDimensions',
                fields: [
                    {
                        id: 'amount_range',
                        name: 'Amount range',
                        table: 'table_a',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table_a_dim_a',
                        binType: BinType.FIXED_WIDTH,
                        binWidth: 10,
                    },
                ],
            });

            expect(createPullRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.stringContaining(
                        'Existing saved charts keep their custom bin dimensions',
                    ),
                }),
            );
        });

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

describe('Bitbucket project credentials', () => {
    const authorizedUser = {
        ...user,
        organizationUuid: 'organization',
        ability: new Ability<PossibleAbilities>([
            {
                action: 'view',
                subject: 'SourceCode',
                conditions: {
                    organizationUuid: 'organization',
                    projectUuid: 'project',
                },
            },
        ]),
    };
    const createService = () => {
        const project = {
            name: 'Jaffle',
            dbtConnection: {
                type: DbtProjectType.BITBUCKET,
                repository: 'workspace/jaffle',
                username: 'bitbucket-user',
                personal_access_token: 'project-token',
                branch: 'main',
                project_sub_path: '/',
            },
        };
        const projectModel = {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'organization' }),
            get: vi.fn().mockResolvedValue(project),
            getWithSensitiveFields: vi.fn().mockResolvedValue(project),
        };
        const service = new GitIntegrationService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            savedChartModel: SAVED_CHART_MODEL as unknown as SavedChartModel,
            projectModel: projectModel as unknown as ProjectModel,
            projectDbtSourcesModel:
                PROJECT_DBT_SOURCES_MODEL as unknown as ProjectDbtSourcesModel,
            spaceModel: SPACE_MODEL as unknown as SpaceModel,
            githubAppInstallationsModel:
                GITHUB_APP_MODEL as unknown as GithubAppInstallationsModel,
            githubAppService: {} as GithubAppService,
            pullRequestsModel: {} as PullRequestsModel,
        });
        return { service, projectModel };
    };

    it('resolves the current repository and project token for an authorized user', async () => {
        const { service } = createService();
        await expect(
            service.getBitbucketCredentials(authorizedUser, 'project'),
        ).resolves.toEqual({
            owner: 'workspace',
            repo: 'jaffle',
            token: 'project-token',
            type: DbtProjectType.BITBUCKET,
        });
    });

    it('rejects access to another organization before loading the token', async () => {
        const { service, projectModel } = createService();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'another-organization',
        });
        await expect(
            service.getBitbucketCredentials(authorizedUser, 'project'),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
    });

    it('does not enable the generic Git writeback paths for Bitbucket', async () => {
        const { service, projectModel } = createService();
        await expect(
            service.getGitCredentials(authorizedUser, 'project'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
    });
});
