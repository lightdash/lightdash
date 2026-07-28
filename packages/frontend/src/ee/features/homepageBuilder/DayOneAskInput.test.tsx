import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { type ComponentProps } from 'react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatInput } from '../aiCopilot/components/ChatElements/AgentChatInput';
import { DayOneAskInput } from './DayOneAskInput';

type AgentChatInputModule = {
    AgentChatInput: typeof AgentChatInput;
};

const {
    agentChatInputProps,
    agents,
    createAgentThread,
    deepResearchEnabled,
    navigate,
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
            },
        ],
    },
    createAgentThread: vi.fn(),
    deepResearchEnabled: { current: true },
    navigate: vi.fn(),
    startDeepResearch: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => navigate,
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: deepResearchEnabled.current },
    }),
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

vi.mock('../aiCopilot/hooks/useAgentSuggestions', () => ({
    useAgentSuggestions: () => ({
        data: undefined,
        isLoading: false,
    }),
}));

vi.mock('../aiCopilot/hooks/useAiAgentPermission', () => ({
    useCanCreateAiAgentThread: () => true,
}));

vi.mock('../aiCopilot/hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => false,
}));

vi.mock('../aiCopilot/hooks/useDeepResearch', () => ({
    useStartDeepResearchForThreadMutation: () => ({
        mutateAsync: startDeepResearch,
    }),
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

    return render(
        <QueryClientProvider client={queryClient}>
            <DayOneAskInput projectUuid="project-1" hideSuggestions />
        </QueryClientProvider>,
    );
};

describe('DayOneAskInput', () => {
    beforeEach(() => {
        agentChatInputProps.current = undefined;
        agents.current = [{ uuid: 'agent-1', name: 'Data agent' }];
        createAgentThread.mockReset();
        createAgentThread.mockResolvedValue({
            uuid: 'thread-1',
            firstMessage: { uuid: 'prompt-1' },
        });
        deepResearchEnabled.current = true;
        startDeepResearch.mockReset();
        startDeepResearch.mockResolvedValue(undefined);
    });

    it('starts Deep Research with a new thread for the selected agent', async () => {
        renderInput();

        expect(agentChatInputProps.current?.agentUuid).toBe('agent-1');
        expect(agentChatInputProps.current?.onStartDeepResearch).toBeDefined();
        expect(agentChatInputProps.current?.deepResearchControlPlacement).toBe(
            'page_header',
        );
        expect(agentChatInputProps.current?.deepResearchControlVariant).toBe(
            'compact',
        );
        expect(
            agentChatInputProps.current?.deepResearchControlClassNames,
        ).toEqual({
            root: expect.any(String),
            label: expect.any(String),
        });

        await act(async () => {
            await agentChatInputProps.current?.onStartDeepResearch?.({
                question: 'Research churn',
                depth: 'deep',
                mcpServerUuids: ['mcp-1'],
            });
        });

        expect(createAgentThread).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            prompt: 'Research churn',
            skipAgentResponse: true,
        });
        expect(startDeepResearch).toHaveBeenCalledWith({
            question: 'Research churn',
            depth: 'deep',
            agentUuid: 'agent-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            mcpServerUuids: ['mcp-1'],
        });
    });

    it('hides Deep Research when Auto routing is selected', () => {
        agents.current = [
            { uuid: 'agent-1', name: 'Data agent' },
            { uuid: 'agent-2', name: 'Finance agent' },
        ];

        renderInput(true);

        expect(agentChatInputProps.current?.selectedAgent).toBe('auto');
        expect(agentChatInputProps.current?.agentUuid).toBeUndefined();
        expect(
            agentChatInputProps.current?.onStartDeepResearch,
        ).toBeUndefined();
    });

    it('hides Deep Research when the feature flag is disabled', () => {
        deepResearchEnabled.current = false;

        renderInput();

        expect(
            agentChatInputProps.current?.onStartDeepResearch,
        ).toBeUndefined();
    });
});
