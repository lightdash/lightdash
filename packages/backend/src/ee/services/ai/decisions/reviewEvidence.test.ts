import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import { rankReviewEvidence } from './reviewEvidence';

const fixture = (count = 8) => ({
    userPrompt: 'Show revenue excluding coupons.',
    assistantResponse: 'Revenue is 100.',
    humanFeedback: null,
    nextUserPrompt: 'You included coupons.',
    errorMessage: null,
    supportingEvidence: Array.from({ length: count }, (_, index) => ({
        source: 'tool_trace' as const,
        toolCallId: `tool-${index}`,
        toolName: index === 6 ? 'runQuery' : 'grepFields',
        parentToolCallId: index === 6 ? 'parent-1' : null,
        createdAt: new Date('2026-01-01'),
        relevanceScore: 100 - index,
        toolArgsPreview: index === 6 ? '{"filters":{}}' : '{}',
        resultPreview: 'Some result.',
    })),
});

describe('review evidence ranking', () => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    afterEach(() => vi.restoreAllMocks());

    it('promotes direct evidence beyond the original top five while retaining IDs and provenance', async () => {
        const evaluate = vi.spyOn(decisions, 'evaluate').mockResolvedValue({
            evidence_6: { type: 'score', score: 4, confidence: 0.99 },
        });
        const candidate = fixture();
        const result = await rankReviewEvidence(decisions, candidate);
        expect(result).toEqual([
            candidate.supportingEvidence[6],
            ...candidate.supportingEvidence.slice(0, 4),
        ]);
        expect(result[0].parentToolCallId).toBe('parent-1');
        expect(candidate.supportingEvidence[0].toolCallId).toBe('tool-0');
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            nextUserPrompt: 'You included coupons.',
        });
    });

    it.each<DecisionAnswers | null>([
        null,
        {},
        { evidence_6: { type: 'score' as const, score: 4, confidence: 0.5 } },
        { evidence_6: { type: 'score' as const, score: 2, confidence: 0.99 } },
    ])(
        'preserves deterministic selection on unavailable or weak evidence: %j',
        async (answers) => {
            vi.spyOn(decisions, 'evaluate').mockResolvedValue(answers);
            const candidate = fixture();
            expect(await rankReviewEvidence(decisions, candidate)).toEqual(
                candidate.supportingEvidence.slice(0, 5),
            );
        },
    );

    it('bounds the shortlist and retains baseline order for ties', async () => {
        const evaluate = vi
            .spyOn(decisions, 'evaluate')
            .mockImplementation(async ({ questions }) =>
                Object.fromEntries(
                    Object.keys(questions).map((key) => [
                        key,
                        { type: 'score' as const, score: 4, confidence: 1 },
                    ]),
                ),
            );
        const candidate = fixture(40);
        expect(await rankReviewEvidence(decisions, candidate)).toEqual(
            candidate.supportingEvidence.slice(0, 5),
        );
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toHaveLength(
            30,
        );
    });

    it('skips the provider when all available evidence already fits', async () => {
        const evaluate = vi.spyOn(decisions, 'evaluate');
        const candidate = fixture(5);
        expect(await rankReviewEvidence(decisions, candidate)).toEqual(
            candidate.supportingEvidence,
        );
        expect(evaluate).not.toHaveBeenCalled();
    });
});
