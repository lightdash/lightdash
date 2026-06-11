import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getThreadReviewHeadline,
    getThreadReviewItems,
    summarizeThreadReviewItems,
} from './threadReviewContext';

const makeReviewItem = (
    overrides: Partial<AiAgentReviewItemSummary> = {},
): AiAgentReviewItemSummary =>
    ({
        uuid: 'review-1',
        fingerprint: 'fingerprint-1',
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        title: 'Review revenue metric',
        description: 'The answer picked the wrong metric',
        primaryRootCause: 'semantic_layer',
        status: 'open',
        dismissedReason: null,
        ownerType: 'semantic_layer_owner',
        assignedToUserUuid: null,
        firstSeenAt: new Date('2026-06-10T09:00:00.000Z'),
        lastSeenAt: new Date('2026-06-10T09:00:00.000Z'),
        findingCount: 1,
        statusUpdatedAt: new Date('2026-06-10T09:00:00.000Z'),
        statusUpdatedByUserUuid: null,
        linkedIssueUrl: null,
        linkedPrUrl: null,
        prState: null,
        prWritebackStatus: null,
        prWritebackMessage: null,
        createdAt: new Date('2026-06-10T09:00:00.000Z'),
        updatedAt: new Date('2026-06-10T09:00:00.000Z'),
        writebackEligible: false,
        writebackEligibility: {
            eligible: false,
            reason: 'unsupported_root_cause',
            provider: null,
            strategy: null,
        },
        latestFinding: {
            uuid: 'finding-1',
            promptUuid: 'prompt-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            subcategories: [],
            fixTargets: ['semantic_yaml_patch'],
            targetRefs: [],
            evidenceExcerpts: [],
            recommendation: {
                actionType: 'update_semantic_yaml',
                title: 'Update revenue metric guidance',
                rationale: 'Metric guidance is stale',
                targetRefs: [],
            },
            projectContextEntry: null,
            createdAt: new Date('2026-06-10T09:00:00.000Z'),
        },
        ...overrides,
    }) as AiAgentReviewItemSummary;

describe('threadReviewContext', () => {
    it('filters review items down to the source thread', () => {
        const items = getThreadReviewItems(
            [
                makeReviewItem(),
                makeReviewItem({
                    uuid: 'review-2',
                    latestFinding: {
                        ...makeReviewItem().latestFinding!,
                        threadUuid: 'thread-2',
                    },
                }),
            ],
            'thread-1',
        );

        expect(items.map((item) => item.uuid)).toEqual(['review-1']);
    });

    it('prioritizes open findings ahead of resolved ones', () => {
        const items = getThreadReviewItems(
            [
                makeReviewItem({
                    uuid: 'resolved-review',
                    status: 'resolved',
                    updatedAt: new Date('2026-06-10T12:00:00.000Z'),
                }),
                makeReviewItem({
                    uuid: 'open-review',
                    status: 'open',
                    updatedAt: new Date('2026-06-10T10:00:00.000Z'),
                }),
            ],
            'thread-1',
        );

        expect(items.map((item) => item.uuid)).toEqual([
            'open-review',
            'resolved-review',
        ]);
    });

    it('summarizes counts by review status', () => {
        const summary = summarizeThreadReviewItems(
            [
                makeReviewItem({ uuid: 'open-review', status: 'open' }),
                makeReviewItem({
                    uuid: 'in-progress-review',
                    status: 'in_progress',
                }),
                makeReviewItem({ uuid: 'resolved-review', status: 'resolved' }),
            ],
            'thread-1',
        );

        expect(summary.findingCount).toBe(3);
        expect(summary.openFindingCount).toBe(1);
        expect(summary.inProgressFindingCount).toBe(1);
        expect(summary.resolvedFindingCount).toBe(1);
        expect(summary.latestReviewItem?.uuid).toBe('open-review');
    });

    it('prefers the recommendation title for the thread headline', () => {
        expect(getThreadReviewHeadline(makeReviewItem())).toBe(
            'Update revenue metric guidance',
        );
    });
});
