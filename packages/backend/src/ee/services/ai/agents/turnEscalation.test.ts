import { type ModelMessage } from 'ai';
import { createTurnEscalation } from './turnEscalation';

const round = (
    id: string,
    error = true,
    toolName = 'runQuery',
): ModelMessage[] => [
    {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: id, toolName, input: {} }],
    },
    {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: id,
                toolName,
                output: {
                    type: error ? 'error-text' : 'text',
                    value: error ? 'Failed' : 'Done',
                },
            },
        ],
    },
];

describe('turn escalation', () => {
    it('escalates once after two failed rounds, independently of error wording', () => {
        const escalation = createTurnEscalation(true, []);
        expect(escalation.observe(round('1'))).toBeNull();
        expect(escalation.observe([...round('1'), ...round('2')])).toBe(
            'stalled-recovery',
        );
        expect(escalation.observe([...round('1'), ...round('2')])).toBeNull();
        expect(escalation.reason).toBe('stalled-recovery');
    });
    it('ignores historical failures and resets after successful work', () => {
        const history = [...round('old-1'), ...round('old-2')];
        const escalation = createTurnEscalation(true, history);
        expect(
            escalation.observe([
                ...history,
                ...round('1'),
                ...round('2', false),
                ...round('3'),
            ]),
        ).toBeNull();
    });
    it('does not count parallel failed tools as multiple reasoning rounds', () => {
        const escalation = createTurnEscalation(true, []);
        expect(
            escalation.observe([round('1')[0], round('1')[1], round('2')[1]]),
        ).toBeNull();
    });
    it('supports explicit requests for wider context even without tool errors', () => {
        const escalation = createTurnEscalation(true, []);
        expect(escalation.observe(round('load', false, 'loadAgentTools'))).toBe(
            'requested-context',
        );
    });
    it('does nothing when disabled, including explicit expansion requests', () => {
        const escalation = createTurnEscalation(false, []);
        expect(
            escalation.observe([
                ...round('1'),
                ...round('2'),
                ...round('load', false, 'loadAgentTools'),
            ]),
        ).toBeNull();
        expect(escalation.reason).toBeNull();
    });
});
