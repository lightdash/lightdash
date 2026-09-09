import { Ability } from '@casl/ability';
import {
    BinType,
    ConflictError,
    CustomDimensionType,
    DbtProjectType,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    PullRequestState,
    SupportedDbtVersions,
    type DbtBitBucketProjectConfig,
    type PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import * as BitbucketClient from '../../clients/bitbucket/Bitbucket';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { GithubAppService } from '../GithubAppService/GithubAppService';
import { user } from '../ProjectService/ProjectService.mock';
import { GitIntegrationService } from './GitIntegrationService';
import {
    CUSTOM_DIMENSION,
    CUSTOM_METRIC,
    EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION,
    EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
    SCHEMA_YML,
} from './GitIntegrationService.mock';

vi.mock('../../clients/bitbucket/Bitbucket', async () => ({
    ...(await vi.importActual<
        typeof import('../../clients/bitbucket/Bitbucket')
    >('../../clients/bitbucket/Bitbucket')),
    getBranch: vi.fn(),
    createBranch: vi.fn(),
    getFileContent: vi.fn(),
    commitFiles: vi.fn(),
    createPullRequest: vi.fn(),
}));

const config: DbtBitBucketProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    username: 'developer',
    personal_access_token: 'project-token',
    repository: 'workspace/analytics',
    branch: 'release/dbt',
    project_sub_path: '/semantic/',
};
const writebackUser = {
    ...user,
    organizationUuid: 'organization',
    ability: new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'CustomFields',
            conditions: {
                organizationUuid: 'organization',
                projectUuid: 'project',
            },
        },
        {
            action: 'manage',
            subject: 'SourceCode',
            conditions: {
                organizationUuid: 'organization',
                projectUuid: 'project',
                isProtectedBranch: false,
            },
        },
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
const prUrl = 'https://bitbucket.org/workspace/analytics/pull-requests/17';
const setup = () => {
    const project = {
        organizationUuid: 'organization',
        projectUuid: 'project',
        name: 'Analytics',
        dbtVersion: SupportedDbtVersions.V1_9,
        dbtConnection: { ...config, personal_access_token: '' },
    };
    const projectModel = {
        get: vi.fn().mockResolvedValue(project),
        getSummary: vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'organization' }),
        getWithSensitiveFields: vi
            .fn()
            .mockResolvedValue({ ...project, dbtConnection: config }),
        getExploreFromCache: vi
            .fn()
            .mockResolvedValue({ ymlPath: 'models/schema.yml' }),
        getWarehouseCredentialsForProject: vi.fn().mockResolvedValue({}),
        getWarehouseClientFromCredentials: vi
            .fn()
            .mockReturnValue(warehouseClientMock),
    };
    const sources = { getSources: vi.fn().mockResolvedValue([]) };
    const pullRequests = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new GitIntegrationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        savedChartModel: {} as SavedChartModel,
        projectModel: projectModel as unknown as ProjectModel,
        projectDbtSourcesModel: sources as unknown as ProjectDbtSourcesModel,
        spaceModel: {} as SpaceModel,
        githubAppInstallationsModel: {} as GithubAppInstallationsModel,
        githubAppService: {} as GithubAppService,
        pullRequestsModel: pullRequests as unknown as PullRequestsModel,
    });
    return { service, projectModel, sources, pullRequests };
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BitbucketClient.getBranch).mockResolvedValue({
        name: config.branch,
        target: { hash: 'base-sha' },
    });
    vi.mocked(BitbucketClient.createBranch).mockResolvedValue({
        name: 'new-branch',
        target: { hash: 'base-sha' },
    });
    vi.mocked(BitbucketClient.getFileContent).mockResolvedValue({
        content: SCHEMA_YML,
        sha: 'base-sha',
    });
    vi.mocked(BitbucketClient.commitFiles).mockResolvedValue(undefined);
    vi.mocked(BitbucketClient.createPullRequest).mockResolvedValue({
        number: 17,
        title: 'Adds custom fields',
        html_url: prUrl,
        state: PullRequestState.OPEN,
        head: 'new-branch',
        base: config.branch,
    });
});

describe('Bitbucket Explorer writeback', () => {
    it.each([
        ['.', 'models/schema.yml'],
        ['/', 'models/schema.yml'],
        ['./dbt', 'dbt/models/schema.yml'],
        ['/./dbt/', 'dbt/models/schema.yml'],
        ['dbt/./project', 'dbt/project/models/schema.yml'],
    ])(
        'normalizes project path %s to %s',
        async (projectSubPath, expectedPath) => {
            const { service, projectModel } = setup();
            const project = await projectModel.get();
            projectModel.get.mockResolvedValue({
                ...project,
                dbtConnection: {
                    ...project.dbtConnection,
                    project_sub_path: projectSubPath,
                },
            });
            await service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            });
            expect(BitbucketClient.getFileContent).toHaveBeenCalledWith(
                expect.objectContaining({ fileName: expectedPath }),
            );
            expect(BitbucketClient.commitFiles).toHaveBeenCalledWith(
                expect.objectContaining({
                    changes: [
                        {
                            action: 'upsert',
                            path: expectedPath,
                            content: EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
                        },
                    ],
                }),
            );
        },
    );

    it('writes a metric without losing existing YAML and records a Bitbucket PR', async () => {
        const { service, pullRequests } = setup();
        await expect(
            service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            }),
        ).resolves.toEqual({ prTitle: 'Adds custom fields', prUrl });
        expect(BitbucketClient.getBranch).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'workspace',
                repo: 'analytics',
                branch: 'release/dbt',
                token: 'project-token',
            }),
        );
        const { branch } = vi.mocked(BitbucketClient.createBranch).mock
            .calls[0][0];
        expect(branch).not.toBe(config.branch);
        expect(BitbucketClient.createBranch).toHaveBeenCalledWith(
            expect.objectContaining({ sha: 'base-sha' }),
        );
        expect(BitbucketClient.commitFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                branch,
                expectedParent: 'base-sha',
                changes: [
                    {
                        action: 'upsert',
                        path: 'semantic/models/schema.yml',
                        content: EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
                    },
                ],
            }),
        );
        expect(BitbucketClient.createPullRequest).toHaveBeenCalledWith(
            expect.objectContaining({ head: branch, base: config.branch }),
        );
        expect(pullRequests.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: PullRequestProvider.BITBUCKET,
                source: PullRequestSource.CUSTOM_METRIC,
                projectUuid: 'project',
                owner: 'workspace',
                repo: 'analytics',
                prNumber: 17,
            }),
        );
    });

    it('preserves both model changes when bulk metrics share a YAML file', async () => {
        const { service } = setup();
        let content = SCHEMA_YML;
        let sha = 'base-sha';
        vi.mocked(BitbucketClient.getFileContent).mockImplementation(
            async () => ({ content, sha }),
        );
        vi.mocked(BitbucketClient.commitFiles).mockImplementation(
            async (args) => {
                expect(args.expectedParent).toBe(sha);
                const change = args.changes[0];
                if (change.action !== 'upsert') {
                    throw new Error('Expected YAML update');
                }
                content = change.content;
                sha = 'updated-sha';
            },
        );
        await service.createPullRequest(writebackUser, 'project', "'", {
            type: 'customMetrics',
            fields: [
                CUSTOM_METRIC,
                { ...CUSTOM_METRIC, name: 'second_metric', table: 'table_b' },
            ],
        });
        expect(content).toContain('new_metric:');
        expect(content).toContain('second_metric:');
        expect(content).toContain('# comment at the top');
        expect(content).toContain('metric_a:');
        expect(BitbucketClient.createPullRequest).toHaveBeenCalledTimes(1);
    });

    it('writes supported custom SQL dimensions through the existing YAML editor', async () => {
        const { service, pullRequests } = setup();
        await service.createPullRequest(writebackUser, 'project', "'", {
            type: 'customDimensions',
            fields: [CUSTOM_DIMENSION],
        });
        expect(BitbucketClient.commitFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                changes: [
                    {
                        action: 'upsert',
                        path: 'semantic/models/schema.yml',
                        content: EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION,
                    },
                ],
            }),
        );
        expect(pullRequests.create).toHaveBeenCalledWith(
            expect.objectContaining({
                source: PullRequestSource.CUSTOM_DIMENSION,
            }),
        );
    });

    it('previews dimensions from the configured base without writing a branch', async () => {
        const { service } = setup();
        const result = await service.previewCustomDimensions(
            fromSession(writebackUser, 'session-cookie'),
            'project',
            [CUSTOM_DIMENSION],
            "'",
        );
        expect(result.yaml).toContain('amount_size:');
        expect(result.yaml).toContain('${table_a.dim_a}');
        expect(BitbucketClient.getFileContent).toHaveBeenCalledWith(
            expect.objectContaining({
                branch: config.branch,
                fileName: 'semantic/models/schema.yml',
            }),
        );
        expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
        expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
    });

    it('requires source-code management before reading the token', async () => {
        const { service, projectModel } = setup();
        const customFieldsOnly = {
            ...writebackUser,
            ability: new Ability<PossibleAbilities>([
                {
                    action: 'manage',
                    subject: 'CustomFields',
                    conditions: {
                        organizationUuid: 'organization',
                        projectUuid: 'project',
                    },
                },
            ]),
        };
        await expect(
            service.createPullRequest(customFieldsOnly, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
        expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
    });

    it('authorizes against the actual project organization before reading secrets', async () => {
        const { service, projectModel } = setup();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'another-organization',
        });
        await expect(
            service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
    });

    it('refuses ambiguous additional Bitbucket sources before calling Git', async () => {
        const { service, sources } = setup();
        sources.getSources.mockResolvedValue([
            {
                name: 'Additional Bitbucket',
                projectDbtSourceUuid: 'additional',
                dbtConnection: config,
            },
        ]);
        await expect(
            service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            }),
        ).rejects.toThrow(/multiple git-backed dbt sources/);
        expect(BitbucketClient.getBranch).not.toHaveBeenCalled();
        expect(BitbucketClient.getFileContent).not.toHaveBeenCalled();
    });

    it.each([
        [undefined, 'missing baseDimensionName'],
        ['missing_column', 'Column missing_column not found'],
    ])(
        'requires an existing base dimension for metrics: %s',
        async (baseDimensionName, message) => {
            const { service } = setup();
            await expect(
                service.createPullRequest(writebackUser, 'project', "'", {
                    type: 'customMetrics',
                    fields: [{ ...CUSTOM_METRIC, baseDimensionName }],
                }),
            ).rejects.toThrow(message);
            expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
            expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
        },
    );

    it('preserves fixed-number bin restrictions', async () => {
        const { service } = setup();
        await expect(
            service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customDimensions',
                fields: [
                    {
                        id: 'bins',
                        name: 'Bins',
                        table: 'table_a',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table_a_dim_a',
                        binType: BinType.FIXED_NUMBER,
                        binNumber: 5,
                    },
                ],
            }),
        ).rejects.toThrow(/Fixed-number bins cannot be written back/);
        expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
    });

    it.each([
        new ForbiddenError('Invalid or expired token'),
        new ForbiddenError('Insufficient token scopes'),
        new NotFoundError('Missing branch'),
    ])(
        'propagates provider failure before creating a branch: %s',
        async (error) => {
            const { service } = setup();
            vi.mocked(BitbucketClient.getBranch).mockRejectedValueOnce(error);
            await expect(
                service.createPullRequest(writebackUser, 'project', "'", {
                    type: 'customMetrics',
                    fields: [CUSTOM_METRIC],
                }),
            ).rejects.toBeInstanceOf(error.constructor);
            expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
            expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
        },
    );

    it('does not publish a PR for missing YAML', async () => {
        const { service } = setup();
        vi.mocked(BitbucketClient.getFileContent).mockRejectedValueOnce(
            new NotFoundError('Missing file'),
        );
        await expect(
            service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
        expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
    });

    it.each([
        new ConflictError('Branch advanced'),
        new ForbiddenError('Token lacks write scope'),
    ])('does not publish a PR when committing fails: %s', async (error) => {
        const { service } = setup();
        vi.mocked(BitbucketClient.commitFiles).mockRejectedValueOnce(error);
        await expect(
            service.createPullRequest(writebackUser, 'project', "'", {
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
            }),
        ).rejects.toBeInstanceOf(error.constructor);
        expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
    });

    it('keeps generic SQL and source-editor credential paths unsupported', async () => {
        const { service } = setup();
        await expect(
            service.getGitCredentials(writebackUser, 'project'),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(service.getProjectRepo('project')).rejects.toBeInstanceOf(
            ParameterError,
        );
        expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
    });
});
