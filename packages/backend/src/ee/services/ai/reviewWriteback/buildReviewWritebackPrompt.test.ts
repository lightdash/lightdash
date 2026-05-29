import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { planReviewWriteback } from './buildReviewWritebackPrompt';

const baseItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary => ({
    uuid: 'fp',
    fingerprint: 'fp',
    organizationUuid: 'org',
    projectUuid: 'project',
    agentUuid: 'agent',
    title: 'Agent picked the wrong revenue metric',
    description: 'It used order count instead of revenue.',
    primaryRootCause: 'semantic_layer',
    status: 'open',
    dismissedReason: null,
    ownerType: 'semantic_layer_owner',
    assignedToUserUuid: null,
    firstSeenAt: new Date('2026-05-26T00:00:00.000Z'),
    lastSeenAt: new Date('2026-05-26T00:00:00.000Z'),
    findingCount: 1,
    statusUpdatedAt: new Date('2026-05-26T00:00:00.000Z'),
    statusUpdatedByUserUuid: null,
    linkedIssueUrl: null,
    linkedPrUrl: null,
    prState: null,
    createdAt: new Date('2026-05-26T00:00:00.000Z'),
    updatedAt: new Date('2026-05-26T00:00:00.000Z'),
    latestFinding: {
        uuid: 'signal',
        promptUuid: 'prompt',
        threadUuid: 'thread',
        projectUuid: 'project',
        agentUuid: 'agent',
        subcategories: ['metric_selection_ambiguity'],
        fixTargets: ['semantic_yaml_patch'],
        targetRefs: [
            {
                type: 'metric',
                modelName: 'orders',
                metricName: 'average_order_size',
                yamlPath: 'models/orders.yml',
            },
        ],
        evidenceExcerpts: [
            {
                source: 'next_user_prompt',
                text: 'use average_order_size, not total_order_amount',
                redacted: false,
            },
        ],
        recommendation: {
            actionType: 'update_semantic_yaml',
            title: 'Add an ai_hint to average_order_size',
            rationale: 'Disambiguate it from total_order_amount.',
            targetRefs: [],
        },
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
    },
    ...overrides,
});

describe('planReviewWriteback', () => {
    it('builds a deterministic one-shot prompt for semantic_layer items', () => {
        const plan = planReviewWriteback(baseItem());

        expect(plan.aggregationKey).toBeNull();
        expect(plan.promptText).toContain(
            'Agent picked the wrong revenue metric',
        );
        expect(plan.promptText).toContain(
            'Add an ai_hint to average_order_size',
        );
        expect(plan.promptText).toContain(
            'metric "orders.average_order_size" (yaml: models/orders.yml)',
        );
        expect(plan.promptText).toContain(
            'use average_order_size, not total_order_amount',
        );
    });

    it('throws for unsupported root causes', () => {
        expect(() =>
            planReviewWriteback(
                baseItem({ primaryRootCause: 'project_context' }),
            ),
        ).toThrow('not supported');
    });
});
