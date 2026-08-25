import {
    ContentAsCodeType,
    PullRequestSource,
    type ChartAsCode,
    type ContentAsCodeWritebackPayload,
    type SessionUser,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentAsCodeProjectSettingsModel } from '../../models/ContentAsCodeProjectSettingsModel';
import { ContentAsCodeSnapshotModel } from '../../models/ContentAsCodeSnapshotModel';
import {
    ContentAsCodeWritebackModel,
    type ContentAsCodeWriteback,
} from '../../models/ContentAsCodeWritebackModel';
import { BaseService } from '../BaseService';
import { CoderService } from '../CoderService/CoderService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';

type ContentAsCodeWritebackServiceArguments = {
    lightdashConfig: LightdashConfig;
    gitIntegrationService: GitIntegrationService;
    coderService: CoderService;
    contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;
    contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;
    contentAsCodeWritebackModel: ContentAsCodeWritebackModel;
};

// Matches the CLI's writeContent (packages/cli/src/handlers/download.ts):
// updatedAt/downloadedAt are transport metadata and never land in the repo.
const dumpContentAsCode = (content: ChartAsCode): string => {
    const { updatedAt, downloadedAt, ...cleanContent } = content;
    return yaml.dump(cleanContent, { quotingType: '"', sortKeys: true });
};

const parsePullRequestNumber = (prUrl: string): number | null => {
    const match = prUrl.match(/\/(?:pull|merge_requests)\/(\d+)/);
    return match ? Number(match[1]) : null;
};

export class ContentAsCodeWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly gitIntegrationService: GitIntegrationService;

    private readonly coderService: CoderService;

    private readonly contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;

    private readonly contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;

    private readonly contentAsCodeWritebackModel: ContentAsCodeWritebackModel;

    constructor(args: ContentAsCodeWritebackServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.gitIntegrationService = args.gitIntegrationService;
        this.coderService = args.coderService;
        this.contentAsCodeProjectSettingsModel =
            args.contentAsCodeProjectSettingsModel;
        this.contentAsCodeSnapshotModel = args.contentAsCodeSnapshotModel;
        this.contentAsCodeWritebackModel = args.contentAsCodeWritebackModel;
    }

    // Identifies this instance in branch names so two instances editing the
    // same slug open two PRs and git surfaces the conflict at merge time.
    private getInstanceSlug(): string {
        try {
            return new URL(this.lightdashConfig.siteUrl).hostname;
        } catch {
            return 'instance';
        }
    }

    private static getChartFilePath(repoPath: string, slug: string): string {
        const prefix = repoPath.replace(/^\/+|\/+$/g, '');
        const base = `lightdash/charts/${slug}.yml`;
        return prefix === '' ? base : `${prefix}/${base}`;
    }

    async runChartWriteback(
        user: SessionUser,
        payload: ContentAsCodeWritebackPayload,
    ): Promise<void> {
        const { projectUuid, savedChartUuid, slug } = payload;

        const settings =
            await this.contentAsCodeProjectSettingsModel.get(projectUuid);
        if (!settings?.writeBackEnabled) {
            this.logger.debug(
                `Skipping content-as-code write-back for ${slug}: write-back not enabled on project ${projectUuid}`,
            );
            return;
        }

        // Managed content only: never write back content that has no
        // last-applied marker (that's the explicit add-to-git flow)
        const snapshot = await this.contentAsCodeSnapshotModel.get(
            projectUuid,
            ContentAsCodeType.CHART,
            slug,
        );
        if (snapshot === undefined) {
            this.logger.debug(
                `Skipping content-as-code write-back for ${slug}: not managed (no last-applied snapshot)`,
            );
            return;
        }

        let row = await this.contentAsCodeWritebackModel.findLive(
            projectUuid,
            ContentAsCodeType.CHART,
            slug,
        );
        if (row === undefined) {
            const branch = `lightdash/write-back/${this.getInstanceSlug()}/${slug}`;
            row = await this.contentAsCodeWritebackModel.create({
                projectUuid,
                contentType: ContentAsCodeType.CHART,
                slug,
                branch,
                createdByUserUuid: user.userUuid,
            });
        }

        try {
            await this.pushChartToBranch(user, payload, row);
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            this.logger.error(
                `Content-as-code write-back failed for ${slug} on project ${projectUuid}: ${message}`,
            );
            await this.contentAsCodeWritebackModel.update(row.uuid, {
                status: 'error',
                error: message,
            });
            throw error;
        }
    }

    private async pushChartToBranch(
        user: SessionUser,
        payload: ContentAsCodeWritebackPayload,
        row: ContentAsCodeWriteback,
    ): Promise<void> {
        const { projectUuid, savedChartUuid, slug } = payload;
        const repo =
            await this.gitIntegrationService.getProjectRepo(projectUuid);

        try {
            await this.gitIntegrationService.createBranchFromSource(
                user,
                projectUuid,
                row.branch,
                repo.branch,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            // The branch persisting across saves is the mechanism that keeps
            // one PR per slug: later saves append commits to it.
            if (!/already exists|Reference already exists/i.test(message)) {
                throw error;
            }
        }

        const chartAsCode =
            await this.coderService.getCurrentChartAsCode(savedChartUuid);
        const content = dumpContentAsCode(chartAsCode);
        const filePath = ContentAsCodeWritebackService.getChartFilePath(
            repo.path,
            slug,
        );

        let existingSha: string | undefined;
        try {
            const existing =
                await this.gitIntegrationService.getFileOrDirectory(
                    user,
                    projectUuid,
                    row.branch,
                    filePath,
                );
            if (existing.type === 'file') {
                existingSha = existing.sha;
                if (existing.content === content) {
                    this.logger.debug(
                        `Content-as-code write-back for ${slug}: branch already has this content`,
                    );
                    return;
                }
            }
        } catch {
            // File does not exist on the branch yet: create it
        }

        await this.gitIntegrationService.saveFile(
            user,
            projectUuid,
            row.branch,
            filePath,
            content,
            existingSha,
            `Update ${slug} from Lightdash`,
        );

        if (row.prUrl !== null && row.status === 'open') {
            return;
        }

        const contentUrl = new URL(
            `/projects/${projectUuid}/saved/${savedChartUuid}`,
            this.lightdashConfig.siteUrl,
        ).href;
        const pullRequest =
            await this.gitIntegrationService.createPullRequestFromBranch(
                user,
                projectUuid,
                row.branch,
                `Update chart \`${slug}\` from Lightdash`,
                [
                    `This chart was edited in Lightdash and is managed as code; this PR proposes the change back to the repo.`,
                    ``,
                    `- Instance: ${this.lightdashConfig.siteUrl}`,
                    `- Content: ${contentUrl}`,
                ].join('\n'),
            );
        await this.contentAsCodeWritebackModel.update(row.uuid, {
            prNumber: parsePullRequestNumber(pullRequest.prUrl),
            prUrl: pullRequest.prUrl,
            status: 'open',
        });
        await this.gitIntegrationService.recordPullRequest({
            user,
            projectUuid,
            type: repo.type,
            owner: repo.owner,
            repo: repo.repo,
            prNumber: parsePullRequestNumber(pullRequest.prUrl) ?? 0,
            prUrl: pullRequest.prUrl,
            source: PullRequestSource.CONTENT_AS_CODE,
        });
    }
}
