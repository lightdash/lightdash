import type { AiAgentWithContext } from '@lightdash/common';
import { generateObject } from 'ai';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { selectAgent } from './agentSelector';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateObject: vi.fn(),
}));

const candidates = ['sales', 'finance'].map((uuid) => ({
    uuid,
    name: uuid,
    description: null,
    instruction: null,
    context: { explores: [], verifiedQuestions: [] },
})) as unknown as AiAgentWithContext[];

describe('agent routing abstention', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([false, true])(
        'preserves the legacy fallback unless decisions are enabled (%s)',
        async (enabled) => {
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: {
                    agentUuid: 'unknown',
                    reasoning: '',
                    confidence: 'high',
                    shouldSkipForwardingQuery: false,
                },
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            } as never);
            const result = await selectAgent({
                model: 'test-model',
                candidates,
                prompt: 'Revenue',
                decisions: enabled
                    ? ({
                          evaluate: async () => null,
                      } as unknown as AiDecisionClient)
                    : undefined,
            });
            expect(result).toMatchObject({
                selectedAgentUuid: enabled ? null : candidates[0].uuid,
                confidence: 'low',
                shouldSkipForwardingQuery: false,
            });
        },
    );

    it('keeps abstention explicit when no closed-choice candidate fits', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        vi.spyOn(decisions, 'evaluate').mockResolvedValue({
            agent: {
                type: 'choice',
                choice: 'none',
                confidence: 0.99,
                probabilities: { none: 1 },
            },
            meta: { type: 'noul', noul: 0.01 },
        });
        const result = await selectAgent({
            model: 'test-model',
            candidates,
            prompt: 'Unknown domain',
            decisions,
        });
        expect(result).toMatchObject({
            selectedAgentUuid: null,
            confidence: 'low',
            shouldSkipForwardingQuery: false,
        });
    });

    it('preserves the generator confidence on provider outage for caller policy', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        vi.spyOn(decisions, 'evaluate').mockResolvedValue(null);
        vi.mocked(generateObject).mockResolvedValueOnce({
            object: {
                agentUuid: 'finance',
                reasoning: '',
                confidence: 'medium',
                shouldSkipForwardingQuery: false,
            },
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        } as never);
        const result = await selectAgent({
            model: 'test-model',
            candidates,
            prompt: 'Revenue',
            decisions,
        });
        expect(result).toMatchObject({
            selectedAgentUuid: 'finance',
            confidence: 'medium',
        });
    });
});
