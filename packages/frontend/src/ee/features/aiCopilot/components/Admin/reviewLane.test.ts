import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getReviewLane,
    getStartWritebackKind,
    isWritebackRetry,
    LANE_TARGET_STATUS,
    partitionInProgress,
} from './reviewLane';

const base = (
    overrides: Partial<AiAgentReviewItemSummary>,
): AiAgentReviewItemSummary =>
    ({
        status: 'open',
        primaryRootCause: 'semantic_layer',
        prWritebackStatus: null,
        remediation: null,
        linkedPrUrl: null,
        latestFinding: { fixTargets: [] },
        ...overrides,
    }) as unknown as AiAgentReviewItemSummary;

describe('getReviewLane', () => {
    it('triage status → needs_triage', () => {
        expect(getReviewLane(base({ status: 'triage' }))).toBe('needs_triage');
    });
    it('open + ambiguous → todo (lane is status-based)', () => {
        expect(
            getReviewLane(
                base({ status: 'open', primaryRootCause: 'ambiguous' }),
            ),
        ).toBe('todo');
    });
    it('open + feedback_needed fixTarget → todo (lane is status-based)', () => {
        expect(
            getReviewLane(
                base({
                    status: 'open',
                    latestFinding: { fixTargets: ['feedback_needed'] } as never,
                }),
            ),
        ).toBe('todo');
    });
    it('open + actionable → todo', () => {
        expect(getReviewLane(base({ status: 'open' }))).toBe('todo');
    });
    it('in_progress status → in_progress', () => {
        expect(getReviewLane(base({ status: 'in_progress' }))).toBe(
            'in_progress',
        );
    });
    it('open with writeback in flight stays in todo — lane is status-driven', () => {
        expect(
            getReviewLane(
                base({ status: 'open', prWritebackStatus: 'running' }),
            ),
        ).toBe('todo');
    });
    it('open with remediation pr_open stays in todo — lane is status-driven', () => {
        expect(
            getReviewLane(
                base({
                    status: 'open',
                    remediation: { status: 'pr_open' } as never,
                }),
            ),
        ).toBe('todo');
    });
    it.each(['resolved', 'dismissed', 'duplicate'] as const)(
        '%s → done',
        (status) => {
            expect(getReviewLane(base({ status }))).toBe('done');
        },
    );
});

describe('partitionInProgress', () => {
    it('splits writeback-running items into active', () => {
        const a = base({ status: 'in_progress', prWritebackStatus: 'running' });
        const b = base({ status: 'in_progress' });
        const { active, rest } = partitionInProgress([a, b]);
        expect(active).toEqual([a]);
        expect(rest).toEqual([b]);
    });
});

describe('LANE_TARGET_STATUS', () => {
    it('maps each lane to the expected status', () => {
        expect(LANE_TARGET_STATUS.needs_triage).toBe('triage');
        expect(LANE_TARGET_STATUS.todo).toBe('open');
        expect(LANE_TARGET_STATUS.in_progress).toBe('in_progress');
        expect(LANE_TARGET_STATUS.done).toBe('resolved');
    });
});

describe('getStartWritebackKind', () => {
    const eligible = (overrides: Partial<AiAgentReviewItemSummary>) =>
        base({
            writebackEligibility: { eligible: true } as never,
            ...overrides,
        });

    it('returns modal for project_context eligible item without PR', () => {
        expect(
            getStartWritebackKind(
                eligible({ primaryRootCause: 'project_context' }),
            ),
        ).toBe('modal');
    });
    it('returns mutate for semantic_layer eligible item without PR', () => {
        expect(
            getStartWritebackKind(
                eligible({ primaryRootCause: 'semantic_layer' }),
            ),
        ).toBe('mutate');
    });
    it('returns null when writeback is in flight', () => {
        expect(
            getStartWritebackKind(
                eligible({
                    primaryRootCause: 'semantic_layer',
                    prWritebackStatus: 'queued',
                }),
            ),
        ).toBeNull();
    });
    it('returns null when PR is already linked', () => {
        expect(
            getStartWritebackKind(
                eligible({
                    primaryRootCause: 'semantic_layer',
                    linkedPrUrl: 'https://github.com/org/repo/pull/1',
                }),
            ),
        ).toBeNull();
    });
    it('returns null when not eligible', () => {
        expect(
            getStartWritebackKind(
                base({
                    primaryRootCause: 'semantic_layer',
                    writebackEligibility: {
                        eligible: false,
                        reason: 'no_fix_targets',
                    } as never,
                }),
            ),
        ).toBeNull();
    });
    it('returns null for a triage-status item that would otherwise be eligible', () => {
        expect(
            getStartWritebackKind(
                eligible({
                    status: 'triage',
                    primaryRootCause: 'semantic_layer',
                }),
            ),
        ).toBeNull();
    });
    it('returns null for terminal-status items (done lane)', () => {
        (['resolved', 'dismissed', 'duplicate'] as const).forEach((status) => {
            expect(
                getStartWritebackKind(
                    eligible({ status, primaryRootCause: 'semantic_layer' }),
                ),
            ).toBeNull();
        });
    });
});

describe('isWritebackRetry', () => {
    it('is true when a prior writeback failed', () => {
        expect(isWritebackRetry(base({ prWritebackStatus: 'failed' }))).toBe(
            true,
        );
    });
    it('is false when no writeback has failed', () => {
        expect(isWritebackRetry(base({ prWritebackStatus: 'running' }))).toBe(
            false,
        );
    });
});
