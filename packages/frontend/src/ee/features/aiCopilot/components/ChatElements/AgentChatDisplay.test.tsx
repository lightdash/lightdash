import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentThread,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type useApp from '../../../../../providers/App/useApp';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AgentChatDisplay } from './AgentChatDisplay';

const { deepResearchRegistrationsMock, trackMock } = vi.hoisted(() => ({
    trackMock: vi.fn(),
    deepResearchRegistrationsMock: vi.fn(),
}));

vi.mock('../../../../../providers/App/useApp', async (importOriginal) => {
    const actual = await importOriginal<{ default: typeof useApp }>();
    return {
        default: () => ({
            ...actual.default(),
            user: { data: { organizationUuid: 'org-1' } },
        }),
    };
});

vi.mock('../../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: trackMock }),
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
    AssistantBubble: ({
        message,
        hiddenSibling,
    }: {
        message: { message: string };
        hiddenSibling: { message: string } | null;
    }) => (
        <div
            data-testid="conversation-item"
            data-hidden-sibling={hiddenSibling?.message}
        >
            {message.message}
        </div>
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
    responseTiming: null,
    jevDecision: null,
    loadout: null,
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
    pinnedAt: null,
    battleProfile: null,
    liveStatus: null,
    binding: null,
    threadContext: null,
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

    it('hands a hidden restore turn to its assistant reply and shows no user bubble', () => {
        deepResearchRegistrationsMock.mockReturnValue([]);
        const restoreUserMessage: AiAgentMessageUser = {
            ...followUpUserMessage,
            uuid: 'restore-prompt',
            message: 'Restore version 1 of Revenue app',
            createdAt: '2026-07-29T09:02:00.000Z',
            hidden: true,
            context: [
                {
                    type: 'data_app_restore',
                    appUuid: 'app-1',
                    version: 3,
                    restoredFromVersion: 1,
                    appSlug: 'revenue-app',
                    displayName: 'Revenue app',
                },
            ],
        };

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
                        restoreUserMessage,
                        getAssistantMessage(
                            'restore-prompt',
                            'Restored version 1 as version 3.',
                            '2026-07-29T09:02:01.000Z',
                        ),
                    ],
                }}
                projectUuid="project-1"
                agentUuid="agent-1"
            />,
        );

        const items = screen.getAllByTestId('conversation-item');
        expect(items.map((element) => element.textContent)).toEqual([
            'What is inside the report?',
            'The report covers anomalies.',
            'Restored version 1 as version 3.',
        ]);
        expect(items.map((element) => element.dataset.hiddenSibling)).toEqual([
            undefined,
            undefined,
            'Restore version 1 of Revenue app',
        ]);
    });

    it('shows a pending question above the composer', () => {
        deepResearchRegistrationsMock.mockReturnValue([]);
        const asking: AiAgentMessageAssistant = {
            ...getAssistantMessage(
                'follow-up-prompt',
                'Which month?',
                '2026-07-29T09:01:01.000Z',
            ),
            toolCalls: [
                {
                    uuid: 'call-row',
                    promptUuid: 'follow-up-prompt',
                    toolCallId: 'ask-1',
                    parentToolCallId: null,
                    createdAt: new Date('2026-07-29T09:01:01.000Z'),
                    toolType: 'built-in',
                    toolName: 'askUser',
                    toolArgs: {
                        questions: [
                            {
                                header: 'Period',
                                question: 'Which month?',
                                options: [
                                    { label: 'November', description: '' },
                                    { label: 'October', description: '' },
                                ],
                                multiSelect: false,
                            },
                        ],
                    },
                },
            ],
        };
        const onChoiceSelect = vi.fn();
        renderWithProviders(
            <AgentChatDisplay
                thread={{ ...thread, messages: [followUpUserMessage, asking] }}
                projectUuid="project-1"
                agentUuid="agent-1"
                onChoiceSelect={onChoiceSelect}
            >
                <textarea aria-label="Composer" />
            </AgentChatDisplay>,
        );

        expect(screen.getByRole('radio', { name: /November/ })).toBeVisible();
        expect(screen.getByLabelText('Composer')).toBeVisible();

        fireEvent.click(screen.getByRole('radio', { name: /October/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

        expect(onChoiceSelect).toHaveBeenCalledWith('October');
        expect(trackMock).toHaveBeenCalledWith({
            name: 'ai_agent.question_answered',
            properties: expect.objectContaining({
                organizationId: 'org-1',
                messageId: asking.uuid,
                questionCount: 1,
                typedAnswerCount: 0,
            }),
        });
    });
});
