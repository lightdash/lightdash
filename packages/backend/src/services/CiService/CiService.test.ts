import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { CiService, type CiServiceGithubClient } from './CiService';

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
