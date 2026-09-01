import { subject } from '@casl/ability';
import {
    assertUnreachable,
    classifyContentAsCodeFilePath,
    computeContentDraftStaleness,
    ConflictError,
    ContentAsCodeType,
    DbtProjectType,
    DEFAULT_CONTENT_AS_CODE_PATH,
    describeContentDraftStaleness,
    ForbiddenError,
    getContentAsCodeFilePath,
    getErrorMessage,
    isSqlChartContent,
    joinContentAsCodePath,
    loadLightdashProjectConfig,
    normalizeContentAsCodePath,
    NotFoundError,
    overlayKeysForAsCodeField,
    ParameterError,
    PullRequestSource,
    type ChartAsCode,
    type ContentAsCodeFileClassification,
    type ContentAsCodePullSummary,
    type ContentAsCodeUploadAdvisory,
    type ContentDraftFieldResolution,
    type ContentDraftStaleness,
    type ContentDraftStalenessDetails,
    type DashboardAsCode,
    type LightdashProjectConfig,
    type SessionUser,
    type SqlChartAsCode,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import pLimit from 'p-limit';
import * as GithubClient from '../../clients/github/Github';
import * as GitlabClient from '../../clients/gitlab/Gitlab';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentAsCodeProjectSettingsModel } from '../../models/ContentAsCodeProjectSettingsModel';
import { ContentAsCodeSnapshotModel } from '../../models/ContentAsCodeSnapshotModel';
import {
    ContentAsCodeWritebackModel,
    type ContentAsCodeWriteback,
} from '../../models/ContentAsCodeWritebackModel';
import {
    ContentDraftModel,
    type ContentDraft,
} from '../../models/ContentDraftModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import { CoderService } from '../CoderService/CoderService';
import { buildContentAsCodeSnapshot } from '../CoderService/contentAsCodeSnapshot';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';

type ContentAsCodeWritebackServiceArguments = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    gitIntegrationService: GitIntegrationService;
    coderService: CoderService;
    contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;
    contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;
    contentAsCodeWritebackModel: ContentAsCodeWritebackModel;
    contentDraftModel: ContentDraftModel;
    userModel: UserModel;
};

type WritebackContentType = 'chart' | 'dashboard';

type RepoReadCredentials = Awaited<
    ReturnType<GitIntegrationService['getGitCredentials']>
> & { branch: string };

type RepoContentFile = {
    path: string;
    classification: ContentAsCodeFileClassification;
    content: string;
};

const WRITEBACK_BRANCH_PREFIX = 'lightdash/write-back';

// The stored branch column is varchar(255); file-backed git hosts cap a ref
// component at 255 bytes too
const MAX_BRANCH_LENGTH = 255;

// Git ref component rules: no spaces or `~^:?*[\`, no `..`, no leading or
// trailing `.`, no `.lock` suffix
const toRefSafeComponent = (value: string): string =>
    value
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/\.{2,}/g, '.')
        .replace(/^[.-]+|[.-]+$/g, '')
        .replace(/\.lock$/, '') || 'content';

type CommitAuthor = { name: string; email: string | null };

const commitAuthorFromUser = (user: {
    firstName?: string;
    lastName?: string;
    email?: string;
}): CommitAuthor => ({
    name:
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        'Lightdash user',
    email: user.email ?? null,
});

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
// every commit names both. Co-authored-by credits the person who made the
// change (the draft author, or the acting user when proposing directly).
const buildCommitMessage = (
    slug: string | undefined,
    author: CommitAuthor,
    projectUrl: string,
): string => {
    const lines = [
        `Update ${slug} from Lightdash`,
        '',
        `Project: ${projectUrl}`,
    ];
    if (author.email) {
        lines.push('', `Co-authored-by: ${author.name} <${author.email}>`);
    }
    return lines.join('\n');
};

const describeAuthor = (author: CommitAuthor): string =>
    author.email ? `${author.name} (${author.email})` : author.name;

export class ContentAsCodeWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly gitIntegrationService: GitIntegrationService;

    private readonly coderService: CoderService;

    private readonly contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;

    private readonly contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;

    private readonly contentAsCodeWritebackModel: ContentAsCodeWritebackModel;

    private readonly contentDraftModel: ContentDraftModel;

    private readonly userModel: UserModel;

    // The review page polls with refresh; one provider round per project per
    // minute is enough to notice merged or closed PRs
    private static readonly PULL_REQUEST_REFRESH_INTERVAL_MS = 60_000;

    private readonly pullRequestsRefreshedAt = new Map<string, number>();

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
        this.contentDraftModel = args.contentDraftModel;
        this.userModel = args.userModel;
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

    // Mirrors the repo layout so a chart and a dashboard sharing a slug get
    // different branches; drafts are siblings of the propose branch because
    // git cannot hold both `<slug>` and `<slug>/...` refs
    static getWritebackBranch(
        instanceSlug: string,
        contentType: WritebackContentType,
        slug: string,
        contentDraftUuid: string | null,
    ): string {
        const folder = contentType === 'chart' ? 'charts' : 'dashboards';
        const prefix = `${WRITEBACK_BRANCH_PREFIX}/${instanceSlug}/${folder}/`;
        const suffix = contentDraftUuid ? `--draft-${contentDraftUuid}` : '';
        const slugBudget = Math.max(
            20,
            MAX_BRANCH_LENGTH - prefix.length - suffix.length,
        );
        const safeSlug = toRefSafeComponent(slug)
            .slice(0, slugBudget)
            .replace(/[.-]+$/, '');
        return `${prefix}${safeSlug}${suffix}`;
    }

    private static getContentFilePath(
        repoPath: string,
        contentPath: string,
        contentType: WritebackContentType,
        slug: string,
    ): string {
        return joinContentAsCodePath(
            repoPath,
            getContentAsCodeFilePath(contentPath, contentType, slug),
        );
    }

    private async getContentPath(projectUuid: string): Promise<string> {
        const settings =
            await this.contentAsCodeProjectSettingsModel.get(projectUuid);
        return settings?.path ?? DEFAULT_CONTENT_AS_CODE_PATH;
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
            contentDraftUuid: null,
            author: commitAuthorFromUser(user),
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

    private async assertCanUploadContentAsCode(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        const contentAsCode = subject('ContentAsCode', {
            projectUuid: project.projectUuid,
            organizationUuid: project.organizationUuid,
            upstreamProjectUuid: project.upstreamProjectUuid,
            type: project.type,
            createdByUserUuid: project.createdByUserUuid,
            metadata: { slug: '' },
        });
        if (
            auditedAbility.cannot('create', contentAsCode) &&
            auditedAbility.cannot('manage', contentAsCode)
        ) {
            throw new ForbiddenError();
        }
    }

    private async assertCanViewContentAsCode(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
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

    async getUploadAdvisory(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ContentAsCodeUploadAdvisory> {
        await this.assertCanUploadContentAsCode(user, projectUuid);
        return {
            openDraftCount:
                await this.contentDraftModel.countOpenByProject(projectUuid),
        };
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

    // The in-app `lightdash upload`: stamps the repo's content_as_code
    // settings, then applies the content files the CLI would
    async pullFromGit(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ContentAsCodePullSummary> {
        await this.assertCanManageContentAsCode(user, projectUuid);
        const repo =
            await this.gitIntegrationService.getProjectRepo(projectUuid);
        const creds = {
            ...(await this.gitIntegrationService.getGitCredentials(
                user,
                projectUuid,
            )),
            branch: repo.branch,
        };
        const prefix = joinContentAsCodePath(repo.path);

        const config =
            await ContentAsCodeWritebackService.readRepoProjectConfig(
                creds,
                joinContentAsCodePath(prefix, 'lightdash.config.yml'),
            );
        const configuredPath =
            config.content_as_code?.path ?? DEFAULT_CONTENT_AS_CODE_PATH;
        await this.coderService.stampContentAsCodeSettings(user, projectUuid, {
            sync: config.content_as_code?.sync === true,
            path: configuredPath,
        });
        if (config.content_as_code?.sync !== true) {
            throw new ParameterError(
                'Pulling content from the repo requires content_as_code.sync: true in lightdash.config.yml',
            );
        }

        const files = await ContentAsCodeWritebackService.readContentFiles(
            creds,
            joinContentAsCodePath(
                prefix,
                normalizeContentAsCodePath(configuredPath),
            ),
        );
        return this.applyContentFiles(user, projectUuid, files);
    }

    private static async readRepoProjectConfig(
        creds: RepoReadCredentials,
        filePath: string,
    ): Promise<LightdashProjectConfig> {
        try {
            return await loadLightdashProjectConfig(
                await ContentAsCodeWritebackService.readRepoFile(
                    creds,
                    filePath,
                ),
            );
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw new ParameterError(
                    `lightdash.config.yml not found at ${filePath} on ${creds.branch}`,
                );
            }
            throw error;
        }
    }

    // One tree listing plus bounded parallel reads with the same credentials
    private static async readContentFiles(
        creds: RepoReadCredentials,
        contentRoot: string,
    ): Promise<RepoContentFile[]> {
        const tree =
            creds.type === DbtProjectType.GITHUB
                ? await GithubClient.getRepoTree({
                      owner: creds.owner,
                      repo: creds.repo,
                      branch: creds.branch,
                      installationId: creds.installationId,
                      token: creds.token,
                  })
                : await GitlabClient.getGitlabRepoTree({
                      owner: creds.owner,
                      repo: creds.repo,
                      branch: creds.branch,
                      token: creds.token,
                      hostDomain: creds.hostDomain,
                  });
        if (tree.truncated) {
            throw new ParameterError(
                'The repo is too large to list in one request; run lightdash upload instead',
            );
        }
        const candidates = tree.files.flatMap(({ path }) => {
            if (contentRoot !== '' && !path.startsWith(`${contentRoot}/`)) {
                return [];
            }
            const classification = classifyContentAsCodeFilePath(path);
            return classification?.supportedExtension
                ? [{ path, classification }]
                : [];
        });
        const limit = pLimit(8);
        return Promise.all(
            candidates.map((candidate) =>
                limit(async () => ({
                    ...candidate,
                    content: await ContentAsCodeWritebackService.readRepoFile(
                        creds,
                        candidate.path,
                    ),
                })),
            ),
        );
    }

    private static async readRepoFile(
        creds: RepoReadCredentials,
        filePath: string,
    ): Promise<string> {
        const getFileContent =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.getFileContent
                : GitlabClient.getFileContent;
        const { content } = await getFileContent({
            fileName: filePath,
            owner: creds.owner,
            repo: creds.repo,
            branch: creds.branch,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });
        return content;
    }

    // Charts before dashboards (tiles reference chart slugs), one at a time
    // so slug and space creation never race; a failed chart holds back the
    // dashboards that use it, as `lightdash upload` does
    private async applyContentFiles(
        user: SessionUser,
        projectUuid: string,
        files: RepoContentFile[],
    ): Promise<ContentAsCodePullSummary> {
        const summary: ContentAsCodePullSummary = {
            charts: 0,
            dashboards: 0,
            failures: [],
        };
        const charts: {
            file: string;
            document: ChartAsCode | SqlChartAsCode;
        }[] = [];
        const dashboards: { file: string; document: DashboardAsCode }[] = [];
        for (const file of files) {
            try {
                const sorted =
                    ContentAsCodeWritebackService.sortContentFile(file);
                if (sorted?.kind === 'chart') {
                    charts.push({ file: file.path, document: sorted.document });
                } else if (sorted?.kind === 'dashboard') {
                    dashboards.push({
                        file: file.path,
                        document: sorted.document,
                    });
                }
            } catch (error) {
                summary.failures.push({
                    file: file.path,
                    message: getErrorMessage(error),
                });
            }
        }

        const failedChartSlugs = new Set<string>();
        /* eslint-disable no-await-in-loop */
        for (const { file, document } of charts) {
            try {
                if (isSqlChartContent(document)) {
                    await this.coderService.upsertSqlChart(
                        user,
                        projectUuid,
                        document.slug,
                        document as SqlChartAsCode,
                    );
                } else {
                    await this.coderService.upsertChart(
                        user,
                        projectUuid,
                        document.slug,
                        document as ChartAsCode,
                        { syncEnabled: true },
                    );
                }
                summary.charts += 1;
            } catch (error) {
                failedChartSlugs.add(document.slug);
                summary.failures.push({
                    file,
                    message: getErrorMessage(error),
                });
            }
        }
        for (const { file, document } of dashboards) {
            const blockedBy = document.tiles.flatMap((tile) =>
                'chartSlug' in tile.properties &&
                typeof tile.properties.chartSlug === 'string' &&
                failedChartSlugs.has(tile.properties.chartSlug)
                    ? [tile.properties.chartSlug]
                    : [],
            );
            if (blockedBy.length > 0) {
                summary.failures.push({
                    file,
                    message: `Skipped: depends on charts that failed to apply (${blockedBy.join(', ')})`,
                });
            } else {
                try {
                    await this.coderService.upsertDashboard(
                        user,
                        projectUuid,
                        document.slug,
                        document,
                        { syncEnabled: true },
                    );
                    summary.dashboards += 1;
                } catch (error) {
                    summary.failures.push({
                        file,
                        message: getErrorMessage(error),
                    });
                }
            }
        }
        /* eslint-enable no-await-in-loop */
        return summary;
    }

    // Same trust as `lightdash upload`: a document with a slug is the as-code
    // type of its folder, loose files declare theirs with contentType
    private static sortContentFile(
        file: RepoContentFile,
    ):
        | { kind: 'chart'; document: ChartAsCode | SqlChartAsCode }
        | { kind: 'dashboard'; document: DashboardAsCode }
        | null {
        let parsed: unknown;
        try {
            parsed = yaml.load(file.content);
        } catch {
            throw new ParameterError(`Could not parse ${file.path} as YAML`);
        }
        if (
            parsed === null ||
            typeof parsed !== 'object' ||
            !('slug' in parsed) ||
            typeof parsed.slug !== 'string'
        ) {
            throw new ParameterError(`${file.path} has no slug`);
        }
        const kind =
            file.classification.kind === 'content'
                ? file.classification.contentType
                : ContentAsCodeWritebackService.looseContentKind(parsed);
        switch (kind) {
            case 'chart':
                return {
                    kind,
                    document: parsed as ChartAsCode | SqlChartAsCode,
                };
            case 'dashboard':
                return { kind, document: parsed as DashboardAsCode };
            case null:
                return null;
            default:
                return assertUnreachable(kind, 'Unknown content kind');
        }
    }

    private static looseContentKind(
        parsed: object,
    ): 'chart' | 'dashboard' | null {
        const contentType =
            'contentType' in parsed ? parsed.contentType : undefined;
        if (
            contentType === ContentAsCodeType.CHART ||
            contentType === ContentAsCodeType.SQL_CHART
        ) {
            return 'chart';
        }
        return contentType === ContentAsCodeType.DASHBOARD ? 'dashboard' : null;
    }

    async listDrafts(
        user: SessionUser,
        projectUuid: string,
        options: { refresh?: boolean } = {},
    ): Promise<ContentDraft[]> {
        await this.assertCanManageContentAsCode(user, projectUuid);
        if (options.refresh && this.claimPullRequestRefresh(projectUuid)) {
            const rows =
                await this.contentAsCodeWritebackModel.listByProject(
                    projectUuid,
                );
            await this.refreshOpenPullRequestStates(user, projectUuid, rows);
        }
        return this.contentDraftModel.listByProject(projectUuid);
    }

    private claimPullRequestRefresh(projectUuid: string): boolean {
        const now = Date.now();
        const last = this.pullRequestsRefreshedAt.get(projectUuid) ?? 0;
        if (
            now - last <
            ContentAsCodeWritebackService.PULL_REQUEST_REFRESH_INTERVAL_MS
        ) {
            return false;
        }
        this.pullRequestsRefreshedAt.set(projectUuid, now);
        return true;
    }

    // The review payload: published vs draft, both rendered as the exact
    // canonical YAML that would land in the repo
    async getDraftReview(
        user: SessionUser,
        projectUuid: string,
        draftUuid: string,
    ): Promise<{
        draft: ContentDraft;
        filePath: string;
        publishedYaml: string;
        draftYaml: string;
        staleness: ContentDraftStaleness | null;
    }> {
        await this.assertCanManageContentAsCode(user, projectUuid);
        const draft = await this.contentDraftModel.get(draftUuid);
        if (!draft || draft.projectUuid !== projectUuid) {
            throw new ParameterError('Draft not found');
        }
        if (
            draft.contentType !== 'chart' &&
            draft.contentType !== 'dashboard'
        ) {
            throw new ParameterError('Unsupported draft content type');
        }
        const filePath = getContentAsCodeFilePath(
            await this.getContentPath(projectUuid),
            draft.contentType,
            draft.slug,
        );
        const staleness =
            draft.status === 'open'
                ? await this.getDraftStaleness(draft)
                : null;
        // A written-back draft shows what actually went to the repo, not a
        // live diff that drifts as published content moves on; a draft handed
        // back to its author is live again
        if (
            draft.status === 'written_back' &&
            draft.writtenBackPublished &&
            draft.writtenBackDraft
        ) {
            return {
                draft,
                filePath,
                publishedYaml: dumpContentAsCode(draft.writtenBackPublished),
                draftYaml: dumpContentAsCode(draft.writtenBackDraft),
                staleness,
            };
        }
        const { published, draftDoc } = await this.renderDraftDocuments(
            projectUuid,
            draft,
        );
        return {
            draft,
            filePath,
            publishedYaml: dumpContentAsCode(published),
            draftYaml: dumpContentAsCode(draftDoc),
            staleness,
        };
    }

    // The reviewer's gesture: the draft (not the published version) becomes
    // the write-back PR
    async writeBackDraft(
        user: SessionUser,
        projectUuid: string,
        draftUuid: string,
    ): Promise<ContentDraft> {
        await this.assertCanManageContentAsCode(user, projectUuid);
        const draft = await this.contentDraftModel.get(draftUuid);
        if (!draft || draft.projectUuid !== projectUuid) {
            throw new ParameterError('Draft not found');
        }
        if (
            draft.contentType !== 'chart' &&
            draft.contentType !== 'dashboard'
        ) {
            throw new ParameterError('Unsupported draft content type');
        }
        const contentType =
            draft.contentType === 'chart' ? 'chart' : 'dashboard';
        // Writing a stale draft back would carry the base it started from
        // over whatever the repo published since
        const staleness = await this.getDraftStaleness(draft);
        if (staleness !== null) {
            throw new ConflictError(
                `This draft is behind the repo (changed since: ${staleness.changedFields.join(', ')}). Ask the author to update it to the latest version first.`,
            );
        }
        const { published, draftDoc } = await this.renderDraftDocuments(
            projectUuid,
            draft,
        );
        const row = await this.writeContentToWritebackPr(user, {
            projectUuid,
            contentType,
            contentUuid: draft.contentUuid,
            slug: draft.slug,
            contentDraftUuid: draft.uuid,
            documentOverride: draftDoc,
            author: await this.resolveDraftAuthor(draft, user),
        });
        await this.contentDraftModel.update(draft.uuid, {
            status: 'written_back',
            prUrl: row.prUrl,
            writtenBackPublished: published,
            writtenBackDraft: draftDoc,
        });
        return { ...draft, status: 'written_back', prUrl: row.prUrl };
    }

    private async renderDraftDocuments(
        projectUuid: string,
        draft: ContentDraft,
    ): Promise<{
        published: ChartAsCode | DashboardAsCode;
        draftDoc: ChartAsCode | DashboardAsCode;
    }> {
        if (draft.contentType === 'chart') {
            const [published, draftDoc] = await Promise.all([
                this.coderService.getPortableChartAsCode(
                    projectUuid,
                    draft.contentUuid,
                ),
                this.coderService.getPortableChartAsCodeWithOverlay(
                    projectUuid,
                    draft.contentUuid,
                    draft.draft,
                ),
            ]);
            return { published, draftDoc };
        }
        const [published, draftDoc] = await Promise.all([
            this.coderService.getCurrentDashboardAsCode(draft.contentUuid),
            this.coderService.getDashboardAsCodeWithOverlay(
                draft.contentUuid,
                draft.draft,
            ),
        ]);
        return { published, draftDoc };
    }

    async dismissDraft(
        user: SessionUser,
        projectUuid: string,
        draftUuid: string,
    ): Promise<void> {
        await this.assertCanManageContentAsCode(user, projectUuid);
        const draft = await this.contentDraftModel.get(draftUuid);
        if (!draft || draft.projectUuid !== projectUuid) {
            throw new ParameterError('Draft not found');
        }
        await this.contentDraftModel.update(draft.uuid, {
            status: 'dismissed',
        });
    }

    // Null when the draft has no recorded base or the repo has not moved
    private async getDraftStaleness(
        draft: ContentDraft,
    ): Promise<ContentDraftStaleness | null> {
        if (!draft.baseSnapshotHash) return null;
        if (
            draft.contentType !== 'chart' &&
            draft.contentType !== 'dashboard'
        ) {
            return null;
        }
        const current = await this.contentAsCodeSnapshotModel.get(
            draft.projectUuid,
            draft.contentType === 'chart'
                ? ContentAsCodeType.CHART
                : ContentAsCodeType.DASHBOARD,
            draft.slug,
        );
        if (!current || current.snapshotHash === draft.baseSnapshotHash) {
            return null;
        }
        return computeContentDraftStaleness({
            draftUuid: draft.uuid,
            contentType: draft.contentType,
            base: draft.baseSnapshot,
            current: current.snapshot,
            overlay: draft.draft,
        });
    }

    // What the repo and the draft each did to the fields that moved, for the
    // author's banner and the reviewer's stale state
    async getDraftStalenessDetails(
        user: SessionUser,
        projectUuid: string,
        draftUuid: string,
    ): Promise<ContentDraftStalenessDetails | null> {
        await this.assertCanViewContentAsCode(user, projectUuid);
        const draft = await this.contentDraftModel.get(draftUuid);
        if (!draft || draft.projectUuid !== projectUuid) {
            throw new ParameterError('Draft not found');
        }
        if (draft.authorUserUuid !== user.userUuid) {
            await this.assertCanManageContentAsCode(user, projectUuid);
        }
        const staleness = await this.getDraftStaleness(draft);
        if (staleness === null) return null;
        const current = await this.contentAsCodeSnapshotModel.get(
            projectUuid,
            draft.contentType === 'chart'
                ? ContentAsCodeType.CHART
                : ContentAsCodeType.DASHBOARD,
            draft.slug,
        );
        const { draftDoc } = await this.renderDraftDocuments(
            projectUuid,
            draft,
        );
        return describeContentDraftStaleness({
            staleness,
            base: draft.baseSnapshot,
            current: current?.snapshot,
            draft: buildContentAsCodeSnapshot(draftDoc).snapshot,
        });
    }

    // The author's gesture: move the draft onto the repo's latest snapshot,
    // keeping their edits where the repo did not touch the same field and
    // taking their call on the fields both sides changed
    async rebaseDraft(
        user: SessionUser,
        projectUuid: string,
        draftUuid: string,
        resolutions: Record<string, ContentDraftFieldResolution>,
    ): Promise<ContentDraft> {
        await this.assertCanViewContentAsCode(user, projectUuid);
        const draft = await this.contentDraftModel.get(draftUuid);
        if (!draft || draft.projectUuid !== projectUuid) {
            throw new ParameterError('Draft not found');
        }
        if (draft.authorUserUuid !== user.userUuid) {
            throw new ForbiddenError();
        }
        if (draft.status !== 'open') {
            throw new ConflictError('Only open drafts can be updated');
        }
        if (
            draft.contentType !== 'chart' &&
            draft.contentType !== 'dashboard'
        ) {
            throw new ParameterError('Unsupported draft content type');
        }
        const current = await this.contentAsCodeSnapshotModel.get(
            projectUuid,
            draft.contentType === 'chart'
                ? ContentAsCodeType.CHART
                : ContentAsCodeType.DASHBOARD,
            draft.slug,
        );
        if (!current) {
            throw new ConflictError(
                'This content has no upload snapshot to update to',
            );
        }
        const staleness = await this.getDraftStaleness(draft);
        const unresolved = (staleness?.conflictingFields ?? []).filter(
            (field) => resolutions[field] === undefined,
        );
        if (unresolved.length > 0) {
            throw new ParameterError(
                `Choose what to keep for: ${unresolved.join(', ')}`,
            );
        }
        const removeKeys = (staleness?.conflictingFields ?? [])
            .filter((field) => resolutions[field] === 'latest')
            .flatMap((field) =>
                overlayKeysForAsCodeField(
                    draft.contentType === 'chart' ? 'chart' : 'dashboard',
                    field,
                ),
            );
        await this.contentDraftModel.rebase(draft.uuid, {
            base: { snapshot: current.snapshot, hash: current.snapshotHash },
            removeKeys,
        });
        const updated = await this.contentDraftModel.get(draft.uuid);
        if (!updated) throw new ParameterError('Draft not found');
        return updated;
    }

    async reopenDraft(
        user: SessionUser,
        projectUuid: string,
        draftUuid: string,
    ): Promise<ContentDraft> {
        await this.assertCanViewContentAsCode(user, projectUuid);
        const draft = await this.contentDraftModel.get(draftUuid);
        if (!draft || draft.projectUuid !== projectUuid) {
            throw new ParameterError('Draft not found');
        }
        if (draft.authorUserUuid !== user.userUuid) {
            throw new ForbiddenError();
        }
        if (draft.status === 'open') return draft;
        if (draft.status !== 'dismissed') {
            throw new ConflictError('Only dismissed drafts can be reopened');
        }
        const existingOpen = await this.contentDraftModel.findOpenDraft(
            projectUuid,
            draft.contentType,
            draft.contentUuid,
            user.userUuid,
        );
        if (existingOpen && existingOpen.uuid !== draft.uuid) {
            throw new ConflictError(
                'This content already has a newer open draft',
            );
        }
        await this.contentDraftModel.update(draft.uuid, { status: 'open' });
        return { ...draft, status: 'open' };
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
                        await this.releaseDraftOfClosedPullRequest(row);
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

    // A PR closed without merging hands the change back to its author as a
    // dismissed draft, so the existing reopen path applies.
    private async releaseDraftOfClosedPullRequest(
        row: ContentAsCodeWriteback,
    ): Promise<void> {
        if (row.contentDraftUuid === null) return;
        const draft = await this.contentDraftModel.get(row.contentDraftUuid);
        if (draft === undefined || draft.status !== 'written_back') return;
        await this.contentDraftModel.update(draft.uuid, {
            status: 'dismissed',
            prUrl: null,
        });
        this.logger.info(
            `Draft ${draft.uuid} for ${row.slug} released after PR #${row.prNumber} was closed without merging`,
        );
    }

    private async writeContentToWritebackPr(
        user: SessionUser,
        target: {
            projectUuid: string;
            contentType: WritebackContentType;
            contentUuid: string;
            slug: string;
            contentDraftUuid: string | null;
            documentOverride?: ChartAsCode | DashboardAsCode;
            author: CommitAuthor;
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
        if (
            row !== undefined &&
            row.status === 'open' &&
            row.prNumber !== null
        ) {
            // The PR may have been merged or closed on the provider since the
            // row was stamped; refresh first so a new edit opens a fresh PR
            // instead of committing to a branch no open PR tracks.
            await this.refreshOpenPullRequestStates(user, projectUuid, [row]);
            row = await this.contentAsCodeWritebackModel.findLive(
                projectUuid,
                snapshotType,
                slug,
            );
        }
        if (row !== undefined) {
            this.assertWritebackOwner(row, target.contentDraftUuid);
        }
        if (row === undefined) {
            const branch = ContentAsCodeWritebackService.getWritebackBranch(
                this.getInstanceSlug(),
                contentType,
                slug,
                target.contentDraftUuid,
            );
            try {
                row = await this.contentAsCodeWritebackModel.create({
                    projectUuid,
                    contentType: snapshotType,
                    slug,
                    contentDraftUuid: target.contentDraftUuid,
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
                this.assertWritebackOwner(raced, target.contentDraftUuid);
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

    private assertWritebackOwner(
        row: ContentAsCodeWriteback,
        requestedDraftUuid: string | null,
    ): void {
        if (row.contentDraftUuid === requestedDraftUuid) return;

        throw new ConflictError(
            `Content "${row.slug}" already has an active write-back proposal. Merge or close it before writing back another draft.`,
            {
                contentType: row.contentType,
                slug: row.slug,
                existingDraftUuid: row.contentDraftUuid,
                requestedDraftUuid,
                prUrl: row.prUrl,
            },
        );
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
            contentDraftUuid: string | null;
            documentOverride?: ChartAsCode | DashboardAsCode;
            author: CommitAuthor;
        },
        row: ContentAsCodeWriteback,
    ): Promise<void> {
        const { projectUuid, contentType, contentUuid, slug } = target;
        const repo =
            await this.gitIntegrationService.getProjectRepo(projectUuid);
        const contentDir = await this.getContentPath(projectUuid);

        let current = row;
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
            if (current.prUrl === null) {
                current =
                    (await this.adoptOpenPullRequest(
                        user,
                        projectUuid,
                        current,
                    )) ?? current;
            }
        }

        const files: { path: string; content: string }[] = [];
        const notes: string[] = [];
        if (contentType === 'chart') {
            const chartAsCode =
                (target.documentOverride as ChartAsCode | undefined) ??
                (await this.coderService.getPortableChartAsCode(
                    projectUuid,
                    contentUuid,
                ));
            files.push({
                path: ContentAsCodeWritebackService.getContentFilePath(
                    repo.path,
                    contentDir,
                    'chart',
                    slug,
                ),
                content: dumpContentAsCode(chartAsCode),
            });
        } else {
            const dashboardAsCode =
                (target.documentOverride as DashboardAsCode | undefined) ??
                (await this.coderService.getCurrentDashboardAsCode(
                    contentUuid,
                ));
            files.push({
                path: ContentAsCodeWritebackService.getContentFilePath(
                    repo.path,
                    contentDir,
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
                contentDir,
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
                target.author,
            );
            if (didCommit) committed += 1;
        }
        if (committed === 0) {
            this.logger.debug(
                `Content-as-code write-back for ${slug}: branch already has this content`,
            );
        }

        if (current.prUrl !== null && current.status === 'open') {
            return;
        }

        const contentPath =
            contentType === 'chart'
                ? `/projects/${projectUuid}/saved/${contentUuid}`
                : `/projects/${projectUuid}/dashboards/${contentUuid}`;
        const contentUrl = new URL(contentPath, this.lightdashConfig.siteUrl)
            .href;
        const label = contentType === 'chart' ? 'chart' : 'dashboard';
        let pullRequest;
        try {
            pullRequest =
                await this.gitIntegrationService.createPullRequestFromBranch(
                    user,
                    projectUuid,
                    row.branch,
                    `Update ${label} \`${slug}\` from Lightdash`,
                    [
                        `This ${label} was edited in Lightdash and is managed as code; this PR proposes the change back to the repo.`,
                        ``,
                        `- Instance: ${this.lightdashConfig.siteUrl}`,
                        `- Content: ${contentUrl}`,
                        `- Change by: ${describeAuthor(target.author)}`,
                        ...(notes.length > 0 ? ['', ...notes] : []),
                    ].join('\n'),
                    PullRequestSource.CONTENT_AS_CODE,
                );
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            if (!/pull request already exists/i.test(message)) {
                throw error;
            }
            // The branch already has an open PR we do not track (another
            // instance, or a row lost to an earlier error): adopt it
            const adopted = await this.adoptOpenPullRequest(
                user,
                projectUuid,
                current,
            );
            if (adopted !== null) return;
            const previous =
                await this.contentAsCodeWritebackModel.findLatestForBranch(
                    projectUuid,
                    row.contentType,
                    slug,
                    row.branch,
                );
            if (previous?.prNumber == null || previous.prUrl === null) {
                throw error;
            }
            await this.contentAsCodeWritebackModel.update(row.uuid, {
                prNumber: previous.prNumber,
                prUrl: previous.prUrl,
                status: 'open',
            });
            return;
        }
        await this.contentAsCodeWritebackModel.update(row.uuid, {
            prNumber: parsePullRequestNumber(pullRequest.prUrl),
            prUrl: pullRequest.prUrl,
            status: 'open',
        });
    }

    // The reviewer pushes the commit, but the credit belongs to whoever made
    // the change; fall back to the reviewer if the author cannot be resolved.
    private async resolveDraftAuthor(
        draft: ContentDraft,
        actingUser: SessionUser,
    ): Promise<CommitAuthor> {
        try {
            const author = await this.userModel.getUserDetailsByUuid(
                draft.authorUserUuid,
            );
            return commitAuthorFromUser(author);
        } catch (error) {
            this.logger.warn(
                `Could not resolve the author of draft ${draft.uuid}; crediting the reviewer instead`,
                error,
            );
            return commitAuthorFromUser(actingUser);
        }
    }

    private async adoptOpenPullRequest(
        user: SessionUser,
        projectUuid: string,
        row: ContentAsCodeWriteback,
    ): Promise<ContentAsCodeWriteback | null> {
        let found: { prNumber: number; prUrl: string } | null;
        try {
            found =
                await this.gitIntegrationService.findOpenPullRequestForBranch(
                    user,
                    projectUuid,
                    row.branch,
                );
        } catch (error) {
            this.logger.warn(
                `Could not look up an open PR for branch ${row.branch} on project ${projectUuid}`,
                error,
            );
            return null;
        }
        if (found === null) return null;
        await this.contentAsCodeWritebackModel.update(row.uuid, {
            prNumber: found.prNumber,
            prUrl: found.prUrl,
            status: 'open',
        });
        this.logger.info(
            `Content-as-code write-back for ${row.slug} adopted open PR #${found.prNumber} on branch ${row.branch}`,
        );
        return { ...row, ...found, status: 'open' };
    }

    private async collectDashboardOwnedCharts(
        user: SessionUser,
        projectUuid: string,
        dashboardAsCode: DashboardAsCode,
        repoPath: string,
        contentPath: string,
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
                            await this.coderService.getPortableChartAsCode(
                                projectUuid,
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
                                contentPath,
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
        author: CommitAuthor,
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
        try {
            await this.gitIntegrationService.saveFile(
                user,
                projectUuid,
                branch,
                file.path,
                file.content,
                existingSha,
                buildCommitMessage(
                    slug,
                    author,
                    new URL(
                        `/projects/${projectUuid}`,
                        this.lightdashConfig.siteUrl,
                    ).href,
                ),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            // Concurrent saves race on the file sha; re-read once and retry
            if (!/but expected|does not match|409/i.test(message)) {
                throw error;
            }
            const fresh = await this.gitIntegrationService.getFileOrDirectory(
                user,
                projectUuid,
                branch,
                file.path,
            );
            if (fresh.type === 'file' && fresh.content === file.content) {
                // The racing save already landed this exact content
                return false;
            }
            await this.gitIntegrationService.saveFile(
                user,
                projectUuid,
                branch,
                file.path,
                file.content,
                fresh.type === 'file' ? fresh.sha : undefined,
                buildCommitMessage(
                    slug,
                    author,
                    new URL(
                        `/projects/${projectUuid}`,
                        this.lightdashConfig.siteUrl,
                    ).href,
                ),
            );
        }
        return true;
    }
}
