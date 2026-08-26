import { subject } from '@casl/ability';
import {
    ContentAsCodeType,
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    PullRequestSource,
    type ChartAsCode,
    type SessionUser,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import * as GithubClient from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentAsCodeProjectSettingsModel } from '../../models/ContentAsCodeProjectSettingsModel';
import { ContentAsCodeSnapshotModel } from '../../models/ContentAsCodeSnapshotModel';
import {
    ContentAsCodeWritebackModel,
    type ContentAsCodeWriteback,
} from '../../models/ContentAsCodeWritebackModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { CoderService } from '../CoderService/CoderService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';

type ContentAsCodeWritebackServiceArguments = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
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

// Fleet template repos receive commits from many people on many instances:
// every commit names both. Co-authored-by makes the acting user visible on
// the commit itself even though the GitHub App is the committer.
const buildCommitMessage = (
    slug: string | undefined,
    user: SessionUser,
    projectUrl: string,
): string => {
    const lines = [
        `Update ${slug} from Lightdash`,
        '',
        `Project: ${projectUrl}`,
    ];
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (user.email) {
        lines.push(
            '',
            `Co-authored-by: ${fullName || 'Lightdash user'} <${user.email}>`,
        );
    }
    return lines.join('\n');
};

export class ContentAsCodeWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly gitIntegrationService: GitIntegrationService;

    private readonly coderService: CoderService;

    private readonly contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;

    private readonly contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;

    private readonly contentAsCodeWritebackModel: ContentAsCodeWritebackModel;

    constructor(args: ContentAsCodeWritebackServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
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

    // The migration path: instances are already ahead today, so drifted
    // content can be proposed back to the repo on demand using the same
    // plumbing as save-time write-back. Runs inline (user-initiated).
    async proposeChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
    ): Promise<ContentAsCodeWriteback> {
        const settings =
            await this.contentAsCodeProjectSettingsModel.get(projectUuid);
        if (!settings?.syncEnabled) {
            throw new ParameterError(
                'Proposing content to git requires content_as_code.sync to be enabled in the repo and stamped by an upload',
            );
        }
        // Permission (view) and slug resolution in one place
        const { contentUuid } =
            await this.coderService.getCurrentContentVersionBySlug(
                user,
                projectUuid,
                'chart',
                slug,
            );
        const snapshot = await this.contentAsCodeSnapshotModel.get(
            projectUuid,
            ContentAsCodeType.CHART,
            slug,
        );
        if (snapshot === undefined) {
            throw new ParameterError(
                `Chart "${slug}" is not managed as code; adding new content to git is an explicit add-to-git action`,
            );
        }
        return this.writeChartToWritebackPr(user, {
            projectUuid,
            savedChartUuid: contentUuid,
            slug,
        });
    }

    async listWritebacks(
        user: SessionUser,
        projectUuid: string,
        options: { refresh?: boolean } = {},
    ): Promise<ContentAsCodeWriteback[]> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const rows =
            await this.contentAsCodeWritebackModel.listByProject(projectUuid);
        if (options.refresh) {
            await this.refreshOpenPullRequestStates(user, projectUuid, rows);
            return this.contentAsCodeWritebackModel.listByProject(projectUuid);
        }
        return rows;
    }

    // A merged-but-not-yet-deployed PR should read "merged, applies on the
    // next deploy" instead of a stale pending badge.
    private async refreshOpenPullRequestStates(
        user: SessionUser,
        projectUuid: string,
        rows: ContentAsCodeWriteback[],
    ): Promise<void> {
        const openRows = rows.filter(
            (row) => row.status === 'open' && row.prNumber !== null,
        );
        if (openRows.length === 0) return;
        let repo;
        let creds;
        try {
            repo = await this.gitIntegrationService.getProjectRepo(projectUuid);
            if (repo.type !== DbtProjectType.GITHUB) return;
            creds = await this.gitIntegrationService.getGitCredentials(
                user,
                projectUuid,
            );
        } catch (error) {
            this.logger.warn(
                `Could not resolve git credentials to refresh write-back PR states on project ${projectUuid}`,
                error,
            );
            return;
        }
        await Promise.all(
            openRows.map(async (row) => {
                try {
                    const pr = await GithubClient.getPullRequest({
                        owner: creds.owner,
                        repo: creds.repo,
                        pullNumber: row.prNumber!,
                        installationId: creds.installationId,
                        token: creds.token,
                    });
                    if (pr.merged) {
                        await this.contentAsCodeWritebackModel.update(
                            row.uuid,
                            { status: 'merged' },
                        );
                    } else if (pr.state === 'closed') {
                        await this.contentAsCodeWritebackModel.update(
                            row.uuid,
                            { status: 'closed' },
                        );
                    }
                } catch (error) {
                    this.logger.warn(
                        `Could not refresh write-back PR state for ${row.slug} on project ${projectUuid}`,
                        error,
                    );
                }
            }),
        );
    }

    private async writeChartToWritebackPr(
        user: SessionUser,
        target: { projectUuid: string; savedChartUuid: string; slug: string },
    ): Promise<ContentAsCodeWriteback> {
        const { projectUuid, slug } = target;
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
            await this.pushChartToBranch(user, target, row);
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
        const updated = await this.contentAsCodeWritebackModel.findLive(
            projectUuid,
            ContentAsCodeType.CHART,
            slug,
        );
        return updated ?? row;
    }

    private async pushChartToBranch(
        user: SessionUser,
        target: { projectUuid: string; savedChartUuid: string; slug: string },
        row: ContentAsCodeWriteback,
    ): Promise<void> {
        const { projectUuid, savedChartUuid, slug } = target;
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
            buildCommitMessage(
                slug,
                user,
                new URL(
                    `/projects/${projectUuid}`,
                    this.lightdashConfig.siteUrl,
                ).href,
            ),
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
                    `- Project: ${new URL(`/projects/${projectUuid}`, this.lightdashConfig.siteUrl).href}`,
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
