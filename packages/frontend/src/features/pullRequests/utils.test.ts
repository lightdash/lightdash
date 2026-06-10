import type { PullRequestProvider, PullRequestSource } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type PullRequestRow } from './types';
import { getReviewPath, getThreadPath, getThreadPreviewTarget } from './utils';

const makeRow = (overrides: Partial<PullRequestRow> = {}): PullRequestRow => ({
    pullRequestUuid: 'pr-1',
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    createdByUserUuid: 'user-1',
    provider: 'github' as PullRequestProvider,
    source: 'ai_agent' as PullRequestSource,
    owner: 'acme',
    repo: 'dbt',
    prNumber: 42,
    prUrl: 'https://github.com/acme/dbt/pull/42',
    aiThreadUuid: 'thread-1',
    aiAgentUuid: 'agent-1',
    reviewContext: null,
    title: 'Fix metrics',
    state: null,
    createdAt: new Date('2026-06-10T10:00:00.000Z'),
    author: null,
    ...overrides,
});

describe('pullRequests utils', () => {
    it('prefers the source review thread over the writeback thread', () => {
        expect(
            getThreadPreviewTarget(
                makeRow({
                    reviewContext: {
                        reviewItemUuid: 'fingerprint-1',
                        reviewItemFingerprint: 'fingerprint-1',
                        reviewTitle: 'Review revenue metric',
                        reviewStatus: 'open',
                        primaryRootCause: 'semantic_layer',
                        sourceFindingUuid: 'finding-1',
                        sourceThreadUuid: 'review-thread-1',
                        sourceProjectUuid: 'review-project-1',
                        sourceAgentUuid: 'review-agent-1',
                    },
                }),
            ),
        ).toEqual({
            projectUuid: 'review-project-1',
            agentUuid: 'review-agent-1',
            threadUuid: 'review-thread-1',
            reviewItemUuid: 'fingerprint-1',
        });
    });

    it('builds a reviews deep link for pull requests tied to findings', () => {
        expect(
            getReviewPath(
                makeRow({
                    reviewContext: {
                        reviewItemUuid: 'fingerprint-1',
                        reviewItemFingerprint: 'fingerprint-1',
                        reviewTitle: 'Review revenue metric',
                        reviewStatus: 'open',
                        primaryRootCause: 'semantic_layer',
                        sourceFindingUuid: 'finding-1',
                        sourceThreadUuid: 'review-thread-1',
                        sourceProjectUuid: 'review-project-1',
                        sourceAgentUuid: 'review-agent-1',
                    },
                }),
            ),
        ).toBe(
            '/generalSettings/ai/reviews?reviewProjectUuid=review-project-1&reviewAgentUuid=review-agent-1&reviewThreadUuid=review-thread-1&reviewItemUuid=fingerprint-1',
        );
    });

    it('adds the review query param when linking into a review source thread', () => {
        expect(
            getThreadPath(
                makeRow({
                    reviewContext: {
                        reviewItemUuid: 'fingerprint-1',
                        reviewItemFingerprint: 'fingerprint-1',
                        reviewTitle: 'Review revenue metric',
                        reviewStatus: 'open',
                        primaryRootCause: 'semantic_layer',
                        sourceFindingUuid: 'finding-1',
                        sourceThreadUuid: 'review-thread-1',
                        sourceProjectUuid: 'review-project-1',
                        sourceAgentUuid: 'review-agent-1',
                    },
                }),
            ),
        ).toBe(
            '/projects/review-project-1/ai-agents/review-agent-1/threads/review-thread-1?reviewItem=fingerprint-1',
        );
    });
});
