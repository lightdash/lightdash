import {
    DbtProjectType,
    PullRequestSource,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { ContentAsCodeWritebackService } from './ContentAsCodeWritebackService';

const args = {
    projectUuid: 'project-uuid',
    savedChartUuid: 'chart-uuid',
    slug: 'monthly-revenue',
};

const user = {
    userUuid: 'user-uuid',
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@lightdash.com',
} as SessionUser;

const chartAsCode = {
    name: 'Monthly revenue',
    slug: 'monthly-revenue',
    updatedAt: new Date('2026-08-25T10:00:00Z'),
    downloadedAt: new Date('2026-08-25T11:00:00Z'),
};

type Overrides = {
    snapshot?: object | undefined;
    liveRow?: object | undefined;
    existingFile?: object | 'missing';
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
        createBranchFromSource: vi.fn().mockResolvedValue({}),
        saveFile: vi.fn().mockResolvedValue({ sha: 'new-sha', path: 'p' }),
        getFileOrDirectory:
            overrides.existingFile === 'missing' || !overrides.existingFile
                ? vi.fn().mockRejectedValue(new Error('Not found'))
                : vi.fn().mockResolvedValue(overrides.existingFile),
        createPullRequestFromBranch: vi.fn().mockResolvedValue({
            prTitle: 'Update chart',
            prUrl: 'https://github.com/acme/analytics/pull/42',
        }),
        recordPullRequest: vi.fn().mockResolvedValue(undefined),
    };
    const coderService = {
        getPortableChartAsCode: vi.fn().mockResolvedValue(chartAsCode),
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
        findLive: vi
            .fn()
            .mockResolvedValue(
                'liveRow' in overrides ? overrides.liveRow : undefined,
            ),
        create: vi.fn().mockResolvedValue({
            uuid: 'row-uuid',
            branch: 'lightdash/write-back/app.lightdash.dev/monthly-revenue',
            prUrl: null,
            status: 'pending',
        }),
        update: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ContentAsCodeWritebackService({
        lightdashConfig: { siteUrl: 'https://app.lightdash.dev' } as never,
        gitIntegrationService: gitIntegrationService as never,
        coderService: coderService as never,
        contentAsCodeSnapshotModel: contentAsCodeSnapshotModel as never,
        contentAsCodeWritebackModel: contentAsCodeWritebackModel as never,
    });
    return {
        service,
        gitIntegrationService,
        coderService,
        contentAsCodeWritebackModel,
    };
};

describe('ContentAsCodeWritebackService', () => {
    it('does nothing for unmanaged content (no last-applied snapshot)', async () => {
        const { service, gitIntegrationService } = buildService({
            snapshot: undefined,
        });
        await service.writeChartToWritebackPr(user, args);
        expect(gitIntegrationService.getProjectRepo).not.toHaveBeenCalled();
    });

    it('first save creates the instance branch, commits the YAML, and opens one PR', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService();
        await service.writeChartToWritebackPr(user, args);

        expect(
            gitIntegrationService.createBranchFromSource,
        ).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'lightdash/write-back/app.lightdash.dev/monthly-revenue',
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

    it('every commit names the acting user and instance', async () => {
        const { service, gitIntegrationService } = buildService();
        await service.writeChartToWritebackPr(user, args);
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
                branch: 'lightdash/write-back/app.lightdash.dev/monthly-revenue',
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
        await service.writeChartToWritebackPr(user, args);

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
                branch: 'lightdash/write-back/app.lightdash.dev/monthly-revenue',
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
        await service.writeChartToWritebackPr(user, args);
        expect(gitIntegrationService.saveFile).not.toHaveBeenCalled();
    });

    it('marks the row as error and rethrows when git fails', async () => {
        const { service, gitIntegrationService, contentAsCodeWritebackModel } =
            buildService();
        gitIntegrationService.saveFile.mockRejectedValue(
            new Error('github says no'),
        );
        await expect(
            service.writeChartToWritebackPr(user, args),
        ).rejects.toThrow('github says no');
        expect(contentAsCodeWritebackModel.update).toHaveBeenCalledWith(
            'row-uuid',
            { status: 'error', error: 'github says no' },
        );
    });
});
