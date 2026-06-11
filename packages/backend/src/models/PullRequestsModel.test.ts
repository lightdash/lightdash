import { toPullRequestReviewContext } from './PullRequestsModel';

const REVIEW_THREAD_UUID = '00000000-0000-0000-0000-000000000007';
const REVIEW_PROJECT_UUID = '00000000-0000-0000-0000-000000000008';
const REVIEW_AGENT_UUID = '00000000-0000-0000-0000-000000000009';
const FINDING_UUID = '00000000-0000-0000-0000-000000000010';
const FINGERPRINT = 'ai_agent_review_item:fingerprint';

const sourceInfo = {
    fingerprint: FINGERPRINT,
    sourceFindingUuid: FINDING_UUID,
    sourceThreadUuid: REVIEW_THREAD_UUID,
    sourceProjectUuid: REVIEW_PROJECT_UUID,
    sourceAgentUuid: REVIEW_AGENT_UUID,
};

describe('toPullRequestReviewContext', () => {
    it('maps a fully populated review source into review context', () => {
        expect(
            toPullRequestReviewContext({
                ...sourceInfo,
                reviewStatus: 'in_progress',
                reviewItemTitle: 'Fix revenue metric guidance',
                primaryRootCause: 'semantic_layer',
            }),
        ).toEqual({
            reviewItemUuid: FINGERPRINT,
            reviewItemFingerprint: FINGERPRINT,
            reviewTitle: 'Fix revenue metric guidance',
            reviewStatus: 'in_progress',
            primaryRootCause: 'semantic_layer',
            sourceFindingUuid: FINDING_UUID,
            sourceThreadUuid: REVIEW_THREAD_UUID,
            sourceProjectUuid: REVIEW_PROJECT_UUID,
            sourceAgentUuid: REVIEW_AGENT_UUID,
        });
    });

    it('applies fallback defaults when title, status, and root cause are absent', () => {
        const context = toPullRequestReviewContext({
            ...sourceInfo,
            reviewStatus: null,
            reviewItemTitle: null,
            primaryRootCause: null,
        });

        expect(context.reviewTitle).toBe('Review AI agent issue');
        expect(context.reviewStatus).toBe('open');
        expect(context.primaryRootCause).toBe('ambiguous');
    });

    it('identifies the review item by fingerprint (the review surface is fingerprint-keyed, not UUID-keyed)', () => {
        const context = toPullRequestReviewContext({
            ...sourceInfo,
            reviewStatus: 'open',
            reviewItemTitle: 'Document revenue definition',
            primaryRootCause: 'project_context',
        });

        expect(context.reviewItemUuid).toBe(FINGERPRINT);
        expect(context.reviewItemFingerprint).toBe(FINGERPRINT);
        expect(context.reviewItemUuid).toBe(context.reviewItemFingerprint);
    });
});
