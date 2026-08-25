import { subject } from '@casl/ability';
import {
    ContentAsCodeType,
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    PullRequestSource,
    type ChartAsCode,
    type DashboardAsCode,
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

type WritebackContentType = 'chart' | 'dashboard';

// Matches the CLI's writeContent (packages/cli/src/handlers/download.ts):
// updatedAt/downloadedAt are transport metadata and verification is runtime
// instance state — none of them land in the repo.
const dumpContentAsCode = (content: ChartAsCode | DashboardAsCode): string => {
    const { updatedAt, downloadedAt, verification, ...cleanContent } = content;
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

    private static getContentFilePath(
        repoPath: string,
        contentType: WritebackContentType,
        slug: string,
    ): string {
        const prefix = repoPath.replace(/^\/+|\/+$/g, '');
        const folder = contentType === 'chart' ? 'charts' : 'dashboards';
        const base = `lightdash/${folder}/${slug}.yml`;
        return prefix === '' ? base : `${prefix}/${base}`;
    }

    // The migration path: instances are already ahead today, so drifted
    // content can be proposed back to the repo on demand using the same
    // plumbing as save-time write-back. Runs inline (user-initiated).
    // With addToGit, UI-only content (no last-applied marker) is allowed:
    // that is the deliberate promotion moment for new content.
    async propose(
        user: SessionUser,
        projectUuid: string,
        contentType: WritebackContentType,
        slug: string,
        options: { addToGit?: boolean } = {},
    ): Promise<ContentAsCodeWriteback> {
        await this.assertCanManageContentAsCode(user, projectUuid);
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
                contentType,
                slug,
            );
        const snapshot = await this.contentAsCodeSnapshotModel.get(
            projectUuid,
            contentType === 'chart'
                ? ContentAsCodeType.CHART
                : ContentAsCodeType.DASHBOARD,
            slug,
        );
        if (snapshot === undefined && !options.addToGit) {
            throw new ParameterError(
                `Content "${slug}" is not managed as code; pass addToGit to deliberately add it to the repo`,
            );
        }
        return this.writeContentToWritebackPr(user, {
            projectUuid,
            contentType,
            contentUuid,
            slug,
        });
    }

    // Write-back visibility is a dev/admin surface (the sync panel), never
    // something business users see; gate on the content-as-code ability.
    private async assertCanManageContentAsCode(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                    metadata: { slug: '' },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async listWritebacks(
        user: SessionUser,
        projectUuid: string,
        options: { refresh?: boolean } = {},
    ): Promise<ContentAsCodeWriteback[]> {
        await this.assertCanManageContentAsCode(user, projectUuid);
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

    private async writeContentToWritebackPr(
        user: SessionUser,
        target: {
            projectUuid: string;
            contentType: WritebackContentType;
            contentUuid: string;
            slug: string;
        },
    ): Promise<ContentAsCodeWriteback> {
        const { projectUuid, contentType, slug } = target;
        const snapshotType =
            contentType === 'chart'
                ? ContentAsCodeType.CHART
                : ContentAsCodeType.DASHBOARD;
        let row = await this.contentAsCodeWritebackModel.findLive(
            projectUuid,
            snapshotType,
            slug,
        );
        if (row === undefined) {
            const branch = `lightdash/write-back/${this.getInstanceSlug()}/${slug}`;
            try {
                row = await this.contentAsCodeWritebackModel.create({
                    projectUuid,
                    contentType: snapshotType,
                    slug,
                    branch,
                    createdByUserUuid: user.userUuid,
                });
            } catch (error) {
                // A concurrent save won the race on the live-unique index;
                // append to its row instead of surfacing a database error
                const raced = await this.contentAsCodeWritebackModel.findLive(
                    projectUuid,
                    snapshotType,
                    slug,
                );
                if (raced === undefined) throw error;
                row = raced;
            }
        }

        try {
            await this.pushContentToBranch(user, target, row);
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
            snapshotType,
            slug,
        );
        return updated ?? row;
    }

    // For dashboards, the dashboard YAML plus its dashboard-owned tile
    // charts land on the same branch/PR; charts with their own open
    // write-back PR keep it and are only noted in the PR body.
    private async pushContentToBranch(
        user: SessionUser,
        target: {
            projectUuid: string;
            contentType: WritebackContentType;
            contentUuid: string;
            slug: string;
        },
        row: ContentAsCodeWriteback,
    ): Promise<void> {
        const { projectUuid, contentType, contentUuid, slug } = target;
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

        const files: { path: string; content: string }[] = [];
        const notes: string[] = [];
        if (contentType === 'chart') {
            const chartAsCode = await this.coderService.getPortableChartAsCode(
                projectUuid,
                contentUuid,
            );
            files.push({
                path: ContentAsCodeWritebackService.getContentFilePath(
                    repo.path,
                    'chart',
                    slug,
                ),
                content: dumpContentAsCode(chartAsCode),
            });
        } else {
            const dashboardAsCode =
                await this.coderService.getCurrentDashboardAsCode(contentUuid);
            files.push({
                path: ContentAsCodeWritebackService.getContentFilePath(
                    repo.path,
                    'dashboard',
                    slug,
                ),
                content: dumpContentAsCode(dashboardAsCode),
            });
            const ownedChartFiles = await this.collectDashboardOwnedCharts(
                user,
                projectUuid,
                dashboardAsCode,
                repo.path,
                notes,
            );
            files.push(...ownedChartFiles);
        }

        let committed = 0;
        for (const file of files) {
            // eslint-disable-next-line no-await-in-loop
            const didCommit = await this.commitFileIfChanged(
                user,
                projectUuid,
                row.branch,
                file,
            );
            if (didCommit) committed += 1;
        }
        if (committed === 0) {
            this.logger.debug(
                `Content-as-code write-back for ${slug}: branch already has this content`,
            );
            return;
        }

        if (row.prUrl !== null && row.status === 'open') {
            return;
        }

        const contentPath =
            contentType === 'chart'
                ? `/projects/${projectUuid}/saved/${contentUuid}`
                : `/projects/${projectUuid}/dashboards/${contentUuid}`;
        const contentUrl = new URL(contentPath, this.lightdashConfig.siteUrl)
            .href;
        const label = contentType === 'chart' ? 'chart' : 'dashboard';
        const pullRequest =
            await this.gitIntegrationService.createPullRequestFromBranch(
                user,
                projectUuid,
                row.branch,
                `Update ${label} \`${slug}\` from Lightdash`,
                [
                    `This ${label} was edited in Lightdash and is managed as code; this PR proposes the change back to the repo.`,
                    ``,
                    `- Project: ${new URL(`/projects/${projectUuid}`, this.lightdashConfig.siteUrl).href}`,
                    `- Content: ${contentUrl}`,
                    ...(notes.length > 0 ? ['', ...notes] : []),
                ].join('\n'),
                PullRequestSource.CONTENT_AS_CODE,
            );
        await this.contentAsCodeWritebackModel.update(row.uuid, {
            prNumber: parsePullRequestNumber(pullRequest.prUrl),
            prUrl: pullRequest.prUrl,
            status: 'open',
        });
    }

    private async collectDashboardOwnedCharts(
        user: SessionUser,
        projectUuid: string,
        dashboardAsCode: DashboardAsCode,
        repoPath: string,
        notes: string[],
    ): Promise<{ path: string; content: string }[]> {
        const chartSlugs = Array.from(
            new Set(
                dashboardAsCode.tiles.flatMap((tile) =>
                    'chartSlug' in tile.properties &&
                    typeof tile.properties.chartSlug === 'string'
                        ? [tile.properties.chartSlug]
                        : [],
                ),
            ),
        );
        const files = await Promise.all(
            chartSlugs.map(
                async (
                    chartSlug,
                ): Promise<{ path: string; content: string } | null> => {
                    try {
                        const independentPr =
                            await this.contentAsCodeWritebackModel.findLive(
                                projectUuid,
                                ContentAsCodeType.CHART,
                                chartSlug,
                            );
                        if (independentPr?.prUrl) {
                            notes.push(
                                `- Tile chart \`${chartSlug}\` has its own open write-back PR: ${independentPr.prUrl}`,
                            );
                            return null;
                        }
                        const { contentUuid } =
                            await this.coderService.getCurrentContentVersionBySlug(
                                user,
                                projectUuid,
                                'chart',
                                chartSlug,
                            );
                        const chartAsCode =
                            await this.coderService.getCurrentChartAsCode(
                                contentUuid,
                            );
                        // Only charts saved within this dashboard travel with
                        // it; space charts referenced by tiles have their own
                        // lifecycle
                        if (
                            chartAsCode.dashboardSlug !== dashboardAsCode.slug
                        ) {
                            return null;
                        }
                        return {
                            path: ContentAsCodeWritebackService.getContentFilePath(
                                repoPath,
                                'chart',
                                chartSlug,
                            ),
                            content: dumpContentAsCode(chartAsCode),
                        };
                    } catch (error) {
                        this.logger.warn(
                            `Skipping tile chart ${chartSlug} in dashboard write-back`,
                            error,
                        );
                        return null;
                    }
                },
            ),
        );
        return files.filter(
            (file): file is { path: string; content: string } => file !== null,
        );
    }

    // Returns true when a commit landed (false when the branch already has
    // identical content)
    private async commitFileIfChanged(
        user: SessionUser,
        projectUuid: string,
        branch: string,
        file: { path: string; content: string },
    ): Promise<boolean> {
        let existingSha: string | undefined;
        try {
            const existing =
                await this.gitIntegrationService.getFileOrDirectory(
                    user,
                    projectUuid,
                    branch,
                    file.path,
                );
            if (existing.type === 'file') {
                existingSha = existing.sha;
                if (existing.content === file.content) {
                    return false;
                }
            }
        } catch {
            // File does not exist on the branch yet: create it
        }
        const slug = file.path
            .split('/')
            .pop()
            ?.replace(/\.yml$/, '');
        await this.gitIntegrationService.saveFile(
            user,
            projectUuid,
            branch,
            file.path,
            file.content,
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
        return true;
    }
}
