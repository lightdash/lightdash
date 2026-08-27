import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import type * as ReactRouter from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatInput } from '../aiCopilot/components/ChatElements/AgentChatInput';
import { DayOneAskInput } from './DayOneAskInput';

type AgentChatInputModule = {
    AgentChatInput: typeof AgentChatInput;
};

const {
    agentChatInputProps,
    agents,
    createAgentThread,
    deepResearchAccess,
    deepResearchHookArgs,
    navigate,
    sqlModeAvailable,
    startDeepResearch,
} = vi.hoisted(() => ({
    agentChatInputProps: {
        current: undefined as ComponentProps<typeof AgentChatInput> | undefined,
    },
    agents: {
        current: [
            {
                uuid: 'agent-1',
                name: 'Data agent',
                enableSqlMode: true,
            },
        ],
    },
    createAgentThread: vi.fn(),
    deepResearchAccess: { current: true },
    deepResearchHookArgs: {
        current: undefined as
            | [projectUuid: string, entryPoint: string]
            | undefined,
    },
    navigate: vi.fn(),
    sqlModeAvailable: { current: true },
    startDeepResearch: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => navigate,
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));

vi.mock('../aiCopilot/hooks/useDeepResearchAccess', () => ({
    useDeepResearchAccess: () => deepResearchAccess.current,
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'organization-1',
                ability: { can: () => true },
            },
        },
    }),
}));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({
        track: vi.fn(),
        data: { rudder: true },
    }),
}));

vi.mock(
    '../aiCopilot/components/PendingPromptContext/PendingPromptContext',
    () => ({
        usePendingPrompt: () => ({ setPendingPrompt: vi.fn() }),
    }),
);

const { suggestionsState } = vi.hoisted(() => ({
    suggestionsState: {
        current: { data: undefined, isLoading: false } as {
            data:
                | { chips: { kind: 'prompt'; label: string; tool: string }[] }
                | undefined;
            isLoading: boolean;
        },
    },
}));

vi.mock('../aiCopilot/hooks/useAgentSuggestions', () => ({
    useAgentSuggestions: () => suggestionsState.current,
}));

vi.mock('../aiCopilot/hooks/useAiAgentPermission', () => ({
    useCanCreateAiAgentThread: () => true,
}));

vi.mock('../aiCopilot/hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => sqlModeAvailable.current,
}));

vi.mock('../aiCopilot/hooks/useDeepResearch', () => ({
    useStartDeepResearchForThreadMutation: (
        projectUuid: string,
        entryPoint: string,
    ) => {
        deepResearchHookArgs.current = [projectUuid, entryPoint];
        return {
            mutateAsync: startDeepResearch,
        };
    },
}));

vi.mock('../aiCopilot/hooks/useProjectAiAgents', () => ({
    useCreateAgentThreadMutation: () => ({
        mutateAsync: createAgentThread,
        isLoading: false,
    }),
    useProjectAiAgents: () => ({
        data: agents.current,
        isInitialLoading: false,
    }),
}));

vi.mock('../aiCopilot/hooks/useUserAgentPreferences', () => ({
    useGetUserAgentPreferences: () => ({
        data: undefined,
        isInitialLoading: false,
    }),
}));

vi.mock(
    '../aiCopilot/components/ChatElements/AgentChatInput',
    async (importOriginal) => {
        const original = await importOriginal<AgentChatInputModule>();
        return {
            ...original,
            AgentChatInput: (
                props: ComponentProps<typeof original.AgentChatInput>,
            ) => {
                agentChatInputProps.current = props;
                return <div data-testid="agent-chat-input" />;
            },
        };
    },
);

const renderInput = (routerEnabled = false) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['ai-router'], { enabled: routerEnabled });

    const renderComponent = () => (
        <MantineProvider env="test">
            <QueryClientProvider client={queryClient}>
                <DayOneAskInput projectUuid="project-1" hideSuggestions />
            </QueryClientProvider>
        </MantineProvider>
    );
    const result = render(renderComponent());

    return {
        ...result,
        rerenderInput: () => result.rerender(renderComponent()),
    };
};

const renderWithSuggestions = (labels: string[]) => {
    suggestionsState.current = {
        data: {
            chips: labels.map((label) => ({
                kind: 'prompt' as const,
                label,
                tool: 'generateQuery',
            })),
        },
        isLoading: false,
    };
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['ai-router'], { enabled: false });
    return render(
        <MantineProvider env="test">
            <QueryClientProvider client={queryClient}>
                <DayOneAskInput projectUuid="project-1" />
            </QueryClientProvider>
        </MantineProvider>,
    );
};

describe('DayOneAskInput suggestion chips', () => {
    afterEach(() => {
        suggestionsState.current = { data: undefined, isLoading: false };
    });

    it('shows at most two chips on the homepage, however many are generated', () => {
        renderWithSuggestions([
            'First suggestion',
            'Second suggestion',
            'Third suggestion',
            'Fourth suggestion',
            'Fifth suggestion',
        ]);

        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.getByText('First suggestion')).toBeInTheDocument();
        expect(screen.getByText('Second suggestion')).toBeInTheDocument();
        expect(screen.queryByText('Third suggestion')).not.toBeInTheDocument();
    });

    it('shows a single chip without padding the row', () => {
        renderWithSuggestions(['Only suggestion']);

        expect(screen.getAllByRole('button')).toHaveLength(1);
    });
});

describe('DayOneAskInput', () => {
    beforeEach(() => {
        agentChatInputProps.current = undefined;
        agents.current = [
            { uuid: 'agent-1', name: 'Data agent', enableSqlMode: true },
        ];
        createAgentThread.mockReset();
        createAgentThread.mockResolvedValue({
            uuid: 'thread-1',
            firstMessage: { uuid: 'prompt-1' },
        });
        deepResearchAccess.current = true;
        deepResearchHookArgs.current = undefined;
        startDeepResearch.mockReset();
        startDeepResearch.mockResolvedValue(undefined);
        sqlModeAvailable.current = true;
    });

    it('starts Deep Research with a new thread for the selected agent', async () => {
        renderInput();

        expect(agentChatInputProps.current?.agentUuid).toBe('agent-1');
        expect(deepResearchHookArgs.current).toEqual(['project-1', 'homepage']);
        expect(agentChatInputProps.current?.onStartDeepResearch).toBeDefined();

        await act(async () => {
            await agentChatInputProps.current?.onStartDeepResearch?.({
                question: 'Research churn',
            });
        });

        expect(createAgentThread).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            prompt: 'Research churn',
            skipAgentResponse: true,
        });
        expect(startDeepResearch).toHaveBeenCalledWith({
            question: 'Research churn',
            agentUuid: 'agent-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
        });
    });

    it('hides Deep Research when Auto routing is selected', () => {
        agents.current = [
            { uuid: 'agent-1', name: 'Data agent', enableSqlMode: true },
            { uuid: 'agent-2', name: 'Finance agent', enableSqlMode: false },
        ];

        renderInput(true);

        expect(agentChatInputProps.current?.selectedAgent).toBe('auto');
        expect(agentChatInputProps.current?.agentUuid).toBeUndefined();
        expect(
            agentChatInputProps.current?.onStartDeepResearch,
        ).toBeUndefined();
        expect(agentChatInputProps.current?.onSqlModeChange).toBeUndefined();
    });

    it('hides Deep Research when the user cannot start a run', () => {
        deepResearchAccess.current = false;

        renderInput();

        expect(
            agentChatInputProps.current?.onStartDeepResearch,
        ).toBeUndefined();
    });

    it('shows the agent setup nudge instead of the composer when the project has no agents', () => {
        agents.current = [];

        const { getByText, queryByTestId } = renderInput();

        expect(queryByTestId('agent-chat-input')).toBeNull();
        expect(
            getByText(/Set up an AI agent to enable Ask AI here/),
        ).toBeInTheDocument();
    });

    it('uses the selected agent SQL default when creating a thread', () => {
        agents.current = [
            { uuid: 'agent-1', name: 'Data agent', enableSqlMode: false },
        ];
        renderInput();

        expect(agentChatInputProps.current?.sqlMode).toBe(false);
        expect(agentChatInputProps.current?.onSqlModeChange).toBeDefined();

        act(() => {
            agentChatInputProps.current?.onSubmit({
                message: 'Show revenue',
                toolHints: [],
            });
        });

        expect(createAgentThread).toHaveBeenCalledWith(
            expect.objectContaining({ enableSqlMode: false }),
        );
    });

    it('applies the homepage SQL Runner override when creating a thread', () => {
        agents.current = [
            { uuid: 'agent-1', name: 'Data agent', enableSqlMode: false },
        ];
        renderInput();

        act(() => {
            agentChatInputProps.current?.onSqlModeChange?.(true);
        });

        expect(agentChatInputProps.current?.sqlMode).toBe(true);
        act(() => {
            agentChatInputProps.current?.onSubmit({
                message: 'Show revenue',
                toolHints: [],
            });
        });

        expect(createAgentThread).toHaveBeenCalledWith(
            expect.objectContaining({ enableSqlMode: true }),
        );
    });

    it('uses each selected agent SQL default instead of another agent override', () => {
        agents.current = [
            { uuid: 'agent-1', name: 'Data agent', enableSqlMode: false },
        ];
        const { rerenderInput } = renderInput();

        act(() => {
            agentChatInputProps.current?.onSqlModeChange?.(true);
        });
        expect(agentChatInputProps.current?.sqlMode).toBe(true);

        agents.current = [
            { uuid: 'agent-2', name: 'Finance agent', enableSqlMode: false },
        ];
        rerenderInput();

        expect(agentChatInputProps.current?.sqlMode).toBe(false);
    });
});
