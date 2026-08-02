import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentThread,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AgentChatDisplay } from './AgentChatDisplay';

const { deepResearchRegistrationsMock } = vi.hoisted(() => ({
    deepResearchRegistrationsMock: vi.fn(),
}));

vi.mock('../../hooks/useProjectAiMcpServers', () => ({
    useAgentAiMcpServers: () => ({ data: [] }),
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useDeepResearchThreadRunRegistrations: deepResearchRegistrationsMock,
}));

vi.mock('../DeepResearch/DeepResearchThreadRuns', () => ({
    DeepResearchThreadRuns: ({
        registrations,
    }: {
        registrations: Array<{ promptUuid: string }>;
    }) =>
        registrations.length > 0 ? (
            <div data-testid="conversation-item">Deep research card</div>
        ) : null,
}));

vi.mock('./AgentChatUserBubble', () => ({
    UserBubble: ({ message }: { message: { message: string } }) => (
        <div data-testid="conversation-item">{message.message}</div>
    ),
}));

vi.mock('./AgentChatAssistantBubble', () => ({
    AssistantBubble: ({ message }: { message: { message: string } }) => (
        <div data-testid="conversation-item">{message.message}</div>
    ),
}));

const deepResearchUserMessage: AiAgentMessageUser = {
    role: 'user',
    uuid: 'deep-research-prompt',
    threadUuid: 'thread-1',
    message: 'Find anomalies',
    createdAt: '2026-07-29T09:00:00.000Z',
    user: { uuid: 'user-1', name: 'Demo User' },
    context: [],
    steers: [],
    hidden: false,
};

const getAssistantMessage = (
    uuid: string,
    message: string | null,
    createdAt: string,
): AiAgentMessageAssistant => ({
    role: 'assistant',
    status: 'idle',
    uuid,
    threadUuid: 'thread-1',
    message,
    errorMessage: null,
    interrupted: false,
    createdAt,
    humanScore: null,
    humanFeedback: null,
    toolCalls: [],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    referencedArtifacts: null,
    modelConfig: null,
    tokenUsage: null,
});

const followUpUserMessage: AiAgentMessageUser = {
    ...deepResearchUserMessage,
    uuid: 'follow-up-prompt',
    message: 'What is inside the report?',
    createdAt: '2026-07-29T09:01:00.000Z',
};

const thread: AiAgentThread = {
    uuid: 'thread-1',
    agentUuid: 'agent-1',
    createdAt: '2026-07-29T09:00:00.000Z',
    createdFrom: 'web_app',
    title: 'Deep research chronology',
    titleGeneratedAt: null,
    firstMessage: {
        uuid: 'deep-research-prompt',
        message: 'Find anomalies',
    },
    user: {
        uuid: 'user-1',
        name: 'Demo User',
    },
    compactions: [],
    messages: [
        deepResearchUserMessage,
        getAssistantMessage(
            'deep-research-prompt',
            null,
            '2026-07-29T09:00:01.000Z',
        ),
        followUpUserMessage,
        getAssistantMessage(
            'follow-up-prompt',
            'The report covers anomalies.',
            '2026-07-29T09:01:01.000Z',
        ),
    ],
};

describe('AgentChatDisplay', () => {
    beforeEach(() => {
        deepResearchRegistrationsMock.mockReturnValue([
            { promptUuid: 'deep-research-prompt' },
        ]);
    });

    it('renders a deep research card after its initiating message', () => {
        renderWithProviders(
            <AgentChatDisplay
                thread={thread}
                projectUuid="project-1"
                agentUuid="agent-1"
            />,
        );

        expect(
            screen
                .getAllByTestId('conversation-item')
                .map((element) => element.textContent),
        ).toEqual([
            'Find anomalies',
            'Deep research card',
            'What is inside the report?',
            'The report covers anomalies.',
        ]);
    });

    it('keeps an unanchored optimistic run visible at the thread tail', () => {
        deepResearchRegistrationsMock.mockReturnValue([
            { promptUuid: 'pending-prompt' },
        ]);

        renderWithProviders(
            <AgentChatDisplay
                thread={{
                    ...thread,
                    messages: [
                        followUpUserMessage,
                        getAssistantMessage(
                            'follow-up-prompt',
                            'The report covers anomalies.',
                            '2026-07-29T09:01:01.000Z',
                        ),
                    ],
                }}
                projectUuid="project-1"
                agentUuid="agent-1"
            />,
        );

        expect(
            screen
                .getAllByTestId('conversation-item')
                .map((element) => element.textContent),
        ).toEqual([
            'What is inside the report?',
            'The report covers anomalies.',
            'Deep research card',
        ]);
    });
});
