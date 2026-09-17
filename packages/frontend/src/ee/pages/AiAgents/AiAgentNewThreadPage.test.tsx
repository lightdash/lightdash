import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { PendingPromptProvider } from '../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { store } from '../../features/aiCopilot/store';
import AiAgentNewThreadPage from './AiAgentNewThreadPage';

const { composerProps } = vi.hoisted(() => ({
    composerProps: vi.fn(),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));

vi.mock(
    '../../features/aiCopilot/components/ChatElements/AgentChatInput',
    () => ({
        AgentChatInput: (props: ComponentProps<typeof AgentChatInput>) => {
            composerProps(props);
            return <textarea placeholder={props.placeholder} />;
        },
    }),
);

vi.mock(
    '../../features/aiCopilot/components/DefaultAgentButton/DefaultAgentButton',
    () => ({
        DefaultAgentButton: () => (
            <button type="button">Set as default agent</button>
        ),
    }),
);

vi.mock('../../features/aiCopilot/hooks/useProjectAiAgents', () => ({
    useCreateAgentThreadMutation: () => ({
        mutateAsync: vi.fn(),
        isLoading: false,
    }),
    useVerifiedQuestions: () => ({ data: undefined }),
}));

vi.mock('../../features/aiCopilot/hooks/usePinnedContext', () => ({
    usePinnedContext: () => ({
        contextInput: [],
        previewItems: [],
        contentMentionItems: [],
        isReady: true,
    }),
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentModelSelection', () => ({
    useAiAgentModelSelection: () => ({ modelOptions: undefined }),
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentBattleModeEnabled', () => ({
    useAiAgentBattleModeEnabled: () => false,
}));

vi.mock('../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => false,
}));

vi.mock('../../features/aiCopilot/hooks/useDeepResearchAccess', () => ({
    useDeepResearchAccess: () => false,
}));

vi.mock('../../features/aiCopilot/hooks/useDeepResearch', () => ({
    useStartDeepResearchForThreadMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock(
    '../../features/aiCopilot/components/AiAgentNewThreadMcpConnections',
    () => ({ AiAgentNewThreadMcpConnections: () => null }),
);

const agent = {
    uuid: 'agent-1',
    name: 'Jaffle analyst',
    imageUrl: null,
    adminOnly: false,
    instruction: 'Internal instructions for the analyst',
    description: 'Ask questions about your shop',
};

const renderPage = (isEmbed: boolean, agentCount: number) => {
    const path = `${isEmbed ? '/embed' : '/projects'}/project-1/ai-agents/${agent.uuid}/threads`;
    window.history.replaceState(null, '', path);
    const agents = Array.from({ length: agentCount }, (_, index) => ({
        ...agent,
        uuid: `agent-${index + 1}`,
    }));

    renderWithProviders(
        <Provider store={store}>
            <PendingPromptProvider>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route
                            element={
                                <Outlet
                                    context={{
                                        agent,
                                        agents,
                                        navigateFromAgentChat: vi.fn(),
                                    }}
                                />
                            }
                        >
                            <Route
                                path="/:mode/:projectUuid/ai-agents/:agentUuid/threads"
                                element={<AiAgentNewThreadPage />}
                            />
                        </Route>
                    </Routes>
                </MemoryRouter>
            </PendingPromptProvider>
        </Provider>,
    );
    return agents;
};

describe('AiAgentNewThreadPage embed controls', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/');
        vi.clearAllMocks();
    });

    it.each([1, 2])(
        'hides agent controls in an embed with %i agents',
        (count) => {
            renderPage(true, count);

            expect(composerProps).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    agents: undefined,
                    selectedAgent: agent,
                    agentUuid: agent.uuid,
                }),
            );
            expect(
                screen.getByPlaceholderText(
                    'Ask Jaffle analyst anything about your data...',
                ),
            ).toBeEnabled();
        },
    );

    it('does not mount the default-agent control in an embed', () => {
        renderPage(true, 1);

        expect(
            screen.queryByRole('button', { name: 'Set as default agent' }),
        ).not.toBeInTheDocument();
    });

    it('hides the instructions popover in embeds while keeping the public description', () => {
        renderPage(true, 1);

        expect(
            screen.queryByRole('button', { name: '' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(agent.instruction)).not.toBeInTheDocument();
        expect(screen.getByText(agent.description)).toBeVisible();
    });

    it('preserves the instructions popover outside embeds', async () => {
        const user = userEvent.setup();
        renderPage(false, 1);

        await user.click(screen.getByRole('button', { name: '' }));

        expect(await screen.findByText(agent.instruction)).toBeVisible();
        expect(screen.getByText(agent.description)).toBeVisible();
    });

    it('preserves agent controls outside embeds', () => {
        const agents = renderPage(false, 2);

        expect(composerProps).toHaveBeenLastCalledWith(
            expect.objectContaining({ agents, selectedAgent: agent }),
        );
        expect(
            screen.getByRole('button', { name: 'Set as default agent' }),
        ).toBeInTheDocument();
    });
});
