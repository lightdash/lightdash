import { Ability } from '@casl/ability';
import {
    AlreadyExistsError,
    ConflictError,
    DbtProjectType,
    DimensionType,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    PullRequestState,
    SupportedDbtVersions,
    UnexpectedGitError,
    type DbtProjectConfig,
    type PossibleAbilities,
    type VizColumn,
} from '@lightdash/common';
import { load } from 'js-yaml';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import * as BitbucketClient from '../../clients/bitbucket/Bitbucket';
import * as GithubClient from '../../clients/github/Github';
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
const legacyClients = vi.hoisted(() => {
    const createClient = () => ({
        getLastCommit: vi.fn(),
        createBranch: vi.fn(),
        checkFileDoesNotExist: vi.fn(),
        createFile: vi.fn(),
        createPullRequest: vi.fn(),
        getOrRefreshToken: vi.fn(),
    });
    return { github: createClient(), gitlab: createClient() };
});
vi.mock('../../clients/github/Github', () => legacyClients.github);
vi.mock('../../clients/gitlab/Gitlab', () => legacyClients.gitlab);

const connection: DbtProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    username: 'developer',
    personal_access_token: 'project-token',
    repository: 'workspace/analytics',
    branch: 'release/dbt',
    project_sub_path: './semantic/',
};
const sql = 'select 1 as amount, current_date as order_date';
const columns: VizColumn[] = [
    { reference: 'amount', type: DimensionType.NUMBER },
    { reference: 'order_date', type: DimensionType.DATE },
];
const expectedPaths = [
    'semantic/models/lightdash/daily_revenue.sql',
    'semantic/models/lightdash/daily_revenue.yml',
];
const writebackUser = {
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
        {
            action: 'manage',
            subject: 'SourceCode',
            conditions: {
                organizationUuid: 'organization',
                projectUuid: 'project',
                isProtectedBranch: false,
            },
        },
    ]),
};
const prUrl = 'https://bitbucket.org/workspace/analytics/pull-requests/21';

const setup = (dbtConnection: DbtProjectConfig = connection) => {
    const project = {
        projectUuid: 'project',
        organizationUuid: 'organization',
        name: 'Analytics',
        dbtVersion: SupportedDbtVersions.V1_9,
        dbtConnection,
    };
    const projectModel = {
        get: vi.fn().mockResolvedValue({
            ...project,
            dbtConnection: { ...dbtConnection, personal_access_token: '' },
        }),
        getSummary: vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'organization' }),
        getWithSensitiveFields: vi.fn().mockResolvedValue(project),
    };
    const pullRequests = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new GitIntegrationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        projectDbtSourcesModel: {} as ProjectDbtSourcesModel,
        pullRequestsModel: pullRequests as unknown as PullRequestsModel,
        savedChartModel: {} as SavedChartModel,
        spaceModel: {} as SpaceModel,
        githubAppInstallationsModel: {
            getInstallationId: vi.fn().mockResolvedValue('installation'),
            getAuth: vi.fn().mockResolvedValue({
                token: 'project-token',
                refreshToken: 'refresh',
            }),
        } as unknown as GithubAppInstallationsModel,
        githubAppService: {
            getValidUserToken: vi.fn().mockResolvedValue(undefined),
        } as unknown as GithubAppService,
    });
    const create = () =>
        service.createPullRequestFromSql(
            writebackUser,
            'project',
            'Daily Revenue',
            sql,
            columns,
        );
    return { service, create, projectModel, pullRequests };
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(BitbucketClient.getBranch).mockImplementation(
        async ({ branch }) => ({
            name: branch,
            target: {
                hash:
                    branch === connection.branch
                        ? 'base-sha'
                        : 'captured-parent',
            },
        }),
    );
    vi.mocked(BitbucketClient.createBranch).mockResolvedValue({
        name: 'feature',
        target: { hash: 'base-sha' },
    });
    vi.mocked(BitbucketClient.getFileContent).mockRejectedValue(
        new NotFoundError('No file'),
    );
    vi.mocked(BitbucketClient.commitFiles).mockResolvedValue(undefined);
    vi.mocked(BitbucketClient.createPullRequest).mockResolvedValue({
        number: 21,
        title: 'Create model',
        html_url: prUrl,
        state: PullRequestState.OPEN,
        head: 'feature',
        base: connection.branch,
    });
    for (const client of Object.values(legacyClients)) {
        client.getLastCommit.mockResolvedValue({
            sha: 'legacy-base',
        });
        client.createBranch.mockResolvedValue(undefined);
        client.checkFileDoesNotExist.mockResolvedValue(undefined);
        client.createFile.mockResolvedValue(undefined);
        client.createPullRequest.mockResolvedValue({
            number: 21,
            title: 'Create model',
            html_url: 'https://example.com/pr/21',
        });
    }
    vi.mocked(GithubClient.getOrRefreshToken).mockResolvedValue({
        token: 'project-token',
        refreshToken: 'refresh',
    });
});

describe('Bitbucket SQL Runner writeback', () => {
    it('creates SQL and YAML atomically from the captured feature-branch parent', async () => {
        const { create, pullRequests } = setup();
        await expect(create()).resolves.toEqual({
            prTitle: 'Create model',
            prUrl,
        });
        const { branch } = vi.mocked(BitbucketClient.createBranch).mock
            .calls[0][0];
        expect(BitbucketClient.createBranch).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'workspace',
                repo: 'analytics',
                token: 'project-token',
                sha: 'base-sha',
            }),
        );
        expect(branch).not.toBe(connection.branch);
        expect(
            vi
                .mocked(BitbucketClient.getFileContent)
                .mock.calls.map(([args]) => args.fileName)
                .sort(),
        ).toEqual(expectedPaths);
        expect(BitbucketClient.commitFiles).toHaveBeenCalledTimes(1);
        const [commit] = vi.mocked(BitbucketClient.commitFiles).mock.calls[0];
        expect(commit).toMatchObject({
            branch,
            expectedParent: 'captured-parent',
            owner: 'workspace',
            repo: 'analytics',
            token: 'project-token',
        });
        expect(commit.changes.map((change) => change.path)).toEqual(
            expectedPaths,
        );
        const [sqlChange, yamlChange] = commit.changes;
        if (sqlChange.action !== 'upsert' || yamlChange.action !== 'upsert') {
            throw new Error('Expected two new model files');
        }
        expect(sqlChange.content).toContain("tags=['created-by-lightdash']");
        expect(sqlChange.content).toContain(sql);
        expect(load(yamlChange.content)).toMatchObject({
            version: 2,
            models: [
                {
                    name: 'daily_revenue',
                    columns: [
                        {
                            name: 'amount',
                            meta: { dimension: { type: 'number' } },
                        },
                        {
                            name: 'order_date',
                            meta: { dimension: { type: 'date' } },
                        },
                    ],
                },
            ],
        });
        expect(BitbucketClient.createPullRequest).toHaveBeenCalledWith(
            expect.objectContaining({ head: branch, base: 'release/dbt' }),
        );
        expect(pullRequests.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: PullRequestProvider.BITBUCKET,
                source: PullRequestSource.SQL_RUNNER,
                prUrl,
                projectUuid: 'project',
            }),
        );
    });

    it('rejects a branch change during collision checks instead of accepting the newer parent', async () => {
        const { create } = setup();
        let currentParent = 'captured-parent';
        vi.mocked(BitbucketClient.getBranch).mockImplementation(
            async ({ branch }) => ({
                name: branch,
                target: {
                    hash:
                        branch === connection.branch
                            ? 'base-sha'
                            : currentParent,
                },
            }),
        );
        vi.mocked(BitbucketClient.getFileContent).mockImplementation(
            async () => {
                currentParent = 'concurrent-parent';
                throw new NotFoundError('No file');
            },
        );
        vi.mocked(BitbucketClient.commitFiles).mockImplementation(
            async ({ expectedParent }) => {
                if (expectedParent !== currentParent) {
                    throw new ConflictError(
                        'Branch changed during file checks',
                    );
                }
            },
        );
        await expect(create()).rejects.toBeInstanceOf(ConflictError);
        expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
    });

    it.each(expectedPaths)(
        'does not overwrite existing %s or publish a PR',
        async (existingPath) => {
            const { create, pullRequests } = setup();
            vi.mocked(BitbucketClient.getFileContent).mockImplementation(
                async ({ fileName }) => {
                    if (fileName === existingPath) {
                        return {
                            content: 'existing content',
                            sha: 'captured-parent',
                        };
                    }
                    throw new NotFoundError('No file');
                },
            );
            await expect(create()).rejects.toBeInstanceOf(AlreadyExistsError);
            expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
            expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
            expect(pullRequests.create).not.toHaveBeenCalled();
        },
    );

    it.each([
        new ForbiddenError('Invalid token'),
        new UnexpectedGitError('API unavailable'),
    ])(
        'does not treat a failed collision check as an absent file: %s',
        async (error) => {
            const { create } = setup();
            vi.mocked(BitbucketClient.getFileContent).mockRejectedValueOnce(
                error,
            );
            await expect(create()).rejects.toBe(error);
            expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
            expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
        },
    );

    it.each([
        new ConflictError('Concurrent update'),
        new ForbiddenError('Missing write scope'),
    ])(
        'does not publish or record a PR when the atomic commit fails: %s',
        async (error) => {
            const { create, pullRequests } = setup();
            vi.mocked(BitbucketClient.commitFiles).mockRejectedValueOnce(error);
            await expect(create()).rejects.toBe(error);
            expect(BitbucketClient.createPullRequest).not.toHaveBeenCalled();
            expect(pullRequests.create).not.toHaveBeenCalled();
        },
    );

    it('does not record a PR that Bitbucket refused to create', async () => {
        const { create, pullRequests } = setup();
        vi.mocked(BitbucketClient.createPullRequest).mockRejectedValueOnce(
            new ForbiddenError('Missing PR scope'),
        );
        await expect(create()).rejects.toBeInstanceOf(ForbiddenError);
        expect(BitbucketClient.commitFiles).toHaveBeenCalledTimes(1);
        expect(pullRequests.create).not.toHaveBeenCalled();
    });

    it.each(['create', 'preview'] as const)(
        'requires manage SourceCode before loading credentials for %s',
        async (action) => {
            const { service, projectModel } = setup();
            const reader = {
                ...writebackUser,
                ability: new Ability<PossibleAbilities>([
                    {
                        action: 'view',
                        subject: 'SourceCode',
                        conditions: {
                            projectUuid: 'project',
                            organizationUuid: 'organization',
                        },
                    },
                ]),
            };
            await expect(
                action === 'create'
                    ? service.createPullRequestFromSql(
                          reader,
                          'project',
                          'Daily Revenue',
                          sql,
                          columns,
                      )
                    : service.writeBackPreview(
                          reader,
                          'project',
                          'Daily Revenue',
                      ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
            expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
        },
    );

    it('checks the resource organization before loading project credentials', async () => {
        const { create, projectModel } = setup();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'other-organization',
        });
        await expect(create()).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
    });

    it('previews the Bitbucket URL and normalized paths without writing files', async () => {
        const { service } = setup();
        await expect(
            service.writeBackPreview(writebackUser, 'project', 'Daily Revenue'),
        ).resolves.toEqual({
            url: 'https://bitbucket.org/workspace/analytics',
            owner: 'workspace',
            repo: 'analytics',
            path: 'semantic/models/lightdash',
            files: expectedPaths,
        });
        expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
        expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
    });

    it('rejects self-hosted Bitbucket and leaves generic source editing disabled', async () => {
        const { create } = setup({
            ...connection,
            host_domain: 'bitbucket.internal',
        });
        await expect(create()).rejects.toBeInstanceOf(ParameterError);
        const { service } = setup();
        await expect(
            service.getGitCredentials(writebackUser, 'project'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(BitbucketClient.createBranch).not.toHaveBeenCalled();
    });
});

describe.each([DbtProjectType.GITHUB, DbtProjectType.GITLAB] as const)(
    '%s SQL Runner regression',
    (type) => {
        const legacyConnection: DbtProjectConfig = {
            ...connection,
            type,
            authorization_method: 'personal_access_token',
            project_sub_path: 'dbt',
            host_domain:
                type === DbtProjectType.GITLAB ? 'gitlab.internal' : undefined,
        };
        const client =
            type === DbtProjectType.GITHUB ? GithubClient : GitlabClient;

        it('retains separate SQL/YAML writes and the configured PR destination', async () => {
            const { create, pullRequests } = setup(legacyConnection);
            await expect(create()).resolves.toMatchObject({
                prUrl: 'https://example.com/pr/21',
            });
            expect(client.checkFileDoesNotExist).toHaveBeenCalledTimes(2);
            expect(client.createFile).toHaveBeenCalledTimes(2);
            const files = vi
                .mocked(client.createFile)
                .mock.calls.map(([args]) => args);
            expect(files[0]).toMatchObject({
                fileName: 'dbt/models/lightdash/daily_revenue.sql',
                content: expect.stringContaining(sql),
            });
            expect(files[1]).toMatchObject({
                fileName: 'dbt/models/lightdash/daily_revenue.yml',
            });
            expect(load(files[1].content)).toMatchObject({
                version: 2,
                models: [{ name: 'daily_revenue' }],
            });
            expect(client.createPullRequest).toHaveBeenCalledWith(
                expect.objectContaining({ base: connection.branch }),
            );
            expect(pullRequests.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider:
                        type === DbtProjectType.GITHUB
                            ? PullRequestProvider.GITHUB
                            : PullRequestProvider.GITLAB,
                    source: PullRequestSource.SQL_RUNNER,
                }),
            );
            expect(BitbucketClient.commitFiles).not.toHaveBeenCalled();
        });

        it('previews without loading credentials or calling the Git provider', async () => {
            const { service, projectModel } = setup(legacyConnection);
            const result = await service.writeBackPreview(
                writebackUser,
                'project',
                'Daily Revenue',
            );
            expect(result).toEqual({
                url:
                    type === DbtProjectType.GITHUB
                        ? 'https://github.com/workspace/analytics'
                        : 'https://gitlab.internal/workspace/analytics',
                owner: 'workspace',
                repo: 'analytics',
                path: 'dbt/models/lightdash',
                files: [
                    'dbt/models/lightdash/daily_revenue.sql',
                    'dbt/models/lightdash/daily_revenue.yml',
                ],
            });
            expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
            expect(client.createBranch).not.toHaveBeenCalled();
            expect(client.checkFileDoesNotExist).not.toHaveBeenCalled();
        });
    },
);
