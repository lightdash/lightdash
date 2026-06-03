import { type AiAgentToolResult, type SlackPrompt } from '@lightdash/common';
import {
    getFeedbackBlocks,
    PROMPT_HUMAN_SCORE_ACTION_ID,
    PROMPT_HUMAN_SCORE_BLOCK_ID,
} from './getSlackBlocks';

type FeedbackButtonsBlock = {
    type: string;
    block_id: string;
    elements: Array<{
        type: string;
        action_id: string;
        positive_button: { value: string };
        negative_button: { value: string };
    }>;
};

type ActionsBlock = {
    type: string;
    elements: Array<{
        action_id: string;
        url: string;
    }>;
};

const slackPrompt: SlackPrompt = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    createdByUserUuid: 'user-uuid',
    prompt: 'Show revenue',
    createdAt: new Date('2026-06-03T00:00:00Z'),
    response: 'Done',
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
    response_slack_ts: '1.2',
    slackUserId: 'U123',
    slackChannelId: 'C123',
    promptSlackTs: '1.1',
    slackThreadTs: '1.1',
};

const toolResult = (toolName: string, status: string): AiAgentToolResult =>
    ({
        uuid: 'tool-result-uuid',
        promptUuid: slackPrompt.promptUuid,
        result: '{}',
        createdAt: new Date('2026-06-03T00:00:00Z'),
        toolCallId: 'tool-call-uuid',
        toolType: 'built-in',
        toolName,
        metadata: { status },
    }) as unknown as AiAgentToolResult;

describe('getFeedbackBlocks', () => {
    it('uses native Slack feedback buttons with score values', () => {
        const blocks = getFeedbackBlocks(
            slackPrompt,
            [toolResult('runQuery', 'success')],
            'agent-uuid',
            'https://lightdash.example.com',
        );

        const feedbackBlock = blocks[0] as unknown as FeedbackButtonsBlock;
        const feedbackElement = feedbackBlock.elements[0];

        expect(feedbackBlock.type).toBe('context_actions');
        expect(feedbackBlock.block_id).toBe(PROMPT_HUMAN_SCORE_BLOCK_ID);
        expect(feedbackElement.type).toBe('feedback_buttons');
        expect(feedbackElement.action_id).toBe(PROMPT_HUMAN_SCORE_ACTION_ID);

        expect(JSON.parse(feedbackElement.positive_button.value)).toEqual({
            promptUuid: slackPrompt.promptUuid,
            humanScore: 1,
        });
        expect(JSON.parse(feedbackElement.negative_button.value)).toEqual({
            promptUuid: slackPrompt.promptUuid,
            humanScore: -1,
        });
    });

    it('keeps the Lightdash chat link in a separate action row', () => {
        const blocks = getFeedbackBlocks(
            slackPrompt,
            [toolResult('runQuery', 'success')],
            'agent-uuid',
            'https://lightdash.example.com',
        );

        const viewChatBlock = blocks[1] as unknown as ActionsBlock;
        const [viewChatButton] = viewChatBlock.elements;

        expect(viewChatBlock.type).toBe('actions');
        expect(viewChatButton.action_id).toBe('view_chat_in_lightdash');
        expect(viewChatButton.url).toBe(
            'https://lightdash.example.com/projects/project-uuid/ai-agents/agent-uuid/threads/thread-uuid',
        );
    });

    it('does not render when there is no successful answer-producing tool', () => {
        expect(
            getFeedbackBlocks(
                slackPrompt,
                [toolResult('findExplores', 'success')],
                'agent-uuid',
                'https://lightdash.example.com',
            ),
        ).toEqual([]);
    });
});
