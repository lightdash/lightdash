import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel.hasAssistantMessage', () => {
    const unanswered = {
        row: {
            response: null,
            responded_at: null,
            error_message: null,
            interrupted: false,
        },
        isLatestPrompt: false,
        toolCallCount: 0,
        reasoningCount: 0,
    };

    it('drops unanswered past turns, e.g. Slack messages backfilled as context', () => {
        expect(AiAgentModel.hasAssistantMessage(unanswered)).toBe(false);
    });

    it('keeps the latest prompt so it can still show pending or error', () => {
        expect(
            AiAgentModel.hasAssistantMessage({
                ...unanswered,
                isLatestPrompt: true,
            }),
        ).toBe(true);
    });

    it.each([
        ['a response', { response: 'here you go' }],
        ['a responded_at', { responded_at: new Date() }],
        ['an error message', { error_message: 'boom' }],
        ['an interrupt', { interrupted: true }],
    ])('keeps past turns that have %s', (_label, overrides) => {
        expect(
            AiAgentModel.hasAssistantMessage({
                ...unanswered,
                row: { ...unanswered.row, ...overrides },
            }),
        ).toBe(true);
    });

    it.each([
        ['tool calls', { toolCallCount: 1 }],
        ['reasoning', { reasoningCount: 1 }],
    ])('keeps past turns that have %s', (_label, overrides) => {
        expect(
            AiAgentModel.hasAssistantMessage({ ...unanswered, ...overrides }),
        ).toBe(true);
    });
});
