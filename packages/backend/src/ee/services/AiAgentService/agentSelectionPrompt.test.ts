import {
    findAgentSelectionMessageByTs,
    findLegacyAgentSelectionMessage,
    parseAgentSelectionValue,
} from './agentSelectionPrompt';

const SLACK_USER_ID = 'U123';
const OTHER_USER_ID = 'U999';
const BOT_USER_ID = 'U0BOT01';
const ROOT_TS = '1700000000.000100';
const FOLLOW_UP_TS = '1700000000.000300';

const threadMessages = [
    {
        user: SLACK_USER_ID,
        text: `<@${BOT_USER_ID}> which agents are available here?`,
        ts: ROOT_TS,
    },
    {
        user: OTHER_USER_ID,
        text: 'no idea',
        ts: '1700000000.000200',
    },
    {
        user: SLACK_USER_ID,
        text: `<@${BOT_USER_ID}> what were revenues last month?`,
        ts: FOLLOW_UP_TS,
    },
];

describe('parseAgentSelectionValue', () => {
    it('reads the triggering message ts from the picker payload', () => {
        expect(
            parseAgentSelectionValue(
                JSON.stringify({
                    agentUuid: 'agent-1',
                    channelId: 'C123',
                    shouldSkipForwardingQuery: true,
                    promptSlackTs: FOLLOW_UP_TS,
                }),
            ),
        ).toEqual({
            agentUuid: 'agent-1',
            channelId: 'C123',
            shouldSkipForwardingQuery: true,
            promptSlackTs: FOLLOW_UP_TS,
        });
    });

    it('reports no ts for pickers posted before the ts was carried', () => {
        expect(
            parseAgentSelectionValue(
                JSON.stringify({
                    agentUuid: 'agent-1',
                    channelId: 'C123',
                    shouldSkipForwardingQuery: false,
                }),
            ),
        ).toEqual({
            agentUuid: 'agent-1',
            channelId: 'C123',
            shouldSkipForwardingQuery: false,
            promptSlackTs: null,
        });
    });

    it('defaults the forwarding flag to forwarding the query', () => {
        expect(
            parseAgentSelectionValue(
                JSON.stringify({ agentUuid: 'agent-1', channelId: 'C123' }),
            )?.shouldSkipForwardingQuery,
        ).toBe(false);
    });

    it.each([
        ['not json', 'not json'],
        ['a json literal', '"agent-1"'],
        ['a missing agent', JSON.stringify({ channelId: 'C123' })],
        ['a missing channel', JSON.stringify({ agentUuid: 'agent-1' })],
        [
            'a non-string agent',
            JSON.stringify({ agentUuid: 1, channelId: 'C123' }),
        ],
    ])('rejects %s', (_label, value) => {
        expect(parseAgentSelectionValue(value)).toBeNull();
    });

    it('ignores a non-string ts rather than rejecting the whole payload', () => {
        expect(
            parseAgentSelectionValue(
                JSON.stringify({
                    agentUuid: 'agent-1',
                    channelId: 'C123',
                    promptSlackTs: 1700000000,
                }),
            )?.promptSlackTs,
        ).toBeNull();
    });
});

describe('findAgentSelectionMessageByTs', () => {
    it('picks the message that opened the picker, not the thread root', () => {
        expect(
            findAgentSelectionMessageByTs(threadMessages, FOLLOW_UP_TS),
        ).toEqual({
            text: `<@${BOT_USER_ID}> what were revenues last month?`,
            ts: FOLLOW_UP_TS,
        });
    });

    it('picks the thread root when the root opened the picker', () => {
        expect(findAgentSelectionMessageByTs(threadMessages, ROOT_TS)).toEqual({
            text: `<@${BOT_USER_ID}> which agents are available here?`,
            ts: ROOT_TS,
        });
    });

    it('resolves nothing when the message is gone', () => {
        expect(findAgentSelectionMessageByTs([], FOLLOW_UP_TS)).toBeNull();
    });

    it('resolves nothing rather than substituting another message', () => {
        expect(
            findAgentSelectionMessageByTs(threadMessages, '1700000000.000999'),
        ).toBeNull();
    });

    it('resolves nothing for a message with no text', () => {
        expect(
            findAgentSelectionMessageByTs(
                [{ user: SLACK_USER_ID, ts: FOLLOW_UP_TS }],
                FOLLOW_UP_TS,
            ),
        ).toBeNull();
    });
});

describe('findLegacyAgentSelectionMessage', () => {
    it('falls back to the first message by the selecting user in a multi-agent channel', () => {
        expect(
            findLegacyAgentSelectionMessage(threadMessages, {
                slackUserId: SLACK_USER_ID,
                botUserId: BOT_USER_ID,
                isMultiAgentChannel: true,
            }),
        ).toEqual({
            text: `<@${BOT_USER_ID}> which agents are available here?`,
            ts: ROOT_TS,
        });
    });

    it('skips messages from other users', () => {
        expect(
            findLegacyAgentSelectionMessage(
                [
                    { user: OTHER_USER_ID, text: 'first', ts: ROOT_TS },
                    {
                        user: SLACK_USER_ID,
                        text: 'second',
                        ts: FOLLOW_UP_TS,
                    },
                ],
                {
                    slackUserId: SLACK_USER_ID,
                    botUserId: BOT_USER_ID,
                    isMultiAgentChannel: true,
                },
            ),
        ).toEqual({ text: 'second', ts: FOLLOW_UP_TS });
    });

    it('requires a bot mention outside the multi-agent channel', () => {
        expect(
            findLegacyAgentSelectionMessage(
                [
                    { user: SLACK_USER_ID, text: 'no mention', ts: ROOT_TS },
                    {
                        user: SLACK_USER_ID,
                        text: `<@${BOT_USER_ID}> revenues?`,
                        ts: FOLLOW_UP_TS,
                    },
                ],
                {
                    slackUserId: SLACK_USER_ID,
                    botUserId: BOT_USER_ID,
                    isMultiAgentChannel: false,
                },
            ),
        ).toEqual({
            text: `<@${BOT_USER_ID}> revenues?`,
            ts: FOLLOW_UP_TS,
        });
    });

    it('resolves nothing when no message matches', () => {
        expect(
            findLegacyAgentSelectionMessage(threadMessages, {
                slackUserId: 'U-nobody',
                botUserId: BOT_USER_ID,
                isMultiAgentChannel: true,
            }),
        ).toBeNull();
    });
});
