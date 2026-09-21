import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import { selectWritebackSource } from './writebackSource';

const sources = [
    {
        projectDbtSourceUuid: 'primary',
        name: 'Primary',
        repository: 'acme/analytics',
        branch: 'main',
        projectSubPath: '/',
        isPrimary: true,
    },
    {
        projectDbtSourceUuid: 'marketing',
        name: 'Marketing dbt',
        repository: 'acme/marketing',
        branch: 'main',
        projectSubPath: '/dbt',
        isPrimary: false,
    },
];

describe('writeback source selection', () => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    const answers = {
        target: {
            type: 'choice' as const,
            choice: 'source_1',
            confidence: 0.99,
            probabilities: { source_1: 1 },
        },
    };
    afterEach(() => vi.restoreAllMocks());

    it('returns only a supplied source identity when the source choice is confident', async () => {
        vi.spyOn(decisions, 'evaluate').mockResolvedValue(answers);
        expect(
            await selectWritebackSource(
                decisions,
                'Change marketing, not analytics.',
                sources,
            ),
        ).toBe('marketing');
    });

    it.each<DecisionAnswers | null>([
        null,
        {
            ...answers,
            target: {
                ...answers.target,
                probabilities: { source_1: 0.5, none: 0.5 },
            },
        },
        { ...answers, target: { ...answers.target, confidence: 0.5 } },
        {
            ...answers,
            target: {
                ...answers.target,
                choice: 'none',
                probabilities: { none: 1 },
            },
        },
        {
            ...answers,
            target: {
                ...answers.target,
                choice: 'source_999',
                probabilities: { source_999: 1 },
            },
        },
    ])(
        'abstains on uncertainty, multiple targets or missing identity: %j',
        async (result) => {
            vi.spyOn(decisions, 'evaluate').mockResolvedValue(result);
            expect(
                await selectWritebackSource(
                    decisions,
                    'Change marketing.',
                    sources,
                ),
            ).toBeNull();
        },
    );

    it('avoids a provider call for an empty request or oversized source set', async () => {
        const evaluate = vi.spyOn(decisions, 'evaluate');
        expect(await selectWritebackSource(decisions, '', sources)).toBeNull();
        expect(
            await selectWritebackSource(
                decisions,
                'Change marketing.',
                Array.from({ length: 41 }, () => sources[0]),
            ),
        ).toBeNull();
        expect(
            await selectWritebackSource(decisions, 'a'.repeat(8001), sources),
        ).toBeNull();
        expect(evaluate).not.toHaveBeenCalled();
    });
});
