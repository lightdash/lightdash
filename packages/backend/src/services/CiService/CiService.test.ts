import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    OrganizationMemberRole,
    RequestMethod,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { ProjectService } from '../ProjectService/ProjectService';
import { CiService, type CiServiceGithubClient } from './CiService';

const noopProjectService = {
    scheduleCompileProject: jest.fn().mockResolvedValue({ jobUuid: 'job-uuid' }),
} as unknown as ProjectService;

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';

const userWithSourceCode: SessionUser = {
    userUuid: 'user-uuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    timezone: null,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SourceCode', action: ['view'] },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const buildGithubProject = (repository: string) => ({
    organizationUuid,
    projectUuid,
    dbtConnection: {
        type: DbtProjectType.GITHUB,
        repository,
    },
});

describe('CiService.getPullRequestChecks', () => {
    const getPullRequest = jest.fn();
    const listCheckRunsForRef = jest.fn();
    const getInstallationToken = jest
        .fn()
        .mockResolvedValue('installation-token');
    const getInstallationId = jest.fn().mockResolvedValue('installation-id');

    const buildService = (repository: string) =>
        new CiService({
            projectModel: {
                get: jest
                    .fn()
                    .mockResolvedValue(buildGithubProject(repository)),
            } as unknown as ProjectModel,
            githubAppInstallationsModel: {
                getInstallationId,
            } as unknown as GithubAppInstallationsModel,
            githubClient: {
                getInstallationToken,
                getPullRequest,
                listCheckRunsForRef,
            } as unknown as CiServiceGithubClient,
            projectService: noopProjectService,
        });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('refuses to query GitHub when the PR URL points at a different repo', async () => {
        const service = buildService('lightdash/lightdash');

        const result = await service.getPullRequestChecks({
            user: userWithSourceCode,
            projectUuid,
            prUrl: 'https://github.com/attacker/secret-repo/pull/1',
        });

        expect(result).toBeNull();
        expect(getInstallationToken).not.toHaveBeenCalled();
        expect(getPullRequest).not.toHaveBeenCalled();
    });

    it('queries GitHub when the PR URL matches the configured repo (case-insensitive)', async () => {
        const service = buildService('lightdash/lightdash');
        getPullRequest.mockResolvedValue({
            headRef: 'feature',
            mergeableState: 'clean',
            draft: false,
            merged: false,
            state: 'open',
        });
        listCheckRunsForRef.mockResolvedValue([]);

        const result = await service.getPullRequestChecks({
            user: userWithSourceCode,
            projectUuid,
            prUrl: 'https://github.com/Lightdash/Lightdash/pull/42',
        });

        expect(getInstallationToken).toHaveBeenCalledTimes(1);
        expect(getPullRequest).toHaveBeenCalledTimes(1);
        expect(result).not.toBeNull();
    });
});

const userWithManageSourceCode: SessionUser = {
    ...userWithSourceCode,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SourceCode',
            action: ['view', 'manage'],
            conditions: { isProtectedBranch: false },
        },
    ]),
};

describe('CiService.mergePullRequest', () => {
    const mergePullRequest = jest
        .fn()
        .mockResolvedValue({ merged: true, sha: 'merge-sha' });
    const getInstallationToken = jest
        .fn()
        .mockResolvedValue('installation-token');
    const getInstallationId = jest.fn().mockResolvedValue('installation-id');
    const scheduleCompileProject = jest
        .fn()
        .mockResolvedValue({ jobUuid: 'job-uuid' });

    const buildService = (repository: string) =>
        new CiService({
            projectModel: {
                get: jest
                    .fn()
                    .mockResolvedValue(buildGithubProject(repository)),
            } as unknown as ProjectModel,
            githubAppInstallationsModel: {
                getInstallationId,
            } as unknown as GithubAppInstallationsModel,
            githubClient: {
                getInstallationToken,
                mergePullRequest,
            } as unknown as CiServiceGithubClient,
            projectService: {
                scheduleCompileProject,
            } as unknown as ProjectService,
        });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws ForbiddenError without manage:SourceCode', async () => {
        const service = buildService('lightdash/lightdash');

        await expect(
            service.mergePullRequest({
                user: userWithSourceCode,
                projectUuid,
                prUrl: 'https://github.com/lightdash/lightdash/pull/42',
            }),
        ).rejects.toThrow();
        expect(mergePullRequest).not.toHaveBeenCalled();
    });

    it('refuses to merge a PR that points at a different repo', async () => {
        const service = buildService('lightdash/lightdash');

        await expect(
            service.mergePullRequest({
                user: userWithManageSourceCode,
                projectUuid,
                prUrl: 'https://github.com/attacker/secret-repo/pull/1',
            }),
        ).rejects.toThrow();
        expect(mergePullRequest).not.toHaveBeenCalled();
    });

    it('merges and forwards the expected head sha when the repo matches', async () => {
        const service = buildService('lightdash/lightdash');

        const result = await service.mergePullRequest({
            user: userWithManageSourceCode,
            projectUuid,
            prUrl: 'https://github.com/Lightdash/Lightdash/pull/42',
            sha: 'head-sha',
        });

        expect(mergePullRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'Lightdash',
                repo: 'Lightdash',
                pullNumber: 42,
                sha: 'head-sha',
                token: 'installation-token',
            }),
        );
        expect(result).toEqual({ merged: true, sha: 'merge-sha' });
    });

    it('schedules a project sync after a successful merge', async () => {
        const service = buildService('lightdash/lightdash');

        await service.mergePullRequest({
            user: userWithManageSourceCode,
            projectUuid,
            prUrl: 'https://github.com/lightdash/lightdash/pull/42',
        });

        expect(scheduleCompileProject).toHaveBeenCalledWith(
            userWithManageSourceCode,
            projectUuid,
            RequestMethod.WEB_APP,
        );
    });

    it('does not schedule a project sync when the merge did not happen', async () => {
        mergePullRequest.mockResolvedValueOnce({ merged: false, sha: null });
        const service = buildService('lightdash/lightdash');

        await service.mergePullRequest({
            user: userWithManageSourceCode,
            projectUuid,
            prUrl: 'https://github.com/lightdash/lightdash/pull/42',
        });

        expect(scheduleCompileProject).not.toHaveBeenCalled();
    });

    it('still returns the merge result when scheduling the sync fails', async () => {
        scheduleCompileProject.mockRejectedValueOnce(
            new Error('compile boom'),
        );
        const service = buildService('lightdash/lightdash');

        const result = await service.mergePullRequest({
            user: userWithManageSourceCode,
            projectUuid,
            prUrl: 'https://github.com/lightdash/lightdash/pull/42',
        });

        expect(result).toEqual({ merged: true, sha: 'merge-sha' });
    });
});

describe('CiService.getPullRequestDiff', () => {
    const getPullRequestDiff = jest.fn().mockResolvedValue('pr-diff');
    const getCommitDiff = jest.fn().mockResolvedValue('commit-diff');
    const getInstallationToken = jest
        .fn()
        .mockResolvedValue('installation-token');
    const getInstallationId = jest.fn().mockResolvedValue('installation-id');

    const buildService = (repository: string) =>
        new CiService({
            projectModel: {
                get: jest
                    .fn()
                    .mockResolvedValue(buildGithubProject(repository)),
            } as unknown as ProjectModel,
            githubAppInstallationsModel: {
                getInstallationId,
            } as unknown as GithubAppInstallationsModel,
            githubClient: {
                getInstallationToken,
                getPullRequestDiff,
                getCommitDiff,
            } as unknown as CiServiceGithubClient,
            projectService: noopProjectService,
        });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns null and fetches nothing when the PR points at a different repo', async () => {
        const service = buildService('lightdash/lightdash');

        const result = await service.getPullRequestDiff({
            user: userWithSourceCode,
            projectUuid,
            prUrl: 'https://github.com/attacker/secret-repo/pull/1',
        });

        expect(result).toBeNull();
        expect(getPullRequestDiff).not.toHaveBeenCalled();
        expect(getCommitDiff).not.toHaveBeenCalled();
    });

    it('fetches the commit diff when a commit SHA is given', async () => {
        const service = buildService('lightdash/lightdash');

        const result = await service.getPullRequestDiff({
            user: userWithSourceCode,
            projectUuid,
            prUrl: 'https://github.com/lightdash/lightdash/pull/42',
            commitSha: 'abc123',
        });

        expect(getCommitDiff).toHaveBeenCalledWith(
            expect.objectContaining({ ref: 'abc123' }),
        );
        expect(getPullRequestDiff).not.toHaveBeenCalled();
        expect(result).toBe('commit-diff');
    });

    it('fetches the whole PR diff when no commit SHA is given', async () => {
        const service = buildService('lightdash/lightdash');

        const result = await service.getPullRequestDiff({
            user: userWithSourceCode,
            projectUuid,
            prUrl: 'https://github.com/lightdash/lightdash/pull/42',
        });

        expect(getPullRequestDiff).toHaveBeenCalledWith(
            expect.objectContaining({ pullNumber: 42 }),
        );
        expect(getCommitDiff).not.toHaveBeenCalled();
        expect(result).toBe('pr-diff');
    });
});

describe('CiService.closePullRequest', () => {
    const closePullRequest = jest.fn().mockResolvedValue({ state: 'closed' });
    const getInstallationToken = jest
        .fn()
        .mockResolvedValue('installation-token');
    const getInstallationId = jest.fn().mockResolvedValue('installation-id');

    const buildService = (repository: string) =>
        new CiService({
            projectModel: {
                get: jest
                    .fn()
                    .mockResolvedValue(buildGithubProject(repository)),
            } as unknown as ProjectModel,
            githubAppInstallationsModel: {
                getInstallationId,
            } as unknown as GithubAppInstallationsModel,
            githubClient: {
                getInstallationToken,
                closePullRequest,
            } as unknown as CiServiceGithubClient,
            projectService: noopProjectService,
        });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws ForbiddenError without manage:SourceCode', async () => {
        const service = buildService('lightdash/lightdash');

        await expect(
            service.closePullRequest({
                user: userWithSourceCode,
                projectUuid,
                prUrl: 'https://github.com/lightdash/lightdash/pull/42',
            }),
        ).rejects.toThrow();
        expect(closePullRequest).not.toHaveBeenCalled();
    });

    it('closes the PR when the repo matches', async () => {
        const service = buildService('lightdash/lightdash');

        const result = await service.closePullRequest({
            user: userWithManageSourceCode,
            projectUuid,
            prUrl: 'https://github.com/lightdash/lightdash/pull/42',
        });

        expect(closePullRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'lightdash',
                repo: 'lightdash',
                pullNumber: 42,
                token: 'installation-token',
            }),
        );
        expect(result).toEqual({ state: 'closed' });
    });
});
