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

describe('AiAgentModel.getThreadMessageStatus', () => {
    const minutesAgo = (minutes: number) =>
        new Date(Date.now() - minutes * 60 * 1000);
    const unanswered = {
        response: null,
        responded_at: null,
        error_message: null,
        created_at: minutesAgo(30),
        retried_at: null,
    };

    it('times out an unanswered prompt five minutes after it was created', () => {
        expect(AiAgentModel.getThreadMessageStatus(unanswered)).toBe('error');
        expect(
            AiAgentModel.getThreadMessageStatus({
                ...unanswered,
                created_at: minutesAgo(1),
            }),
        ).toBe('pending');
    });

    it('counts from the latest retry, so a resumed old prompt stays pending', () => {
        expect(
            AiAgentModel.getThreadMessageStatus({
                ...unanswered,
                retried_at: minutesAgo(1),
            }),
        ).toBe('pending');
        expect(
            AiAgentModel.getThreadMessageStatus({
                ...unanswered,
                retried_at: minutesAgo(10),
            }),
        ).toBe('error');
    });

    it('reports an answered prompt as idle', () => {
        expect(
            AiAgentModel.getThreadMessageStatus({
                ...unanswered,
                response: 'Done.',
                responded_at: minutesAgo(29),
            }),
        ).toBe('idle');
    });
});
