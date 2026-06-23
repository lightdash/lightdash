import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    formatRelativeReviewDate,
    getIssueTitle,
    getTargetAnchor,
} from './reviewItemDetails';

const makeItem = (
    overrides: Omit<Partial<AiAgentReviewItemSummary>, 'latestFinding'> & {
        latestFinding?: Record<string, unknown> | null;
    },
): AiAgentReviewItemSummary =>
    ({
        title: 'Fallback title',
        description: 'desc',
        primaryRootCause: 'semantic_layer',
        findingCount: 1,
        ...overrides,
        latestFinding:
            overrides.latestFinding === null
                ? null
                : {
                      fixTargets: [],
                      targetRefs: [],
                      evidenceExcerpts: [],
                      recommendation: null,
                      projectContextEntry: null,
                      ...overrides.latestFinding,
                  },
    }) as unknown as AiAgentReviewItemSummary;

describe('getIssueTitle', () => {
    it('no longer special-cases semantic_layer into a "Review {target}" title', () => {
        const item = makeItem({
            primaryRootCause: 'semantic_layer',
            latestFinding: {
                targetRefs: [
                    {
                        type: 'dimension',
                        modelName: 'users',
                        dimensionName: 'users',
                    },
                ],
                recommendation: {
                    actionType: 'update_semantic_yaml',
                    title: 'Add weekly_active_users metric',
                    rationale: 'because',
                    targetRefs: [],
                },
            },
        });

        expect(getIssueTitle(item)).toBe('Add weekly_active_users metric');
        expect(getIssueTitle(item)).not.toMatch(/^Review /);
    });

    it('falls back to the item title when there is no recommendation', () => {
        const item = makeItem({
            title: 'No metric for weekly active users',
            latestFinding: { recommendation: null },
        });
        expect(getIssueTitle(item)).toBe('No metric for weekly active users');
    });
});

describe('getTargetAnchor', () => {
    it('returns the model.field anchor for the first target ref', () => {
        const item = makeItem({
            latestFinding: {
                targetRefs: [
                    {
                        type: 'metric',
                        modelName: 'orders',
                        metricName: 'total_revenue',
                    },
                ],
            },
        });
        expect(getTargetAnchor(item)).toBe('orders.total_revenue');
    });

    it('returns null when there are no target refs', () => {
        expect(getTargetAnchor(makeItem({ latestFinding: null }))).toBeNull();
    });
});

describe('formatRelativeReviewDate', () => {
    it('renders coarse relative recency for recent findings', () => {
        const now = Date.now();
        expect(formatRelativeReviewDate(new Date(now - 30_000))).toBe(
            'just now',
        );
        expect(formatRelativeReviewDate(new Date(now - 5 * 60_000))).toBe(
            '5m ago',
        );
        expect(formatRelativeReviewDate(new Date(now - 3 * 3_600_000))).toBe(
            '3h ago',
        );
        expect(formatRelativeReviewDate(new Date(now - 2 * 86_400_000))).toBe(
            '2d ago',
        );
    });

    it('falls back to an absolute date once older than a week', () => {
        const old = new Date(Date.now() - 30 * 86_400_000);
        expect(formatRelativeReviewDate(old)).not.toMatch(/ago/);
    });
});
