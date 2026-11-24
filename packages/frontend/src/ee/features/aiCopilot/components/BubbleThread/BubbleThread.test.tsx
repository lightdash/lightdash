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
import { buildDesignPrompt } from '../../../capture/buildDesignPrompt';
import { store } from '../../store';
import { isAgentThreadQuiet } from '../../streaming/quietAgentThreads';
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
    userMessage: 'Make this chart a bar chart',
    composerProps: [] as Record<string, unknown>[],
    asked: false,
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
                        message: state.userMessage,
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
vi.mock('../ChatElements/askUserQuestions', () => ({
    getPendingAskUser: () =>
        state.asked ? { toolCallId: 'ask-1', questions: [] } : null,
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
    AgentChatInput: (props: {
        onSubmit: Submit;
        toolbarStart: ReactNode;
        loading: boolean;
    }) => {
        state.composerProps.push(props);
        const { onSubmit, toolbarStart, loading } = props;
        return (
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
        );
    },
}));

type Props = ComponentProps<typeof BubbleThread>;

const baseProps = (overrides: Partial<Props> = {}): Props => ({
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadId: 'thread-1',
    armed: false,
    onReplied: vi.fn(),
    replyCollecting: false,
    onSendReply: vi.fn().mockResolvedValue(undefined),
    onClose: null,
    color: '#e03131',
    pill: null,
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
        state.userMessage = 'Make this chart a bar chart';
        state.composerProps = [];
        state.asked = false;
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
        // Posted without marks: the host hands the page back.
        await waitFor(() => expect(props.onReplied).toHaveBeenCalledTimes(1));
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
        expect(props.onReplied).not.toHaveBeenCalled();
    });

    it('the reply bar has no Mark or Mic button: a click on the bubble selects it', async () => {
        renderThread({ armed: true });
        await screen.findByRole('button', { name: 'Send reply' });
        for (const name of ['Mark', 'Mic']) {
            expect(screen.queryByRole('button', { name })).toBeNull();
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

    it('stays on the page when the agent makes a dashboard elsewhere', () => {
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
        expect(state.navigate).not.toHaveBeenCalled();
    });

    it('its reply box takes no focus and keeps one height as the thread scrolls', () => {
        renderThread();
        expect(state.composerProps.at(-1)).toMatchObject({
            autoFocus: false,
            hideSuggestionsWhenScrolledUp: false,
        });
    });

    it('shows a message sent from a bubble as its marks and typed words', () => {
        state.userMessage = buildDesignPrompt({
            surfaceHeading: 'These requests are about the dashboard "Sales".',
            summary:
                '[Design Mode capture, 0:04. The attached image shows the page with numbered red marks.]\n- ① (0:01) picked the bar "credit_card" on "Revenue"\n- ② (0:02) circled, middle',
            typed: 'make these orange',
            hasImages: true,
        });
        renderThread();
        expect(screen.getByLabelText('Mark 1')).toHaveTextContent('1');
        expect(screen.getByLabelText('Mark 2')).toHaveTextContent('2');
        expect(screen.getByText('make these orange')).toBeInTheDocument();
        expect(screen.queryByText(/Design Mode capture/)).toBeNull();
        expect(screen.queryByText(/These requests are about/)).toBeNull();
    });

    it('shows any other message the usual way', () => {
        renderThread();
        expect(
            screen.getByText('Make this chart a bar chart'),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText('Mark 1')).toBeNull();
    });

    it("keeps its thread's agent from scrolling the page", () => {
        renderThread();
        expect(isAgentThreadQuiet('thread-1')).toBe(true);
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
        await enabledTool('Send reply');
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

    describe('minimised', () => {
        const pill = (overrides: Partial<NonNullable<Props['pill']>> = {}) => ({
            marks: [1, 2],
            sending: false,
            failed: false,
            unread: true,
            onExpand: vi.fn(),
            ...overrides,
        });

        it('is a pill, with the conversation kept out of sight', () => {
            renderThread({ pill: pill() });
            expect(
                screen.getByRole('button', { name: 'Expand: Reply ready' }),
            ).toBeInTheDocument();
            const kept = screen
                .getByText('Done, it is a bar chart now')
                .closest('[data-minimised]');
            expect(kept).toHaveAttribute('data-minimised', 'true');
        });

        it('open, it has no pill and hides nothing', () => {
            renderThread();
            expect(
                screen.queryByRole('button', { name: /^Expand/ }),
            ).toBeNull();
            expect(
                screen
                    .getByText('Done, it is a bar chart now')
                    .closest('[data-minimised]'),
            ).toHaveAttribute('data-minimised', 'false');
        });

        it('pressing the pill expands', () => {
            const onExpand = vi.fn();
            renderThread({ pill: pill({ onExpand }) });
            fireEvent.click(screen.getByRole('button', { name: /^Expand/ }));
            expect(onExpand).toHaveBeenCalledTimes(1);
        });

        it('says Working while the reply streams, then Reply ready', () => {
            state.isStreaming = true;
            const props = baseProps({ pill: pill({ unread: false }) });
            const { rerender } = renderWithProviders(ui(props));
            expect(
                screen.getByRole('button', { name: 'Expand: Working' }),
            ).toBeInTheDocument();
            state.isStreaming = false;
            rerender(ui({ ...props }));
            // It came while minimised, so it is unread whatever the host says.
            expect(
                screen.getByRole('button', { name: 'Expand: Reply ready' }),
            ).toBeInTheDocument();
        });

        it('says Working while a reply is on its way out', () => {
            renderThread({ pill: pill({ sending: true }) });
            expect(
                screen.getByRole('button', { name: 'Expand: Working' }),
            ).toBeInTheDocument();
        });

        it('says when the agent waits on an answer', () => {
            state.asked = true;
            renderThread({ pill: pill() });
            expect(
                screen.getByRole('button', {
                    name: 'Expand: Needs your answer',
                }),
            ).toBeInTheDocument();
        });

        it('says when the last message could not be sent', () => {
            renderThread({ pill: pill({ failed: true }) });
            expect(
                screen.getByRole('button', { name: 'Expand: Could not send' }),
            ).toBeInTheDocument();
        });

        it('a read conversation is named after its agent', async () => {
            renderThread({ pill: pill({ unread: false }) });
            expect(
                await screen.findByRole('button', {
                    name: 'Expand: Data agent',
                }),
            ).toBeInTheDocument();
        });

        it('keeps the same conversation when it is opened again', () => {
            const props = baseProps({ pill: pill() });
            const { rerender } = renderWithProviders(ui(props));
            const kept = screen.getByText('Done, it is a bar chart now');
            rerender(ui({ ...props, pill: null }));
            expect(screen.getByText('Done, it is a bar chart now')).toBe(kept);
        });

        it("draws the user's marks in the bubble's colour", () => {
            state.userMessage = buildDesignPrompt({
                surfaceHeading: 'About the dashboard.',
                summary:
                    '[Design Mode capture, 0:04. The attached image shows the page with numbered red marks.]\n- ① (0:01) circled, middle',
                typed: 'make it blue',
                hasImages: true,
            });
            renderThread({ color: '#1971c2' });
            expect(screen.getByLabelText('Mark 1')).toHaveStyle({
                '--badge-bg': '#1971c2',
            });
        });
    });
});
