import {
    PullRequestProvider,
    type AiAgentReviewItemSummary,
} from '@lightdash/common';
import { getAiAgentReviewItemWritebackEligibility } from './AiAgentAdminService';

const NOW = new Date('2026-06-08T10:00:00.000Z');

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
