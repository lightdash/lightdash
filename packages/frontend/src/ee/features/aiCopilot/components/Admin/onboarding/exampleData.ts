import {
    type AiAgentReviewItemSummary,
    type AiAgentReviewRemediation,
    PullRequestProvider,
} from '@lightdash/common';

// Sample cards shown while the onboarding tour runs so admins see what the
// board looks like across the lifecycle. Identified by a sentinel uuid prefix
// so the card can render them inert (no live PR, no workspace, no thread).
const EXAMPLE_REVIEW_ITEM_PREFIX = 'example:';

export const isExampleReviewItem = (uuid: string): boolean =>
    uuid.startsWith(EXAMPLE_REVIEW_ITEM_PREFIX);

const EXAMPLE_SEEN_AT = new Date();

const makeExampleReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> &
        Pick<
            AiAgentReviewItemSummary,
            'uuid' | 'title' | 'description' | 'primaryRootCause' | 'ownerType'
        >,
): AiAgentReviewItemSummary => ({
    fingerprint: overrides.uuid,
    organizationUuid: '',
    projectUuid: null,
    agentUuid: null,
    status: 'open',
    dismissedReason: null,
    assignedToUserUuid: null,
    firstSeenAt: EXAMPLE_SEEN_AT,
    lastSeenAt: EXAMPLE_SEEN_AT,
    findingCount: 1,
    statusUpdatedAt: EXAMPLE_SEEN_AT,
    statusUpdatedByUserUuid: null,
    linkedIssueUrl: null,
    linkedPrUrl: null,
    prState: null,
    prWritebackStatus: null,
    prWritebackMessage: null,
    writebackEligible: false,
    writebackEligibility: {
        eligible: false,
        reason: 'missing_project',
        provider: null,
        strategy: null,
    },
    remediation: null,
    boardPosition: null,
    createdAt: EXAMPLE_SEEN_AT,
    updatedAt: EXAMPLE_SEEN_AT,
    latestFinding: null,
    ...overrides,
});

const makeExampleRemediation = (
    fingerprint: string,
    status: AiAgentReviewRemediation['status'],
): AiAgentReviewRemediation => ({
    uuid: `${fingerprint}:remediation`,
    fingerprint,
    organizationUuid: '',
    sourceFindingUuid: `${fingerprint}:finding`,
    sourcePromptUuid: `${fingerprint}:prompt`,
    sourceThreadUuid: `${fingerprint}:thread`,
    sourceProjectUuid: `${fingerprint}:project`,
    sourceAgentUuid: `${fingerprint}:agent`,
    workThreadUuid: `${fingerprint}:work-thread`,
    pullRequestUuid: `${fingerprint}:pr`,
    linkedPrUrl: 'https://github.com/example/dbt-project/pull/1234',
    previewProjectUuid: `${fingerprint}:preview-project`,
    previewAgentUuid: `${fingerprint}:preview-agent`,
    previewThreadUuid: `${fingerprint}:preview-thread`,
    status,
    errorMessage: null,
    retryPrompt: null,
    createdByUserUuid: null,
    resolvedByUserUuid: null,
    resolvedAt: null,
    createdAt: EXAMPLE_SEEN_AT,
    updatedAt: EXAMPLE_SEEN_AT,
});

export const EXAMPLE_REVIEW_ITEMS: AiAgentReviewItemSummary[] = [
    // To Do — eligible, so the card shows the Start button the tour points at.
    makeExampleReviewItem({
        uuid: `${EXAMPLE_REVIEW_ITEM_PREFIX}todo`,
        title: 'No metric for weekly active users',
        description:
            'Someone asked for weekly active users. There was no metric for it, so the agent estimated.',
        primaryRootCause: 'semantic_layer',
        ownerType: 'semantic_layer_owner',
        writebackEligible: true,
        writebackEligibility: {
            eligible: true,
            reason: null,
            provider: PullRequestProvider.GITHUB,
            strategy: 'semantic_layer',
        },
    }),
    // In Progress — a PR is open and the workspace is ready to follow the fix.
    makeExampleReviewItem({
        uuid: `${EXAMPLE_REVIEW_ITEM_PREFIX}in-progress`,
        title: 'Agent didn’t know what “active user” means',
        description:
            'Someone asked for active users. The agent guessed instead of using your definition.',
        primaryRootCause: 'project_context',
        ownerType: 'unknown',
        status: 'in_progress',
        linkedPrUrl: 'https://github.com/example/dbt-project/pull/1234',
        remediation: makeExampleRemediation(
            `${EXAMPLE_REVIEW_ITEM_PREFIX}in-progress`,
            'preview_ready',
        ),
    }),
    // Done — merged, so the card lands in the Done lane.
    makeExampleReviewItem({
        uuid: `${EXAMPLE_REVIEW_ITEM_PREFIX}done`,
        title: 'Revenue excluded refunds',
        description:
            'Someone asked for revenue. The agent left out refunds, so the number was too high.',
        primaryRootCause: 'semantic_layer',
        ownerType: 'semantic_layer_owner',
        status: 'resolved',
        linkedPrUrl: 'https://github.com/example/dbt-project/pull/1230',
    }),
];
