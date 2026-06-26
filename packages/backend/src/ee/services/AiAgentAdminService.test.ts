import { Ability } from '@casl/ability';
import {
    AiAgentReviewRemediation,
    JobStatusType,
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
const OTHER_PROJECT_UUID = '00000000-0000-0000-0000-000000000099';
const PREVIEW_THREAD_UUID = '00000000-0000-0000-0000-000000000010';
const COMPILE_JOB_UUID = '00000000-0000-0000-0000-000000000011';
const WORK_THREAD_UUID = '00000000-0000-0000-0000-000000000012';
const SITE_URL = 'https://app.lightdash.cloud';
const PR_URL = 'https://github.com/acme/dbt/pull/42';

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
    boardPosition: null,
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
    workThreadUuid: WORK_THREAD_UUID,
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
        {
            action: 'manage',
            subject: 'AiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
        {
            action: 'manage',
            subject: 'OrganizationAiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
    ]),
    abilityRules: [],
});

const makeDeveloperUser = (): SessionUser => ({
    ...makeAdminUser(),
    role: OrganizationMemberRole.DEVELOPER,
    ability: new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'AiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
        {
            action: 'manage',
            subject: 'OrganizationAiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
    ]),
});

// Project-scoped AI admin: org member, no org-level OrganizationAiAgent, only
// project-level manage:AiAgent on PROJECT_UUID. Should see only that project's
// resources. (manage implies view in CASL.)
const makeProjectUser = (): SessionUser => ({
    ...makeAdminUser(),
    role: OrganizationMemberRole.MEMBER,
    ability: new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'AiAgent',
            conditions: {
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
            },
        },
    ]),
});

// Org interactive_viewer-like principal: holds org-wide VIEW of AiAgent and
// OrganizationAiAgent but no MANAGE anywhere. Must NOT receive org-wide admin
// reads (regression guard against the view-gated widening).
const makeOrgViewerUser = (): SessionUser => ({
    ...makeAdminUser(),
    role: OrganizationMemberRole.MEMBER,
    ability: new Ability<PossibleAbilities>([
        {
            action: 'view',
            subject: 'AiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
        {
            action: 'view',
            subject: 'OrganizationAiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
    ]),
});

const makeService = ({
    aiAgentModel = {},
    aiAgentReviewClassifierModel = {},
    aiAgentReviewNotificationModel = {},
    aiOrganizationSettingsService = {},
    projectModel = {},
    projectService = {},
    schedulerClient = {},
    githubAppInstallationsModel = {},
    gitlabAppInstallationsModel = {},
    aiAgentService = {},
    pullRequestsModel = {},
    writebackPreviewService = {},
    jobModel = {},
    userModel = {},
    aiAgentReviewNotificationService = {},
}: {
    aiAgentModel?: Record<string, unknown>;
    aiAgentReviewClassifierModel?: Record<string, unknown>;
    aiAgentReviewNotificationModel?: Record<string, unknown>;
    aiOrganizationSettingsService?: Record<string, unknown>;
    projectModel?: Record<string, unknown>;
    projectService?: Record<string, unknown>;
    schedulerClient?: Record<string, unknown>;
    githubAppInstallationsModel?: Record<string, unknown>;
    gitlabAppInstallationsModel?: Record<string, unknown>;
    aiAgentService?: Record<string, unknown>;
    pullRequestsModel?: Record<string, unknown>;
    writebackPreviewService?: Record<string, unknown>;
    jobModel?: Record<string, unknown>;
    userModel?: Record<string, unknown>;
    aiAgentReviewNotificationService?: Record<string, unknown>;
} = {}) =>
    new AiAgentAdminService({
        analytics: { track: jest.fn() },
        aiAgentModel: {
            createWebAppThreadWithPrompt: jest.fn().mockResolvedValue({
                threadUuid: PREVIEW_THREAD_UUID,
                promptUuid: 'prompt-uuid-1',
            }),
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
            getPromotedFingerprintScope: jest.fn().mockResolvedValue({
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
            }),
            updateReviewItemWritebackProgress: jest
                .fn()
                .mockResolvedValue(undefined),
            setReviewItemPrLink: jest.fn().mockResolvedValue(undefined),
            setReviewRemediationPullRequest: jest
                .fn()
                .mockResolvedValue(undefined),
            setReviewItemWritebackStatus: jest
                .fn()
                .mockResolvedValue(undefined),
            createRemediationEvent: jest.fn().mockResolvedValue(undefined),
            listRemediationEvents: jest.fn().mockResolvedValue([]),
            getThreadWritebackPullRequests: jest
                .fn()
                .mockResolvedValue(
                    new Map([
                        [WORK_THREAD_UUID, [{ prUrl: PR_URL, createdAt: NOW }]],
                    ]),
                ),
            findReviewRemediationByWorkThread: jest
                .fn()
                .mockResolvedValue(null),
            ...aiAgentReviewClassifierModel,
        },
        aiAgentReviewNotificationModel: {
            getSettings: jest.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                enabled: false,
                slackChannelId: null,
            }),
            upsertSettings: jest.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                enabled: true,
                slackChannelId: 'C123',
            }),
            ...aiAgentReviewNotificationModel,
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
            findExploresFromCache: jest.fn().mockResolvedValue({}),
            getAllByOrganizationUuid: jest.fn().mockResolvedValue([]),
            ...projectModel,
        },
        aiAgentService: {
            generateAgentThreadResponse: jest
                .fn()
                .mockResolvedValue('Opened a pull request.'),
            ...aiAgentService,
        },
        projectService: {
            scheduleCompileProject: jest
                .fn()
                .mockResolvedValue({ jobUuid: COMPILE_JOB_UUID }),
            ...projectService,
        },
        projectContextService: {},
        pullRequestsModel: {
            findByProjectAndUrl: jest
                .fn()
                .mockResolvedValue({ pullRequestUuid: 'pull-request-1' }),
            ...pullRequestsModel,
        },
        writebackPreviewService: {
            createPreviewForPullRequest: jest.fn().mockResolvedValue({
                previewProjectUuid: PREVIEW_PROJECT_UUID,
                previewUrl: `${SITE_URL}/projects/${PREVIEW_PROJECT_UUID}/home`,
                compileJobUuid: COMPILE_JOB_UUID,
            }),
            ...writebackPreviewService,
        },
        jobModel: {
            get: jest.fn().mockResolvedValue({ jobStatus: JobStatusType.DONE }),
            ...jobModel,
        },
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
            aiAgentReviewRemediationCompile: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
            aiAgentReviewRemediationRun: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
            ...schedulerClient,
        },
        userModel: {
            findSessionUserByUUID: jest.fn().mockResolvedValue(makeAdminUser()),
            ...userModel,
        },
        aiAgentReviewNotificationService: {
            notifyAssigned: jest.fn().mockResolvedValue(undefined),
            ...aiAgentReviewNotificationService,
        },
        lightdashConfig: {
            siteUrl: SITE_URL,
            appRuntime: { e2bApiKey: 'e2b-api-key' },
            aiWriteback: { anthropicApiKey: 'anthropic-api-key' },
        },
    } as unknown as ConstructorParameters<typeof AiAgentAdminService>[0]);

describe('AiAgentAdminService.getPromptActivity', () => {
    it('delegates to the model with bounded days', async () => {
        const findAdminPromptActivity = jest.fn().mockResolvedValue([
            { date: '2026-06-01', promptCount: 2 },
            { date: '2026-06-02', promptCount: 0 },
        ]);
        const service = makeService({
            aiAgentModel: { findAdminPromptActivity },
        });

        await expect(
            service.getPromptActivity(makeAdminUser(), PROJECT_UUID, 100),
        ).resolves.toEqual([
            { date: '2026-06-01', promptCount: 2 },
            { date: '2026-06-02', promptCount: 0 },
        ]);

        expect(findAdminPromptActivity).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            days: 30,
        });
    });

    it('rejects non-admin users', async () => {
        const findAdminPromptActivity = jest.fn();
        const service = makeService({
            aiAgentModel: { findAdminPromptActivity },
        });
        const user = {
            ...makeAdminUser(),
            ability: new Ability<PossibleAbilities>([]),
        };

        await expect(
            service.getPromptActivity(user, PROJECT_UUID, 14),
        ).rejects.toThrow(
            'Insufficient permissions to access AI agent features',
        );
        expect(findAdminPromptActivity).not.toHaveBeenCalled();
    });
});

describe('AiAgentAdminService review access', () => {
    it('allows developers with manage:AiAgent to access reviews', async () => {
        const listReviewSignals = jest.fn().mockResolvedValue([]);
        const service = makeService({
            aiAgentReviewClassifierModel: { listReviewSignals },
        });

        await expect(
            service.listReviewSignals(makeDeveloperUser()),
        ).resolves.toEqual([]);
        expect(listReviewSignals).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
        });
    });

    it('forbids users without manage:AiAgent from reviews', async () => {
        const listReviewSignals = jest.fn();
        const service = makeService({
            aiAgentReviewClassifierModel: { listReviewSignals },
        });
        const user = {
            ...makeAdminUser(),
            role: OrganizationMemberRole.DEVELOPER,
            ability: new Ability<PossibleAbilities>([]),
        };

        await expect(service.listReviewSignals(user)).rejects.toThrow(
            'Insufficient permissions to access AI agent reviews',
        );
        expect(listReviewSignals).not.toHaveBeenCalled();
    });
});

describe('AiAgentAdminService.updateReviewItemAssignee', () => {
    it('notifies the assignee after the model write succeeds', async () => {
        const notifyAssigned = jest.fn().mockResolvedValue(undefined);
        const updateReviewItemAssignee = jest.fn().mockResolvedValue(undefined);
        const service = makeService({
            aiAgentReviewClassifierModel: {
                updateReviewItemAssignee,
                getReviewItem: jest.fn().mockResolvedValue(
                    makeReviewItem({
                        organizationUuid: ORGANIZATION_UUID,
                        projectUuid: PROJECT_UUID,
                    }),
                ),
            },
            aiAgentReviewNotificationService: { notifyAssigned },
        });

        await service.updateReviewItemAssignee(
            makeDeveloperUser(),
            'fingerprint-1',
            'user-2',
        );

        expect(notifyAssigned).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            fingerprint: 'fingerprint-1',
            assigneeUserUuid: 'user-2',
            actorUserUuid: USER_UUID,
        });
    });
});

describe('AiAgentAdminService review notification settings', () => {
    it('allows developers to read settings', async () => {
        const getSettings = jest.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            enabled: true,
            slackChannelId: 'C123',
        });
        const service = makeService({
            aiAgentReviewNotificationModel: { getSettings },
        });

        await expect(
            service.getReviewNotificationSettings(makeDeveloperUser()),
        ).resolves.toEqual({
            organizationUuid: ORGANIZATION_UUID,
            enabled: true,
            slackChannelId: 'C123',
        });
        expect(getSettings).toHaveBeenCalledWith(ORGANIZATION_UUID);
    });

    it('forbids developers from updating settings', async () => {
        const upsertSettings = jest.fn();
        const service = makeService({
            aiAgentReviewNotificationModel: { upsertSettings },
        });

        await expect(
            service.updateReviewNotificationSettings(makeDeveloperUser(), {
                enabled: true,
                slackChannelId: 'C123',
            }),
        ).rejects.toThrow(
            'Insufficient permissions to access organization-wide AI agent data',
        );
        expect(upsertSettings).not.toHaveBeenCalled();
    });
});

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
                sourceThreadHasWritebackPr: false,
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
                sourceThreadHasWritebackPr: false,
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
                sourceThreadHasWritebackPr: false,
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
                sourceThreadHasWritebackPr: false,
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
                        workThreadUuid: null,
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
                sourceThreadHasWritebackPr: false,
            }),
        ).toEqual({
            eligible: false,
            provider: null,
            strategy: null,
            reason: 'writeback_in_progress',
        });
    });

    it('blocks writeback when the source thread already opened a PR', () => {
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
                sourceThreadHasWritebackPr: true,
            }),
        ).toEqual({
            eligible: false,
            provider: null,
            strategy: null,
            reason: 'source_thread_writeback_exists',
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

    it('creates a seeded preview work thread and links it to the remediation', async () => {
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest.fn().mockResolvedValue({
                threadUuid: PREVIEW_THREAD_UUID,
                promptUuid: 'prompt-uuid-1',
            }),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
        };
        const schedulerClient = {
            aiAgentReviewRemediationRun: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
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
            schedulerClient,
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
        expect(aiAgentModel.createWebAppThreadWithPrompt).toHaveBeenCalledWith({
            thread: {
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PREVIEW_PROJECT_UUID,
                userUuid: USER_UUID,
                createdFrom: 'web_app',
                agentUuid: PREVIEW_AGENT_UUID,
            },
            prompt: {
                createdByUserUuid: USER_UUID,
                prompt: expect.stringContaining(
                    "Re-run the user's original question",
                ),
                context: [
                    {
                        type: 'thread',
                        threadUuid: THREAD_UUID,
                        promptUuid: PROMPT_UUID,
                    },
                ],
            },
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
        expect(
            schedulerClient.aiAgentReviewRemediationRun,
        ).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PREVIEW_PROJECT_UUID,
            userUuid: USER_UUID,
            fingerprint: 'fingerprint-1',
            remediationUuid: REMEDIATION_UUID,
            agentUuid: PREVIEW_AGENT_UUID,
            threadUuid: PREVIEW_THREAD_UUID,
        });
    });

    it('falls back to the flagged prompt text when the verification prompt fails to seed', async () => {
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest
                .fn()
                .mockRejectedValueOnce(new Error('context insert failed'))
                .mockResolvedValue({
                    threadUuid: PREVIEW_THREAD_UUID,
                    promptUuid: 'prompt-uuid-1',
                }),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
        };
        const schedulerClient = {
            aiAgentReviewRemediationRun: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
        };
        const service = makeService({ aiAgentModel, schedulerClient });
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

        expect(
            aiAgentModel.createWebAppThreadWithPrompt,
        ).toHaveBeenLastCalledWith({
            thread: expect.objectContaining({
                projectUuid: PREVIEW_PROJECT_UUID,
            }),
            prompt: {
                createdByUserUuid: USER_UUID,
                prompt: 'Show revenue',
            },
        });
        expect(schedulerClient.aiAgentReviewRemediationRun).toHaveBeenCalled();
    });

    it('links no preview thread when seeding fails and there is no retry prompt', async () => {
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest
                .fn()
                .mockRejectedValue(new Error('context insert failed')),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
        };
        const schedulerClient = {
            aiAgentReviewRemediationRun: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
        };
        const aiAgentReviewClassifierModel = {
            getReviewRemediation: jest
                .fn()
                .mockResolvedValue(makeRemediation({ retryPrompt: null })),
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
        const service = makeService({
            aiAgentModel,
            aiAgentReviewClassifierModel,
            schedulerClient,
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

        expect(
            aiAgentReviewClassifierModel.setReviewRemediationPreviewThread,
        ).not.toHaveBeenCalled();
        expect(aiAgentModel.createWebAppThreadWithPrompt).toHaveBeenCalledTimes(
            1,
        );
        expect(
            schedulerClient.aiAgentReviewRemediationRun,
        ).not.toHaveBeenCalled();
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

    it('instructs the verification agent to stay on governed explores', async () => {
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest.fn().mockResolvedValue({
                threadUuid: PREVIEW_THREAD_UUID,
                promptUuid: 'prompt-uuid-1',
            }),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
        };
        const service = makeService({ aiAgentModel });
        (getPullRequestComments as jest.Mock).mockResolvedValue([
            `Preview ready: ${SITE_URL}/projects/${PREVIEW_PROJECT_UUID}/tables`,
        ]);

        await service.pollReviewRemediationPreview({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            userUuid: USER_UUID,
            fingerprint: 'fingerprint-1',
            remediationUuid: REMEDIATION_UUID,
            prUrl: PR_URL,
            startedAt: Date.now(),
        });

        expect(aiAgentModel.createWebAppThreadWithPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: expect.objectContaining({
                    prompt: expect.stringContaining(
                        'do not fall back to raw SQL',
                    ),
                }),
            }),
        );
    });
});

describe('AiAgentAdminService.getReviewItemActivity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const makeEvent = (eventType: string, payload = {}) => ({
        uuid: `event-${eventType}`,
        remediationUuid: REMEDIATION_UUID,
        eventType,
        occurredAt: NOW,
        payload,
        createdByUserUuid: null,
    });

    it('returns a writeback live state with the live progress message', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest.fn().mockResolvedValue(
                makeReviewItem({
                    prWritebackMessage: 'Reading payments.yml',
                    remediation: makeRemediation({ status: 'running' }),
                }),
            ),
            listRemediationEvents: jest
                .fn()
                .mockResolvedValue([makeEvent('finding_opened')]),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        const activity = await service.getReviewItemActivity(
            makeAdminUser(),
            'fingerprint-1',
        );

        expect(activity.liveState).toBe('writeback');
        expect(activity.liveMessage).toBe('Reading payments.yml');
    });

    it('returns events with a compiling live state before the preview compiles', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest.fn().mockResolvedValue(
                makeReviewItem({
                    remediation: makeRemediation({ status: 'pr_open' }),
                }),
            ),
            listRemediationEvents: jest
                .fn()
                .mockResolvedValue([
                    makeEvent('finding_opened'),
                    makeEvent('pr_opened'),
                ]),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        const activity = await service.getReviewItemActivity(
            makeAdminUser(),
            'fingerprint-1',
        );

        expect(activity.events).toHaveLength(2);
        expect(activity.liveState).toBe('compiling');
    });

    it('returns a verifying live state after the preview compiles', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest.fn().mockResolvedValue(
                makeReviewItem({
                    remediation: makeRemediation({ status: 'preview_ready' }),
                }),
            ),
            listRemediationEvents: jest
                .fn()
                .mockResolvedValue([
                    makeEvent('finding_opened'),
                    makeEvent('pr_opened'),
                    makeEvent('preview_compiled'),
                ]),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        const activity = await service.getReviewItemActivity(
            makeAdminUser(),
            'fingerprint-1',
        );

        expect(activity.liveState).toBe('verifying');
    });

    it('returns no live state once verification completed or remediation is terminal', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest.fn().mockResolvedValue(
                makeReviewItem({
                    remediation: makeRemediation({ status: 'resolved' }),
                }),
            ),
            listRemediationEvents: jest
                .fn()
                .mockResolvedValue([
                    makeEvent('pr_opened'),
                    makeEvent('preview_compiled'),
                    makeEvent('verification_completed'),
                    makeEvent('resolved'),
                ]),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        const activity = await service.getReviewItemActivity(
            makeAdminUser(),
            'fingerprint-1',
        );

        expect(activity.liveState).toBeNull();
    });

    it('returns an empty feed when the item has no remediation', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest
                .fn()
                .mockResolvedValue(makeReviewItem({ remediation: null })),
            listRemediationEvents: jest.fn(),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        const activity = await service.getReviewItemActivity(
            makeAdminUser(),
            'fingerprint-1',
        );

        expect(activity).toEqual({
            events: [],
            liveState: null,
            liveMessage: null,
            verdictStale: false,
        });
        expect(
            aiAgentReviewClassifierModel.listRemediationEvents,
        ).not.toHaveBeenCalled();
    });
});

describe('AiAgentAdminService project-scoped read access', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const projectModel = {
        getAllByOrganizationUuid: jest
            .fn()
            .mockResolvedValue([
                { projectUuid: PROJECT_UUID },
                { projectUuid: OTHER_PROJECT_UUID },
            ]),
    };

    it('lets a project-scoped user read an item in a project they can access', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest
                .fn()
                .mockResolvedValue(
                    makeReviewItem({ projectUuid: PROJECT_UUID }),
                ),
            listRemediationEvents: jest.fn().mockResolvedValue([]),
        };
        const service = makeService({
            aiAgentReviewClassifierModel,
            projectModel,
        });

        // No remediation → empty feed, but the per-item project check passes.
        const activity = await service.getReviewItemActivity(
            makeProjectUser(),
            'fingerprint-1',
        );
        expect(activity.events).toEqual([]);
    });

    it('forbids a project-scoped user from an item in another project', async () => {
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest
                .fn()
                .mockResolvedValue(
                    makeReviewItem({ projectUuid: OTHER_PROJECT_UUID }),
                ),
        };
        const service = makeService({
            aiAgentReviewClassifierModel,
            projectModel,
        });

        await expect(
            service.getReviewItemActivity(makeProjectUser(), 'fingerprint-1'),
        ).rejects.toThrow(
            'Insufficient permissions to access this AI agent resource',
        );
    });

    it('forbids a user with no AI access at all', async () => {
        const service = makeService({ projectModel });
        const user = {
            ...makeAdminUser(),
            ability: new Ability<PossibleAbilities>([]),
        };

        await expect(
            service.getReviewItemActivity(user, 'fingerprint-1'),
        ).rejects.toThrow(
            'Insufficient permissions to access AI agent features',
        );
    });

    it('forbids an org view-only principal (no widening to interactive_viewer)', async () => {
        // Holds org-wide view:AiAgent + view:OrganizationAiAgent but no manage.
        // resolveReadScope gates on manage, so this principal must be denied
        // rather than handed {kind:'all'} cross-project admin reads.
        const service = makeService({ projectModel });

        await expect(
            service.getReviewItemActivity(makeOrgViewerUser(), 'fingerprint-1'),
        ).rejects.toThrow(
            'Insufficient permissions to access AI agent features',
        );
        await expect(
            service.getAllThreads(makeOrgViewerUser()),
        ).rejects.toThrow(
            'Insufficient permissions to access AI agent features',
        );
    });
});

describe('AiAgentAdminService.runReviewItemWritebackJob', () => {
    const payload = {
        fingerprint: 'fingerprint-1',
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        userUuid: USER_UUID,
        remediationUuid: REMEDIATION_UUID,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('enqueues a compile poll instead of seeding the verification thread inline', async () => {
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest.fn(),
            updateThreadTitle: jest.fn(),
        };
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
            aiAgentReviewRemediationRun: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-2' }),
        };
        const service = makeService({ aiAgentModel, schedulerClient });

        await service.runReviewItemWritebackJob(payload);

        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                userUuid: USER_UUID,
                fingerprint: 'fingerprint-1',
                remediationUuid: REMEDIATION_UUID,
                previewProjectUuid: PREVIEW_PROJECT_UUID,
                compileJobUuid: COMPILE_JOB_UUID,
                startedAt: expect.any(Number),
            }),
        );
        expect(
            aiAgentModel.createWebAppThreadWithPrompt,
        ).not.toHaveBeenCalled();
        expect(
            schedulerClient.aiAgentReviewRemediationRun,
        ).not.toHaveBeenCalled();
    });

    it('runs the build-fix thread and records a pr_opened activity event', async () => {
        const aiAgentReviewClassifierModel = {
            createRemediationEvent: jest.fn().mockResolvedValue(undefined),
        };
        const aiAgentService = {
            generateAgentThreadResponse: jest
                .fn()
                .mockResolvedValue('Opened a pull request.'),
        };
        const service = makeService({
            aiAgentReviewClassifierModel,
            aiAgentService,
        });

        await service.runReviewItemWritebackJob(payload);

        // The build-fix thread (not the headless sandbox) opens the PR, pinning
        // the editDbtProject tool on the opening turn.
        expect(aiAgentService.generateAgentThreadResponse).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                threadUuid: WORK_THREAD_UUID,
                autoApproveSql: true,
                toolHints: ['editDbtProject'],
                forceToolHints: true,
                suppressWritebackPreview: true,
            }),
        );
        // writeback_completed is emitted by the shared editDbtProject seam, not
        // the job; the job records pr_opened once it resolves the opened PR.
        expect(
            aiAgentReviewClassifierModel.createRemediationEvent,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                event: {
                    eventType: 'pr_opened',
                    payload: { prUrl: PR_URL, prNumber: 42 },
                },
            }),
        );
    });

    it('re-verifies a remediation in place on retest', async () => {
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
        };
        const projectService = {
            scheduleCompileProject: jest
                .fn()
                .mockResolvedValue({ jobUuid: COMPILE_JOB_UUID }),
        };
        const aiAgentReviewClassifierModel = {
            getReviewItem: jest.fn().mockResolvedValue(
                makeReviewItem({
                    remediation: makeRemediation({
                        previewProjectUuid: PREVIEW_PROJECT_UUID,
                        previewThreadUuid: PREVIEW_THREAD_UUID,
                    }),
                }),
            ),
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({
            schedulerClient,
            projectService,
            aiAgentReviewClassifierModel,
        });

        await service.retestReviewRemediation(makeAdminUser(), 'fingerprint-1');

        // Recompiles the existing preview in place (no new clone) ...
        expect(projectService.scheduleCompileProject).toHaveBeenCalledWith(
            expect.anything(),
            PREVIEW_PROJECT_UUID,
            expect.anything(),
            true,
            true,
        );
        // ... then reuses the compile poll to re-run verification.
        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                remediationUuid: REMEDIATION_UUID,
                previewProjectUuid: PREVIEW_PROJECT_UUID,
                compileJobUuid: COMPILE_JOB_UUID,
            }),
        );
    });
});

describe('AiAgentAdminService.pollReviewRemediationCompile', () => {
    const payload = {
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        userUuid: USER_UUID,
        fingerprint: 'fingerprint-1',
        remediationUuid: REMEDIATION_UUID,
        previewProjectUuid: PREVIEW_PROJECT_UUID,
        compileJobUuid: COMPILE_JOB_UUID,
        startedAt: Date.now(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('seeds the verification thread once the compile job is done', async () => {
        const jobModel = {
            get: jest.fn().mockResolvedValue({ jobStatus: JobStatusType.DONE }),
        };
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest.fn().mockResolvedValue({
                threadUuid: PREVIEW_THREAD_UUID,
                promptUuid: 'prompt-uuid-1',
            }),
            updateThreadTitle: jest.fn().mockResolvedValue(undefined),
        };
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest.fn(),
            aiAgentReviewRemediationRun: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
        };
        const aiAgentReviewClassifierModel = {
            setReviewRemediationPreviewThread: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({
            jobModel,
            aiAgentModel,
            schedulerClient,
            aiAgentReviewClassifierModel,
        });

        await service.pollReviewRemediationCompile(payload);

        expect(jobModel.get).toHaveBeenCalledWith(COMPILE_JOB_UUID);
        expect(aiAgentModel.createWebAppThreadWithPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                thread: expect.objectContaining({
                    projectUuid: PREVIEW_PROJECT_UUID,
                }),
            }),
        );
        expect(
            aiAgentReviewClassifierModel.setReviewRemediationPreviewThread,
        ).toHaveBeenCalled();
        expect(schedulerClient.aiAgentReviewRemediationRun).toHaveBeenCalled();
        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).not.toHaveBeenCalled();
    });

    it('records a preview_compiled activity event when the compile lands', async () => {
        const jobModel = {
            get: jest.fn().mockResolvedValue({ jobStatus: JobStatusType.DONE }),
        };
        const aiAgentReviewClassifierModel = {
            createRemediationEvent: jest.fn().mockResolvedValue(undefined),
        };
        const service = makeService({
            jobModel,
            aiAgentReviewClassifierModel,
        });

        await service.pollReviewRemediationCompile(payload);

        expect(
            aiAgentReviewClassifierModel.createRemediationEvent,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            event: {
                eventType: 'preview_compiled',
                payload: { previewProjectUuid: PREVIEW_PROJECT_UUID },
            },
        });
    });

    it('re-enqueues itself while the compile job is still running', async () => {
        const jobModel = {
            get: jest
                .fn()
                .mockResolvedValue({ jobStatus: JobStatusType.RUNNING }),
        };
        const aiAgentModel = {
            createWebAppThreadWithPrompt: jest.fn(),
            updateThreadTitle: jest.fn(),
        };
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
            aiAgentReviewRemediationRun: jest.fn(),
        };
        const service = makeService({
            jobModel,
            aiAgentModel,
            schedulerClient,
        });

        await service.pollReviewRemediationCompile(payload);

        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).toHaveBeenCalledWith(payload, expect.any(Date));
        expect(
            aiAgentModel.createWebAppThreadWithPrompt,
        ).not.toHaveBeenCalled();
    });

    it('fails the remediation when the compile job errors', async () => {
        const jobModel = {
            get: jest
                .fn()
                .mockResolvedValue({ jobStatus: JobStatusType.ERROR }),
        };
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest.fn(),
            aiAgentReviewRemediationRun: jest.fn(),
        };
        const aiAgentReviewClassifierModel = {
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({
            jobModel,
            schedulerClient,
            aiAgentReviewClassifierModel,
        });

        await service.pollReviewRemediationCompile(payload);

        expect(
            aiAgentReviewClassifierModel.updateReviewRemediationStatus,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            status: 'failed',
            errorMessage: 'Preview project failed to compile',
        });
        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).not.toHaveBeenCalled();
    });

    it('fails the remediation when the compile does not finish in time', async () => {
        const jobModel = { get: jest.fn() };
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest.fn(),
            aiAgentReviewRemediationRun: jest.fn(),
        };
        const aiAgentReviewClassifierModel = {
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({
            jobModel,
            schedulerClient,
            aiAgentReviewClassifierModel,
        });

        await service.pollReviewRemediationCompile({
            ...payload,
            startedAt: Date.now() - 11 * 60_000,
        });

        expect(
            aiAgentReviewClassifierModel.updateReviewRemediationStatus,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            status: 'failed',
            errorMessage: 'Preview project did not compile in time',
        });
        expect(jobModel.get).not.toHaveBeenCalled();
        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).not.toHaveBeenCalled();
    });

    it('records a verification_completed event after the remediation run', async () => {
        const aiAgentReviewClassifierModel = {
            createRemediationEvent: jest.fn().mockResolvedValue(undefined),
        };
        const service = makeService({ aiAgentReviewClassifierModel });

        await service.recordReviewRemediationVerified({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PREVIEW_PROJECT_UUID,
            userUuid: USER_UUID,
            fingerprint: 'fingerprint-1',
            remediationUuid: REMEDIATION_UUID,
            agentUuid: PREVIEW_AGENT_UUID,
            threadUuid: PREVIEW_THREAD_UUID,
        });

        expect(
            aiAgentReviewClassifierModel.createRemediationEvent,
        ).toHaveBeenCalledWith({
            remediationUuid: REMEDIATION_UUID,
            organizationUuid: ORGANIZATION_UUID,
            event: {
                eventType: 'verification_completed',
                payload: { previewThreadUuid: PREVIEW_THREAD_UUID },
            },
        });
    });

    it('does nothing when the remediation is no longer pr_open', async () => {
        const jobModel = { get: jest.fn() };
        const schedulerClient = {
            aiAgentReviewRemediationCompile: jest.fn(),
            aiAgentReviewRemediationRun: jest.fn(),
        };
        const aiAgentReviewClassifierModel = {
            getReviewRemediation: jest
                .fn()
                .mockResolvedValue(makeRemediation({ status: 'resolved' })),
            updateReviewRemediationStatus: jest
                .fn()
                .mockResolvedValue(undefined),
        };
        const service = makeService({
            jobModel,
            schedulerClient,
            aiAgentReviewClassifierModel,
        });

        await service.pollReviewRemediationCompile(payload);

        expect(jobModel.get).not.toHaveBeenCalled();
        expect(
            aiAgentReviewClassifierModel.updateReviewRemediationStatus,
        ).not.toHaveBeenCalled();
        expect(
            schedulerClient.aiAgentReviewRemediationCompile,
        ).not.toHaveBeenCalled();
    });
});
