import {
    rankRecentSimilarPrompts,
    type RecentPromptCandidate,
} from './recentSimilarPrompts';

const candidate = (
    overrides: Partial<RecentPromptCandidate> & { text: string },
): RecentPromptCandidate => ({
    promptUuid: 'p',
    threadUuid: 't',
    userUuid: 'u',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
});

const weeklyReview =
    'Give me the weekly sales review: total payment revenue and number of orders, one row per week, split by payment method, as a table sorted by week. Flag any week where revenue fell more than 10% versus the previous week. Run it for the last 4 weeks.';

describe('rankRecentSimilarPrompts', () => {
    it('matches the same procedure asked for a different period', () => {
        const result = rankRecentSimilarPrompts(weeklyReview, [
            candidate({
                threadUuid: 't1',
                userUuid: 'u1',
                text: 'As usual, the weekly sales review please: revenue and orders per week by payment method as a table, flag weeks where revenue fell over 10%. Four weeks ending 1 February 2026.',
            }),
            candidate({
                threadUuid: 't2',
                userUuid: 'u2',
                text: 'Weekly sales review for September: payment revenue and order count per week, split by payment method, table sorted by week, flag drops over 10% week on week.',
            }),
        ]);

        expect(result.prompts).toHaveLength(2);
        expect(result.threadCount).toBe(2);
        expect(result.userCount).toBe(2);
    });

    it('ignores unrelated questions on the same agent', () => {
        const result = rankRecentSimilarPrompts(weeklyReview, [
            candidate({ text: 'Which customers churned in Q3?' }),
            candidate({
                text: 'What is the average shipping cost by fulfillment center?',
            }),
        ]);

        expect(result.prompts).toHaveLength(0);
        expect(result.threadCount).toBe(0);
    });

    it('counts a user once across several threads', () => {
        const result = rankRecentSimilarPrompts(weeklyReview, [
            candidate({ threadUuid: 't1', userUuid: 'u1', text: weeklyReview }),
            candidate({ threadUuid: 't2', userUuid: 'u1', text: weeklyReview }),
        ]);

        expect(result.threadCount).toBe(2);
        expect(result.userCount).toBe(1);
    });

    it('orders matches by similarity', () => {
        const result = rankRecentSimilarPrompts(weeklyReview, [
            candidate({
                threadUuid: 'loose',
                text: 'Weekly sales review as a table: revenue and orders per week split by payment method, sorted by week.',
            }),
            candidate({ threadUuid: 'exact', text: weeklyReview }),
        ]);

        expect(result.prompts.map((p) => p.threadUuid)).toEqual([
            'exact',
            'loose',
        ]);
    });
});
