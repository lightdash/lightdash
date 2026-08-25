import { subject } from '@casl/ability';
import {
    ContentAsCodeProposeResult,
    ContentAsCodeSnapshotType,
    ContentAsCodeSyncItemState,
    ContentAsCodeType,
    ContentAsCodeWriteBackStatus,
    ContentType,
    DashboardDAO,
    ForbiddenError,
    getErrorMessage,
    isContentAsCodeSnapshotType,
    isDashboardChartTileType,
    NotFoundError,
    ParameterError,
    SavedChartDAO,
    SessionUser,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentAsCodeAppliedRevisionModel } from '../../models/ContentAsCodeAppliedRevisionModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';
import { CoderService } from './CoderService';
import {
    hashContentAsCodeDocument,
    toCanonicalContentAsCodeSnapshot,
} from './contentAsCodeHash';
import {
    getContentAsCodeChartRelativePath,
    getContentAsCodeDashboardRelativePath,
} from './contentAsCodePaths';
import { dumpCanonicalContentAsCodeYaml } from './contentAsCodeYaml';
import { transformChartAsCode } from './transformChartAsCode';

type ContentAsCodeWriteBackServiceArguments = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    contentAsCodeAppliedRevisionModel: ContentAsCodeAppliedRevisionModel;
    contentVerificationModel: ContentVerificationModel;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
    gitIntegrationService: GitIntegrationService;
};

type WriteBackFile = { filePath: string; content: string };

const chartSlugsFromDashboard = (dashboard: DashboardDAO): string[] =>
    [
        ...new Set(
            dashboard.tiles
                .filter(isDashboardChartTileType)
                .map((tile) => tile.properties.chartSlug)
                .filter((slug): slug is string => Boolean(slug)),
        ),
    ].sort((left, right) => left.localeCompare(right));

export class ContentAsCodeWriteBackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly contentAsCodeAppliedRevisionModel: ContentAsCodeAppliedRevisionModel;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly dashboardModel: DashboardModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly spaceModel: SpaceModel;

    private readonly gitIntegrationService: GitIntegrationService;

    constructor(args: ContentAsCodeWriteBackServiceArguments) {
        super({ serviceName: 'ContentAsCodeWriteBackService' });
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        this.contentAsCodeAppliedRevisionModel =
            args.contentAsCodeAppliedRevisionModel;
        this.contentVerificationModel = args.contentVerificationModel;
        this.dashboardModel = args.dashboardModel;
        this.savedChartModel = args.savedChartModel;
        this.spaceModel = args.spaceModel;
        this.gitIntegrationService = args.gitIntegrationService;
    }

    /**
     * Propose a managed-chart UI save as a git PR. The instance save already
     * succeeded; git failures are logged and never returned to the saver.
     * Editors do not need SourceCode — power users review the PR in git.
     */
    async writeBackManagedChartIfNeeded(
        user: SessionUser,
        chart: SavedChartDAO,
    ): Promise<void> {
        const { projectUuid, slug } = chart;
        if (!projectUuid || !slug) {
            return;
        }

        try {
            if (!(await this.isWriteBackEnabled(projectUuid))) {
                return;
            }
            if (await this.spaceModel.isDefaultUserSpace(chart.spaceUuid)) {
                return;
            }
            const revision = await this.findRevision(
                projectUuid,
                ContentAsCodeType.CHART,
                slug,
            );
            if (!revision) {
                return;
            }

            const spaces = await this.getSpaces([chart.spaceUuid]);
            if (spaces.length === 0) {
                return;
            }

            const chartAsCode = await this.buildChartAsCode(chart, spaces);
            const canonical = toCanonicalContentAsCodeSnapshot(chartAsCode);
            if (hashContentAsCodeDocument(canonical) === revision.contentHash) {
                return;
            }

            await this.pushFiles(user, projectUuid, {
                slug,
                files: [
                    {
                        filePath: getContentAsCodeChartRelativePath(slug),
                        content: dumpCanonicalContentAsCodeYaml(canonical),
                    },
                ],
                title: `Update chart \`${slug}\``,
                description: this.contentDescription(
                    projectUuid,
                    'chart',
                    slug,
                ),
            });
        } catch (error) {
            this.logger.warn(
                'Content-as-code write-back failed after managed chart save',
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    slug,
                    chartUuid: chart.uuid,
                    error: getErrorMessage(error),
                },
            );
        }
    }

    /**
     * Silent dashboard save write-back. Includes new tile chart YAML on the
     * dashboard PR unless that chart already has its own open write-back PR.
     */
    async writeBackManagedDashboardIfNeeded(
        user: SessionUser,
        dashboard: DashboardDAO,
        previousChartSlugs: string[] = [],
    ): Promise<void> {
        const { projectUuid, slug } = dashboard;
        if (!projectUuid || !slug) {
            return;
        }

        try {
            if (!(await this.isWriteBackEnabled(projectUuid))) {
                return;
            }
            if (await this.spaceModel.isDefaultUserSpace(dashboard.spaceUuid)) {
                return;
            }
            const revision = await this.findRevision(
                projectUuid,
                ContentAsCodeType.DASHBOARD,
                slug,
            );
            if (!revision) {
                return;
            }

            const plan = await this.buildDashboardWriteBackPlan({
                user,
                projectUuid,
                dashboard,
                previousChartSlugs,
                includeDashboardIfUnchanged: false,
            });
            if (plan.files.length === 0) {
                return;
            }

            await this.pushFiles(user, projectUuid, {
                slug,
                files: plan.files,
                title: `Update dashboard \`${slug}\``,
                description: this.dashboardDescription(
                    projectUuid,
                    slug,
                    plan.notedChartSlugs,
                ),
            });
        } catch (error) {
            this.logger.warn(
                'Content-as-code write-back failed after managed dashboard save',
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    slug,
                    dashboardUuid: dashboard.uuid,
                    error: getErrorMessage(error),
                },
            );
        }
    }

    /**
     * Explicit power-user action: open or update the write-back PR for a slug.
     * Covers drifted (ahead) and UI-only add-to-git. The saver sees the PR URL.
     */
    async proposeContentToGit(
        user: SessionUser,
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<ContentAsCodeProposeResult> {
        const project = await this.projectModel.getSummary(projectUuid);
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'create',
                subject('ContentAsCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!isContentAsCodeSnapshotType(contentType)) {
            throw new ParameterError(
                `Unsupported content type "${contentType}"`,
            );
        }
        if (!(await this.isWriteBackEnabled(projectUuid))) {
            throw new ParameterError(
                'Content as code write-back is not enabled for this project',
            );
        }

        if (contentType === ContentAsCodeType.CHART) {
            return this.proposeChart(user, projectUuid, slug);
        }
        return this.proposeDashboard(user, projectUuid, slug);
    }

    async getWriteBackStatus(
        user: SessionUser,
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<ContentAsCodeWriteBackStatus> {
        const project = await this.projectModel.getSummary(projectUuid);
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'view',
                subject('ContentAsCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!isContentAsCodeSnapshotType(contentType)) {
            throw new ParameterError(
                `Unsupported content type "${contentType}"`,
            );
        }

        const [syncEnabled, writeBackEnabled] = await Promise.all([
            this.projectModel.getContentAsCodeSyncEnabled(projectUuid),
            this.projectModel.getContentAsCodeWriteBackEnabled(projectUuid),
        ]);
        const unavailable: ContentAsCodeWriteBackStatus = {
            contentType,
            slug,
            syncEnabled,
            writeBackEnabled,
            state: 'unavailable',
            writeBack: { prState: 'none', prUrl: null, prTitle: null },
        };
        if (!syncEnabled || !writeBackEnabled) {
            return unavailable;
        }

        const state = await this.getSyncState(projectUuid, contentType, slug);
        let writeBack: ContentAsCodeWriteBackStatus['writeBack'] = {
            prState: 'none',
            prUrl: null,
            prTitle: null,
        };
        try {
            writeBack =
                await this.gitIntegrationService.getContentAsCodePullRequestStatus(
                    user,
                    projectUuid,
                    slug,
                );
        } catch (error) {
            this.logger.warn(
                'Failed to load content-as-code write-back pull request status',
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    contentType,
                    slug,
                    error: getErrorMessage(error),
                },
            );
        }
        return {
            contentType,
            slug,
            syncEnabled,
            writeBackEnabled,
            state,
            writeBack,
        };
    }

    private async proposeChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
    ): Promise<ContentAsCodeProposeResult> {
        const chart = await this.getChartBySlug(projectUuid, slug);
        if (await this.spaceModel.isDefaultUserSpace(chart.spaceUuid)) {
            throw new ParameterError('Personal spaces never write back to git');
        }
        const spaces = await this.getSpaces([chart.spaceUuid]);
        const chartAsCode = await this.buildChartAsCode(chart, spaces);
        const canonical = toCanonicalContentAsCodeSnapshot(chartAsCode);
        const revision = await this.findRevision(
            projectUuid,
            ContentAsCodeType.CHART,
            slug,
        );
        if (
            revision &&
            hashContentAsCodeDocument(canonical) === revision.contentHash
        ) {
            throw new ParameterError(
                `Chart "${slug}" is already in sync with the last-applied snapshot`,
            );
        }

        const filePath = getContentAsCodeChartRelativePath(slug);
        const pullRequest = await this.pushFiles(user, projectUuid, {
            slug,
            files: [
                {
                    filePath,
                    content: dumpCanonicalContentAsCodeYaml(canonical),
                },
            ],
            title: revision
                ? `Update chart \`${slug}\``
                : `Add chart \`${slug}\``,
            description: this.contentDescription(projectUuid, 'chart', slug),
        });
        return {
            prUrl: pullRequest.prUrl,
            prTitle: pullRequest.prTitle,
            filesWritten: [filePath],
            notedChartSlugs: [],
        };
    }

    private async proposeDashboard(
        user: SessionUser,
        projectUuid: string,
        slug: string,
    ): Promise<ContentAsCodeProposeResult> {
        const dashboard = await this.getDashboardBySlug(projectUuid, slug);
        if (await this.spaceModel.isDefaultUserSpace(dashboard.spaceUuid)) {
            throw new ParameterError('Personal spaces never write back to git');
        }
        const revision = await this.findRevision(
            projectUuid,
            ContentAsCodeType.DASHBOARD,
            slug,
        );
        const previousChartSlugs = revision
            ? chartSlugsFromAppliedSnapshot(revision.snapshot)
            : [];
        const plan = await this.buildDashboardWriteBackPlan({
            user,
            projectUuid,
            dashboard,
            previousChartSlugs,
            includeDashboardIfUnchanged: revision === undefined,
        });
        if (plan.files.length === 0 && plan.notedChartSlugs.length === 0) {
            throw new ParameterError(
                `Dashboard "${slug}" is already in sync with the last-applied snapshot`,
            );
        }
        if (plan.files.length === 0) {
            throw new ParameterError(
                `Dashboard "${slug}" has no files to write back. Charts with their own open pull requests: ${plan.notedChartSlugs.join(', ')}`,
            );
        }

        const pullRequest = await this.pushFiles(user, projectUuid, {
            slug,
            files: plan.files,
            title: revision
                ? `Update dashboard \`${slug}\``
                : `Add dashboard \`${slug}\``,
            description: this.dashboardDescription(
                projectUuid,
                slug,
                plan.notedChartSlugs,
            ),
        });
        return {
            prUrl: pullRequest.prUrl,
            prTitle: pullRequest.prTitle,
            filesWritten: plan.files.map((file) => file.filePath),
            notedChartSlugs: plan.notedChartSlugs,
        };
    }

    private async buildDashboardWriteBackPlan({
        user,
        projectUuid,
        dashboard,
        previousChartSlugs,
        includeDashboardIfUnchanged,
    }: {
        user: SessionUser;
        projectUuid: string;
        dashboard: DashboardDAO;
        previousChartSlugs: string[];
        includeDashboardIfUnchanged: boolean;
    }): Promise<{ files: WriteBackFile[]; notedChartSlugs: string[] }> {
        const spaces = await this.getSpaces([dashboard.spaceUuid]);
        if (spaces.length === 0) {
            return { files: [], notedChartSlugs: [] };
        }

        const files: WriteBackFile[] = [];
        const dashboardAsCode = await this.buildDashboardAsCode(
            dashboard,
            spaces,
        );
        const dashboardCanonical =
            toCanonicalContentAsCodeSnapshot(dashboardAsCode);
        const dashboardRevision = await this.findRevision(
            projectUuid,
            ContentAsCodeType.DASHBOARD,
            dashboard.slug,
        );
        const dashboardChanged =
            dashboardRevision === undefined ||
            hashContentAsCodeDocument(dashboardCanonical) !==
                dashboardRevision.contentHash;
        if (includeDashboardIfUnchanged || dashboardChanged) {
            files.push({
                filePath: getContentAsCodeDashboardRelativePath(dashboard.slug),
                content: dumpCanonicalContentAsCodeYaml(dashboardCanonical),
            });
        }

        const currentChartSlugs = chartSlugsFromDashboard(dashboard);
        const previous = new Set(previousChartSlugs);
        const newChartSlugs = currentChartSlugs.filter(
            (slug) => !previous.has(slug),
        );
        const notedChartSlugs: string[] = [];

        for (const chartSlug of newChartSlugs) {
            const hasOwnPr =
                await this.gitIntegrationService.hasOpenContentAsCodePullRequest(
                    user,
                    projectUuid,
                    chartSlug,
                );
            if (hasOwnPr) {
                notedChartSlugs.push(chartSlug);
                continue;
            }

            const chart = await this.getChartBySlug(projectUuid, chartSlug);
            if (await this.spaceModel.isDefaultUserSpace(chart.spaceUuid)) {
                continue;
            }
            const chartSpaces = await this.getSpaces([chart.spaceUuid]);
            const chartAsCode = await this.buildChartAsCode(chart, chartSpaces);
            files.push({
                filePath: getContentAsCodeChartRelativePath(chartSlug),
                content: dumpCanonicalContentAsCodeYaml(
                    toCanonicalContentAsCodeSnapshot(chartAsCode),
                ),
            });
        }

        return { files, notedChartSlugs };
    }

    private async getSyncState(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<ContentAsCodeSyncItemState> {
        const revision = await this.findRevision(
            projectUuid,
            contentType,
            slug,
        );
        if (!revision) {
            return 'ui_only';
        }
        const currentHash = await this.hashCurrentDocument(
            projectUuid,
            contentType,
            slug,
        );
        return currentHash === revision.contentHash ? 'in_sync' : 'ahead';
    }

    private async hashCurrentDocument(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ): Promise<string> {
        if (contentType === ContentAsCodeType.CHART) {
            const chart = await this.getChartBySlug(projectUuid, slug);
            const spaces = await this.getSpaces([chart.spaceUuid]);
            return hashContentAsCodeDocument(
                toCanonicalContentAsCodeSnapshot(
                    await this.buildChartAsCode(chart, spaces),
                ),
            );
        }
        const dashboard = await this.getDashboardBySlug(projectUuid, slug);
        const spaces = await this.getSpaces([dashboard.spaceUuid]);
        return hashContentAsCodeDocument(
            toCanonicalContentAsCodeSnapshot(
                await this.buildDashboardAsCode(dashboard, spaces),
            ),
        );
    }

    private async getChartBySlug(
        projectUuid: string,
        slug: string,
    ): Promise<SavedChartDAO> {
        const summaries = await this.savedChartModel.find({
            projectUuid,
            slugs: [slug],
            includeOrphanChartsWithinDashboard: true,
        });
        if (summaries.length === 0) {
            throw new NotFoundError(`Chart "${slug}" not found`);
        }
        return this.savedChartModel.get(summaries[0].uuid);
    }

    private async getDashboardBySlug(
        projectUuid: string,
        slug: string,
    ): Promise<DashboardDAO> {
        const summaries = await this.dashboardModel.find({
            projectUuid,
            slugs: [slug],
        });
        if (summaries.length === 0) {
            throw new NotFoundError(`Dashboard "${slug}" not found`);
        }
        return this.dashboardModel.getByIdOrSlug(summaries[0].uuid);
    }

    private async buildChartAsCode(
        chart: SavedChartDAO,
        spaces: Awaited<ReturnType<SpaceModel['find']>>,
    ) {
        const dashboardSlugs = chart.dashboardUuid
            ? await this.dashboardModel.getSlugsForUuids([chart.dashboardUuid])
            : {};
        const verificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.CHART,
                [chart.uuid],
            );

        return transformChartAsCode(
            chart,
            spaces,
            dashboardSlugs,
            verificationMap,
        );
    }

    private async buildDashboardAsCode(
        dashboard: DashboardDAO,
        spaces: Awaited<ReturnType<SpaceModel['find']>>,
    ) {
        const verificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.DASHBOARD,
                [dashboard.uuid],
            );
        return CoderService.transformDashboard(
            dashboard,
            spaces,
            verificationMap,
        );
    }

    private async pushFiles(
        user: SessionUser,
        projectUuid: string,
        args: {
            slug: string;
            files: WriteBackFile[];
            title: string;
            description: string;
        },
    ) {
        return this.gitIntegrationService.writeBackContentAsCodeFiles(
            user,
            projectUuid,
            args,
        );
    }

    private async isWriteBackEnabled(projectUuid: string): Promise<boolean> {
        const [syncEnabled, writeBackEnabled] = await Promise.all([
            this.projectModel.getContentAsCodeSyncEnabled(projectUuid),
            this.projectModel.getContentAsCodeWriteBackEnabled(projectUuid),
        ]);
        return syncEnabled && writeBackEnabled;
    }

    private async findRevision(
        projectUuid: string,
        contentType: ContentAsCodeSnapshotType,
        slug: string,
    ) {
        return this.contentAsCodeAppliedRevisionModel.findBySlug(
            projectUuid,
            contentType,
            slug,
        );
    }

    private async getSpaces(spaceUuids: string[]) {
        return this.spaceModel.find({ spaceUuids });
    }

    private contentDescription(
        projectUuid: string,
        kind: 'chart' | 'dashboard',
        slug: string,
    ): string {
        const instanceUrl = this.lightdashConfig.siteUrl;
        const path =
            kind === 'chart'
                ? `/projects/${projectUuid}/saved/${slug}`
                : `/projects/${projectUuid}/dashboards/${slug}`;
        return `Updates the content-as-code YAML for ${kind} \`${slug}\`.

Instance: ${instanceUrl}
${kind === 'chart' ? 'Chart' : 'Dashboard'}: ${instanceUrl}${path}`;
    }

    private dashboardDescription(
        projectUuid: string,
        slug: string,
        notedChartSlugs: string[],
    ): string {
        const notes =
            notedChartSlugs.length === 0
                ? ''
                : `

Charts with their own open write-back pull request (not duplicated here):
${notedChartSlugs.map((chartSlug) => `- \`${chartSlug}\``).join('\n')}`;
        return `${this.contentDescription(projectUuid, 'dashboard', slug)}${notes}`;
    }
}

const chartSlugsFromAppliedSnapshot = (
    snapshot: Record<string, unknown>,
): string[] => {
    const tiles = snapshot.tiles;
    if (!Array.isArray(tiles)) {
        return [];
    }
    return [
        ...new Set(
            tiles
                .map((tile) => {
                    if (
                        tile &&
                        typeof tile === 'object' &&
                        'properties' in tile &&
                        tile.properties &&
                        typeof tile.properties === 'object' &&
                        'chartSlug' in tile.properties &&
                        typeof tile.properties.chartSlug === 'string'
                    ) {
                        return tile.properties.chartSlug;
                    }
                    return null;
                })
                .filter((slug): slug is string => Boolean(slug)),
        ),
    ];
};
