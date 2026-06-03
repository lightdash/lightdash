import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import {
    PreviewDeploySetupService,
    type PreviewDeployGithubClient,
} from './PreviewDeploySetupService';

const ORG = 'org-1';
const PROJECT = 'p1';

const userWith = (action: 'view' | 'manage'): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can(action, 'SourceCode', { organizationUuid: ORG });
    if (action === 'manage') {
        can('view', 'SourceCode', { organizationUuid: ORG });
    }
    return {
        userUuid: 'u1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        organizationUuid: ORG,
        organizationName: 'Acme',
        organizationCreatedAt: new Date(),
        role: 'admin',
        ability: build(),
    } as AnyType;
};

const githubProject = (subPath = '/'): AnyType => ({
    organizationUuid: ORG,
    name: 'Analytics',
    dbtConnection: {
        type: DbtProjectType.GITHUB,
        repository: 'acme/analytics',
        branch: 'main',
        project_sub_path: subPath,
    },
});

const gitlabProject = (): AnyType => ({
    organizationUuid: ORG,
    name: 'Analytics',
    dbtConnection: {
        type: DbtProjectType.GITLAB,
        repository: 'acme/analytics',
        branch: 'main',
        project_sub_path: '/',
        host_domain: 'gitlab.acme.com',
    },
});

// Injected GitHub client surface — faked per-test, no module mocking needed.
const makeGithubClient = (): jest.Mocked<PreviewDeployGithubClient> =>
    ({
        createBranch: jest.fn().mockResolvedValue(undefined),
        createPullRequest: jest.fn(),
        createSignedCommitOnBranch: jest.fn().mockResolvedValue(undefined),
        getBranchHeadSha: jest.fn(),
        getRepoDefaultBranch: jest.fn(),
        getRepoWorkflowFiles: jest.fn(),
    }) as AnyType;

const buildService = (overrides: Record<string, AnyType> = {}) =>
    new PreviewDeploySetupService({
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
        } as AnyType,
        projectModel: { get: jest.fn() } as AnyType,
        githubAppInstallationsModel: {
            getInstallationId: jest.fn().mockResolvedValue('inst-1'),
        } as AnyType,
        pullRequestsModel: {
            findOrCreate: jest.fn().mockResolvedValue({}),
        } as AnyType,
        projectCiStatusModel: {
            findByProjectUuid: jest.fn(),
            upsert: jest.fn(),
        } as AnyType,
        githubClient: makeGithubClient(),
        ...overrides,
    });

describe('PreviewDeploySetupService.setupPreviewDeploy', () => {
    it('commits the preview workflow files onto the default branch and returns pre-filled secrets', async () => {
        const githubClient = makeGithubClient();
        githubClient.getRepoDefaultBranch.mockResolvedValue('main');
        githubClient.getBranchHeadSha.mockResolvedValue('base-sha');
        githubClient.createPullRequest.mockResolvedValue({
            number: 42,
            html_url: 'https://github.com/acme/analytics/pull/42',
        } as AnyType);
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(githubProject('/transform')),
            } as AnyType,
            githubClient,
        });

        const result = await service.setupPreviewDeploy({
            user: userWith('manage'),
            projectUuid: PROJECT,
        });

        // Behaviour: both workflow files are committed (no deletions) onto a PR
        // based on the repo's default branch.
        const commitArgs =
            githubClient.createSignedCommitOnBranch.mock.calls[0][0];
        expect(commitArgs.fileChanges.additions).toHaveLength(2);
        expect(commitArgs.fileChanges.deletions).toEqual([]);
        expect(githubClient.createPullRequest).toHaveBeenCalledWith(
            expect.objectContaining({ base: 'main' }),
        );

        // Output: the opened PR + pre-filled secrets surfaced to the caller.
        expect(result.prUrl).toBe('https://github.com/acme/analytics/pull/42');
        expect(result.repository).toBe('acme/analytics');
        const prefilled = Object.fromEntries(
            result.secrets.map((s) => [s.name, s.value]),
        );
        expect(prefilled.LIGHTDASH_PROJECT).toBe(PROJECT);
        expect(prefilled.LIGHTDASH_URL).toBe('https://lightdash.example.com');
        expect(prefilled.LIGHTDASH_API_KEY).toBeNull();
    });

    it('rejects a non-GitHub project before touching the GitHub API', async () => {
        const githubClient = makeGithubClient();
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(gitlabProject()),
            } as AnyType,
            githubClient,
        });

        await expect(
            service.setupPreviewDeploy({
                user: userWith('manage'),
                projectUuid: PROJECT,
            }),
        ).rejects.toThrow(ParameterError);
        expect(githubClient.getRepoDefaultBranch).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError without manage:SourceCode', async () => {
        const githubClient = makeGithubClient();
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            githubClient,
        });

        await expect(
            service.setupPreviewDeploy({
                user: userWith('view'),
                projectUuid: PROJECT,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(githubClient.createPullRequest).not.toHaveBeenCalled();
    });
});

describe('PreviewDeploySetupService.getOrScanProjectCiStatus', () => {
    it('returns the existing status without scanning when already configured', async () => {
        const existing = {
            projectUuid: PROJECT,
            hasPreviewDeployWorkflow: true,
            workflowPath: '.github/workflows/start-preview.yml',
        };
        const githubClient = makeGithubClient();
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            projectCiStatusModel: {
                findByProjectUuid: jest.fn().mockResolvedValue(existing),
                upsert: jest.fn(),
            } as AnyType,
            githubClient,
        });

        const result = await service.getOrScanProjectCiStatus(
            userWith('view'),
            PROJECT,
        );

        expect(result).toBe(existing);
        expect(githubClient.getRepoWorkflowFiles).not.toHaveBeenCalled();
    });

    it('scans the GitHub repo and persists the detection result', async () => {
        const githubClient = makeGithubClient();
        githubClient.getRepoWorkflowFiles.mockResolvedValue([
            {
                path: '.github/workflows/start-preview.yml',
                content: 'run: lightdash start-preview',
            },
        ]);
        const upserted = {
            projectUuid: PROJECT,
            hasPreviewDeployWorkflow: true,
            workflowPath: '.github/workflows/start-preview.yml',
        };
        const projectCiStatusModel = {
            findByProjectUuid: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue(upserted),
        };
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            projectCiStatusModel: projectCiStatusModel as AnyType,
            githubClient,
        });

        const result = await service.getOrScanProjectCiStatus(
            userWith('view'),
            PROJECT,
        );

        expect(projectCiStatusModel.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ hasPreviewDeployWorkflow: true }),
        );
        expect(result).toBe(upserted);
    });

    it('does not scan a non-GitHub project', async () => {
        const githubClient = makeGithubClient();
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(gitlabProject()),
            } as AnyType,
            projectCiStatusModel: {
                findByProjectUuid: jest.fn().mockResolvedValue(null),
                upsert: jest.fn(),
            } as AnyType,
            githubClient,
        });

        const result = await service.getOrScanProjectCiStatus(
            userWith('view'),
            PROJECT,
        );

        expect(result).toBeNull();
        expect(githubClient.getRepoWorkflowFiles).not.toHaveBeenCalled();
    });
});
