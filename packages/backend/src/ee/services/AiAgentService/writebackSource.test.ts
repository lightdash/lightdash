import type {
    AiWebAppPrompt,
    AiWritebackSource,
    SlackPrompt,
} from '@lightdash/common';
import { getAiWritebackEventSource } from '../AiWritebackService/AiWritebackService';
import { getAiWritebackSourceForPrompt } from './AiAgentService';

const webPrompt = {
    promptUuid: 'prompt-1',
    threadUuid: 'thread-1',
    organizationUuid: 'organization-1',
    projectUuid: 'project-1',
} as AiWebAppPrompt;

const slackPrompt = {
    ...webPrompt,
    slackUserId: 'user-1',
    slackChannelId: 'channel-1',
    promptSlackTs: '1.1',
    slackThreadTs: '1.0',
    response_slack_ts: '1.2',
} as SlackPrompt;

describe('AI writeback event sources', () => {
    it.each<{
        surface: string;
        source: () => AiWritebackSource;
        expected: string;
    }>([
        {
            surface: 'chat',
            source: () => getAiWritebackSourceForPrompt(webPrompt, undefined),
            expected: 'chat',
        },
        {
            surface: 'slack',
            source: () => getAiWritebackSourceForPrompt(slackPrompt, undefined),
            expected: 'slack',
        },
        {
            surface: 'api',
            source: () => 'api',
            expected: 'api',
        },
        {
            surface: 'mcp',
            source: () => 'mcp',
            expected: 'mcp',
        },
        {
            surface: 'review item',
            source: () =>
                getAiWritebackSourceForPrompt(webPrompt, 'admin_review'),
            expected: 'review_item',
        },
    ])('emits $expected for $surface', ({ source, expected }) => {
        expect(getAiWritebackEventSource(source())).toBe(expected);
    });

    it('classifies a later user turn on a review thread as chat', () => {
        expect(
            getAiWritebackEventSource(
                getAiWritebackSourceForPrompt(webPrompt, undefined),
            ),
        ).toBe('chat');
    });
});
