import { type AiAgentReviewItemSummary } from '@lightdash/common';

// Sample rows shown while the onboarding tour runs so admins see what findings
// look like, aligned to the real columns. Identified by a sentinel uuid prefix
// so the cells can render them inert (no live PR, no status menu, no thread).
const EXAMPLE_REVIEW_ITEM_PREFIX = 'example:';

export const isExampleReviewItem = (uuid: string): boolean =>
    uuid.startsWith(EXAMPLE_REVIEW_ITEM_PREFIX);

const EXAMPLE_SEEN_AT = new Date();

const makeExampleReviewItem = (
    overrides: Pick<
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
    createdAt: EXAMPLE_SEEN_AT,
    updatedAt: EXAMPLE_SEEN_AT,
    latestFinding: null,
    ...overrides,
});

export const EXAMPLE_REVIEW_ITEMS: AiAgentReviewItemSummary[] = [
    makeExampleReviewItem({
        uuid: `${EXAMPLE_REVIEW_ITEM_PREFIX}semantic-layer`,
        title: 'No metric for weekly active users',
        description:
            'Someone asked for weekly active users. There was no metric for it, so the agent estimated.',
        primaryRootCause: 'semantic_layer',
        ownerType: 'semantic_layer_owner',
    }),
    makeExampleReviewItem({
        uuid: `${EXAMPLE_REVIEW_ITEM_PREFIX}project-context`,
        title: 'Agent didn’t know what “active user” means',
        description:
            'Someone asked for active users. The agent guessed instead of using your definition.',
        primaryRootCause: 'project_context',
        ownerType: 'unknown',
    }),
];
