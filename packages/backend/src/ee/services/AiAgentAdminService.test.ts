import { Ability } from '@casl/ability';
import {
    AiAgentReviewRemediation,
    OrganizationMemberRole,
    PullRequestProvider,
    type AiAgentReviewItemSummary,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { getPullRequestComments } from '../../clients/github/Github';
import {
    AiAgentAdminService,
    getAiAgentReviewItemWritebackEligibility,
} from './AiAgentAdminService';

jest.mock('../../clients/github/Github', () => ({
    getInstallationToken: jest.fn(),
    getPullRequest: jest.fn(),
    getPullRequestComments: jest.fn(),
}));

const NOW = new Date('2026-06-08T10:00:00.000Z');
const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const AGENT_UUID = '00000000-0000-0000-0000-000000000003';
const USER_UUID = '00000000-0000-0000-0000-000000000004';
const REMEDIATION_UUID = '00000000-0000-0000-0000-000000000005';
const THREAD_UUID = '00000000-0000-0000-0000-000000000006';
const PROMPT_UUID = '00000000-0000-0000-0000-000000000007';
const PREVIEW_PROJECT_UUID = '00000000-0000-0000-0000-000000000008';
const PREVIEW_AGENT_UUID = '00000000-0000-0000-0000-000000000009';
const PREVIEW_THREAD_UUID = '00000000-0000-0000-0000-000000000010';
const SITE_URL = 'https://app.lightdash.cloud';

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary => ({
    uuid: 'fingerprint-1',
    fingerprint: 'fingerprint-1',
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    title: 'Missing metric',
    description: 'The agent could not answer because a metric was missing.',
    primaryRootCause: 'semantic_layer',
    status: 'open',
    dismissedReason: null,
    ownerType: 'semantic_layer_owner',
    assignedToUserUuid: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    findingCount: 1,
    statusUpdatedAt: NOW,
    statusUpdatedByUserUuid: null,
    linkedIssueUrl: null,
    linkedPrUrl: null,
    prState: null,
    prWritebackStatus: null,
    prWritebackMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    writebackEligible: false,
    writebackEligibility: {
        eligible: false,
        reason: 'reviews_disabled',
        provider: null,
        strategy: null,
    },
    remediation: null,
    latestFinding: null,
    ...overrides,
});

const makeRemediation = (
    overrides: Partial<AiAgentReviewRemediation> = {},
): AiAgentReviewRemediation => ({
    uuid: REMEDIATION_UUID,
    fingerprint: 'fingerprint-1',
    organizationUuid: ORGANIZATION_UUID,
    sourceFindingUuid: 'finding-1',
    sourcePromptUuid: PROMPT_UUID,
    sourceThreadUuid: THREAD_UUID,
    sourceProjectUuid: PROJECT_UUID,
    sourceAgentUuid: AGENT_UUID,
    pullRequestUuid: 'pull-request-1',
    linkedPrUrl: 'https://github.com/acme/dbt/pull/42',
    previewProjectUuid: null,
    previewAgentUuid: null,
    previewThreadUuid: null,
    status: 'pr_open',
    errorMessage: null,
    retryPrompt: 'Show revenue',
    createdByUserUuid: USER_UUID,
    resolvedByUserUuid: null,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
});

const makeAdminUser = (): SessionUser => ({
    userUuid: USER_UUID,
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Acme',
    organizationCreatedAt: NOW,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    timezone: null,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Organization' },
    ]),
    abilityRules: [],
});

const makeService = ({
    aiAgentModel = {},
    aiAgentReviewClassifierModel = {},
    featureFlagService = {},
    aiOrganizationSettingsService = {},
    projectModel = {},
    schedulerClient = {},
    githubAppInstallationsModel = {},
    gitlabAppInstallationsModel = {},
}: {
    aiAgentModel?: Record<string, unknown>;
    aiAgentReviewClassifierModel?: Record<string, unknown>;
    featureFlagService?: Record<string, unknown>;
    aiOrganizationSettingsService?: Record<string, unknown>;
    projectModel?: Record<string, unknown>;
    schedulerClient?: Record<string, unknown>;
    githubAppInstallationsModel?: Record<string, unknown>;
    gitlabAppInstallationsModel?: Record<string, unknown>;
} = {}) =>
    new AiAgentAdminService({
        analytics: { track: jest.fn() },
        aiAgentModel: {
            createWebAppThread: jest
                .fn()
                .mockResolvedValue(PREVIEW_THREAD_UUID),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
            ...aiAgentModel,
        },
        aiAgentReviewClassifierModel: {
            getReviewRemediation: jest
                .fn()
                .mockResolvedValue(makeRemediation()),
            getReviewItem: jest
                .fn()
                .mockResolvedValue(makeReviewItem({ title: 'Review revenue' })),
            setReviewRemediationPreviewThread: jest
                .fn()
                .mockResolvedValue(undefined),
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
            ...aiAgentReviewClassifierModel,
        },
        featureFlagService: {
            get: jest.fn().mockResolvedValue({ enabled: true }),
            ...featureFlagService,
        },
        aiOrganizationSettingsService: {
            isAiAgentReviewsEnabled: jest.fn().mockResolvedValue(true),
            ...aiOrganizationSettingsService,
        },
        projectModel: {
            get: jest.fn().mockRejectedValue(new Error('Project not found')),
            getPreviewAiAgentUuid: jest
                .fn()
                .mockResolvedValue(PREVIEW_AGENT_UUID),
            ...projectModel,
        },
        aiWritebackService: {},
        projectContextService: {},
        pullRequestsModel: {},
        githubAppInstallationsModel: {
            getInstallationId: jest.fn().mockResolvedValue('installation-1'),
            findInstallationId: jest.fn().mockResolvedValue(undefined),
            ...githubAppInstallationsModel,
        },
        gitlabAppInstallationsModel: {
            findInstallationId: jest.fn().mockResolvedValue(undefined),
            ...gitlabAppInstallationsModel,
        },
        schedulerClient: {
            aiAgentReviewRemediationPreview: jest
                .fn()
                .mockResolvedValue(undefined),
            ...schedulerClient,
        },
        userModel: {},
        lightdashConfig: {
            siteUrl: SITE_URL,
            appRuntime: { e2bApiKey: 'e2b-api-key' },
            aiWriteback: { anthropicApiKey: 'anthropic-api-key' },
        },
    } as unknown as ConstructorParameters<typeof AiAgentAdminService>[0]);

describe('getAiAgentReviewItemWritebackEligibility', () => {
    it('allows semantic layer writeback on GitHub when configured', () => {
        expect(
            getAiAgentReviewItemWritebackEligibility({
                item: makeReviewItem(),
                reviewsEnabled: true,
                projectContextEnabled: false,
                projectAccess: {
                    provider: PullRequestProvider.GITHUB,
                    hasGitAppInstallation: true,
                },
                hasSemanticWritebackConfig: true,
            }),
        ).toEqual({
            eligible: true,
            provider: PullRequestProvider.GITHUB,
            strategy: 'semantic_layer',
            reason: null,
        });
    });

    it('allows semantic layer writeback on GitLab when configured', () => {
        expect(
            getAiAgentReviewItemWritebackEligibility({
                item: makeReviewItem(),
                reviewsEnabled: true,
                projectContextEnabled: false,
                projectAccess: {
                    provider: PullRequestProvider.GITLAB,
                    hasGitAppInstallation: true,
                },
                hasSemanticWritebackConfig: true,
            }),
        ).toEqual({
            eligible: true,
            provider: PullRequestProvider.GITLAB,
            strategy: 'semantic_layer',
            reason: null,
        });
    });

    it('blocks project context writeback for GitLab projects', () => {
        expect(
            getAiAgentReviewItemWritebackEligibility({
                item: makeReviewItem({
                    primaryRootCause: 'project_context',
                    latestFinding: {
                        uuid: 'finding-1',
                        promptUuid: 'prompt-1',
                        threadUuid: 'thread-1',
                        projectUuid: 'project-1',
                        agentUuid: 'agent-1',
                        subcategories: [],
                        fixTargets: ['project_context_rule'],
                        targetRefs: [],
                        evidenceExcerpts: [],
                        recommendation: null,
                        projectContextEntry: {
                            op: 'create',
                            id: null,
                            kind: 'context',
                            content: 'Use orders for revenue questions.',
                            terms: ['revenue'],
                            objects: ['orders'],
                        },
                        createdAt: NOW,
                    },
                }),
                reviewsEnabled: true,
                projectContextEnabled: true,
                projectAccess: {
                    provider: PullRequestProvider.GITLAB,
                    hasGitAppInstallation: true,
                },
                hasSemanticWritebackConfig: false,
            }),
        ).toEqual({
            eligible: false,
            provider: PullRequestProvider.GITLAB,
            strategy: 'project_context',
            reason: 'unsupported_source_control',
        });
    });

    it('returns a reason when semantic writeback config is missing', () => {
        expect(
            getAiAgentReviewItemWritebackEligibility({
                item: makeReviewItem(),
                reviewsEnabled: true,
                projectContextEnabled: false,
                projectAccess: {
                    provider: PullRequestProvider.GITHUB,
                    hasGitAppInstallation: true,
                },
                hasSemanticWritebackConfig: false,
            }),
        ).toEqual({
            eligible: false,
            provider: PullRequestProvider.GITHUB,
            strategy: 'semantic_layer',
            reason: 'missing_writeback_config',
        });
    });

    it('blocks writeback when an active remediation exists', () => {
        expect(
            getAiAgentReviewItemWritebackEligibility({
                item: makeReviewItem({
                    remediation: {
                        uuid: 'remediation-1',
                        fingerprint: 'fingerprint-1',
                        organizationUuid: 'org-1',
                        sourceFindingUuid: 'finding-1',
                        sourcePromptUuid: 'prompt-1',
                        sourceThreadUuid: 'thread-1',
                        sourceProjectUuid: 'project-1',
                        sourceAgentUuid: 'agent-1',
                        pullRequestUuid: null,
                        linkedPrUrl: null,
                        previewProjectUuid: null,
                        previewAgentUuid: null,
                        previewThreadUuid: null,
                        status: 'pr_open',
                        errorMessage: null,
                        retryPrompt: 'Show revenue',
                        createdByUserUuid: null,
                        resolvedByUserUuid: null,
                        resolvedAt: null,
                        createdAt: NOW,
                        updatedAt: NOW,
                    },
                }),
                reviewsEnabled: true,
                projectContextEnabled: false,
                projectAccess: {
                    provider: PullRequestProvider.GITHUB,
                    hasGitAppInstallation: true,
                },
                hasSemanticWritebackConfig: true,
            }),
        ).toEqual({
            eligible: false,
            provider: null,
            strategy: null,
            reason: 'writeback_in_progress',
        });
    });
});

describe('AiAgentAdminService.updateReviewItemStatus', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('resolves the linked remediation when the review item is resolved', async () => {
        const resolvedReviewItem = makeReviewItem({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            status: 'resolved',
            remediation: makeRemediation({ status: 'pr_open' }),
        });
        const aiAgentReviewClassifierModel = {
            getPromotedFingerprintScope: jest.fn().mockResolvedValue({
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
            }),
            getReviewItem: jest
                .fn()
                .mockResolvedValueOnce(
                    makeReviewItem({
                        organizationUuid: ORGANIZATION_UUID,
                        projectUuid: PROJECT_UUID,
                        agentUuid: AGENT_UUID,
                        status: 'open',
                    }),
                )
                .mockResolvedValue(resolvedReviewItem),
            upsertReviewItemState: jest.fn().mockResolvedValue(undefined),
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        await service.updateReviewItemStatus(makeAdminUser(), 'fingerprint-1', {
            status: 'resolved',
            dismissedReason: null,
        });

        expect(
            aiAgentReviewClassifierModel.updateReviewRemediationStatus,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            status: 'resolved',
            resolvedByUserUuid: USER_UUID,
        });
    });
});

describe('AiAgentAdminService.pollReviewRemediationPreview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates a preview work thread and links it to the remediation', async () => {
        const aiAgentModel = {
            createWebAppThread: jest
                .fn()
                .mockResolvedValue(PREVIEW_THREAD_UUID),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
        };
        const aiAgentReviewClassifierModel = {
            getReviewRemediation: jest
                .fn()
                .mockResolvedValue(makeRemediation()),
            getReviewItem: jest
                .fn()
                .mockResolvedValue(makeReviewItem({ title: 'Review revenue' })),
            setReviewRemediationPreviewThread: jest
                .fn()
                .mockResolvedValue(undefined),
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const projectModel = {
            getPreviewAiAgentUuid: jest
                .fn()
                .mockResolvedValue(PREVIEW_AGENT_UUID),
        };
        const service = makeService({
            aiAgentModel,
            aiAgentReviewClassifierModel,
            projectModel,
        });
        (getPullRequestComments as jest.Mock).mockResolvedValue([
            `Preview ready: ${SITE_URL}/projects/${PREVIEW_PROJECT_UUID}/tables`,
        ]);

        await service.pollReviewRemediationPreview({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            userUuid: USER_UUID,
            fingerprint: 'fingerprint-1',
            remediationUuid: REMEDIATION_UUID,
            prUrl: 'https://github.com/acme/dbt/pull/42',
            startedAt: Date.now(),
        });

        expect(projectModel.getPreviewAiAgentUuid).toHaveBeenCalledWith({
            projectUuid: PROJECT_UUID,
            previewProjectUuid: PREVIEW_PROJECT_UUID,
            aiAgentUuid: AGENT_UUID,
        });
        expect(aiAgentModel.createWebAppThread).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PREVIEW_PROJECT_UUID,
            userUuid: USER_UUID,
            createdFrom: 'web_app',
            agentUuid: PREVIEW_AGENT_UUID,
        });
        expect(aiAgentModel.updateThreadTitle).toHaveBeenCalledWith({
            threadUuid: PREVIEW_THREAD_UUID,
            title: 'Review fix: Review revenue',
        });
        expect(
            aiAgentReviewClassifierModel.setReviewRemediationPreviewThread,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            previewProjectUuid: PREVIEW_PROJECT_UUID,
            previewAgentUuid: PREVIEW_AGENT_UUID,
            previewThreadUuid: PREVIEW_THREAD_UUID,
        });
    });

    it('marks remediation failed when no preview URL is published in time', async () => {
        const aiAgentReviewClassifierModel = {
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const schedulerClient = {
            aiAgentReviewRemediationPreview: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({
            aiAgentReviewClassifierModel,
            schedulerClient,
        });

        await service.pollReviewRemediationPreview({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            userUuid: USER_UUID,
            fingerprint: 'fingerprint-1',
            remediationUuid: REMEDIATION_UUID,
            prUrl: 'https://github.com/acme/dbt/pull/42',
            startedAt: Date.now() - 11 * 60_000,
        });

        expect(
            aiAgentReviewClassifierModel.updateReviewRemediationStatus,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            status: 'failed',
            errorMessage: 'Preview URL was not published in time',
        });
        expect(
            schedulerClient.aiAgentReviewRemediationPreview,
        ).not.toHaveBeenCalled();
    });
});
