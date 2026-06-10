import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    OrganizationMemberRole,
    PullRequest,
    PullRequestProvider,
    PullRequestSource,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import * as GithubClient from '../../clients/github/Github';
import * as GitlabClient from '../../clients/gitlab/Gitlab';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { PullRequestsModel } from '../../models/PullRequestsModel';
import type { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';
import { PullRequestsService } from './PullRequestsService';

jest.mock('../../clients/github/Github');
jest.mock('../../clients/gitlab/Gitlab');

const githubClientMock = jest.mocked(GithubClient);
const gitlabClientMock = jest.mocked(GitlabClient);

// siteUrl from lightdashConfigMock is https://test.lightdash.cloud
const PREVIEW_URL =
    'https://test.lightdash.cloud/projects/123e4567-e89b-12d3-a456-426614174000/dashboards';

const baseUser = {
    email: 'test@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.EDITOR,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const user: SessionUser = {
    ...baseUser,
    userUuid: 'user-uuid',
    ability: new Ability<PossibleAbilities>([
        { subject: 'SourceCode', action: ['view', 'manage'] },
    ]),
};

const makePullRequest = (provider: PullRequestProvider): PullRequest => ({
    pullRequestUuid: 'pr-uuid',
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    createdByUserUuid: 'user-uuid',
    provider,
    source: PullRequestSource.AI_AGENT,
    owner: 'my-group',
    repo: 'my-repo',
    prNumber: 42,
    prUrl: 'https://gitlab.com/my-group/my-repo/-/merge_requests/42',
    aiThreadUuid: null,
    aiAgentUuid: null,
    reviewContext: null,
    createdAt: new Date(),
});

const pullRequestsModel = {
    findByProjectAndUrl: jest.fn(),
};

const gitIntegrationService = {
    getInstallationId: jest.fn(),
    getGitCredentials: jest.fn(),
};

const projectModel = {
    getSummary: jest.fn(),
};

describe('PullRequestsService.getPullRequestPreview', () => {
    let service: PullRequestsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new PullRequestsService({
            lightdashConfig: lightdashConfigMock,
            pullRequestsModel:
                pullRequestsModel as unknown as PullRequestsModel,
            gitIntegrationService:
                gitIntegrationService as unknown as GitIntegrationService,
            projectModel: projectModel as unknown as ProjectModel,
        });
    });

    it('reads the preview URL from a GitLab MR notes', async () => {
        pullRequestsModel.findByProjectAndUrl.mockResolvedValue(
            makePullRequest(PullRequestProvider.GITLAB),
        );
        gitIntegrationService.getGitCredentials.mockResolvedValue({
            owner: 'my-group',
            repo: 'my-repo',
            token: 'glpat-xxx',
            hostDomain: 'gitlab.internal.acme.com',
            type: DbtProjectType.GITLAB,
        });
        gitlabClientMock.getMergeRequestComments.mockResolvedValue([
            'no preview here',
            `deploy ready: ${PREVIEW_URL}`,
        ]);

        const result = await service.getPullRequestPreview(
            user,
            'project-uuid',
            'https://gitlab.com/my-group/my-repo/-/merge_requests/42',
        );

        expect(result).toEqual({ previewUrl: PREVIEW_URL });
        expect(gitlabClientMock.getMergeRequestComments).toHaveBeenCalledWith({
            owner: 'my-group',
            repo: 'my-repo',
            iid: 42,
            token: 'glpat-xxx',
            hostDomain: 'gitlab.internal.acme.com',
        });
        expect(githubClientMock.getPullRequestComments).not.toHaveBeenCalled();
    });

    it('returns null for a GitLab MR with no preview comment', async () => {
        pullRequestsModel.findByProjectAndUrl.mockResolvedValue(
            makePullRequest(PullRequestProvider.GITLAB),
        );
        gitIntegrationService.getGitCredentials.mockResolvedValue({
            owner: 'my-group',
            repo: 'my-repo',
            token: 'glpat-xxx',
            type: DbtProjectType.GITLAB,
        });
        gitlabClientMock.getMergeRequestComments.mockResolvedValue([
            'just a regular discussion',
        ]);

        const result = await service.getPullRequestPreview(
            user,
            'project-uuid',
            'https://gitlab.com/my-group/my-repo/-/merge_requests/42',
        );

        expect(result).toEqual({ previewUrl: null });
    });

    it('returns null (not throwing) when GitLab credentials cannot be resolved', async () => {
        pullRequestsModel.findByProjectAndUrl.mockResolvedValue(
            makePullRequest(PullRequestProvider.GITLAB),
        );
        gitIntegrationService.getGitCredentials.mockRejectedValue(
            new Error('Invalid personal access token for GitLab project'),
        );

        const result = await service.getPullRequestPreview(
            user,
            'project-uuid',
            'https://gitlab.com/my-group/my-repo/-/merge_requests/42',
        );

        expect(result).toEqual({ previewUrl: null });
        expect(gitlabClientMock.getMergeRequestComments).not.toHaveBeenCalled();
    });

    it('still reads the preview URL from a GitHub PR (unchanged path)', async () => {
        pullRequestsModel.findByProjectAndUrl.mockResolvedValue(
            makePullRequest(PullRequestProvider.GITHUB),
        );
        gitIntegrationService.getInstallationId.mockResolvedValue('install-1');
        githubClientMock.getPullRequestComments.mockResolvedValue([
            `preview: ${PREVIEW_URL}`,
        ]);

        const result = await service.getPullRequestPreview(
            user,
            'project-uuid',
            'https://github.com/my-group/my-repo/pull/42',
        );

        expect(result).toEqual({ previewUrl: PREVIEW_URL });
        expect(gitlabClientMock.getMergeRequestComments).not.toHaveBeenCalled();
    });

    it('returns null for an unknown pull request', async () => {
        pullRequestsModel.findByProjectAndUrl.mockResolvedValue(undefined);

        const result = await service.getPullRequestPreview(
            user,
            'project-uuid',
            'https://gitlab.com/my-group/my-repo/-/merge_requests/99',
        );

        expect(result).toEqual({ previewUrl: null });
    });
});
