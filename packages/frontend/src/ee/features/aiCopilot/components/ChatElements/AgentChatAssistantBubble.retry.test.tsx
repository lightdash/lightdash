import { type AiAgentMessageAssistant } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AssistantBubble } from './AgentChatAssistantBubble';

vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
    useAiAgentStoreSelector: () => null,
}));
vi.mock('../../streaming/useAiAgentThreadStreamQuery', () => ({
    useAiAgentThreadStreamQuery: () => undefined,
    useAiAgentThreadMessageStreaming: () => false,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../../hooks/useProjectAiAgents', () => ({
    useRetryAiAgentThreadMessageMutation: () => ({ mutate: vi.fn() }),
    useUpdatePromptFeedbackMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => true }),
}));
vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: {},
        user: {
            data: { organizationUuid: 'org', ability: { can: () => true } },
        },
    }),
}));
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        isSuccess: false,
        error: null,
    }),
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));
vi.mock('./AgentChatDebugDrawer', () => ({ default: () => null }));
vi.mock('./AiDocumentCards', () => ({ default: () => null }));
vi.mock('./MessageTimingIndicator', () => ({
    MessageTimingIndicator: () => null,
}));
vi.mock('./ToolCalls/WritebackDiffModal', () => ({
    WritebackDiffModal: () => null,
}));

const erroredMessage = {
    uuid: 'message',
    threadUuid: 'thread',
    role: 'assistant',
    status: 'error',
    message: '',
    errorMessage: 'The bot could not answer.',
    toolCalls: [],
    toolResults: [],
    artifacts: [],
    reasoning: [],
    createdAt: new Date().toISOString(),
    vizConfigOutput: null,
    filtersOutput: null,
    metricQuery: null,
    humanScore: null,
    user: { uuid: 'user', name: 'User' },
    savedQueryUuid: null,
    interrupted: false,
} as unknown as AiAgentMessageAssistant;

const renderBubble = (canRetry: boolean) =>
    renderWithProviders(
        <MemoryRouter>
            <AssistantBubble
                message={erroredMessage}
                hiddenSibling={null}
                isLastMessage
                canRetry={canRetry}
                projectUuid="project"
                agentUuid="agent"
            />
        </MemoryRouter>,
    );

describe('retrying a failed assistant message', () => {
    it('offers Try again on threads that can be continued here', () => {
        renderBubble(true);

        expect(screen.getByText('The bot could not answer.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    });

    it('shows the error without Try again on read-only threads', () => {
        renderBubble(false);

        expect(screen.getByText('The bot could not answer.')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument();
    });
});
