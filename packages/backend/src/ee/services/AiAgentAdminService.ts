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
    UpdateAiAgentReviewItemStatus,
    type SessionUser,
} from '@lightdash/common';
import jwt from 'jsonwebtoken';
import {
    getInstallationToken,
    getPullRequest,
} from '../../clients/github/Github';
import { type LightdashConfig } from '../../config/parseConfig';
import { type GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
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

type AiAgentAdminServiceDependencies = {
    aiAgentModel: AiAgentModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    featureFlagService: FeatureFlagService;
    projectModel: ProjectModel;
    aiWritebackService: AiWritebackService;
    githubAppInstallationsModel: GithubAppInstallationsModel;
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
    private readonly aiAgentModel: AiAgentModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly projectModel: ProjectModel;

    private readonly aiWritebackService: AiWritebackService;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly userModel: UserModel;

    constructor(dependencies: AiAgentAdminServiceDependencies) {
        super();
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiAgentReviewClassifierModel =
            dependencies.aiAgentReviewClassifierModel;
        this.featureFlagService = dependencies.featureFlagService;
        this.projectModel = dependencies.projectModel;
        this.aiWritebackService = dependencies.aiWritebackService;
        this.githubAppInstallationsModel =
            dependencies.githubAppInstallationsModel;
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

        const overrides = await this.reconcileLinkedPullRequests(
            organizationUuid,
            items,
        );

        const writebackEnabled = await this.isWritebackFeatureEnabled(user);
        const githubProjects = writebackEnabled
            ? await this.getGithubProjectUuids(
                  items
                      .filter(
                          (item) =>
                              item.primaryRootCause === 'semantic_layer' &&
                              item.projectUuid !== null,
                      )
                      .map((item) => item.projectUuid as string),
              )
            : new Set<string>();

        const now = Date.now();
        const reconciled = items.map((item) => {
            const override = overrides.get(item.fingerprint);
            const writebackEligible =
                writebackEnabled &&
                item.primaryRootCause === 'semantic_layer' &&
                item.projectUuid !== null &&
                githubProjects.has(item.projectUuid);
            return withStaleWritebackOverride(
                { ...item, ...(override ?? {}), writebackEligible },
                now,
            );
        });

        if (statuses) {
            return reconciled.filter((item) => statuses.includes(item.status));
        }
        return reconciled;
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
        const [classifier, engine] = await Promise.all([
            this.featureFlagService.get({
                featureFlagId: FeatureFlags.AiAgentReviewClassifier,
                user: flagUser,
            }),
            this.featureFlagService.get({
                featureFlagId: FeatureFlags.AiWriteback,
                user: flagUser,
            }),
        ]);
        return classifier.enabled && engine.enabled;
    }

    private async getGithubProjectUuids(
        projectUuids: string[],
    ): Promise<Set<string>> {
        const distinct = [...new Set(projectUuids)];
        const results = await Promise.all(
            distinct.map(async (projectUuid) => {
                try {
                    const project = await this.projectModel.get(projectUuid);
                    return project.dbtConnection.type === DbtProjectType.GITHUB
                        ? projectUuid
                        : null;
                } catch {
                    return null;
                }
            }),
        );
        return new Set(results.filter((uuid): uuid is string => uuid !== null));
    }

    /**
     * For items with an open linked PR, fetch the live GitHub state and return
     * the overrides to fold back in: merged → resolved, closed-unmerged →
     * re-opened. Best effort — a GitHub failure for one item is skipped.
     */
    private async reconcileLinkedPullRequests(
        organizationUuid: string,
        items: AiAgentReviewItemSummary[],
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
        return reviewItem;
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

        const engineFlag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiWriteback,
            user: {
                userUuid: user.userUuid,
                organizationUuid,
                organizationName: user.organizationName ?? '',
            },
        });
        if (!engineFlag.enabled) {
            throw new ForbiddenError('AI writeback is not enabled');
        }

        // Fail fast at the click rather than queue → run → fail on the worker.
        if (!this.lightdashConfig.appRuntime.e2bApiKey) {
            throw new MissingConfigError(
                'E2B API key is not configured (E2B_API_KEY)',
            );
        }
        if (!this.lightdashConfig.aiWriteback.anthropicApiKey) {
            throw new MissingConfigError(
                'Anthropic API key is not configured (AI_WRITEBACK_ANTHROPIC_API_KEY)',
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
        if (reviewItem.primaryRootCause !== 'semantic_layer') {
            throw new ParameterError(
                'Writeback is only supported for semantic-layer review items',
            );
        }
        if (reviewItem.linkedPrUrl && reviewItem.prState === 'open') {
            throw new ParameterError(
                'A pull request is already open for this review item',
            );
        }
        const writebackInFlight =
            reviewItem.prWritebackStatus === 'queued' ||
            reviewItem.prWritebackStatus === 'running';
        if (writebackInFlight && !isWritebackStale(reviewItem, Date.now())) {
            throw new ParameterError(
                'A writeback is already in progress for this review item',
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

        const project = await this.projectModel.get(scope.projectUuid);
        if (project.dbtConnection.type !== DbtProjectType.GITHUB) {
            throw new ParameterError(
                'Writeback requires a GitHub-connected dbt project',
            );
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

        const updated = await this.aiAgentReviewClassifierModel.getReviewItem(
            organizationUuid,
            fingerprint,
        );
        return updated ?? reviewItem;
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
            const result = await this.aiWritebackService.run({
                user,
                projectUuid,
                prompt: plan.promptText,
                onProgress: (message) => {
                    void setProgress(message);
                },
            });

            if (result.prUrl) {
                await this.aiAgentReviewClassifierModel.setReviewItemPrLink({
                    fingerprint,
                    organizationUuid,
                    projectUuid,
                    agentUuid,
                    linkedPrUrl: result.prUrl,
                    prState: 'open',
                });
                await setTerminal('completed', 'Opened pull request');
            } else {
                await setTerminal(
                    'completed',
                    'Writeback ran — no changes were needed',
                );
            }
        } catch (error) {
            await setTerminal('failed', getErrorMessage(error));
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

        const writebackEnabled = await this.isWritebackFeatureEnabled(user);
        const writebackEligible =
            writebackEnabled &&
            reviewItem.primaryRootCause === 'semantic_layer' &&
            reviewItem.projectUuid !== null &&
            (await this.getGithubProjectUuids([reviewItem.projectUuid])).has(
                reviewItem.projectUuid,
            );
        return withStaleWritebackOverride(
            { ...reviewItem, writebackEligible },
            Date.now(),
        );
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
