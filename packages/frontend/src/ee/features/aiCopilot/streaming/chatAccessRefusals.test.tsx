import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { AssistantBubble } from '../components/ChatElements/AgentChatAssistantBubble';
import {
    aiAgentThreadStreamSlice,
    isAiAgentThreadStreamActive,
    isAiAgentThreadStreamRecoveryActive,
    startStreaming,
} from '../store/aiAgentThreadStreamSlice';
import { useAiAgentThreadStreamMutation } from './useAiAgentThreadStreamMutation';

const mocks = vi.hoisted(() => ({
    dispatch: vi.fn(),
    streamState: vi.fn(),
    can: vi.fn(),
    enabled: true,
}));
vi.mock('../store/hooks', () => ({
    useAiAgentStoreDispatch: () => mocks.dispatch,
    useAiAgentStoreSelector: () => null,
}));
vi.mock('./AiAgentThreadStreamAbortControllerContext', () => ({
    useAiAgentThreadStreamAbortController: () => ({
        setAbortController: vi.fn(),
        abort: vi.fn(),
    }),
}));
vi.mock('./useAiAgentThreadStreamQuery', () => ({
    useAiAgentThreadStreamQuery: () => mocks.streamState(),
    useAiAgentThreadMessageStreaming: () => false,
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.enabled } }),
}));
vi.mock('../hooks/useProjectAiAgents', () => ({
    useRetryAiAgentThreadMessageMutation: () => ({ mutate: vi.fn() }),
    useUpdatePromptFeedbackMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: mocks.can }),
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({
        health: {},
        user: {
            data: {
                organizationUuid: 'org',
                ability: { can: mocks.can },
            },
        },
    }),
}));
vi.mock('../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../components/ChatElements/AgentChatDebugDrawer', () => ({
    default: () => null,
}));
vi.mock('../components/ChatElements/AiDocumentCards', () => ({
    default: () => null,
}));
vi.mock('../components/ChatElements/MessageModelIndicator', () => ({
    MessageModelIndicator: () => null,
}));
vi.mock('../components/ChatElements/MessageTimingIndicator', () => ({
    MessageTimingIndicator: () => null,
}));

vi.mock('../components/ChatElements/ToolCalls/WritebackDiffModal', () => ({
    WritebackDiffModal: () => null,
}));

const options = {
    threadUuid: 'thread',
    messageUuid: 'message',
    projectUuid: 'project',
    agentUuid: 'agent',
    refetchThread: vi.fn(),
};
const refusal = new AiAccessRefusedError(
    AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
).refusal;
const message = {
    uuid: 'message',
    threadUuid: 'thread',
    role: 'assistant',
    status: 'error',
    message: '',
    errorMessage: refusal.message,
    toolCalls: [],
    toolResults: [],
    artifacts: [],
    reasoning: [],
} as unknown as AiAgentMessageAssistant;

const renderBubble = (status: AiAgentMessageAssistant['status'] = 'error') =>
    renderWithProviders(
        <MemoryRouter>
            <AssistantBubble
                message={{ ...message, status }}
                hiddenSibling={null}
                isLastMessage
                projectUuid="project"
                agentUuid="agent"
            />
        </MemoryRouter>,
    );

const setupStream = async (data: unknown) => {
    const store = configureStore({ reducer: aiAgentThreadStreamSlice.reducer });
    mocks.dispatch.mockImplementation(store.dispatch);
    mocks.streamState.mockImplementation(() => store.getState().thread);
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'error',
                    error: {
                        statusCode: 403,
                        name: 'ForbiddenError',
                        message: refusal.message,
                        data,
                    },
                }),
                {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        ),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useAiAgentThreadStreamMutation());
    await act(async () => {
        await result.current.streamMessage({ ...options, onError });
    });
    return { store, onError };
};

describe('chat stream access refusals', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.enabled = true;
        mocks.can.mockReturnValue(false);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('preserves the HTTP refusal in a terminal stream state', async () => {
        const { store, onError } = await setupStream(refusal);
        const state = store.getState().thread;
        expect(state.connection).toEqual({ status: 'refused', refusal });
        expect(isAiAgentThreadStreamActive(state.connection)).toBe(false);
        expect(isAiAgentThreadStreamRecoveryActive(state.connection)).toBe(
            false,
        );
        expect(state.timing.finishedAt).not.toBeNull();
        expect(onError).toHaveBeenCalledWith(refusal.message);
        expect(options.refetchThread).not.toHaveBeenCalled();
        store.dispatch(startStreaming({ ...options, autoApproveSql: false }));
        expect(store.getState().thread.connection).toEqual({
            status: 'streaming',
        });
    });

    it.each([
        [false, 'pending'],
        [true, 'pending'],
        [false, 'error'],
        [true, 'error'],
    ] as const)(
        'shows the refusal without retry, with settings only for admins (%s, %s)',
        async (canManage, status) => {
            await setupStream(refusal);
            mocks.can.mockReturnValue(canManage);
            renderBubble(status);
            expect(screen.getByText(refusal.message)).toBeVisible();
            expect(
                screen.queryByText('Something went wrong'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Try again' }),
            ).not.toBeInTheDocument();
            const link = screen.queryByRole('link', {
                name: 'Review agent identity',
            });
            if (canManage)
                expect(link).toHaveAttribute('href', refusal.settingsUrl);
            else expect(link).not.toBeInTheDocument();
        },
    );

    it('keeps ordinary HTTP errors retryable', async () => {
        const { store } = await setupStream({});
        expect(store.getState().thread.connection).toEqual({
            status: 'error',
            error: refusal.message,
        });
        renderBubble();
        expect(screen.getByText('Something went wrong')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    });

    it('keeps the flag-off error presentation unchanged', async () => {
        await setupStream(refusal);
        mocks.enabled = false;
        renderBubble();
        expect(screen.getByText('Something went wrong')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    });
});
