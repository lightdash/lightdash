import type { RelevantVerifiedAnswer } from '../../AiAgentService/AiAgentService';
import { AiDecisionClient } from './AiDecisionClient';
import { selectVerifiedAnswers } from './verifiedAnswers';

const candidate = (id: string, similarity = 0.8): RelevantVerifiedAnswer => ({
    artifactVersionUuid: id,
    artifactType: 'chart',
    title: 'Orders',
    description: null,
    verifiedQuestion: 'Count orders by status',
    similarity,
    chartConfig: {
        queryConfig: {
            exploreName: 'orders',
            metrics: ['orders_count'],
            dimensions: ['orders_status'],
            filters: {},
        },
    },
});

const setup = (scores: [number, number][]) => {
    const answers = Object.fromEntries(
        scores.flatMap(([relevant, same], index) => [
            [`relevant_${index}`, { type: 'noul', noul: relevant }],
            [`same_${index}`, { type: 'noul', noul: same }],
        ]),
    );
    const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
            Response.json({ model: 'test', answers }),
        );
    const decisions = new AiDecisionClient(
        { apiKey: 'test', model: 'test', timeoutMs: 900 },
        request,
    );
    return {
        request,
        args: {
            decisions,
            question: 'Count orders by status',
            legacyThreshold: 0.7,
            limit: 3,
        },
    };
};

describe('verified answer relevance', () => {
    it('promotes a lower-cosine whole-question match without changing its query', async () => {
        const { args, request } = setup([
            [0.02, 0.01],
            [0.96, 0.7],
            [0.99, 0.99],
        ]);
        const candidates = [
            candidate('wrong', 0.99),
            candidate('related'),
            candidate('same', 0.4),
        ];
        const original = structuredClone(candidates);
        expect(await selectVerifiedAnswers({ ...args, candidates })).toEqual([
            candidates[2],
            candidates[1],
        ]);
        expect(candidates).toEqual(original);
        expect(request).toHaveBeenCalledOnce();
    });

    it('retains uncertain legacy candidates but does not admit uncertain expansion', async () => {
        const { args } = setup([
            [0.5, 0.5],
            [0.84, 0.99],
        ]);
        const candidates = [candidate('baseline'), candidate('expanded', 0.4)];
        expect(await selectVerifiedAnswers({ ...args, candidates })).toEqual([
            candidates[0],
        ]);
    });

    it('preserves order for ties and enforces the requested result count', async () => {
        const { args } = setup(Array.from({ length: 4 }, () => [0.99, 0.99]));
        const candidates = ['a', 'b', 'c', 'd'].map((id) => candidate(id));
        expect(
            await selectVerifiedAnswers({ ...args, limit: 2, candidates }),
        ).toEqual(candidates.slice(0, 2));
    });

    it.each(['offline', 'malformed'])(
        'restores the exact cosine shortlist on %s',
        async (failure) => {
            const { args, request } = setup([]);
            if (failure === 'offline')
                request.mockRejectedValue(new Error('offline'));
            const candidates = [
                candidate('a'),
                candidate('boundary', 0.7),
                candidate('expanded', 0.4),
                candidate('b'),
            ];
            expect(
                await selectVerifiedAnswers({ ...args, candidates }),
            ).toEqual([candidates[0], candidates[3]]);
        },
    );

    it('never trims an oversized query to obtain a semantic judgment', async () => {
        const { args, request } = setup([]);
        const large = candidate('large');
        large.chartConfig = { sql: 'x'.repeat(13_000) };
        const expanded = { ...large, similarity: 0.3 };
        expect(
            await selectVerifiedAnswers({
                ...args,
                candidates: [large, expanded],
            }),
        ).toEqual([large]);
        expect(request).not.toHaveBeenCalled();
    });

    it('limits the batch to thirty candidates and leaves unscored baseline entries available', async () => {
        const { args, request } = setup(
            Array.from({ length: 30 }, () => [0.01, 0.01]),
        );
        const candidates = Array.from({ length: 31 }, (_, index) =>
            candidate(String(index)),
        );
        expect(await selectVerifiedAnswers({ ...args, candidates })).toEqual([
            candidates[30],
        ]);
        expect(request).toHaveBeenCalledOnce();
    });

    it.each(['', 'x'.repeat(8_001)])(
        'skips unusable questions',
        async (question) => {
            const { args, request } = setup([]);
            const candidates = [candidate('a')];
            expect(
                await selectVerifiedAnswers({ ...args, question, candidates }),
            ).toEqual(candidates);
            expect(request).not.toHaveBeenCalled();
        },
    );
});
