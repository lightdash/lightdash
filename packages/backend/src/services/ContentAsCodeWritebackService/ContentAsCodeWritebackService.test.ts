import { Ability } from '@casl/ability';
import {
    ConflictError,
    DbtProjectType,
    ForbiddenError,
    PossibleAbilities,
    PullRequestSource,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getPullRequest } from '../../clients/github/Github';
import { ContentAsCodeWritebackService } from './ContentAsCodeWritebackService';

vi.mock('../../clients/github/Github', () => ({
    getPullRequest: vi.fn(),
}));

const user = {
    userUuid: 'user-uuid',
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@lightdash.com',
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'ContentAsCode' },
    ]),
} as unknown as SessionUser;

const chartAsCode = {
    name: 'Monthly revenue',
    slug: 'monthly-revenue',
    updatedAt: new Date('2026-08-25T10:00:00Z'),
    downloadedAt: new Date('2026-08-25T11:00:00Z'),
};

type Overrides = {
    settings?: object | undefined;
    snapshot?: object | undefined;
    liveRow?: object | undefined;
    liveRows?: (object | undefined)[];
    existingFile?: object | 'missing';
    draft?: object | undefined;
    createError?: Error;
    openDraftCount?: number;
    branchExists?: boolean;
    providerPullRequest?: { prNumber: number; prUrl: string } | null;
    pullRequestCreateError?: Error;
    writebackRows?: object[];
};

const buildService = (overrides: Overrides = {}) => {
    const gitIntegrationService = {
        getProjectRepo: vi.fn().mockResolvedValue({
            owner: 'acme',
            repo: 'analytics',
            branch: 'main',
            path: '/',
            type: DbtProjectType.GITHUB,
        }),
        createBranchFromSource: overrides.branchExists
            ? vi.fn().mockRejectedValue(new Error('Reference already exists'))
            : vi.fn().mockResolvedValue({}),
        findOpenPullRequestForBranch: vi
            .fn()
            .mockResolvedValue(overrides.providerPullRequest ?? null),
        saveFile: vi.fn().mockResolvedValue({ sha: 'new-sha', path: 'p' }),
        getFileOrDirectory:
            overrides.existingFile === 'missing' || !overrides.existingFile
                ? vi.fn().mockRejectedValue(new Error('Not found'))
                : vi.fn().mockResolvedValue(overrides.existingFile),
        createPullRequestFromBranch: overrides.pullRequestCreateError
            ? vi.fn().mockRejectedValue(overrides.pullRequestCreateError)
            : vi.fn().mockResolvedValue({
                  prTitle: 'Update chart',
                  prUrl: 'https://github.com/acme/analytics/pull/42',
              }),
        recordPullRequest: vi.fn().mockResolvedValue(undefined),
        getGitCredentials: vi.fn().mockResolvedValue({
            owner: 'acme',
            repo: 'analytics',
            token: 'token',
            type: DbtProjectType.GITHUB,
        }),
    };
    const coderService = {
        getPortableChartAsCode: vi.fn().mockResolvedValue(chartAsCode),
        getPortableChartAsCodeWithOverlay: vi.fn().mockResolvedValue({
            ...chartAsCode,
            name: 'Monthly revenue draft',
        }),
        getCurrentChartAsCode: vi.fn().mockResolvedValue(chartAsCode),
        getCurrentDashboardAsCode: vi.fn().mockResolvedValue({
            name: 'Weekly KPIs',
            slug: 'weekly-kpis',
            updatedAt: new Date('2026-08-25T10:00:00Z'),
            tiles: [
                {
                    type: 'saved_chart',
                    properties: { chartSlug: 'monthly-revenue' },
                },
                {
                    type: 'saved_chart',
                    properties: { chartSlug: 'chart-with-own-pr' },
                },
                { type: 'markdown', properties: { content: 'hello' } },
            ],
        }),
        getCurrentContentVersionBySlug: vi
            .fn()
            .mockResolvedValue({ contentUuid: 'chart-uuid' }),
        getDashboardAsCodeWithOverlay: vi.fn().mockResolvedValue({
            name: 'Weekly KPIs draft',
            slug: 'weekly-kpis',
            tiles: [],
        }),
    };
    const contentAsCodeProjectSettingsModel = {
        get: vi
            .fn()
            .mockResolvedValue(
                'settings' in overrides
                    ? overrides.settings
                    : { syncEnabled: true },
            ),
    };
    const contentAsCodeSnapshotModel = {
        get: vi
            .fn()
            .mockResolvedValue(
                'snapshot' in overrides
                    ? overrides.snapshot
                    : { snapshotHash: 'abc' },
            ),
    };
    const contentAsCodeWritebackModel = {
        findLive: vi.fn(
            overrides.liveRows
                ? async () => overrides.liveRows!.shift()
                : async () =>
                      'liveRow' in overrides ? overrides.liveRow : undefined,
        ),
        findLatestForBranch: vi.fn().mockResolvedValue(undefined),
        listByProject: vi.fn().mockResolvedValue(overrides.writebackRows ?? []),
        create: vi.fn().mockImplementation(async (args) => {
            if (overrides.createError) throw overrides.createError;
            return {
                uuid: 'row-uuid',
                branch: args.branch,
                contentDraftUuid: args.contentDraftUuid ?? null,
                prUrl: null,
                status: 'pending',
            };
        }),
        update: vi.fn().mockResolvedValue(undefined),
    };
    const contentDraftModel = {
        get: vi.fn().mockResolvedValue(
            'draft' in overrides
                ? overrides.draft
                : {
                      uuid: 'draft-uuid',
                      projectUuid: 'project-uuid',
                      contentType: 'dashboard',
                      contentUuid: 'dashboard-uuid',
                      slug: 'weekly-kpis',
                      authorUserUuid: 'author-uuid',
                      draft: { name: 'Weekly KPIs draft' },
                      status: 'open',
                      prUrl: null,
                  },
        ),
        listByProject: vi.fn(),
        countOpenByProject: vi
            .fn()
            .mockResolvedValue(overrides.openDraftCount ?? 0),
        findOpenDraft: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
    };
    const userModel = {
        getUserDetailsByUuid: vi.fn().mockResolvedValue({
            userUuid: 'author-uuid',
            firstName: 'Draft',
            lastName: 'Author',
            email: 'author@lightdash.com',
        }),
    };
    const service = new ContentAsCodeWritebackService({
        lightdashConfig: { siteUrl: 'https://app.lightdash.dev' } as never,
        projectModel: {
            get: vi.fn().mockResolvedValue({
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
            }),
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-uuid' }),
        } as never,
        gitIntegrationService: gitIntegrationService as never,
        coderService: coderService as never,
        contentAsCodeProjectSettingsModel:
            contentAsCodeProjectSettingsModel as never,
        contentAsCodeSnapshotModel: contentAsCodeSnapshotModel as never,
        contentAsCodeWritebackModel: contentAsCodeWritebackModel as never,
        contentDraftModel: contentDraftModel as never,
        userModel: userModel as never,
    });
    return {
        service,
        gitIntegrationService,
        coderService,
        contentAsCodeWritebackModel,
        contentDraftModel,
        userModel,
    };
};

describe('ContentAsCodeWritebackService', () => {
    const dismissedDraft = {
        uuid: 'draft-uuid',
        projectUuid: 'project-uuid',
        contentType: 'dashboard',
        contentUuid: 'dashboard-uuid',
        slug: 'weekly-kpis',
        authorUserUuid: 'author-uuid',
        draft: { name: 'Weekly KPIs draft' },
        status: 'dismissed',
        prUrl: null,
    };
    const author = {
        ...user,
        userUuid: 'author-uuid',
        ability: new Ability<PossibleAbilities>([
            { action: 'view', subject: 'ContentAsCode' },
        ]),
    } as SessionUser;

    it.each([0, 3])(
        'reports %i open drafts for upload without changing content',
        async (openDraftCount) => {
            const { service, gitIntegrationService } = buildService({
                openDraftCount,
            });

            await expect(
                service.getUploadAdvisory(user, 'project-uuid'),
            ).resolves.toEqual({ openDraftCount });
            expect(gitIntegrationService.saveFile).not.toHaveBeenCalled();
            expect(
                gitIntegrationService.createPullRequestFromBranch,
            ).not.toHaveBeenCalled();
        },
    );

    it('allows upload-only users to read the advisory', async () => {
        const uploadOnlyUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { action: 'create', subject: 'ContentAsCode' },
            ]),
        } as unknown as SessionUser;
        const { service } = buildService({ openDraftCount: 2 });

        await expect(
            service.getUploadAdvisory(uploadOnlyUser, 'project-uuid'),
        ).resolves.toEqual({ openDraftCount: 2 });
    });

    it('dismisses an open draft without deleting it', async () => {
        const { service, contentDraftModel } = buildService();

        await service.dismissDraft(user, 'project-uuid', 'draft-uuid');

        expect(contentDraftModel.update).toHaveBeenCalledWith('draft-uuid', {
            status: 'dismissed',
        });
    });

    it('lets the author reopen the same dismissed draft', async () => {
        const { service, contentDraftModel } = buildService({
            draft: dismissedDraft,
        });

        await expect(
            service.reopenDraft(author, 'project-uuid', 'draft-uuid'),
        ).resolves.toMatchObject({
            uuid: 'draft-uuid',
            status: 'open',
        });
        expect(contentDraftModel.update).toHaveBeenCalledWith('draft-uuid', {
            status: 'open',
        });
    });

    it('makes repeated reopen requests idempotent', async () => {
        const { service, contentDraftModel } = buildService({
            draft: { ...dismissedDraft, status: 'open' },
        });

        await expect(
            service.reopenDraft(author, 'project-uuid', 'draft-uuid'),
        ).resolves.toMatchObject({
            uuid: 'draft-uuid',
            status: 'open',
        });
        expect(contentDraftModel.update).not.toHaveBeenCalled();
    });

    it('does not let another user reopen an author draft', async () => {
        const { service, contentDraftModel } = buildService({
            draft: dismissedDraft,
        });
        const otherUser = {
            ...author,
            userUuid: 'other-user-uuid',
        } as SessionUser;

        await expect(
            service.reopenDraft(otherUser, 'project-uuid', 'draft-uuid'),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(contentDraftModel.update).not.toHaveBeenCalled();
    });

    it('does not reopen history when the author already has an open draft', async () => {
        const { service, contentDraftModel } = buildService({
            draft: dismissedDraft,
        });
        contentDraftModel.findOpenDraft.mockResolvedValue({
            ...dismissedDraft,
            uuid: 'newer-open-draft-uuid',
            status: 'open',
        });

        await expect(
            service.reopenDraft(author, 'project-uuid', 'draft-uuid'),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(contentDraftModel.update).not.toHaveBeenCalled();
    });

    it('shows the same reopened row in the review queue immediately', async () => {
        const { service, contentDraftModel } = buildService({
            draft: dismissedDraft,
        });
        let persistedDraft = { ...dismissedDraft };
        contentDraftModel.get.mockImplementation(async () => persistedDraft);
        contentDraftModel.update.mockImplementation(
            async (_uuid: string, update: { status?: string }) => {
                persistedDraft = { ...persistedDraft, ...update };
            },
        );
        contentDraftModel.listByProject.mockImplementation(async () => [
            persistedDraft,
        ]);

        await service.reopenDraft(author, 'project-uuid', 'draft-uuid');
        await expect(service.listDrafts(user, 'project-uuid')).resolves.toEqual(
            [expect.objectContaining({ uuid: 'draft-uuid', status: 'open' })],
        );
    });

    it('first save creates the instance branch, commits the YAML, and opens one PR', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService();
        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');

        expect(
            gitIntegrationService.createBranchFromSource,
        ).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'lightdash/write-back/app.lightdash.dev/charts/monthly-revenue',
            'main',
        );
        const [, , , filePath, content, sha] =
            gitIntegrationService.saveFile.mock.calls[0];
        expect(filePath).toBe('lightdash/charts/monthly-revenue.yml');
        expect(sha).toBeUndefined();
        expect(content).not.toContain('updatedAt');
        expect(content).not.toContain('downloadedAt');
        expect(content).toContain('slug: monthly-revenue');

        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).toHaveBeenCalledTimes(1);
        const prBody =
            gitIntegrationService.createPullRequestFromBranch.mock.calls[0][4];
        expect(prBody).toContain(
            'https://app.lightdash.dev/projects/project-uuid',
        );
        expect(prBody).toContain('/projects/project-uuid/saved/chart-uuid');
        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            expect.objectContaining({
                prNumber: 42,
                prUrl: 'https://github.com/acme/analytics/pull/42',
                status: 'open',
            }),
        );
        // The PR is recorded inside createPullRequestFromBranch with the
        // content-as-code source; a second record call would hit the
        // (provider, owner, repo, pr_number) unique constraint
        const prSource =
            gitIntegrationService.createPullRequestFromBranch.mock.calls[0][5];
        expect(prSource).toBe(PullRequestSource.CONTENT_AS_CODE);
        expect(gitIntegrationService.recordPullRequest).not.toHaveBeenCalled();
    });

    it('hands a draft back as dismissed when its PR is closed without merging', async () => {
        const openRow = {
            uuid: 'row-uuid',
            contentType: 'dashboard',
            slug: 'weekly-kpis',
            contentDraftUuid: 'draft-uuid',
            branch: 'lightdash/write-back/app.lightdash.dev/dashboards/weekly-kpis--draft-draft-uuid',
            prNumber: 5,
            prUrl: 'https://github.com/acme/analytics/pull/5',
            status: 'open',
        };
        const { service, contentAsCodeWritebackModel, contentDraftModel } =
            buildService({
                writebackRows: [openRow],
                draft: {
                    ...dismissedDraft,
                    status: 'written_back',
                    prUrl: openRow.prUrl,
                },
            });
        vi.mocked(getPullRequest).mockResolvedValueOnce({
            state: 'closed',
            merged: false,
        } as never);

        await service.listDrafts(user, 'project-uuid', { refresh: true });

        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            { status: 'closed' },
        );
        expect(contentDraftModel.update).toHaveBeenCalledWith('draft-uuid', {
            status: 'dismissed',
            prUrl: null,
        });
        expect(contentDraftModel.listByProject).toHaveBeenCalledWith(
            'project-uuid',
        );
    });

    it('leaves a written-back draft alone when its PR merged', async () => {
        const { service, contentAsCodeWritebackModel, contentDraftModel } =
            buildService({
                writebackRows: [
                    {
                        uuid: 'row-uuid',
                        contentType: 'dashboard',
                        slug: 'weekly-kpis',
                        contentDraftUuid: 'draft-uuid',
                        branch: 'b',
                        prNumber: 5,
                        prUrl: 'https://github.com/acme/analytics/pull/5',
                        status: 'open',
                    },
                ],
            });
        vi.mocked(getPullRequest).mockResolvedValueOnce({
            state: 'closed',
            merged: true,
        } as never);

        await service.listDrafts(user, 'project-uuid', { refresh: true });

        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            { status: 'merged' },
        );
        expect(contentDraftModel.update).not.toHaveBeenCalled();
    });

    it('reconciles with the provider at most once per minute per project', async () => {
        const { service, contentAsCodeWritebackModel } = buildService();

        await service.listDrafts(user, 'project-uuid', { refresh: true });
        await service.listDrafts(user, 'project-uuid', { refresh: true });
        await service.listDrafts(user, 'other-project', { refresh: true });

        expect(contentAsCodeWritebackModel.listByProject).toHaveBeenCalledTimes(
            2,
        );
    });

    it('does not touch the provider when listing drafts without refresh', async () => {
        const { service, contentAsCodeWritebackModel } = buildService();
        vi.mocked(getPullRequest).mockClear();

        await service.listDrafts(user, 'project-uuid');

        expect(
            contentAsCodeWritebackModel.listByProject,
        ).not.toHaveBeenCalled();
        expect(getPullRequest).not.toHaveBeenCalled();
    });

    it('freezes the reviewed documents when a draft is written back', async () => {
        const { service, contentDraftModel } = buildService();

        await service.writeBackDraft(user, 'project-uuid', 'draft-uuid');

        expect(contentDraftModel.update).toHaveBeenCalledWith(
            'draft-uuid',
            expect.objectContaining({
                status: 'written_back',
                writtenBackPublished: expect.objectContaining({
                    name: 'Weekly KPIs',
                }),
                writtenBackDraft: expect.objectContaining({
                    name: 'Weekly KPIs draft',
                }),
            }),
        );
    });

    it('writes files under the stamped content path', async () => {
        const { service, gitIntegrationService } = buildService({
            settings: { syncEnabled: true, path: 'analytics/content' },
        });
        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');

        const [, , , filePath] = gitIntegrationService.saveFile.mock.calls[0];
        expect(filePath).toBe('analytics/content/charts/monthly-revenue.yml');
    });

    it('names the reviewed file by the stamped content path', async () => {
        const { service } = buildService({
            settings: { syncEnabled: true, path: 'analytics/content' },
        });

        const review = await service.getDraftReview(
            user,
            'project-uuid',
            'draft-uuid',
        );

        expect(review.filePath).toBe(
            'analytics/content/dashboards/weekly-kpis.yml',
        );
    });

    it('reviews a written-back draft from its frozen documents', async () => {
        const { service, coderService } = buildService({
            draft: {
                ...dismissedDraft,
                status: 'written_back',
                writtenBackPublished: { name: 'Frozen published', tiles: [] },
                writtenBackDraft: { name: 'Frozen draft', tiles: [] },
            },
        });

        const review = await service.getDraftReview(
            user,
            'project-uuid',
            'draft-uuid',
        );

        expect(review.publishedYaml).toContain('name: Frozen published');
        expect(review.draftYaml).toContain('name: Frozen draft');
        expect(coderService.getCurrentDashboardAsCode).not.toHaveBeenCalled();
        expect(
            coderService.getDashboardAsCodeWithOverlay,
        ).not.toHaveBeenCalled();
    });

    it('reviews a draft handed back to its author live, not from the frozen documents', async () => {
        const { service, coderService } = buildService({
            draft: {
                ...dismissedDraft,
                status: 'dismissed',
                writtenBackPublished: { name: 'Frozen published', tiles: [] },
                writtenBackDraft: { name: 'Frozen draft', tiles: [] },
            },
        });

        const review = await service.getDraftReview(
            user,
            'project-uuid',
            'draft-uuid',
        );

        expect(review.draftYaml).toContain('Weekly KPIs draft');
        expect(review.draftYaml).not.toContain('Frozen');
        expect(coderService.getDashboardAsCodeWithOverlay).toHaveBeenCalled();
    });

    it('credits the draft author on the commit and in the PR body', async () => {
        const { service, gitIntegrationService, userModel } = buildService();

        await service.writeBackDraft(user, 'project-uuid', 'draft-uuid');

        expect(userModel.getUserDetailsByUuid).toHaveBeenCalledWith(
            'author-uuid',
        );
        const message = gitIntegrationService.saveFile.mock.calls[0][6];
        expect(message).toContain(
            'Co-authored-by: Draft Author <author@lightdash.com>',
        );
        expect(message).not.toContain('demo@lightdash.com');
        const prBody =
            gitIntegrationService.createPullRequestFromBranch.mock.calls[0][4];
        expect(prBody).toContain(
            'Change by: Draft Author (author@lightdash.com)',
        );
    });

    it('credits the reviewer when the draft author cannot be resolved', async () => {
        const { service, gitIntegrationService, userModel } = buildService();
        userModel.getUserDetailsByUuid.mockRejectedValueOnce(
            new Error('user gone'),
        );

        await service.writeBackDraft(user, 'project-uuid', 'draft-uuid');

        const message = gitIntegrationService.saveFile.mock.calls[0][6];
        expect(message).toContain(
            'Co-authored-by: Demo User <demo@lightdash.com>',
        );
    });

    it('builds branch names that are safe git refs per content type', () => {
        expect(
            ContentAsCodeWritebackService.getWritebackBranch(
                'app.lightdash.dev',
                'chart',
                'monthly-revenue',
                null,
            ),
        ).toBe('lightdash/write-back/app.lightdash.dev/charts/monthly-revenue');
        expect(
            ContentAsCodeWritebackService.getWritebackBranch(
                'app.lightdash.dev',
                'dashboard',
                'monthly-revenue',
                'draft-uuid',
            ),
        ).toBe(
            'lightdash/write-back/app.lightdash.dev/dashboards/monthly-revenue--draft-draft-uuid',
        );
        const odd = ContentAsCodeWritebackService.getWritebackBranch(
            'app.lightdash.dev',
            'chart',
            `weird slug/with..dots~^:?*[\\${'x'.repeat(300)}.lock`,
            null,
        );
        expect(odd).toMatch(
            /^lightdash\/write-back\/app\.lightdash\.dev\/charts\/[A-Za-z0-9._-]+$/,
        );
        expect(odd.length).toBeLessThanOrEqual(255);
        const longDraft = ContentAsCodeWritebackService.getWritebackBranch(
            'analytics.some-very-long-customer-hostname.lightdash.cloud',
            'dashboard',
            'd'.repeat(300),
            '296ed5f6-4f11-4124-aa19-e0da4906cc57',
        );
        expect(longDraft.length).toBeLessThanOrEqual(255);
        expect(longDraft).toMatch(
            /--draft-296ed5f6-4f11-4124-aa19-e0da4906cc57$/,
        );
    });

    it('adopts the open PR found on the provider when the branch already exists', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService({
                branchExists: true,
                providerPullRequest: {
                    prNumber: 7,
                    prUrl: 'https://github.com/acme/analytics/pull/7',
                },
            });

        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');

        expect(
            gitIntegrationService.findOpenPullRequestForBranch,
        ).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'lightdash/write-back/app.lightdash.dev/charts/monthly-revenue',
        );
        expect(gitIntegrationService.saveFile).toHaveBeenCalledTimes(1);
        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).not.toHaveBeenCalled();
        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            {
                prNumber: 7,
                prUrl: 'https://github.com/acme/analytics/pull/7',
                status: 'open',
            },
        );
    });

    it('opens a new PR when the existing branch has no open PR', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService({ branchExists: true, providerPullRequest: null });

        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');

        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).toHaveBeenCalledTimes(1);
        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            expect.objectContaining({ prNumber: 42, status: 'open' }),
        );
    });

    it('adopts the provider PR when creating one is refused as a duplicate', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService({
                pullRequestCreateError: new Error(
                    'Validation Failed: A pull request already exists for acme:lightdash/write-back/app.lightdash.dev/monthly-revenue.',
                ),
            });
        gitIntegrationService.findOpenPullRequestForBranch.mockResolvedValue({
            prNumber: 9,
            prUrl: 'https://github.com/acme/analytics/pull/9',
        });

        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');

        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            {
                prNumber: 9,
                prUrl: 'https://github.com/acme/analytics/pull/9',
                status: 'open',
            },
        );
        expect(contentAsCodeWritebackModel.update).not.toHaveBeenCalledWith(
            'row-uuid',
            expect.objectContaining({ status: 'error' }),
        );
    });

    it('marks the row as error when a duplicate PR cannot be found anywhere', async () => {
        const { service, contentAsCodeWritebackModel } = buildService({
            pullRequestCreateError: new Error(
                'Validation Failed: A pull request already exists for acme:lightdash/write-back/app.lightdash.dev/monthly-revenue.',
            ),
        });

        await expect(
            service.propose(user, 'project-uuid', 'chart', 'monthly-revenue'),
        ).rejects.toThrow('pull request already exists');
        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            expect.objectContaining({ status: 'error' }),
        );
    });

    it('writes dashboard-owned charts with portable chart type bindings', async () => {
        const { service, gitIntegrationService, coderService } = buildService();
        coderService.getCurrentChartAsCode.mockResolvedValue({
            ...chartAsCode,
            dashboardSlug: 'weekly-kpis',
            chartConfig: {
                type: 'data_app_viz',
                config: {
                    dataAppVizUuid: 'source-viz-uuid',
                    dataAppVizVersion: 7,
                    fieldMapping: {},
                },
            },
        });
        coderService.getPortableChartAsCode.mockResolvedValue({
            ...chartAsCode,
            dashboardSlug: 'weekly-kpis',
            chartConfig: {
                type: 'data_app_viz',
                config: {
                    dataAppVizSlug: 'revenue-chart-type',
                    fieldMapping: {},
                },
            },
        });

        await service.propose(user, 'project-uuid', 'dashboard', 'weekly-kpis');

        const chartFileCall = gitIntegrationService.saveFile.mock.calls.find(
            (call) => call[3] === 'lightdash/charts/monthly-revenue.yml',
        );
        expect(chartFileCall?.[4]).toContain(
            'dataAppVizSlug: revenue-chart-type',
        );
        expect(chartFileCall?.[4]).not.toContain('dataAppVizUuid');
        expect(chartFileCall?.[4]).not.toContain('dataAppVizVersion');
        expect(coderService.getCurrentChartAsCode).not.toHaveBeenCalled();
    });

    it('every commit names the acting user and instance', async () => {
        const { service, gitIntegrationService } = buildService();
        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');
        const message = gitIntegrationService.saveFile.mock.calls[0][6];
        expect(message).toContain(
            'Project: https://app.lightdash.dev/projects/project-uuid',
        );
        expect(message).toContain(
            'Co-authored-by: Demo User <demo@lightdash.com>',
        );
    });

    it('later saves append a commit to the open PR without opening another', async () => {
        const { service, gitIntegrationService } = buildService({
            liveRow: {
                uuid: 'row-uuid',
                contentDraftUuid: null,
                branch: 'lightdash/write-back/app.lightdash.dev/charts/monthly-revenue',
                prUrl: 'https://github.com/acme/analytics/pull/42',
                status: 'open',
            },
            existingFile: {
                type: 'file',
                content: 'stale: "content"\n',
                sha: 'old-sha',
                path: 'lightdash/charts/monthly-revenue.yml',
            },
        });
        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');

        const [, , , , , sha] = gitIntegrationService.saveFile.mock.calls[0];
        expect(sha).toBe('old-sha');
        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).not.toHaveBeenCalled();
    });

    it('skips the commit when the branch already has identical content', async () => {
        const identical = (() => {
            const { updatedAt, downloadedAt, ...clean } = chartAsCode;
            // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
            return require('js-yaml').dump(clean, {
                quotingType: '"',
                sortKeys: true,
            });
        })();
        const { service, gitIntegrationService } = buildService({
            liveRow: {
                uuid: 'row-uuid',
                contentDraftUuid: null,
                branch: 'lightdash/write-back/app.lightdash.dev/charts/monthly-revenue',
                prUrl: 'https://github.com/acme/analytics/pull/42',
                status: 'open',
            },
            existingFile: {
                type: 'file',
                content: identical,
                sha: 'old-sha',
                path: 'lightdash/charts/monthly-revenue.yml',
            },
        });
        await service.propose(user, 'project-uuid', 'chart', 'monthly-revenue');
        expect(gitIntegrationService.saveFile).not.toHaveBeenCalled();
    });

    it('propose requires sync to be stamped on the project', async () => {
        const { service } = buildService({
            settings: undefined,
        });
        await expect(
            service.propose(user, 'project-uuid', 'chart', 'monthly-revenue'),
        ).rejects.toThrow('content_as_code.sync');
    });

    it('propose rejects unmanaged content', async () => {
        const { service } = buildService({ snapshot: undefined });
        await expect(
            service.propose(user, 'project-uuid', 'chart', 'monthly-revenue'),
        ).rejects.toThrow('not managed as code');
    });

    it('marks the row as error and rethrows when git fails', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService();
        gitIntegrationService.saveFile.mockRejectedValue(
            new Error('github says no'),
        );
        await expect(
            service.propose(user, 'project-uuid', 'chart', 'monthly-revenue'),
        ).rejects.toThrow('github says no');
        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            { status: 'error', error: 'github says no' },
        );
    });

    it('gives a draft a stable branch and write-back owner', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService();

        await service.writeBackDraft(user, 'project-uuid', 'draft-uuid');

        expect(contentAsCodeWritebackModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                contentDraftUuid: 'draft-uuid',
                branch: 'lightdash/write-back/app.lightdash.dev/dashboards/weekly-kpis--draft-draft-uuid',
            }),
        );
        expect(
            gitIntegrationService.createBranchFromSource,
        ).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'lightdash/write-back/app.lightdash.dev/dashboards/weekly-kpis--draft-draft-uuid',
            'main',
        );
    });

    it('reviews and writes a chart draft to the chart file', async () => {
        const { service, coderService, gitIntegrationService } = buildService({
            draft: {
                uuid: 'chart-draft-uuid',
                projectUuid: 'project-uuid',
                contentType: 'chart',
                contentUuid: 'chart-uuid',
                slug: 'monthly-revenue',
                authorUserUuid: 'author-uuid',
                draft: { name: 'Monthly revenue draft' },
                status: 'open',
                prUrl: null,
            },
        });

        const review = await service.getDraftReview(
            user,
            'project-uuid',
            'chart-draft-uuid',
        );
        await service.writeBackDraft(user, 'project-uuid', 'chart-draft-uuid');

        expect(review.draftYaml).toContain('Monthly revenue draft');
        expect(
            coderService.getPortableChartAsCodeWithOverlay,
        ).toHaveBeenCalledWith('project-uuid', 'chart-uuid', {
            name: 'Monthly revenue draft',
        });
        expect(gitIntegrationService.saveFile).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'lightdash/write-back/app.lightdash.dev/charts/monthly-revenue--draft-chart-draft-uuid',
            'lightdash/charts/monthly-revenue.yml',
            expect.stringContaining('Monthly revenue draft'),
            undefined,
            expect.any(String),
        );
    });

    it('reuses the branch stored on the row, including a pre-rename branch name', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService({
                liveRow: {
                    uuid: 'row-uuid',
                    contentType: 'dashboard',
                    slug: 'weekly-kpis',
                    contentDraftUuid: 'draft-uuid',
                    // Rows from before the branch rename keep their stored branch
                    branch: 'lightdash/write-back/app.lightdash.dev/weekly-kpis/draft-draft-uuid',
                    prNumber: 42,
                    prUrl: 'https://github.com/acme/analytics/pull/42',
                    status: 'open',
                },
                existingFile: {
                    type: 'file',
                    content: 'stale: "content"\n',
                    sha: 'old-sha',
                    path: 'lightdash/dashboards/weekly-kpis.yml',
                },
            });

        await service.writeBackDraft(user, 'project-uuid', 'draft-uuid');

        expect(contentAsCodeWritebackModel.create).not.toHaveBeenCalled();
        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).not.toHaveBeenCalled();
        expect(gitIntegrationService.saveFile).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'lightdash/write-back/app.lightdash.dev/weekly-kpis/draft-draft-uuid',
            'lightdash/dashboards/weekly-kpis.yml',
            expect.any(String),
            'old-sha',
            expect.any(String),
        );
    });

    it('opens the pending PR when a retry finds the draft content already committed', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const identical = require('js-yaml').dump(
            {
                name: 'Weekly KPIs draft',
                slug: 'weekly-kpis',
                tiles: [],
            },
            { quotingType: '"', sortKeys: true },
        );
        const { service, gitIntegrationService } = buildService({
            liveRow: {
                uuid: 'row-uuid',
                contentType: 'dashboard',
                slug: 'weekly-kpis',
                contentDraftUuid: 'draft-uuid',
                branch: 'lightdash/write-back/app.lightdash.dev/dashboards/weekly-kpis--draft-draft-uuid',
                prNumber: null,
                prUrl: null,
                status: 'pending',
            },
            existingFile: {
                type: 'file',
                content: identical,
                sha: 'old-sha',
                path: 'lightdash/dashboards/weekly-kpis.yml',
            },
        });

        await service.writeBackDraft(user, 'project-uuid', 'draft-uuid');

        expect(gitIntegrationService.saveFile).not.toHaveBeenCalled();
        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).toHaveBeenCalledTimes(1);
    });

    it('refuses a competing draft before touching the existing branch', async () => {
        const { service, gitIntegrationService, contentDraftModel } =
            buildService({
                liveRow: {
                    uuid: 'row-uuid',
                    contentType: 'dashboard',
                    slug: 'weekly-kpis',
                    contentDraftUuid: 'other-draft-uuid',
                    branch: 'lightdash/write-back/app.lightdash.dev/dashboards/weekly-kpis--draft-other-draft-uuid',
                    prNumber: null,
                    prUrl: null,
                    status: 'pending',
                },
            });

        await expect(
            service.writeBackDraft(user, 'project-uuid', 'draft-uuid'),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(gitIntegrationService.getProjectRepo).not.toHaveBeenCalled();
        expect(
            gitIntegrationService.createBranchFromSource,
        ).not.toHaveBeenCalled();
        expect(gitIntegrationService.saveFile).not.toHaveBeenCalled();
        expect(contentDraftModel.update).not.toHaveBeenCalled();
    });

    it('refuses the losing draft when another owner wins the database race', async () => {
        const competingRow = {
            uuid: 'other-row-uuid',
            contentType: 'dashboard',
            slug: 'weekly-kpis',
            contentDraftUuid: 'other-draft-uuid',
            branch: 'lightdash/write-back/app.lightdash.dev/dashboards/weekly-kpis--draft-other-draft-uuid',
            prNumber: null,
            prUrl: null,
            status: 'pending',
        };
        const { service, gitIntegrationService } = buildService({
            liveRows: [undefined, competingRow],
            createError: new Error('unique constraint'),
        });

        await expect(
            service.writeBackDraft(user, 'project-uuid', 'draft-uuid'),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(
            gitIntegrationService.createBranchFromSource,
        ).not.toHaveBeenCalled();
        expect(gitIntegrationService.saveFile).not.toHaveBeenCalled();
    });

    it('lets exactly one of two concurrent drafts create git state', async () => {
        const {
            service,
            gitIntegrationService,
            contentAsCodeWritebackModel,
            contentDraftModel,
        } = buildService();
        let owner: string | null = null;
        let liveRow: object | undefined;
        contentDraftModel.get.mockImplementation(async (draftUuid: string) => ({
            uuid: draftUuid,
            projectUuid: 'project-uuid',
            contentType: 'dashboard',
            contentUuid: 'dashboard-uuid',
            slug: 'weekly-kpis',
            authorUserUuid: `${draftUuid}-author`,
            draft: { name: `${draftUuid} changes` },
            status: 'open',
            prUrl: null,
        }));
        contentAsCodeWritebackModel.findLive.mockImplementation(
            async () => liveRow,
        );
        contentAsCodeWritebackModel.create.mockImplementation(async (args) => {
            if (liveRow) throw new Error('unique constraint');
            owner = args.contentDraftUuid;
            liveRow = {
                uuid: 'row-uuid',
                contentType: args.contentType,
                slug: args.slug,
                contentDraftUuid: args.contentDraftUuid,
                branch: args.branch,
                prNumber: null,
                prUrl: null,
                status: 'pending',
            };
            return liveRow;
        });

        const results = await Promise.allSettled([
            service.writeBackDraft(user, 'project-uuid', 'alice-draft'),
            service.writeBackDraft(user, 'project-uuid', 'bob-draft'),
        ]);

        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const [rejected] = results.filter(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected',
        );
        expect(rejected.reason).toBeInstanceOf(ConflictError);
        expect(owner).toMatch(/^(alice|bob)-draft$/);
        expect(
            gitIntegrationService.createBranchFromSource,
        ).toHaveBeenCalledTimes(1);
        expect(gitIntegrationService.saveFile).toHaveBeenCalledTimes(1);
        expect(
            gitIntegrationService.createPullRequestFromBranch,
        ).toHaveBeenCalledTimes(1);
        expect(contentDraftModel.update).toHaveBeenCalledTimes(1);
    });
});
