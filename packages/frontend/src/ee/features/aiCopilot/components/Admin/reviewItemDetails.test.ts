import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_VISIBLE_ROOT_CAUSES,
    formatRelativeReviewDate,
    getIssueTitle,
    getReviewReasoningText,
    getReviewSecondaryDetail,
    getTargetAnchor,
    getWhyText,
    SURFACED_ROOT_CAUSES,
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
                      subcategories: [],
                      targetRefs: [],
                      evidenceExcerpts: [],
                      recommendation: null,
                      projectContextEntry: null,
                      ...overrides.latestFinding,
                  },
    }) as unknown as AiAgentReviewItemSummary;

describe('SURFACED_ROOT_CAUSES', () => {
    it('never offers product capability as a category', () => {
        expect(SURFACED_ROOT_CAUSES).not.toContain('product_capability');
        expect(SURFACED_ROOT_CAUSES).toContain('semantic_layer');
        expect(DEFAULT_VISIBLE_ROOT_CAUSES).not.toContain('product_capability');
    });
});

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

describe('getReviewReasoningText', () => {
    it('formats a persisted legacy string ref', () => {
        const item = makeItem({
            primaryRootCause: 'project_context',
            latestFinding: {
                projectContextEntry: {
                    op: 'create',
                    id: null,
                    kind: 'context',
                    content: 'Use the orders explore.',
                    terms: [],
                    objects: ['orders'],
                },
            },
        });

        expect(getReviewReasoningText(item)).toContain('Objects: orders.');
    });

    it('uses the review item project context entry for memory nominations', () => {
        const item = makeItem({
            source: 'memory',
            projectContextEntry: {
                op: 'create',
                id: null,
                kind: 'context',
                content: 'Use approved net revenue definitions.',
                terms: [],
                objects: ['orders'],
                title: null,
                apply: null,
            },
            latestFinding: null,
        });

        expect(getReviewReasoningText(item)).toContain(
            'Use approved net revenue definitions.',
        );
    });

    it('ignores finding entries for memory items without an item entry', () => {
        const item = makeItem({
            source: 'memory',
            nominationReason: 'Promote the approved revenue definition.',
            projectContextEntry: null,
            latestFinding: {
                projectContextEntry: {
                    op: 'create',
                    id: null,
                    kind: 'context',
                    content: 'Stray finding entry.',
                    terms: [],
                    objects: [],
                },
            },
        });

        expect(getReviewReasoningText(item)).toBe(
            'Promote the approved revenue definition.',
        );
        expect(getReviewSecondaryDetail(item)).toBeNull();
    });

    it('ignores item entries for non-memory items', () => {
        const item = makeItem({
            source: 'manual',
            description: 'Manually filed issue.',
            projectContextEntry: {
                op: 'create',
                id: null,
                kind: 'context',
                content: 'Stray item entry.',
                terms: [],
                objects: [],
                title: null,
                apply: null,
            },
            latestFinding: null,
        });

        expect(getReviewReasoningText(item)).toBe('Manually filed issue.');
        expect(getReviewSecondaryDetail(item)).toBeNull();
    });
});

describe('getWhyText', () => {
    it('keeps delimiter-like text in a structured nomination reason', () => {
        const reason = 'Useful\n\nNominated by is part of the reason';
        expect(
            getWhyText(
                makeItem({
                    source: 'memory',
                    description: 'Legacy description',
                    nominationReason: reason,
                }),
            ),
        ).toBe(reason);
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
