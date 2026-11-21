import { type LiveAuthNeed, type LiveIntegrationSpec } from './types';

const TEST_WITH_POINTS = {
    test_account: 3,
    our_account: 2,
    paid_account: 1,
    cant_test: 0,
} as const;

const BLOCKING_NEEDS = new Set<LiveAuthNeed>([
    'card',
    'real_person',
    'vendor_approval',
    'sales_contract',
]);

/** Gmail alone 2; plus a phone or someone adding us 1; anything blocking 0. */
const getNeedsPoints = (needs: LiveAuthNeed[]) => {
    if (needs.some((need) => BLOCKING_NEEDS.has(need))) return 0;
    return needs.length === 1 && needs[0] === 'gmail' ? 2 : 1;
};

const getAuthRating = (score: number) => {
    if (score >= 6) return 'easy';
    if (score >= 3) return 'medium';
    return 'hard';
};

/**
 * How easy access is, out of 7: where test data comes from (3), what a
 * person must provide (2), a token a customer can paste (1), and a way in
 * with no vendor review (1).
 */
export const getLiveAuthScore = ({
    auth,
}: Pick<LiveIntegrationSpec, 'auth'>) => {
    const score =
        TEST_WITH_POINTS[auth.testWith] +
        getNeedsPoints(auth.needs) +
        (auth.token ? 1 : 0) +
        (auth.token || auth.oauth === 'no_review' ? 1 : 0);
    return { score, rating: getAuthRating(score) };
};
