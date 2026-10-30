import { type ModelMessage } from 'ai';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi.fn(),
}));

const decisions = { name: 'decision-client' };
const imageHistory: ModelMessage[] = [
    {
        role: 'user',
        content: [
            {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: Buffer.from('image bytes') },
            },
        ],
    },
];
const textHistory: ModelMessage[] = [
    { role: 'user', content: 'Recreate this chart' },
];

const gate = (decisionHistory: ModelMessage[], isSlackPrompt = false) =>
    AiAgentService.resolvePreModelDecisionGate({
        decisions,
        decisionHistory,
        isSlackPrompt,
    });

test('a current screenshot disables text-only shortcuts without mutating the in-loop decision client', () => {
    expect(gate(imageHistory)).toEqual({
        historyHasImages: true,
        preModelDecisions: undefined,
        fastExperienceEnabled: false,
    });
    expect(decisions).toEqual({ name: 'decision-client' });
});

test('retained screenshots keep follow-ups on the primary model', () => {
    expect(
        gate([...imageHistory, ...textHistory]).preModelDecisions,
    ).toBeUndefined();
});

test('an expired-image text placeholder re-enables the existing shortcuts', () => {
    const result = gate([
        {
            role: 'user',
            content:
                'Attached image chart.png has expired. Re-upload it if needed.',
        },
    ]);
    expect(result).toEqual({
        historyHasImages: false,
        preModelDecisions: decisions,
        fastExperienceEnabled: true,
    });
});

test('text-only history preserves the original decision client and fast experience', () => {
    const result = gate(textHistory);
    expect(result.preModelDecisions).toBe(decisions);
    expect(result.fastExperienceEnabled).toBe(true);
});

test('Slack routing is not changed by the browser-image feature', () => {
    expect(gate(imageHistory, true)).toEqual({
        historyHasImages: false,
        preModelDecisions: decisions,
        fastExperienceEnabled: true,
    });
});

test('a missing decision client cannot enable either fast path', () => {
    expect(
        AiAgentService.resolvePreModelDecisionGate({
            decisions: undefined,
            decisionHistory: textHistory,
            isSlackPrompt: false,
        }),
    ).toEqual({
        historyHasImages: false,
        preModelDecisions: undefined,
        fastExperienceEnabled: false,
    });
});
