import {
    prepareSlackThreadContextMessages,
    selectSlackThreadContextMessages,
} from './AiAgentService';

describe('selectSlackThreadContextMessages', () => {
    it('keeps only earlier non-prompt human context', () => {
        expect(
            selectSlackThreadContextMessages({
                messages: [
                    { ts: '100.000001', user: 'U-CONTEXT', text: 'context' },
                    {
                        ts: '150.000001',
                        user: 'U-PROMPT',
                        text: '<@U-BOT> earlier prompt',
                    },
                    {
                        ts: '160.000001',
                        bot_id: 'B-BOT',
                        text: 'bot response',
                    },
                    { ts: '200.000001', user: 'U-CURRENT', text: 'current' },
                    { ts: '300.000001', user: 'U-FUTURE', text: 'future' },
                ],
                currentMessageTs: '200.000001',
                botId: 'B-BOT',
                botUserId: 'U-BOT',
            }),
        ).toEqual([{ ts: '100.000001', user: 'U-CONTEXT', text: 'context' }]);
    });

    it('returns undefined when no context remains', () => {
        expect(
            selectSlackThreadContextMessages({
                messages: [
                    {
                        ts: '100.000001',
                        user: 'U-PROMPT',
                        text: '<@U-BOT> prompt',
                    },
                ],
                currentMessageTs: '200.000001',
                botId: 'B-BOT',
                botUserId: 'U-BOT',
            }),
        ).toBeUndefined();
    });
});

describe('prepareSlackThreadContextMessages', () => {
    it('skips invalid timestamps and orders valid Slack context', () => {
        expect(
            prepareSlackThreadContextMessages({
                messages: [
                    { text: 'later', user: 'U2', ts: '1700000002.2' },
                    { text: 'invalid', user: 'U3', ts: 'invalid' },
                    { text: 'earlier', user: 'U1', ts: '1700000001.1' },
                ],
                slackChannelId: 'C1',
                fallbackUserUuid: 'user-1',
            }),
        ).toMatchObject([
            {
                prompt: 'earlier',
                slackUserId: 'U1',
                promptSlackTs: '1700000001.1',
            },
            {
                prompt: 'later',
                slackUserId: 'U2',
                promptSlackTs: '1700000002.2',
            },
        ]);
    });
});
