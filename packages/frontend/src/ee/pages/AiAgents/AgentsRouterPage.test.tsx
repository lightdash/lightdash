import { MantineProvider } from '@mantine/core';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type StartDeepResearchArgs } from '../../features/aiCopilot/deepResearch/types';
import AgentsRouterPage from './AgentsRouterPage';

const mocks = vi.hoisted(() => ({
    canStartDeepResearch: true,
    createThread: vi.fn(),
    createThreadForAgent: undefined as
        | ((args: {
              agentUuid: string;
              message: string;
              payload: { kind: 'chat' } | { kind: 'deep_research' };
              toolHints: string[];
          }) => Promise<{ uuid: string }>)
        | undefined,
    handleRouterSubmit: vi.fn(),
    onStartDeepResearch: undefined as
        | ((args: StartDeepResearchArgs) => Promise<void>)
        | undefined,
    setPendingPrompt: vi.fn(),
    startDeepResearch: vi.fn(),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: { name: 'Jaffle Shop' } }),
}));

vi.mock('../../features/aiCopilot/hooks/useProjectAiAgents', () => ({
    useCreateAgentThreadMutation: () => ({
        mutateAsync: mocks.createThread,
    }),
    useProjectAiAgents: () => ({
        data: [
            {
                enableSqlMode: true,
                name: 'Aurora',
                uuid: 'agent-1',
            },
        ],
    }),
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentPermission', () => ({
    useAiAgentPermission: () => false,
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => false,
}));

vi.mock('../../features/aiCopilot/hooks/useAiOrganizationSettings', () => ({
    useAiAgentMemoryEnabled: () => false,
}));

vi.mock('../../features/aiCopilot/hooks/usePinnedContext', () => ({
    usePinnedContext: () => ({
        contentMentionItems: [],
        contextInput: [{ chartUuid: 'chart-1', type: 'chart' }],
        isReady: true,
        previewItems: [],
    }),
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentModelSelection', () => ({
    useAiAgentModelSelection: () => ({
        extendedThinking: false,
        handleExtendedThinkingChange: vi.fn(),
        handleSelectedModelKeyChange: vi.fn(),
        isModelSelectionExplicit: false,
        modelConfig: undefined,
        modelOptions: [],
        selectedModelKey: null,
        showExtendedThinking: false,
    }),
}));

vi.mock('../../features/aiCopilot/hooks/useDeepResearchAccess', () => ({
    useDeepResearchAccess: () => mocks.canStartDeepResearch,
}));

vi.mock('../../features/aiCopilot/hooks/useDeepResearch', () => ({
    useStartDeepResearchForThreadMutation: () => ({
        mutateAsync: mocks.startDeepResearch,
    }),
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentRouterFlow', () => ({
    useAiAgentRouterFlow: ({
        createThreadForAgent,
    }: {
        createThreadForAgent: typeof mocks.createThreadForAgent;
    }) => {
        mocks.createThreadForAgent = createThreadForAgent;
        return {
            confirmPick: vi.fn(),
            handleSubmit: mocks.handleRouterSubmit,
            isCreating: false,
            isLocked: false,
            isPickingAgent: false,
            isRouting: false,
            phase: { kind: 'idle' },
            sortedCandidates: [],
        };
    },
}));

vi.mock(
    '../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext',
    () => ({
        usePendingPrompt: () => ({
            pendingPrompt: '',
            setPendingPrompt: mocks.setPendingPrompt,
        }),
    }),
);

vi.mock('../../features/aiCopilot/store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
}));

vi.mock(
    '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout',
    () => ({
        AiAgentPageLayout: ({ children }: { children: React.ReactNode }) =>
            children,
    }),
);

vi.mock(
    '../../features/aiCopilot/components/AiAgentPageLayout/AgentSidebar',
    () => ({ AutoModeSidebar: () => null }),
);

vi.mock(
    '../../features/aiCopilot/components/MyMemories/MyMemoriesModal',
    () => ({ MyMemoriesModal: () => null }),
);

vi.mock(
    '../../features/aiCopilot/components/ChatElements/AgentChatInput',
    () => ({
        AgentChatInput: ({
            onStartDeepResearch,
        }: {
            onStartDeepResearch?: (
                args: StartDeepResearchArgs,
            ) => Promise<void>;
        }) => {
            mocks.onStartDeepResearch = onStartDeepResearch;
            return null;
        },
    }),
);

const renderPage = () =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <AgentsRouterPage />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('AgentsRouterPage Deep Research', () => {
    beforeEach(() => {
        mocks.canStartDeepResearch = true;
        mocks.createThread.mockReset();
        mocks.createThreadForAgent = undefined;
        mocks.handleRouterSubmit.mockReset();
        mocks.onStartDeepResearch = undefined;
        mocks.setPendingPrompt.mockReset();
        mocks.startDeepResearch.mockReset();
    });

    it('routes Deep Research from the Auto composer', async () => {
        renderPage();
        expect(mocks.onStartDeepResearch).toBeDefined();

        await act(() =>
            mocks.onStartDeepResearch?.({ question: 'Investigate revenue' }),
        );

        expect(mocks.handleRouterSubmit).toHaveBeenCalledWith({
            context: [{ chartUuid: 'chart-1', type: 'chart' }],
            message: 'Investigate revenue',
            optimisticContext: [],
            payload: { kind: 'deep_research' },
            toolHints: [],
        });
        expect(mocks.setPendingPrompt).toHaveBeenCalledWith('');
    });

    it('creates a response-free thread and starts research for the routed agent', async () => {
        mocks.createThread.mockResolvedValue({
            firstMessage: { uuid: 'prompt-1' },
            uuid: 'thread-1',
        });
        renderPage();
        expect(mocks.createThreadForAgent).toBeDefined();

        await mocks.createThreadForAgent?.({
            agentUuid: 'agent-1',
            message: 'Investigate revenue',
            payload: { kind: 'deep_research' },
            toolHints: [],
        });

        expect(mocks.createThread).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            context: undefined,
            modelConfig: undefined,
            optimisticContext: undefined,
            prompt: 'Investigate revenue',
            skipAgentResponse: true,
        });
        expect(mocks.startDeepResearch).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            promptUuid: 'prompt-1',
            question: 'Investigate revenue',
            threadUuid: 'thread-1',
        });
    });

    it('hides Deep Research without access', () => {
        mocks.canStartDeepResearch = false;

        renderPage();

        expect(mocks.onStartDeepResearch).toBeUndefined();
    });
});
