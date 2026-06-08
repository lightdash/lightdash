import { subject } from '@casl/ability';
import {
    AiAgentAdminConversationsSummary,
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentReviewItemStatus,
    AiAgentReviewItemSummary,
    AiAgentReviewSignalSummary,
    AiAgentReviewWritebackJobPayload,
    AiAgentSummary,
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    KnexPaginateArgs,
    KnexPaginatedData,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    UpdateAiAgentReviewItemStatus,
    type AiAgentReviewItemWritebackBlockedReason,
    type AiAgentReviewItemWritebackEligibility,
    type AiAgentReviewItemWritebackPreview,
    type AiAgentReviewItemWritebackStrategy,
    type SessionUser,
} from '@lightdash/common';
import jwt from 'jsonwebtoken';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    getInstallationToken,
    getPullRequest,
} from '../../clients/github/Github';
import { type LightdashConfig } from '../../config/parseConfig';
import { type GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { type GitlabAppInstallationsModel } from '../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type PullRequestsModel } from '../../models/PullRequestsModel';
import { type UserModel } from '../../models/UserModel';
import { BaseService } from '../../services/BaseService';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { AiAgentModel } from '../models/AiAgentModel';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { type CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import {
    buildYmlPathByModel,
    planReviewWriteback,
} from './ai/reviewWriteback/buildReviewWritebackPrompt';
import { type AiWritebackService } from './AiWritebackService/AiWritebackService';
import { type ProjectContextService } from './ProjectContextService/ProjectContextService';

type AiAgentAdminServiceDependencies = {
    analytics: LightdashAnalytics;
    aiAgentModel: AiAgentModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    featureFlagService: FeatureFlagService;
    projectModel: ProjectModel;
    aiWritebackService: AiWritebackService;
    projectContextService: ProjectContextService;
    pullRequestsModel: PullRequestsModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    gitlabAppInstallationsModel: GitlabAppInstallationsModel;
    schedulerClient: CommercialSchedulerClient;
    userModel: UserModel;
    lightdashConfig: LightdashConfig;
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

// Longer than the worker's 30-min job timeout — past this, a queued/running writeback has lost its worker and is treated as failed so the UI recovers and retries.
const WRITEBACK_STALE_MS = 35 * 60 * 1000;

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
}): AiAgentReviewItemWritebackEligibility => {
    const {
        item,
        reviewsEnabled,
        projectContextEnabled,
        projectAccess,
        hasSemanticWritebackConfig,
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
        item.prWritebackStatus === 'queued' ||
        item.prWritebackStatus === 'running'
    ) {
        return unavailableWritebackEligibility('writeback_in_progress');
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

const isWritebackStale = (
    item: AiAgentReviewItemSummary,
    now: number,
): boolean =>
    (item.prWritebackStatus === 'queued' ||
        item.prWritebackStatus === 'running') &&
    now - new Date(item.updatedAt).getTime() > WRITEBACK_STALE_MS;

const withStaleWritebackOverride = (
    item: AiAgentReviewItemSummary,
    now: number,
): AiAgentReviewItemSummary =>
    isWritebackStale(item, now)
        ? {
              ...item,
              prWritebackStatus: 'failed',
              prWritebackMessage: 'Writeback timed out',
          }
        : item;

export class AiAgentAdminService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiAgentModel: AiAgentModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly projectModel: ProjectModel;

    private readonly aiWritebackService: AiWritebackService;

    private readonly projectContextService: ProjectContextService;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly gitlabAppInstallationsModel: GitlabAppInstallationsModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly userModel: UserModel;

    constructor(dependencies: AiAgentAdminServiceDependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiAgentReviewClassifierModel =
            dependencies.aiAgentReviewClassifierModel;
        this.featureFlagService = dependencies.featureFlagService;
        this.projectModel = dependencies.projectModel;
        this.aiWritebackService = dependencies.aiWritebackService;
        this.projectContextService = dependencies.projectContextService;
        this.pullRequestsModel = dependencies.pullRequestsModel;
        this.githubAppInstallationsModel =
            dependencies.githubAppInstallationsModel;
        this.gitlabAppInstallationsModel =
            dependencies.gitlabAppInstallationsModel;
        this.schedulerClient = dependencies.schedulerClient;
        this.userModel = dependencies.userModel;
        this.lightdashConfig = dependencies.lightdashConfig;
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

        const featureFlag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiAgentReviewClassifier,
            user: {
                userUuid: user.userUuid,
                organizationUuid,
                organizationName: user.organizationName ?? '',
            },
        });

        if (!featureFlag.enabled) {
            throw new ForbiddenError(
                'AI agent review classifier is not enabled',
            );
        }

        const items = await this.aiAgentReviewClassifierModel.listReviewItems({
            organizationUuid,
            statuses,
        });

        const [reviewsEnabled, projectContextEnabled] = await Promise.all([
            this.isWritebackFeatureEnabled(user),
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

        const now = Date.now();
        const reconciled = items.map((item) => {
            const override = overrides.get(item.fingerprint);
            const staleAwareItem = withStaleWritebackOverride(
                { ...item, ...(override ?? {}) },
                now,
            );
            const writebackEligibility =
                getAiAgentReviewItemWritebackEligibility({
                    item: staleAwareItem,
                    reviewsEnabled,
                    projectContextEnabled,
                    projectAccess: staleAwareItem.projectUuid
                        ? (projectAccessByUuid.get(
                              staleAwareItem.projectUuid,
                          ) ?? null)
                        : null,
                    hasSemanticWritebackConfig:
                        this.hasSemanticWritebackConfig(),
                });

            return {
                ...staleAwareItem,
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

    private async isWritebackFeatureEnabled(
        user: SessionUser,
    ): Promise<boolean> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            return false;
        }
        const flagUser = {
            userUuid: user.userUuid,
            organizationUuid,
            organizationName: user.organizationName ?? '',
        };
        const classifier = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiAgentReviewClassifier,
            user: flagUser,
        });
        return classifier.enabled;
    }

    private async isProjectContextFeatureEnabled(
        user: SessionUser,
    ): Promise<boolean> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            return false;
        }
        const flag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiProjectContext,
            user: {
                userUuid: user.userUuid,
                organizationUuid,
                organizationName: user.organizationName ?? '',
            },
        });
        return flag.enabled;
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

        const featureFlag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiAgentReviewClassifier,
            user: {
                userUuid: user.userUuid,
                organizationUuid,
                organizationName: user.organizationName ?? '',
            },
        });

        if (!featureFlag.enabled) {
            throw new ForbiddenError(
                'AI agent review classifier is not enabled',
            );
        }

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

        const featureFlag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiAgentReviewClassifier,
            user: {
                userUuid: user.userUuid,
                organizationUuid,
                organizationName: user.organizationName ?? '',
            },
        });
        if (!featureFlag.enabled) {
            throw new ForbiddenError(
                'AI agent review classifier is not enabled',
            );
        }

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
                    previousStatus: previousReviewItem?.status ?? 'open',
                    newStatus: update.status,
                },
            });
        }
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

        const featureFlag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiAgentReviewClassifier,
            user: {
                userUuid: user.userUuid,
                organizationUuid,
                organizationName: user.organizationName ?? '',
            },
        });
        if (!featureFlag.enabled) {
            throw new ForbiddenError(
                'AI agent review classifier is not enabled',
            );
        }

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                organizationUuid,
                fingerprint,
            );
        if (!reviewItem) {
            throw new NotFoundError('Review item not found');
        }
        const projectContextEnabled =
            reviewItem.primaryRootCause === 'project_context'
                ? await this.isProjectContextFeatureEnabled(user)
                : false;
        const staleAwareItem = withStaleWritebackOverride(
            reviewItem,
            Date.now(),
        );
        const projectAccessByUuid = await this.getProjectWritebackAccessByUuid(
            organizationUuid,
            staleAwareItem.projectUuid ? [staleAwareItem.projectUuid] : [],
        );
        const writebackEligibility = getAiAgentReviewItemWritebackEligibility({
            item: staleAwareItem,
            reviewsEnabled: true,
            projectContextEnabled,
            projectAccess: staleAwareItem.projectUuid
                ? (projectAccessByUuid.get(staleAwareItem.projectUuid) ?? null)
                : null,
            hasSemanticWritebackConfig: this.hasSemanticWritebackConfig(),
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
        const { fingerprint, organizationUuid, projectUuid, userUuid } =
            payload;

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
            return;
        }
        const { agentUuid } = scope;

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
                await this.pullRequestsModel.findOrCreate({
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
                const result = await this.aiWritebackService.run({
                    user,
                    projectUuid,
                    prompt: plan.promptText,
                    source: 'admin_review',
                    onProgress: (message) => {
                        void setProgress(message);
                    },
                });
                prUrl = result.prUrl;
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
                await setTerminal('completed', 'Opened pull request');
            } else {
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

    async failReviewItemWritebackJob(args: {
        fingerprint: string;
        organizationUuid: string;
        message: string;
    }): Promise<void> {
        await this.aiAgentReviewClassifierModel.failReviewItemWriteback(args);
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
            this.isWritebackFeatureEnabled(user),
            this.isProjectContextFeatureEnabled(user),
        ]);
        const projectAccessByUuid = await this.getProjectWritebackAccessByUuid(
            organizationUuid,
            reviewItem.projectUuid ? [reviewItem.projectUuid] : [],
        );
        const staleAwareItem = withStaleWritebackOverride(
            reviewItem,
            Date.now(),
        );
        const writebackEligibility = getAiAgentReviewItemWritebackEligibility({
            item: staleAwareItem,
            reviewsEnabled,
            projectContextEnabled,
            projectAccess: staleAwareItem.projectUuid
                ? (projectAccessByUuid.get(staleAwareItem.projectUuid) ?? null)
                : null,
            hasSemanticWritebackConfig: this.hasSemanticWritebackConfig(),
        });

        return {
            ...staleAwareItem,
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
