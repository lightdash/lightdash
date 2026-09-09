import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    PossibleAbilities,
    PullRequest,
    PullRequestProvider,
    PullRequestSource,
    PullRequestState,
} from '@lightdash/common';
import * as BitbucketClient from '../../clients/bitbucket/Bitbucket';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';
import { user } from '../ProjectService/ProjectService.mock';
import { PullRequestsService } from './PullRequestsService';

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
const storedPullRequest: PullRequest = {
    pullRequestUuid: 'pull-request',
    organizationUuid: 'organization',
    projectUuid: 'project',
    createdByUserUuid: null,
    provider: PullRequestProvider.BITBUCKET,
    source: PullRequestSource.AI_AGENT,
    owner: 'workspace',
    repo: 'jaffle',
    prNumber: 1,
    prUrl: 'https://bitbucket.org/workspace/jaffle/pull-requests/1',
    summary: null,
    aiThreadUuid: null,
    aiAgentUuid: null,
    reviewContext: null,
    createdAt: new Date('2026-09-09'),
};

const createService = () => {
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'organization' }),
        get: vi.fn().mockResolvedValue({
            dbtConnection: { type: DbtProjectType.BITBUCKET },
        }),
    };
    const pullRequestsModel = {
        getByProject: vi.fn().mockResolvedValue({ data: [storedPullRequest] }),
    };
    const gitIntegrationService = {
        getBitbucketCredentials: vi.fn().mockResolvedValue({
            owner: 'workspace',
            repo: 'jaffle',
            token: 'project-token',
            type: DbtProjectType.BITBUCKET,
        }),
        getGitCredentials: vi.fn(),
    };
    const service = new PullRequestsService({
        lightdashConfig: lightdashConfigMock,
        projectModel: projectModel as unknown as ProjectModel,
        pullRequestsModel: pullRequestsModel as unknown as PullRequestsModel,
        gitIntegrationService:
            gitIntegrationService as unknown as GitIntegrationService,
    });
    return { service, projectModel, pullRequestsModel, gitIntegrationService };
};

describe('Bitbucket pull request metadata', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('checks access to the resource organization before reading stored pull requests or credentials', async () => {
        const {
            service,
            projectModel,
            pullRequestsModel,
            gitIntegrationService,
        } = createService();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'another-organization',
        });
        await expect(
            service.getPullRequests(authorizedUser, 'project'),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(pullRequestsModel.getByProject).not.toHaveBeenCalled();
        expect(
            gitIntegrationService.getBitbucketCredentials,
        ).not.toHaveBeenCalled();
    });

    it('preserves successful metadata when another pull request is inaccessible', async () => {
        const { service, pullRequestsModel, gitIntegrationService } =
            createService();
        const inaccessible = {
            ...storedPullRequest,
            pullRequestUuid: 'inaccessible',
            prNumber: 2,
        };
        pullRequestsModel.getByProject.mockResolvedValue({
            data: [storedPullRequest, inaccessible],
        });
        vi.spyOn(BitbucketClient, 'getPullRequest')
            .mockResolvedValueOnce({
                number: 1,
                title: 'Add revenue',
                state: PullRequestState.OPEN,
                html_url: storedPullRequest.prUrl,
                head: 'change',
                base: 'main',
            })
            .mockRejectedValueOnce(new ForbiddenError());
        const result = await service.getPullRequests(authorizedUser, 'project');
        expect(result.data).toEqual([
            {
                ...storedPullRequest,
                title: 'Add revenue',
                state: PullRequestState.OPEN,
            },
            { ...inaccessible, title: null, state: null },
        ]);
        expect(gitIntegrationService.getGitCredentials).not.toHaveBeenCalled();
    });

    it('queues large histories and preserves results when a queued request fails', async () => {
        const { service, pullRequestsModel } = createService();
        const rows = Array.from({ length: 12 }, (_, index) => ({
            ...storedPullRequest,
            pullRequestUuid: `pull-request-${index + 1}`,
            prNumber: index + 1,
        }));
        pullRequestsModel.getByProject.mockResolvedValue({ data: rows });
        const pending = new Map<number, () => void>();
        const getPullRequest = vi
            .spyOn(BitbucketClient, 'getPullRequest')
            .mockImplementation(async ({ pullNumber }) => {
                await new Promise<void>((resolve) => {
                    pending.set(pullNumber, resolve);
                });
                pending.delete(pullNumber);
                if (pullNumber === 9) {
                    throw new ForbiddenError();
                }
                return {
                    number: pullNumber,
                    title: `Change ${pullNumber}`,
                    state: PullRequestState.OPEN,
                    html_url: `https://bitbucket.org/workspace/jaffle/pull-requests/${pullNumber}`,
                    head: 'change',
                    base: 'main',
                };
            });

        const result = service.getPullRequests(authorizedUser, 'project');
        await vi.waitFor(() => {
            expect(getPullRequest).toHaveBeenCalledTimes(8);
            expect(pending.size).toBe(8);
        });
        [...pending.values()].forEach((resolve) => resolve());
        await vi.waitFor(() => {
            expect(getPullRequest).toHaveBeenCalledTimes(12);
            expect(pending.size).toBe(4);
        });
        [...pending.values()].forEach((resolve) => resolve());

        expect((await result).data).toEqual(
            rows.map((row) => ({
                ...row,
                title: row.prNumber === 9 ? null : `Change ${row.prNumber}`,
                state: row.prNumber === 9 ? null : PullRequestState.OPEN,
            })),
        );
    });

    it.each([
        { owner: 'old-workspace', repo: 'jaffle' },
        { owner: 'workspace', repo: 'old-repo' },
    ])(
        'never uses the current token for historical repository $owner/$repo',
        async (repository) => {
            const { service, pullRequestsModel } = createService();
            const historic = { ...storedPullRequest, ...repository };
            pullRequestsModel.getByProject.mockResolvedValue({
                data: [historic],
            });
            const getPullRequest = vi.spyOn(BitbucketClient, 'getPullRequest');
            expect(
                (await service.getPullRequests(authorizedUser, 'project')).data,
            ).toEqual([{ ...historic, title: null, state: null }]);
            expect(getPullRequest).not.toHaveBeenCalled();
        },
    );

    it('keeps stored links usable when project credentials are unavailable', async () => {
        const { service, gitIntegrationService } = createService();
        gitIntegrationService.getBitbucketCredentials.mockRejectedValue(
            new ForbiddenError(),
        );
        const getPullRequest = vi.spyOn(BitbucketClient, 'getPullRequest');
        expect(
            (await service.getPullRequests(authorizedUser, 'project')).data,
        ).toEqual([{ ...storedPullRequest, title: null, state: null }]);
        expect(getPullRequest).not.toHaveBeenCalled();
    });
});
