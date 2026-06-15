import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    DbtProjectType,
    ForbiddenError,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import {
    WritebackPreviewService,
    type WritebackPreviewGithubClient,
} from './WritebackPreviewService';

const ORG = 'org-1';
const PROJECT = 'project-1';
const PR_URL = 'https://github.com/acme/analytics/pull/42';

const userWithSourceCodeAccess = (canViewSourceCode: boolean): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    if (canViewSourceCode) {
        can('view', 'SourceCode', {
            organizationUuid: ORG,
            projectUuid: PROJECT,
        });
    }

    return {
        userUuid: 'user-1',
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

const githubProject = (): AnyType => ({
    organizationUuid: ORG,
    projectUuid: PROJECT,
    dbtConnection: {
        type: DbtProjectType.GITHUB,
    },
});

const makeGithubClient = (): jest.Mocked<WritebackPreviewGithubClient> =>
    ({
        getInstallationToken: jest.fn().mockResolvedValue('installation-token'),
        getPullRequest: jest.fn().mockResolvedValue({
            state: 'open',
            headRef: 'feature/writeback',
        }),
        createPullRequestComment: jest.fn().mockResolvedValue(undefined),
    }) as AnyType;

const buildService = (overrides: Record<string, AnyType> = {}) =>
    new WritebackPreviewService({
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
        } as AnyType,
        projectModel: {
            get: jest.fn().mockResolvedValue(githubProject()),
        } as AnyType,
        projectService: {
            createPreview: jest.fn().mockResolvedValue({
                projectUuid: 'preview-project-1',
                compileJobUuid: 'compile-job-1',
            }),
        } as AnyType,
        githubAppInstallationsModel: {
            getInstallationId: jest.fn().mockResolvedValue('installation-1'),
        } as AnyType,
        githubClient: makeGithubClient(),
        ...overrides,
    });

describe('WritebackPreviewService.createPreviewForPullRequest', () => {
    it('throws before GitHub or preview side effects without source code access', async () => {
        const githubClient = makeGithubClient();
        const projectService = {
            createPreview: jest.fn(),
        };
        const githubAppInstallationsModel = {
            getInstallationId: jest.fn(),
        };
        const service = buildService({
            githubClient,
            projectService: projectService as AnyType,
            githubAppInstallationsModel: githubAppInstallationsModel as AnyType,
        });

        await expect(
            service.createPreviewForPullRequest({
                user: userWithSourceCodeAccess(false),
                projectUuid: PROJECT,
                prUrl: PR_URL,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(
            githubAppInstallationsModel.getInstallationId,
        ).not.toHaveBeenCalled();
        expect(githubClient.getInstallationToken).not.toHaveBeenCalled();
        expect(githubClient.createPullRequestComment).not.toHaveBeenCalled();
        expect(projectService.createPreview).not.toHaveBeenCalled();
    });

    it('creates a preview and posts the preview URL for authorized users', async () => {
        const githubClient = makeGithubClient();
        const projectService = {
            createPreview: jest.fn().mockResolvedValue({
                projectUuid: 'preview-project-1',
                compileJobUuid: 'compile-job-1',
            }),
        };
        const service = buildService({
            githubClient,
            projectService: projectService as AnyType,
        });

        const result = await service.createPreviewForPullRequest({
            user: userWithSourceCodeAccess(true),
            projectUuid: PROJECT,
            prUrl: PR_URL,
        });

        expect(result).toEqual({
            previewProjectUuid: 'preview-project-1',
            previewUrl:
                'https://lightdash.example.com/projects/preview-project-1/home',
            compileJobUuid: 'compile-job-1',
        });
        expect(projectService.createPreview).toHaveBeenCalledWith(
            expect.anything(),
            PROJECT,
            expect.objectContaining({
                copyContent: true,
                validateAfterCompile: true,
            }),
            expect.anything(),
        );
    });
});
