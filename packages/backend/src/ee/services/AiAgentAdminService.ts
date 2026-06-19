import { subject } from '@casl/ability';
import {
    AiAgentAdminConversationsSummary,
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentReviewItemActivity,
    AiAgentReviewItemPrDiff,
    AiAgentReviewItemStatus,
    AiAgentReviewItemSummary,
    AiAgentReviewRemediationCompileJobPayload,
    AiAgentReviewRemediationPreviewJobPayload,
    AiAgentReviewRemediationRunJobPayload,
    AiAgentReviewSignalSummary,
    AiAgentReviewWritebackJobPayload,
    AiAgentSummary,
    AlreadyExistsError,
    assertUnreachable,
    DbtProjectType,
    extractPreviewProjectUuidFromUrl,
    extractPreviewUrlFromComments,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    JobStatusType,
    KnexPaginateArgs,
    KnexPaginatedData,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    RequestMethod,
    UpdateAiAgentReviewItemStatus,
    type AiAgentReviewItemWritebackBlockedReason,
    type AiAgentReviewItemWritebackEligibility,
    type AiAgentReviewItemWritebackPreview,
    type AiAgentReviewItemWritebackStrategy,
    type AiAgentReviewRemediation,
    type AiAgentReviewRemediationEvent,
    type AiAgentReviewRemediationEventType,
    type AiAgentReviewRemediationLiveState,
    type AiAgentReviewRemediationStatus,
    type PullRequest,
    type SessionUser,
} from '@lightdash/common';
import jwt from 'jsonwebtoken';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    getInstallationToken,
    getPullRequest,
    getPullRequestComments,
    getPullRequestDiffFiles,
} from '../../clients/github/Github';
import { type LightdashConfig } from '../../config/parseConfig';
import { isUniqueConstraintViolation } from '../../database/errors';
import { type GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { type GitlabAppInstallationsModel } from '../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import { type JobModel } from '../../models/JobModel/JobModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type PullRequestsModel } from '../../models/PullRequestsModel';
import { type UserModel } from '../../models/UserModel';
import { BaseService } from '../../services/BaseService';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { type ProjectService } from '../../services/ProjectService/ProjectService';
import { AiAgentModel } from '../models/AiAgentModel';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { type CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import {
    buildYmlPathByModel,
    planReviewWriteback,
} from './ai/reviewWriteback/buildReviewWritebackPrompt';
import { type AiAgentService } from './AiAgentService/AiAgentService';
import { type AiOrganizationSettingsService } from './AiOrganizationSettingsService';
import { type WritebackPreviewService } from './AiWritebackService/WritebackPreviewService';
import { type ProjectContextService } from './ProjectContextService/ProjectContextService';

type AiAgentAdminServiceDependencies = {
    analytics: LightdashAnalytics;
    aiAgentModel: AiAgentModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    aiAgentService: AiAgentService;
    featureFlagService: FeatureFlagService;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
    projectModel: ProjectModel;
    projectService: ProjectService;
    projectContextService: ProjectContextService;
    pullRequestsModel: PullRequestsModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    gitlabAppInstallationsModel: GitlabAppInstallationsModel;
    schedulerClient: CommercialSchedulerClient;
    userModel: UserModel;
    lightdashConfig: LightdashConfig;
    writebackPreviewService: WritebackPreviewService;
    jobModel: JobModel;
};

const parsePullRequestUrl = (
    prUrl: string,
): { owner: string; repo: string; pullNumber: number } | null => {
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
        return null;
    }
    return { owner: match[1], repo: match[2], pullNumber: Number(match[3]) };
};

type ProjectWritebackAccess =
    | {
          provider: PullRequestProvider;
          hasGitAppInstallation: boolean;
      }
    | {
          provider: null;
          hasGitAppInstallation: false;
      };

type ProjectWritebackAccessEntry = [string, ProjectWritebackAccess];

const terminalReviewStatuses = new Set<AiAgentReviewItemStatus>([
    'resolved',
    'dismissed',
    'duplicate',
]);

const activeRemediationStatuses = new Set([
    'queued',
    'running',
    'pr_open',
    'preview_ready',
]);

const REVIEW_PREVIEW_POLL_INTERVAL_MS = 25_000;
const REVIEW_PREVIEW_WAIT_TIMEOUT_MS = 10 * 60_000;
const PREVIEW_COMPILE_POLL_INTERVAL_MS = 10_000;
const PREVIEW_COMPILE_WAIT_TIMEOUT_MS = 10 * 60_000;

const unavailableWritebackEligibility = (
    reason: AiAgentReviewItemWritebackBlockedReason,
    strategy: AiAgentReviewItemWritebackStrategy | null = null,
    provider: PullRequestProvider | null = null,
): AiAgentReviewItemWritebackEligibility => ({
    eligible: false,
    reason,
    strategy,
    provider,
});

const getWritebackStrategy = (
    item: AiAgentReviewItemSummary,
    projectContextEnabled: boolean,
):
    | { strategy: AiAgentReviewItemWritebackStrategy }
    | { eligibility: AiAgentReviewItemWritebackEligibility } => {
    if (item.primaryRootCause === 'semantic_layer') {
        return { strategy: 'semantic_layer' };
    }
    if (item.primaryRootCause !== 'project_context') {
        return {
            eligibility: unavailableWritebackEligibility(
                'unsupported_root_cause',
            ),
        };
    }
    if (!projectContextEnabled) {
        return {
            eligibility: unavailableWritebackEligibility(
                'project_context_disabled',
                'project_context',
            ),
        };
    }
    if (!item.latestFinding?.projectContextEntry) {
        return {
            eligibility: unavailableWritebackEligibility(
                'missing_project_context_entry',
                'project_context',
            ),
        };
    }
    return { strategy: 'project_context' };
};

const toReviewWritebackStrategy = (
    strategy: ReturnType<typeof planReviewWriteback>['strategy'],
): AiAgentReviewItemWritebackStrategy =>
    strategy === 'project_context' ? 'project_context' : 'semantic_layer';

export const getAiAgentReviewItemWritebackEligibility = (args: {
    item: AiAgentReviewItemSummary;
    reviewsEnabled: boolean;
    projectContextEnabled: boolean;
    projectAccess: ProjectWritebackAccess | null;
    hasSemanticWritebackConfig: boolean;
    sourceThreadHasWritebackPr: boolean;
}): AiAgentReviewItemWritebackEligibility => {
    const {
        item,
        reviewsEnabled,
        projectContextEnabled,
        projectAccess,
        hasSemanticWritebackConfig,
        sourceThreadHasWritebackPr,
    } = args;

    if (!reviewsEnabled) {
        return unavailableWritebackEligibility('reviews_disabled');
    }
    if (terminalReviewStatuses.has(item.status)) {
        return unavailableWritebackEligibility('terminal_state');
    }
    if (item.linkedPrUrl && item.prState === 'open') {
        return unavailableWritebackEligibility('pull_request_open');
    }
    if (
        item.remediation &&
        activeRemediationStatuses.has(item.remediation.status)
    ) {
        return unavailableWritebackEligibility('writeback_in_progress');
    }
    if (
        item.prWritebackStatus === 'queued' ||
        item.prWritebackStatus === 'running'
    ) {
        return unavailableWritebackEligibility('writeback_in_progress');
    }
    // The agent already opened a writeback PR in the thread this finding came
    // from — remediating would open a second PR for the same issue.
    if (sourceThreadHasWritebackPr && !item.linkedPrUrl) {
        return unavailableWritebackEligibility(
            'source_thread_writeback_exists',
        );
    }

    const strategyResult = getWritebackStrategy(item, projectContextEnabled);
    if ('eligibility' in strategyResult) {
        return strategyResult.eligibility;
    }
    const { strategy } = strategyResult;

    if (!item.projectUuid) {
        return unavailableWritebackEligibility('missing_project', strategy);
    }
    if (!projectAccess || !projectAccess.provider) {
        return unavailableWritebackEligibility(
            'unsupported_source_control',
            strategy,
        );
    }
    if (
        strategy === 'project_context' &&
        projectAccess.provider !== PullRequestProvider.GITHUB
    ) {
        return unavailableWritebackEligibility(
            'unsupported_source_control',
            strategy,
            projectAccess.provider,
        );
    }
    if (!projectAccess.hasGitAppInstallation) {
        return unavailableWritebackEligibility(
            'git_app_not_installed',
            strategy,
            projectAccess.provider,
        );
    }
    if (strategy === 'semantic_layer' && !hasSemanticWritebackConfig) {
        return unavailableWritebackEligibility(
            'missing_writeback_config',
            strategy,
            projectAccess.provider,
        );
    }

    return {
        eligible: true,
        reason: null,
        strategy,
        provider: projectAccess.provider,
    };
};

export class AiAgentAdminService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiAgentModel: AiAgentModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly aiAgentService: AiAgentService;

    private readonly featureFlagService: FeatureFlagService;

    private readonly aiOrganizationSettingsService: AiOrganizationSettingsService;

    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectService;

    private readonly projectContextService: ProjectContextService;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly gitlabAppInstallationsModel: GitlabAppInstallationsModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly userModel: UserModel;

    private readonly writebackPreviewService: WritebackPreviewService;

    private readonly jobModel: JobModel;

    constructor(dependencies: AiAgentAdminServiceDependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiAgentReviewClassifierModel =
            dependencies.aiAgentReviewClassifierModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.featureFlagService = dependencies.featureFlagService;
        this.aiOrganizationSettingsService =
            dependencies.aiOrganizationSettingsService;
        this.projectModel = dependencies.projectModel;
        this.projectService = dependencies.projectService;
        this.projectContextService = dependencies.projectContextService;
        this.pullRequestsModel = dependencies.pullRequestsModel;
        this.githubAppInstallationsModel =
            dependencies.githubAppInstallationsModel;
        this.gitlabAppInstallationsModel =
            dependencies.gitlabAppInstallationsModel;
        this.schedulerClient = dependencies.schedulerClient;
        this.userModel = dependencies.userModel;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.writebackPreviewService = dependencies.writebackPreviewService;
        this.jobModel = dependencies.jobModel;
    }

    private checkOrganizationAdminAccess(user: SessionUser): void {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid!,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access organization-wide AI agent data',
            );
        }
    }

    /**
     * Get all threads across all agents in the organization
     * Only accessible by organization admins
     */
    async getAllThreads(
        user: SessionUser,
        paginateArgs?: KnexPaginateArgs,
        filters?: AiAgentAdminFilters,
        sort?: AiAgentAdminSort,
    ): Promise<KnexPaginatedData<AiAgentAdminConversationsSummary>> {
        const { organizationUuid } = user;

        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        // TODO: Check if filter contains userUuid and check if they exist in the organization
        // TODO: Check if filter contains agentUuid and check if they exist in the organization
        // TODO: Check if filter contains projectUuid and check if they exist in the organization

        return this.aiAgentModel.findAdminThreadsPaginated({
            organizationUuid,
            paginateArgs,
            filters,
            sort,
        });
    }

    async listAgents(user: SessionUser): Promise<AiAgentSummary[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);
        return this.aiAgentModel.findAllAgents({
            organizationUuid,
        });
    }

    async listReviewItems(
        user: SessionUser,
        statuses?: AiAgentReviewItemStatus[],
    ): Promise<AiAgentReviewItemSummary[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const items = await this.aiAgentReviewClassifierModel.listReviewItems({
            organizationUuid,
            statuses,
        });

        const [reviewsEnabled, projectContextEnabled] = await Promise.all([
            this.areReviewsEnabled(user),
            this.isProjectContextFeatureEnabled(user),
        ]);
        const overrides = await this.reconcileLinkedPullRequests(
            user.userUuid,
            organizationUuid,
            items,
            { projectContextEnabled },
        );

        const projectAccessByUuid = await this.getProjectWritebackAccessByUuid(
            organizationUuid,
            items
                .map((item) => item.projectUuid)
                .filter((uuid): uuid is string => uuid !== null),
        );

        const writebackPrByThread =
            await this.aiAgentReviewClassifierModel.getThreadWritebackPullRequests(
                items
                    .map((item) => item.latestFinding?.threadUuid)
                    .filter((uuid): uuid is string => !!uuid),
            );

        const reconciled = items.map((item) => {
            const override = overrides.get(item.fingerprint);
            const reconciledItem = { ...item, ...(override ?? {}) };
            const writebackEligibility =
                getAiAgentReviewItemWritebackEligibility({
                    item: reconciledItem,
                    reviewsEnabled,
                    projectContextEnabled,
                    projectAccess: reconciledItem.projectUuid
                        ? (projectAccessByUuid.get(
                              reconciledItem.projectUuid,
                          ) ?? null)
                        : null,
                    hasSemanticWritebackConfig:
                        this.hasSemanticWritebackConfig(),
                    sourceThreadHasWritebackPr:
                        !!reconciledItem.latestFinding?.threadUuid &&
                        (writebackPrByThread.get(
                            reconciledItem.latestFinding.threadUuid,
                        )?.length ?? 0) > 0,
                });

            return {
                ...reconciledItem,
                writebackEligible: writebackEligibility.eligible,
                writebackEligibility,
            };
        });

        const filtered = statuses
            ? reconciled.filter((item) => statuses.includes(item.status))
            : reconciled;

        const blockedReasons = filtered.reduce<
            Partial<Record<AiAgentReviewItemWritebackBlockedReason, number>>
        >((acc, item) => {
            if (item.writebackEligibility.eligible) {
                return acc;
            }
            acc[item.writebackEligibility.reason] =
                (acc[item.writebackEligibility.reason] ?? 0) + 1;
            return acc;
        }, {});

        this.analytics.track({
            event: 'ai_agent_review_items.listed',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                totalCount: filtered.length,
                eligibleCount: filtered.filter(
                    (item) => item.writebackEligibility.eligible,
                ).length,
                statuses: statuses ?? null,
                blockedReasons,
            },
        });

        return filtered;
    }

    private async areReviewsEnabled(user: SessionUser): Promise<boolean> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            return false;
        }
        return this.aiOrganizationSettingsService.isAiAgentReviewsEnabled({
            organizationUuid,
        });
    }

    private async isProjectContextFeatureEnabled(
        user: SessionUser,
    ): Promise<boolean> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            return false;
        }
        const [reviewsEnabled, aiWritebackFlag] = await Promise.all([
            this.aiOrganizationSettingsService.isAiAgentReviewsEnabled({
                organizationUuid,
            }),
            this.featureFlagService.get({
                featureFlagId: FeatureFlags.AiWriteback,
                user: {
                    userUuid: user.userUuid,
                    organizationUuid,
                    organizationName: user.organizationName ?? '',
                },
            }),
        ]);
        return reviewsEnabled && aiWritebackFlag.enabled;
    }

    private hasSemanticWritebackConfig(): boolean {
        return Boolean(
            this.lightdashConfig.appRuntime.e2bApiKey &&
            this.lightdashConfig.aiWriteback.anthropicApiKey,
        );
    }

    private async getProjectWritebackAccessByUuid(
        organizationUuid: string,
        projectUuids: string[],
    ): Promise<Map<string, ProjectWritebackAccess>> {
        const distinct = [...new Set(projectUuids)];
        const [githubInstallationId, gitlabInstallationId] = await Promise.all([
            this.githubAppInstallationsModel
                .findInstallationId(organizationUuid)
                .catch(() => undefined),
            this.gitlabAppInstallationsModel
                .findInstallationId(organizationUuid)
                .catch(() => undefined),
        ]);

        const entries = await Promise.all(
            distinct.map(
                async (
                    projectUuid,
                ): Promise<ProjectWritebackAccessEntry | null> => {
                    try {
                        const project =
                            await this.projectModel.get(projectUuid);
                        if (
                            project.dbtConnection.type === DbtProjectType.GITHUB
                        ) {
                            return [
                                projectUuid,
                                {
                                    provider: PullRequestProvider.GITHUB,
                                    hasGitAppInstallation:
                                        githubInstallationId !== undefined,
                                },
                            ];
                        }
                        if (
                            project.dbtConnection.type === DbtProjectType.GITLAB
                        ) {
                            return [
                                projectUuid,
                                {
                                    provider: PullRequestProvider.GITLAB,
                                    hasGitAppInstallation:
                                        gitlabInstallationId !== undefined,
                                },
                            ];
                        }
                    } catch {
                        return null;
                    }
                    return [
                        projectUuid,
                        {
                            provider: null,
                            hasGitAppInstallation: false,
                        },
                    ];
                },
            ),
        );

        return new Map(
            entries.filter(
                (entry): entry is ProjectWritebackAccessEntry => entry !== null,
            ),
        );
    }

    private static throwWritebackBlocked(
        eligibility: AiAgentReviewItemWritebackEligibility,
    ): never {
        if (eligibility.eligible) {
            throw new ParameterError('Writeback is available');
        }

        switch (eligibility.reason) {
            case 'reviews_disabled':
                throw new ForbiddenError(
                    'AI agent review writeback is not enabled',
                );
            case 'missing_writeback_config':
                throw new MissingConfigError(
                    'AI writeback requires E2B_API_KEY and AI_WRITEBACK_ANTHROPIC_API_KEY',
                );
            case 'git_app_not_installed':
                throw new ParameterError(
                    `Install the ${eligibility.provider ?? 'Git'} app to open writeback pull requests`,
                );
            case 'pull_request_open':
                throw new ParameterError(
                    'A pull request is already open for this review item',
                );
            case 'source_thread_writeback_exists':
                throw new ParameterError(
                    'The agent already opened a pull request in the source thread for this finding',
                );
            case 'writeback_in_progress':
                throw new ParameterError(
                    'A writeback is already in progress for this review item',
                );
            case 'terminal_state':
                throw new ParameterError(
                    'Writeback is not available for terminal review items',
                );
            case 'missing_project':
                throw new ParameterError(
                    'Writeback requires a project-scoped review item',
                );
            case 'missing_project_context_entry':
                throw new ParameterError(
                    'Project context writeback requires a generated context entry',
                );
            case 'project_context_disabled':
                throw new ParameterError(
                    'Project context writeback is not enabled',
                );
            case 'unsupported_source_control':
                throw new ParameterError(
                    'Writeback requires a GitHub or GitLab connected dbt project',
                );
            case 'unsupported_root_cause':
            default:
                throw new ParameterError(
                    'Writeback is not available for this review item',
                );
        }
    }

    /**
     * For items with an open linked PR, fetch the live GitHub state and return
     * the overrides to fold back in: merged → resolved, closed-unmerged →
     * re-opened. Best effort — a GitHub failure for one item is skipped.
     */
    private async reconcileLinkedPullRequests(
        userUuid: string,
        organizationUuid: string,
        items: AiAgentReviewItemSummary[],
        {
            projectContextEnabled,
        }: {
            projectContextEnabled: boolean;
        },
    ): Promise<
        Map<
            string,
            { status: AiAgentReviewItemStatus; prState: 'merged' | 'closed' }
        >
    > {
        const overrides = new Map<
            string,
            { status: AiAgentReviewItemStatus; prState: 'merged' | 'closed' }
        >();
        const open = items.filter(
            (item) => item.linkedPrUrl && item.prState === 'open',
        );
        if (open.length === 0) {
            return overrides;
        }

        let token: string;
        try {
            const installationId =
                await this.githubAppInstallationsModel.getInstallationId(
                    organizationUuid,
                );
            if (!installationId) {
                return overrides;
            }
            token = await getInstallationToken(installationId);
        } catch (error) {
            this.logger.warn(
                `Skipping PR-state reconcile — could not resolve GitHub installation: ${error}`,
            );
            return overrides;
        }

        await Promise.all(
            open.map(async (item) => {
                const parsed = parsePullRequestUrl(item.linkedPrUrl!);
                if (!parsed) {
                    return;
                }
                try {
                    const pr = await getPullRequest({
                        owner: parsed.owner,
                        repo: parsed.repo,
                        pullNumber: parsed.pullNumber,
                        token,
                    });
                    if (pr.state === 'open') {
                        return;
                    }
                    const status: AiAgentReviewItemStatus = pr.merged
                        ? 'resolved'
                        : 'open';
                    const prState = pr.merged ? 'merged' : 'closed';
                    await this.aiAgentReviewClassifierModel.reconcileReviewItemPrState(
                        {
                            fingerprint: item.fingerprint,
                            organizationUuid,
                            status,
                            prState,
                        },
                    );
                    if (item.remediation) {
                        await this.aiAgentReviewClassifierModel.createRemediationEvent(
                            {
                                remediationUuid: item.remediation.uuid,
                                organizationUuid,
                                event: {
                                    eventType: pr.merged
                                        ? 'pr_merged'
                                        : 'pr_closed',
                                    payload: { prUrl: item.linkedPrUrl! },
                                },
                            },
                        );
                    }
                    overrides.set(item.fingerprint, { status, prState });
                    // Loop closure: a merged project_context PR changed the file,
                    // so re-ingest to refresh the cache for future agent turns.
                    if (
                        pr.merged &&
                        projectContextEnabled &&
                        item.primaryRootCause === 'project_context' &&
                        item.projectUuid
                    ) {
                        await this.schedulerClient.ingestProjectContext({
                            projectUuid: item.projectUuid,
                            organizationUuid,
                            userUuid,
                        });
                    }
                } catch (error) {
                    this.logger.warn(
                        `Failed to reconcile PR state for review item ${item.fingerprint}: ${error}`,
                    );
                }
            }),
        );

        return overrides;
    }

    async listReviewSignals(
        user: SessionUser,
    ): Promise<AiAgentReviewSignalSummary[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        return this.aiAgentReviewClassifierModel.listReviewSignals({
            organizationUuid,
        });
    }

    async updateReviewItemStatus(
        user: SessionUser,
        fingerprint: string,
        update: UpdateAiAgentReviewItemStatus,
    ): Promise<AiAgentReviewItemSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        if (update.status === 'dismissed' && !update.dismissedReason) {
            throw new ParameterError(
                'A dismissed reason is required when dismissing a review item',
            );
        }
        if (update.status !== 'dismissed' && update.dismissedReason) {
            throw new ParameterError(
                'A dismissed reason is only allowed when dismissing a review item',
            );
        }

        const scope =
            await this.aiAgentReviewClassifierModel.getPromotedFingerprintScope(
                organizationUuid,
                fingerprint,
            );
        if (!scope) {
            throw new NotFoundError('Review item not found');
        }
        const previousReviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );

        await this.aiAgentReviewClassifierModel.upsertReviewItemState({
            fingerprint,
            organizationUuid,
            projectUuid: scope.projectUuid,
            agentUuid: scope.agentUuid,
            status: update.status,
            dismissedReason: update.dismissedReason,
            statusUpdatedByUserUuid: user.userUuid,
        });

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem) {
            throw new NotFoundError('Review item not found');
        }
        if (previousReviewItem?.status !== update.status) {
            this.analytics.track({
                event: 'ai_agent_review_item.status_changed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    fingerprint,
                    rootCause: reviewItem.primaryRootCause,
                    previousStatus: previousReviewItem?.status ?? 'triage',
                    newStatus: update.status,
                },
            });
        }
        if (
            update.status === 'resolved' &&
            reviewItem.remediation &&
            reviewItem.remediation.status !== 'resolved'
        ) {
            await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                {
                    remediationUuid: reviewItem.remediation.uuid,
                    organizationUuid,
                    status: 'resolved',
                    resolvedByUserUuid: user.userUuid,
                },
            );
        } else if (
            terminalReviewStatuses.has(update.status) &&
            reviewItem.remediation &&
            activeRemediationStatuses.has(reviewItem.remediation.status)
        ) {
            // Dismissing or duplicating must also close an active remediation —
            // otherwise the one-active-per-fingerprint index blocks all future
            // writebacks for this fingerprint. Closed as failed (not resolved)
            // so "resolved" keeps meaning the fix was confirmed.
            await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                {
                    remediationUuid: reviewItem.remediation.uuid,
                    organizationUuid,
                    status: 'failed',
                    errorMessage: `Review item was marked as ${update.status}`,
                },
            );
        }
        return this.getReviewItem(user, fingerprint);
    }

    async updateReviewItemAssignee(
        user: SessionUser,
        fingerprint: string,
        assignedToUserUuid: string | null,
    ): Promise<AiAgentReviewItemSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        await this.aiAgentReviewClassifierModel.updateReviewItemAssignee({
            fingerprint,
            organizationUuid,
            assignedToUserUuid,
        });

        return this.getReviewItem(user, fingerprint);
    }

    async createReviewItemWriteback(
        user: SessionUser,
        fingerprint: string,
    ): Promise<AiAgentReviewItemSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem) {
            throw new NotFoundError('Review item not found');
        }
        const finding = reviewItem.latestFinding;
        if (!finding) {
            throw new ParameterError(
                'Writeback requires a promoted review finding',
            );
        }
        const [reviewsEnabled, projectContextEnabled] = await Promise.all([
            this.areReviewsEnabled(user),
            reviewItem.primaryRootCause === 'project_context'
                ? this.isProjectContextFeatureEnabled(user)
                : false,
        ]);
        const projectAccessByUuid = await this.getProjectWritebackAccessByUuid(
            organizationUuid,
            reviewItem.projectUuid ? [reviewItem.projectUuid] : [],
        );
        const writebackPrByThread =
            await this.aiAgentReviewClassifierModel.getThreadWritebackPullRequests(
                [finding.threadUuid],
            );
        const sourceThreadHasWritebackPr =
            (writebackPrByThread.get(finding.threadUuid)?.length ?? 0) > 0;
        const writebackEligibility = getAiAgentReviewItemWritebackEligibility({
            item: reviewItem,
            reviewsEnabled,
            projectContextEnabled,
            projectAccess: reviewItem.projectUuid
                ? (projectAccessByUuid.get(reviewItem.projectUuid) ?? null)
                : null,
            hasSemanticWritebackConfig: this.hasSemanticWritebackConfig(),
            sourceThreadHasWritebackPr,
        });
        if (!writebackEligibility.eligible) {
            AiAgentAdminService.throwWritebackBlocked(writebackEligibility);
        }

        const scope =
            await this.aiAgentReviewClassifierModel.getPromotedFingerprintScope(
                organizationUuid,
                fingerprint,
            );
        if (!scope) {
            throw new NotFoundError('Review item not found');
        }

        // Plan the writeback up front: for semantic_layer we seed a real
        // Build-fix thread with the writeback prompt so the workspace can show
        // it the moment Create PR is clicked; project_context stays a
        // deterministic, threadless writeback.
        const explores = await this.projectModel.findExploresFromCache(
            scope.projectUuid,
            'name',
        );
        const plan = planReviewWriteback(
            reviewItem,
            buildYmlPathByModel(Object.values(explores)),
        );

        // The model presents a stale remediation as failed, which relaxes the
        // eligibility check above — but the partial unique index still sees
        // the row as active, so it must be persisted as failed (the model
        // re-checks staleness in SQL) before a new one can be inserted.
        if (reviewItem.remediation) {
            await this.aiAgentReviewClassifierModel.failStaleReviewRemediation({
                remediationUuid: reviewItem.remediation.uuid,
                organizationUuid,
            });
        }

        const retryPrompt =
            await this.aiAgentReviewClassifierModel.getPromptText({
                organizationUuid,
                promptUuid: finding.promptUuid,
            });

        // Create the Build-fix thread before the remediation row so a failed
        // unique-index insert leaves only a harmless orphan thread, never a
        // remediation pointing at a thread that doesn't exist. The source
        // project/agent were validated above (eligibility + scope), so the
        // auth-bypassing model call is safe.
        let workThreadUuid: string | null = null;
        if (plan.strategy === 'prompt') {
            const created =
                await this.aiAgentModel.createWebAppThreadWithPrompt({
                    thread: {
                        organizationUuid,
                        projectUuid: scope.projectUuid,
                        userUuid: user.userUuid,
                        createdFrom: 'web_app' as const,
                        agentUuid: scope.agentUuid,
                    },
                    prompt: {
                        createdByUserUuid: user.userUuid,
                        prompt: plan.promptText,
                        context: [
                            {
                                type: 'thread',
                                threadUuid: finding.threadUuid,
                                promptUuid: finding.promptUuid,
                            },
                        ],
                    },
                });
            workThreadUuid = created.threadUuid;
            await this.aiAgentModel.updateThreadTitle({
                threadUuid: workThreadUuid,
                title: `Fix review: ${reviewItem.title}`,
            });
        }

        // The one-active-per-fingerprint index can still reject the insert in
        // a race (concurrent retry, or a worker reviving the row between the
        // read and the stale update) — surface that as a conflict, not a 500.
        let remediation: AiAgentReviewRemediation;
        try {
            remediation =
                await this.aiAgentReviewClassifierModel.createReviewRemediation(
                    {
                        fingerprint,
                        organizationUuid,
                        sourceFindingUuid: finding.uuid,
                        sourcePromptUuid: finding.promptUuid,
                        sourceThreadUuid: finding.threadUuid,
                        sourceProjectUuid: finding.projectUuid,
                        sourceAgentUuid: finding.agentUuid,
                        workThreadUuid,
                        retryPrompt,
                        createdByUserUuid: user.userUuid,
                    },
                );
        } catch (error) {
            if (isUniqueConstraintViolation(error)) {
                throw new AlreadyExistsError(
                    'A writeback for this review item is already in progress',
                );
            }
            throw error;
        }

        // Anchor the feed at the finding itself, backdated to when it was
        // first seen — the remediation row is created much later.
        await this.aiAgentReviewClassifierModel.createRemediationEvent({
            remediationUuid: remediation.uuid,
            organizationUuid,
            event: {
                eventType: 'finding_opened',
                payload: {
                    excerpt: retryPrompt,
                    sourceThreadUuid: finding.threadUuid,
                    sourcePromptUuid: finding.promptUuid,
                },
            },
            occurredAt: reviewItem.firstSeenAt,
        });

        await this.aiAgentReviewClassifierModel.setReviewItemWritebackStatus({
            fingerprint,
            organizationUuid,
            projectUuid: scope.projectUuid,
            agentUuid: scope.agentUuid,
            status: 'queued',
            message: 'Queued',
        });

        await this.schedulerClient.aiAgentReviewWriteback({
            fingerprint,
            organizationUuid,
            projectUuid: scope.projectUuid,
            userUuid: user.userUuid,
            remediationUuid: remediation.uuid,
        });

        this.analytics.track({
            event: 'ai_agent_review_item.writeback_queued',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: scope.projectUuid,
                fingerprint,
                rootCause: reviewItem.primaryRootCause,
                strategy: writebackEligibility.strategy,
                provider: writebackEligibility.provider,
            },
        });

        return this.getReviewItem(user, fingerprint);
    }

    /**
     * Runs on the scheduler worker. Performs the writeback synchronously inside
     * the job, streaming phase messages onto the review item so the admin UI
     * can poll for progress.
     */
    async runReviewItemWritebackJob(
        payload: AiAgentReviewWritebackJobPayload,
    ): Promise<void> {
        const {
            fingerprint,
            organizationUuid,
            projectUuid,
            userUuid,
            remediationUuid,
        } = payload;

        const setProgress = (message: string) =>
            this.aiAgentReviewClassifierModel.updateReviewItemWritebackProgress(
                {
                    fingerprint,
                    organizationUuid,
                    message,
                },
            );

        const scope =
            await this.aiAgentReviewClassifierModel.getPromotedFingerprintScope(
                organizationUuid,
                fingerprint,
            );
        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!scope || !reviewItem) {
            if (remediationUuid) {
                await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                    {
                        remediationUuid,
                        organizationUuid,
                        status: 'failed',
                        errorMessage: 'Review item no longer exists',
                    },
                );
            }
            return;
        }
        const { agentUuid } = scope;
        if (remediationUuid) {
            await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                {
                    remediationUuid,
                    organizationUuid,
                    status: 'running',
                },
            );
        }

        const setTerminal = (
            status: 'completed' | 'failed',
            message: string | null,
        ) =>
            this.aiAgentReviewClassifierModel.setReviewItemWritebackStatus({
                fingerprint,
                organizationUuid,
                projectUuid,
                agentUuid,
                status,
                message,
            });

        let strategy: AiAgentReviewItemWritebackStrategy | null = null;
        try {
            const user = await this.userModel.findSessionUserByUUID(userUuid);
            await setProgress('Starting writeback…');

            const explores = await this.projectModel.findExploresFromCache(
                projectUuid,
                'name',
            );
            const plan = planReviewWriteback(
                reviewItem,
                buildYmlPathByModel(Object.values(explores)),
            );
            const planStrategy = toReviewWritebackStrategy(plan.strategy);
            strategy = planStrategy;

            let prUrl: string | null;
            let pullRequest: PullRequest | null = null;
            if (plan.strategy === 'project_context') {
                await setProgress('Updating project context…');
                const finding = reviewItem.latestFinding;
                const sourceThread = finding
                    ? {
                          threadUrl: `${this.lightdashConfig.siteUrl}/projects/${finding.projectUuid}/ai-agents/${finding.agentUuid}/threads/${finding.threadUuid}`,
                          promptUuid: finding.promptUuid,
                          threadUuid: finding.threadUuid,
                      }
                    : null;
                const writeback =
                    await this.projectContextService.writebackEntry({
                        projectUuid,
                        entry: plan.entry,
                        branchTimestamp: Date.now(),
                        sourceThread,
                    });
                prUrl = writeback.prUrl;
                // Surface the PR in the project's Pull Requests list with
                // AI_AGENT provenance, same as the semantic_layer writeback.
                pullRequest = await this.pullRequestsModel.findOrCreate({
                    organizationUuid,
                    projectUuid,
                    createdByUserUuid: userUuid,
                    provider: PullRequestProvider.GITHUB,
                    source: PullRequestSource.AI_AGENT,
                    owner: writeback.owner,
                    repo: writeback.repo,
                    prNumber: writeback.prNumber,
                    prUrl: writeback.prUrl,
                });
            } else {
                // Run the Build-fix thread: the conversational agent calls
                // editDbtProject, which opens the PR and links it to this
                // thread via ai_writeback_thread. The writeback_completed event
                // is emitted by the shared editDbtProject seam so that
                // user-driven Continue PR turns record it too.
                const remediation = remediationUuid
                    ? await this.aiAgentReviewClassifierModel.getReviewRemediation(
                          { organizationUuid, remediationUuid },
                      )
                    : null;
                const workThreadUuid = remediation?.workThreadUuid ?? null;
                if (!workThreadUuid) {
                    throw new ParameterError(
                        'Build-fix thread was not created for this remediation',
                    );
                }
                await this.aiAgentService.generateAgentThreadResponse(user, {
                    agentUuid,
                    threadUuid: workThreadUuid,
                    autoApproveSql: true,
                    // Force the writeback tool on the opening turn so the run
                    // always opens a PR rather than just discussing the fix.
                    toolHints: ['editDbtProject'],
                    forceToolHints: true,
                    // The review flow owns preview + verification (below), so the
                    // tool must not also create its own preview project.
                    suppressWritebackPreview: true,
                    onStepProgress: (message) => {
                        void setProgress(message);
                    },
                });
                const writebackPrs =
                    await this.aiAgentReviewClassifierModel.getThreadWritebackPullRequests(
                        [workThreadUuid],
                    );
                prUrl = writebackPrs.get(workThreadUuid)?.[0]?.prUrl ?? null;
                pullRequest = prUrl
                    ? await this.pullRequestsModel.findByProjectAndUrl(
                          projectUuid,
                          prUrl,
                      )
                    : null;
                if (prUrl && !pullRequest) {
                    const parsed = parsePullRequestUrl(prUrl);
                    if (parsed) {
                        pullRequest = await this.pullRequestsModel.findOrCreate(
                            {
                                organizationUuid,
                                projectUuid,
                                createdByUserUuid: userUuid,
                                provider: PullRequestProvider.GITHUB,
                                source: PullRequestSource.AI_AGENT,
                                owner: parsed.owner,
                                repo: parsed.repo,
                                prNumber: parsed.pullNumber,
                                prUrl,
                            },
                        );
                    }
                }
            }

            if (prUrl) {
                await this.aiAgentReviewClassifierModel.setReviewItemPrLink({
                    fingerprint,
                    organizationUuid,
                    projectUuid,
                    agentUuid,
                    linkedPrUrl: prUrl,
                    prState: 'open',
                });
                let terminalMessage = 'Opened pull request';
                if (remediationUuid && pullRequest) {
                    await this.aiAgentReviewClassifierModel.setReviewRemediationPullRequest(
                        {
                            remediationUuid,
                            organizationUuid,
                            pullRequestUuid: pullRequest.pullRequestUuid,
                        },
                    );
                    await this.aiAgentReviewClassifierModel.createRemediationEvent(
                        {
                            remediationUuid,
                            organizationUuid,
                            event: {
                                eventType: 'pr_opened',
                                payload: {
                                    prUrl,
                                    prNumber:
                                        parsePullRequestUrl(prUrl)
                                            ?.pullNumber ?? null,
                                },
                            },
                        },
                    );
                } else if (remediationUuid) {
                    // The PR exists (e.g. a non-GitHub URL we cannot record in
                    // pull_requests) — keep the lifecycle truthful instead of
                    // failing a successful writeback. Preview creation is
                    // skipped without a recorded pull request.
                    await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                        {
                            remediationUuid,
                            organizationUuid,
                            status: 'pr_open',
                        },
                    );
                }
                // Both strategies verify against the PR's head branch in a preview env.
                await setProgress('Creating preview environment…');
                const preview =
                    await this.writebackPreviewService.createPreviewForPullRequest(
                        { user, projectUuid, prUrl },
                    );
                if (preview) {
                    terminalMessage = `Opened pull request · Preview: ${preview.previewUrl}`;
                    if (remediationUuid && pullRequest) {
                        // The verification agent snapshots the preview's
                        // explores at run start, so prompting before the
                        // compile finishes makes it report a false negative.
                        // The wait runs as a self-rescheduling poll job so no
                        // worker slot is held and a deploy can't strand it.
                        await this.schedulerClient.aiAgentReviewRemediationCompile(
                            {
                                organizationUuid,
                                projectUuid,
                                userUuid,
                                fingerprint,
                                remediationUuid,
                                previewProjectUuid: preview.previewProjectUuid,
                                compileJobUuid: preview.compileJobUuid,
                                startedAt: Date.now(),
                            },
                        );
                    }
                }
                await setTerminal('completed', terminalMessage);
            } else {
                if (remediationUuid) {
                    // No PR means nothing was wrong to fix — a legitimate
                    // no-op, not a failure; close the remediation to match the
                    // item's completed status.
                    await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                        {
                            remediationUuid,
                            organizationUuid,
                            status: 'resolved',
                        },
                    );
                }
                await setTerminal(
                    'completed',
                    'Writeback ran — no changes were needed',
                );
            }
            this.analytics.track({
                event: 'ai_agent_review_item.writeback_completed',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    fingerprint,
                    rootCause: reviewItem.primaryRootCause,
                    strategy: planStrategy,
                    prCreated: prUrl !== null,
                },
            });
        } catch (error) {
            if (remediationUuid) {
                await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                    {
                        remediationUuid,
                        organizationUuid,
                        status: 'failed',
                        errorMessage: getErrorMessage(error),
                    },
                );
            }
            await setTerminal('failed', getErrorMessage(error));
            this.analytics.track({
                event: 'ai_agent_review_item.writeback_failed',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    fingerprint,
                    rootCause: reviewItem.primaryRootCause,
                    strategy,
                    errorMessage: getErrorMessage(error),
                },
            });
            throw error;
        }
    }

    private async resolveReviewWritebackPreviewUrl(
        organizationUuid: string,
        prUrl: string,
    ): Promise<string | null> {
        const parsed = parsePullRequestUrl(prUrl);
        if (!parsed) {
            return null;
        }

        try {
            const installationId =
                await this.githubAppInstallationsModel.getInstallationId(
                    organizationUuid,
                );
            const comments = await getPullRequestComments({
                owner: parsed.owner,
                repo: parsed.repo,
                pullNumber: parsed.pullNumber,
                installationId,
            });
            return extractPreviewUrlFromComments(
                comments,
                this.lightdashConfig.siteUrl,
            );
        } catch (error) {
            this.logger.warn(
                `Failed to resolve review remediation preview URL: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
    }

    /**
     * The per-PR activity feed for a review finding: stored lifecycle events
     * plus a derived in-flight state (never stored) for the accented live row.
     */
    async getReviewItemActivity(
        user: SessionUser,
        fingerprint: string,
    ): Promise<AiAgentReviewItemActivity> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem?.remediation) {
            return {
                events: [],
                liveState: null,
                liveMessage: null,
                verdictStale: false,
            };
        }

        const events =
            await this.aiAgentReviewClassifierModel.listRemediationEvents({
                remediationUuid: reviewItem.remediation.uuid,
                organizationUuid,
            });

        const liveState = AiAgentAdminService.deriveRemediationLiveState(
            reviewItem.remediation.status,
            events,
        );
        return {
            events,
            liveState,
            liveMessage:
                liveState === 'writeback'
                    ? reviewItem.prWritebackMessage
                    : null,
            verdictStale: AiAgentAdminService.deriveVerdictStale(events),
        };
    }

    /**
     * A verdict is stale when the PR moved on after it was produced: the latest
     * commit-landing event (pr_opened / pr_updated / writeback_completed)
     * occurred after the latest verification_completed. No verdict yet → never
     * stale (the in-flight states cover that).
     */
    private static deriveVerdictStale(
        events: AiAgentReviewRemediationEvent[],
    ): boolean {
        const latestOccurredAt = (
            eventTypes: AiAgentReviewRemediationEventType[],
        ): number => {
            const times = events
                .filter((event) => eventTypes.includes(event.eventType))
                .map((event) => new Date(event.occurredAt).getTime());
            return times.length > 0 ? Math.max(...times) : -Infinity;
        };
        const latestVerification = latestOccurredAt(['verification_completed']);
        if (latestVerification === -Infinity) {
            return false;
        }
        const latestCommit = latestOccurredAt([
            'pr_opened',
            'pr_updated',
            'writeback_completed',
        ]);
        return latestCommit > latestVerification;
    }

    /**
     * Re-verify a remediation after the PR changed (a Continue PR commit). The
     * preview project tracks the PR head branch, so a fresh compile picks up the
     * new commits in place — no new clone. Resets the remediation to pr_open so
     * the existing compile poll runs, which on completion seeds a fresh Test-fix
     * thread and re-runs verification (clearing the stale verdict).
     */
    async retestReviewRemediation(
        user: SessionUser,
        fingerprint: string,
    ): Promise<AiAgentReviewItemActivity> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        const remediation = reviewItem?.remediation ?? null;
        if (!remediation) {
            throw new NotFoundError('No remediation to retest');
        }
        if (!remediation.previewProjectUuid) {
            throw new ParameterError(
                'This remediation has no preview to retest',
            );
        }

        await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus({
            remediationUuid: remediation.uuid,
            organizationUuid,
            status: 'pr_open',
        });

        const { jobUuid } = await this.projectService.scheduleCompileProject(
            user,
            remediation.previewProjectUuid,
            RequestMethod.BACKEND,
            true,
            true,
        );

        await this.schedulerClient.aiAgentReviewRemediationCompile({
            organizationUuid,
            projectUuid: remediation.sourceProjectUuid,
            userUuid: user.userUuid,
            fingerprint,
            remediationUuid: remediation.uuid,
            previewProjectUuid: remediation.previewProjectUuid,
            compileJobUuid: jobUuid,
            startedAt: Date.now(),
        });

        return this.getReviewItemActivity(user, fingerprint);
    }

    private static deriveRemediationLiveState(
        status: AiAgentReviewRemediationStatus,
        events: AiAgentReviewRemediationEvent[],
    ): AiAgentReviewRemediationLiveState | null {
        if (status === 'queued' || status === 'running') {
            return 'writeback';
        }
        if (status !== 'pr_open' && status !== 'preview_ready') {
            return null;
        }
        const has = (eventType: AiAgentReviewRemediationEventType) =>
            events.some((event) => event.eventType === eventType);
        if (!has('pr_opened') || has('verification_completed')) {
            return null;
        }
        return has('preview_compiled') ? 'verifying' : 'compiling';
    }

    /**
     * Called by the worker after the remediation verification run finishes —
     * the run itself lives in AiAgentService, which doesn't own remediation
     * lifecycle state.
     */
    async recordReviewRemediationVerified(
        payload: AiAgentReviewRemediationRunJobPayload,
    ): Promise<void> {
        await this.aiAgentReviewClassifierModel.createRemediationEvent({
            remediationUuid: payload.remediationUuid,
            organizationUuid: payload.organizationUuid,
            event: {
                eventType: 'verification_completed',
                payload: { previewThreadUuid: payload.threadUuid },
            },
        });
    }

    /**
     * Self-rescheduling poll: checks the preview's compile job and only seeds
     * the verification thread once the explores exist — the verification agent
     * snapshots explores at run start, so prompting earlier produces a false
     * negative. Runs as short scheduler jobs (state lives in the job queue) so
     * no worker slot is held and a deploy mid-wait can't strand it.
     */
    async pollReviewRemediationCompile(
        payload: AiAgentReviewRemediationCompileJobPayload,
    ): Promise<void> {
        const {
            organizationUuid,
            remediationUuid,
            previewProjectUuid,
            compileJobUuid,
            startedAt,
            userUuid,
        } = payload;

        // Status guard must run before the timeout: a poll firing after the
        // remediation reached a terminal state must not overwrite that state.
        const remediation =
            await this.aiAgentReviewClassifierModel.getReviewRemediation({
                organizationUuid,
                remediationUuid,
            });
        if (!remediation || remediation.status !== 'pr_open') {
            return;
        }

        const failRemediation = (errorMessage: string) =>
            this.aiAgentReviewClassifierModel.updateReviewRemediationStatus({
                remediationUuid,
                organizationUuid,
                status: 'failed',
                errorMessage,
            });

        if (Date.now() - startedAt > PREVIEW_COMPILE_WAIT_TIMEOUT_MS) {
            await failRemediation('Preview project did not compile in time');
            return;
        }

        const job = await this.jobModel.get(compileJobUuid);
        switch (job.jobStatus) {
            case JobStatusType.DONE:
                await this.aiAgentReviewClassifierModel.createRemediationEvent({
                    remediationUuid,
                    organizationUuid,
                    event: {
                        eventType: 'preview_compiled',
                        payload: { previewProjectUuid },
                    },
                });
                await this.setReviewRemediationPreviewFromProject({
                    organizationUuid,
                    remediationUuid,
                    previewProjectUuid,
                    userUuid,
                });
                return;
            case JobStatusType.ERROR:
                await failRemediation('Preview project failed to compile');
                return;
            case JobStatusType.STARTED:
            case JobStatusType.RUNNING:
                await this.schedulerClient.aiAgentReviewRemediationCompile(
                    payload,
                    new Date(Date.now() + PREVIEW_COMPILE_POLL_INTERVAL_MS),
                );
                return;
            default:
                assertUnreachable(
                    job.jobStatus,
                    `Unknown job status for compile job ${compileJobUuid}`,
                );
        }
    }

    private static buildReviewVerificationPrompt(
        linkedPrUrl: string | null,
    ): string {
        return [
            `A fix for this project was just applied from a pull request${
                linkedPrUrl ? ` (${linkedPrUrl})` : ''
            }. The conversation where the original question went wrong is attached as context.`,
            '',
            "Re-run the user's original question end-to-end against this project. Then compare the outcome with the attached conversation and state clearly whether the issue is resolved. Point out anything that still looks wrong.",
            '',
            'Answer through the governed explores only — do not fall back to raw SQL against the warehouse for the comparison. If the explores cannot be queried, report that instead of computing the answer another way.',
        ].join('\n');
    }

    private async createReviewRemediationPreviewThread({
        remediation,
        organizationUuid,
        previewProjectUuid,
        previewAgentUuid,
        userUuid,
    }: {
        remediation: AiAgentReviewRemediation;
        organizationUuid: string;
        previewProjectUuid: string;
        previewAgentUuid: string;
        userUuid: string;
    }): Promise<string> {
        // Seed the thread with a verification prompt that pins the source
        // conversation as context — the agent re-runs the original question
        // against the fixed project and reports whether the issue is
        // resolved. Thread and prompt are created atomically; on failure the
        // whole creation is retried with the flagged prompt's text verbatim.
        const thread = {
            organizationUuid,
            projectUuid: previewProjectUuid,
            userUuid,
            createdFrom: 'web_app' as const,
            agentUuid: previewAgentUuid,
        };
        let threadUuid: string;
        try {
            ({ threadUuid } =
                await this.aiAgentModel.createWebAppThreadWithPrompt({
                    thread,
                    prompt: {
                        createdByUserUuid: userUuid,
                        prompt: AiAgentAdminService.buildReviewVerificationPrompt(
                            remediation.linkedPrUrl,
                        ),
                        context: [
                            {
                                type: 'thread',
                                threadUuid: remediation.sourceThreadUuid,
                                promptUuid: remediation.sourcePromptUuid,
                            },
                        ],
                    },
                }));
        } catch (error) {
            this.logger.warn(
                `Failed to seed review verification prompt, falling back to the flagged prompt text: ${getErrorMessage(
                    error,
                )}`,
            );
            if (!remediation.retryPrompt) {
                throw error;
            }
            ({ threadUuid } =
                await this.aiAgentModel.createWebAppThreadWithPrompt({
                    thread,
                    prompt: {
                        createdByUserUuid: userUuid,
                        prompt: remediation.retryPrompt,
                    },
                }));
        }

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                remediation.fingerprint,
            );
        await this.aiAgentModel.updateThreadTitle({
            threadUuid,
            title: `Review fix: ${reviewItem?.title ?? remediation.retryPrompt ?? remediation.fingerprint}`,
        });

        return threadUuid;
    }

    private async setReviewRemediationPreviewFromProject({
        organizationUuid,
        remediationUuid,
        previewProjectUuid,
        userUuid,
    }: {
        organizationUuid: string;
        remediationUuid: string;
        previewProjectUuid: string;
        userUuid: string;
    }): Promise<void> {
        const remediation =
            await this.aiAgentReviewClassifierModel.getReviewRemediation({
                organizationUuid,
                remediationUuid,
            });
        if (!remediation || remediation.status !== 'pr_open') {
            return;
        }

        const previewAgentUuid = await this.projectModel.getPreviewAiAgentUuid({
            projectUuid: remediation.sourceProjectUuid,
            previewProjectUuid,
            aiAgentUuid: remediation.sourceAgentUuid,
        });
        if (!previewAgentUuid) {
            await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                {
                    remediationUuid,
                    organizationUuid,
                    status: 'failed',
                    errorMessage: 'Preview did not copy the source AI agent',
                },
            );
            return;
        }

        let previewThreadUuid: string;
        try {
            previewThreadUuid = await this.createReviewRemediationPreviewThread(
                {
                    remediation,
                    organizationUuid,
                    previewProjectUuid,
                    previewAgentUuid,
                    userUuid,
                },
            );
        } catch (error) {
            this.logger.warn(
                `Failed to create review verification thread: ${getErrorMessage(
                    error,
                )}`,
            );
            return;
        }

        await this.aiAgentReviewClassifierModel.setReviewRemediationPreviewThread(
            {
                remediationUuid,
                organizationUuid,
                previewProjectUuid,
                previewAgentUuid,
                previewThreadUuid,
            },
        );

        await this.schedulerClient.aiAgentReviewRemediationRun({
            organizationUuid,
            projectUuid: previewProjectUuid,
            userUuid,
            fingerprint: remediation.fingerprint,
            remediationUuid,
            agentUuid: previewAgentUuid,
            threadUuid: previewThreadUuid,
        });
    }

    async pollReviewRemediationPreview(
        payload: AiAgentReviewRemediationPreviewJobPayload,
    ): Promise<void> {
        const {
            organizationUuid,
            remediationUuid,
            prUrl,
            startedAt,
            userUuid,
        } = payload;

        // Status guard must run before the timeout: a poll firing after the
        // remediation reached a terminal state (e.g. an admin marked it fixed)
        // must not overwrite that state.
        const remediation =
            await this.aiAgentReviewClassifierModel.getReviewRemediation({
                organizationUuid,
                remediationUuid,
            });
        if (!remediation || remediation.status !== 'pr_open') {
            return;
        }

        if (Date.now() - startedAt > REVIEW_PREVIEW_WAIT_TIMEOUT_MS) {
            await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                {
                    remediationUuid,
                    organizationUuid,
                    status: 'failed',
                    errorMessage: 'Preview URL was not published in time',
                },
            );
            return;
        }

        const previewUrl = await this.resolveReviewWritebackPreviewUrl(
            organizationUuid,
            prUrl,
        );
        if (!previewUrl) {
            await this.schedulerClient.aiAgentReviewRemediationPreview(
                payload,
                new Date(Date.now() + REVIEW_PREVIEW_POLL_INTERVAL_MS),
            );
            return;
        }

        const previewProjectUuid = extractPreviewProjectUuidFromUrl(
            previewUrl,
            this.lightdashConfig.siteUrl,
        );
        if (!previewProjectUuid) {
            await this.aiAgentReviewClassifierModel.updateReviewRemediationStatus(
                {
                    remediationUuid,
                    organizationUuid,
                    status: 'failed',
                    errorMessage:
                        'Preview URL did not contain a Lightdash project',
                },
            );
            return;
        }

        await this.setReviewRemediationPreviewFromProject({
            organizationUuid,
            remediationUuid,
            previewProjectUuid,
            userUuid,
        });
    }

    async failReviewItemWritebackJob(args: {
        fingerprint: string;
        organizationUuid: string;
        message: string;
    }): Promise<void> {
        await this.aiAgentReviewClassifierModel.failReviewItemWriteback(args);
    }

    async getReviewItemPrDiff(
        user: SessionUser,
        fingerprint: string,
    ): Promise<AiAgentReviewItemPrDiff> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem?.linkedPrUrl) {
            throw new NotFoundError(
                'No pull request is linked to this review item',
            );
        }
        const parsed = parsePullRequestUrl(reviewItem.linkedPrUrl);
        if (!parsed) {
            throw new NotFoundError(
                'The linked pull request is not a GitHub pull request',
            );
        }

        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                organizationUuid,
            );
        const diff = await getPullRequestDiffFiles({
            owner: parsed.owner,
            repo: parsed.repo,
            pullNumber: parsed.pullNumber,
            installationId,
        });

        return {
            prUrl: reviewItem.linkedPrUrl,
            ...diff,
        };
    }

    // Resolves the review item a preview work thread belongs to, so the
    // thread page can show the verification context without relying on
    // query params surviving navigation.
    async getReviewItemByPreviewThread(
        user: SessionUser,
        previewThreadUuid: string,
    ): Promise<AiAgentReviewItemSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const remediation =
            await this.aiAgentReviewClassifierModel.findReviewRemediationByPreviewThread(
                {
                    organizationUuid,
                    previewThreadUuid,
                },
            );
        if (!remediation) {
            throw new NotFoundError('No review item is linked to this thread');
        }

        return this.getReviewItem(user, remediation.fingerprint);
    }

    async getReviewItem(
        user: SessionUser,
        fingerprint: string,
    ): Promise<AiAgentReviewItemSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem) {
            throw new NotFoundError('Review item not found');
        }

        const [reviewsEnabled, projectContextEnabled] = await Promise.all([
            this.areReviewsEnabled(user),
            this.isProjectContextFeatureEnabled(user),
        ]);
        const projectAccessByUuid = await this.getProjectWritebackAccessByUuid(
            organizationUuid,
            reviewItem.projectUuid ? [reviewItem.projectUuid] : [],
        );
        const sourceThreadHasWritebackPr = reviewItem.latestFinding
            ? ((
                  await this.aiAgentReviewClassifierModel.getThreadWritebackPullRequests(
                      [reviewItem.latestFinding.threadUuid],
                  )
              ).get(reviewItem.latestFinding.threadUuid)?.length ?? 0) > 0
            : false;
        const writebackEligibility = getAiAgentReviewItemWritebackEligibility({
            item: reviewItem,
            reviewsEnabled,
            projectContextEnabled,
            projectAccess: reviewItem.projectUuid
                ? (projectAccessByUuid.get(reviewItem.projectUuid) ?? null)
                : null,
            hasSemanticWritebackConfig: this.hasSemanticWritebackConfig(),
            sourceThreadHasWritebackPr,
        });

        return {
            ...reviewItem,
            writebackEligible: writebackEligibility.eligible,
            writebackEligibility,
        };
    }

    /**
     * Compute the diff a writeback PR would make, without opening it. Only the
     * project_context strategy has a deterministic preview; semantic_layer runs
     * in a sandbox, so it returns `{ available: false }`.
     */
    async getReviewItemWritebackPreview(
        user: SessionUser,
        fingerprint: string,
    ): Promise<AiAgentReviewItemWritebackPreview> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem) {
            throw new NotFoundError('Review item not found');
        }
        const trackPreviewViewed = (
            available: boolean,
            strategy: AiAgentReviewItemWritebackStrategy | null,
        ) =>
            this.analytics.track({
                event: 'ai_agent_review_item.writeback_preview_viewed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: reviewItem.projectUuid,
                    fingerprint,
                    rootCause: reviewItem.primaryRootCause,
                    available,
                    strategy,
                },
            });

        if (reviewItem.projectUuid === null) {
            trackPreviewViewed(false, null);
            return { available: false };
        }

        let plan: ReturnType<typeof planReviewWriteback>;
        try {
            plan = planReviewWriteback(reviewItem);
        } catch {
            trackPreviewViewed(false, null);
            return { available: false };
        }
        if (plan.strategy !== 'project_context') {
            trackPreviewViewed(false, toReviewWritebackStrategy(plan.strategy));
            return { available: false };
        }

        const preview = await this.projectContextService.previewWriteback({
            projectUuid: reviewItem.projectUuid,
            entry: plan.entry,
        });
        trackPreviewViewed(true, toReviewWritebackStrategy(plan.strategy));
        return { available: true, ...preview };
    }

    /**
     * Generate an embed token for the analytics dashboard
     * Only accessible by organization admins
     *
     * Security considerations:
     * - Only uses authenticated user's organization UUID (no client-controlled filtering)
     * - Token includes user email and a unique external ID for audit trails
     * - Token expires after 1 hour to limit exposure
     * - TODO: Add rate limiting to prevent token generation abuse
     * - TODO: Consider caching tokens to reduce generation overhead
     *
     * @param user - The authenticated session user (must be org admin)
     * @returns JWT token and embed URL for the analytics dashboard
     */
    async generateEmbedToken(
        user: SessionUser,
    ): Promise<{ token: string; url: string }> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(user);

        const { analyticsEmbedSecret } = this.lightdashConfig;

        if (!analyticsEmbedSecret) {
            throw new Error('ANALYTICS_EMBED_SECRET is not configured');
        }

        const projectUuid = this.lightdashConfig.ai?.analyticsProjectUuid;
        const dashboardUuid = this.lightdashConfig.ai?.analyticsDashboardUuid;

        if (!projectUuid || !dashboardUuid) {
            throw new Error(
                'AI agent analytics dashboard configuration is missing. Please configure AI_ANALYTICS_PROJECT_UUID and AI_ANALYTICS_DASHBOARD_UUID',
            );
        }

        const userAttributes: Record<string, string> = {
            lightdash_embed_ai_agents_organization_uuid: organizationUuid,
        };

        const data = {
            content: {
                type: 'dashboard',
                projectUuid,
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: 'none',
                    allowedFilters: undefined,
                },
                canExportCsv: false,
                canExportImages: false,
                canExportPagePdf: false,
                canDateZoom: false,
                canExplore: false,
                canViewUnderlyingData: false,
            },
            user: {
                externalId: `org_${organizationUuid}_user_${user.userUuid}`,
                email: user.email,
            },
            userAttributes,
        };

        const token = jwt.sign(data, analyticsEmbedSecret, {
            expiresIn: '1 hour',
        });

        const baseUrl = `https://analytics.lightdash.cloud/embed/${projectUuid}`;
        const url = new URL(`${baseUrl}#${token}`);

        return {
            token,
            url: url.href,
        };
    }
}
