import {
    ForbiddenError,
    type AiAgentSummary,
    type AiPromptContextInput,
    type ApiError,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type ComponentProps, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { type AiAgentToolResult } from '../../types';
import { BubbleThread } from './BubbleThread';

type Submit = (args: {
    message: string;
    toolHints: string[];
    context?: AiPromptContextInput;
}) => void | Promise<unknown>;

const replyContext: AiPromptContextInput = [
    { type: 'chart', chartUuid: 'chart-1' },
];

const state = vi.hoisted(() => ({
    createMessage: vi.fn(),
    navigate: vi.fn(),
    threadHookArgs: [] as unknown[][],
    mutationHookArgs: [] as unknown[][],
    isStreaming: false,
}));

vi.mock('../../../../../api');
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useNavigate: () => state.navigate,
}));
vi.mock('../../../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({ project: { slug: 'jaffle' } }),
}));
vi.mock('../../hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => false,
}));
vi.mock('../../hooks/useDeepResearch', () => ({
    useDeepResearchThreadRunRegistrations: () => [],
}));
vi.mock('../../hooks/useProjectAiMcpServers', () => ({
    useAgentAiMcpServers: () => ({ data: [] }),
}));
vi.mock('../../hooks/useDashboardPageContextCuration', () => ({
    useDashboardPageContextCuration: () => ({
        curateContext: (context: unknown) => context,
        recordSubmittedContext: vi.fn(),
    }),
}));
vi.mock('../../hooks/useRefreshDocumentOnAgentSave', () => ({
    useRefreshDocumentOnAgentSave: () => vi.fn(),
}));
vi.mock('../../hooks/usePendingThreadRefetch', () => ({
    usePendingThreadRefetch: () => ({
        isStreaming: state.isStreaming,
        isThreadPending: false,
    }),
}));
// The agent hooks are real, so a refused agent fetch runs its own error handling.
vi.mock('../../hooks/useProjectAiAgents', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useCreateAgentThreadMessageMutation: (...args: unknown[]) => {
        state.mutationHookArgs.push(args);
        return { mutateAsync: state.createMessage, isLoading: false };
    },
    useAiAgentThread: (...args: unknown[]) => {
        state.threadHookArgs.push(args);
        return {
            data: {
                uuid: 'thread-1',
                createdFrom: 'web_app',
                binding: null,
                compactions: [],
                user: { uuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce' },
                messages: [
                    {
                        role: 'user',
                        uuid: 'prompt-1',
                        message: 'Make this chart a bar chart',
                        createdAt: '2026-11-20T09:00:00.000Z',
                        context: [],
                        hidden: false,
                    },
                    {
                        role: 'assistant',
                        uuid: 'prompt-1',
                        message: 'Done, it is a bar chart now',
                        createdAt: '2026-11-20T09:00:05.000Z',
                    },
                ],
            },
            isLoading: false,
            refetch: vi.fn(),
        };
    },
}));
vi.mock('../ChatElements/ScrollToBottom', () => ({ default: () => null }));
vi.mock('../ChatElements/AgentChatUserBubble', () => ({
    UserBubble: ({ message }: { message: { message: string } }) => (
        <div>{message.message}</div>
    ),
}));
vi.mock('../ChatElements/AgentChatAssistantBubble', () => ({
    AssistantBubble: ({ message }: { message: { message: string } }) => (
        <div>{message.message}</div>
    ),
}));
// The composer is covered by its own tests: here it is a reply button.
vi.mock('../ChatElements/AgentChatInput', () => ({
    AgentChatInput: ({
        onSubmit,
        toolbarStart,
        loading,
    }: {
        onSubmit: Submit;
        toolbarStart: ReactNode;
        loading: boolean;
    }) => (
        <div>
            {toolbarStart}
            <button
                type="button"
                disabled={loading}
                onClick={() =>
                    void onSubmit({
                        message: 'Make it blue',
                        toolHints: [],
                        context: replyContext,
                    })
                }
            >
                Send reply
            </button>
        </div>
    ),
}));

type Props = ComponentProps<typeof BubbleThread>;

const baseProps = (overrides: Partial<Props> = {}): Props => ({
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadId: 'thread-1',
    armed: false,
    onArm: vi.fn(),
    replyCollecting: false,
    onSendReply: vi.fn().mockResolvedValue(undefined),
    onClose: null,
    ...overrides,
});

const ui = (props: Props) => (
    <Provider store={store}>
        <MemoryRouter>
            <BubbleThread {...props} />
        </MemoryRouter>
    </Provider>
);

const renderThread = (overrides: Partial<Props> = {}) => {
    const props = baseProps(overrides);
    renderWithProviders(ui(props));
    return props;
};

const dashboardEdit = (href: string, uuid: string, slug: string) =>
    ({
        isPreliminary: false,
        toolName: 'editContent',
        toolArgs: { type: 'dashboard' },
        toolResult: { metadata: { status: 'success', href, uuid, slug } },
    }) as unknown as AiAgentToolResult;

const onToolResult = () => {
    const options = state.mutationHookArgs.at(-1)?.[3] as {
        onToolResult: (toolResult: AiAgentToolResult) => void;
    };
    return options.onToolResult;
};

// The signed-in user loads after the first render; until then the thread is read-only.
const enabledTool = async (name: string) => {
    await waitFor(() =>
        expect(screen.getByRole('button', { name })).toBeEnabled(),
    );
};

describe('BubbleThread', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.createMessage.mockResolvedValue({ uuid: 'prompt-2' });
        state.threadHookArgs = [];
        state.mutationHookArgs = [];
        state.isStreaming = false;
        mockedLightdashApi.mockResolvedValue([
            { uuid: 'agent-1', name: 'Data agent', imageUrl: null },
        ] as AiAgentSummary[]);
        window.history.pushState({}, '', '/');
    });

    it("shows the thread's messages", async () => {
        renderThread();
        expect(
            screen.getByText('Make this chart a bar chart'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Done, it is a bar chart now'),
        ).toBeInTheDocument();
        expect(await screen.findByText('Data agent')).toBeInTheDocument();
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/projects/project-1/aiAgents' }),
        );
        expect(state.threadHookArgs.at(-1)).toEqual([
            'project-1',
            'agent-1',
            'thread-1',
        ]);
    });

    it('a typed reply with no marks posts to the same thread', async () => {
        const props = renderThread();
        fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
        await waitFor(() =>
            expect(state.createMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    prompt: 'Make it blue',
                    context: replyContext,
                }),
            ),
        );
        expect(state.mutationHookArgs.at(-1)?.slice(0, 3)).toEqual([
            'project-1',
            'agent-1',
            'thread-1',
        ]);
        expect(props.onSendReply).not.toHaveBeenCalled();
    });

    it('a reply typed while this bubble is armed with nothing collected posts to the thread', async () => {
        const props = renderThread({ armed: true });
        fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
        await waitFor(() => expect(state.createMessage).toHaveBeenCalled());
        expect(props.onSendReply).not.toHaveBeenCalled();
    });

    it('a reply with marks goes out with the marks', async () => {
        const props = renderThread({ armed: true, replyCollecting: true });
        fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
        await waitFor(() =>
            expect(props.onSendReply).toHaveBeenCalledWith(
                'Make it blue',
                replyContext,
            ),
        );
        expect(state.createMessage).not.toHaveBeenCalled();
    });

    it("the reply bar's Stylus arms this bubble", async () => {
        const props = renderThread();
        await enabledTool('Stylus');
        fireEvent.click(screen.getByRole('button', { name: 'Stylus' }));
        expect(props.onArm).toHaveBeenLastCalledWith('text');
        fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));
        expect(props.onArm).toHaveBeenLastCalledWith('text');
        fireEvent.click(screen.getByRole('button', { name: 'Mic' }));
        expect(props.onArm).toHaveBeenLastCalledWith('mic');
        expect(props.onArm).toHaveBeenCalledTimes(3);
    });

    it('the reply bar tools are disabled while another target is active', async () => {
        const props = baseProps();
        const { rerender } = renderWithProviders(ui(props));
        await enabledTool('Stylus');
        rerender(ui({ ...props, replyCollecting: true }));
        for (const name of ['Stylus', 'Cursor', 'Mic']) {
            const button = screen.getByRole('button', { name });
            expect(button).toBeDisabled();
            fireEvent.click(button);
        }
        expect(props.onArm).not.toHaveBeenCalled();
    });

    it('the reply bar tools stay enabled on the armed bubble', async () => {
        renderThread({ armed: true, replyCollecting: true });
        for (const name of ['Stylus', 'Cursor', 'Mic']) {
            await enabledTool(name);
        }
    });

    it('stays on the page when the agent edits the dashboard already open', () => {
        window.history.pushState(
            {},
            '',
            '/projects/jaffle/dashboards/sales-overview/view',
        );
        renderThread();
        onToolResult()(
            dashboardEdit(
                '/projects/project-1/dashboards/dashboard-1/view',
                'dashboard-1',
                'sales-overview',
            ),
        );
        expect(state.navigate).not.toHaveBeenCalled();
    });

    it('opens a dashboard the agent made elsewhere', () => {
        window.history.pushState(
            {},
            '',
            '/projects/jaffle/dashboards/sales-overview/view',
        );
        renderThread();
        onToolResult()(
            dashboardEdit(
                '/projects/project-1/dashboards/dashboard-2/view',
                'dashboard-2',
                'new-dashboard',
            ),
        );
        expect(state.navigate).toHaveBeenCalledWith(
            '/projects/project-1/dashboards/dashboard-2/view',
            { viewTransition: true },
        );
    });

    it('stays on the page when the agent cannot be fetched', async () => {
        const refused: ApiError = {
            status: 'error',
            error: new ForbiddenError(),
        };
        mockedLightdashApi.mockRejectedValue(refused);
        renderThread();
        await waitFor(() =>
            expect(mockedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project-1/aiAgents',
                }),
            ),
        );
        // Lets the failed query settle and run its error handler.
        await enabledTool('Stylus');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(state.navigate).not.toHaveBeenCalled();
        expect(
            screen.getByText('Done, it is a bar chart now'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Data agent')).not.toBeInTheDocument();
    });

    it('has a close button only when the host asks for one', () => {
        renderThread();
        expect(
            screen.queryByRole('button', { name: 'Close' }),
        ).not.toBeInTheDocument();
    });

    it('closes from its header', () => {
        const onClose = vi.fn();
        renderThread({ onClose });
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
