import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

const useAgentAiMcpServersMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useProjectAiMcpServers', () => ({
    useAgentAiMcpServers: useAgentAiMcpServersMock,
}));

const connectedMcpServer = {
    uuid: 'mcp-1',
    projectUuid: 'project-1',
    name: 'GitHub',
    url: 'https://example.com/mcp',
    iconUrl: null,
    authType: 'oauth' as const,
    allowOAuthCredentialSharing: false,
    hasCredentials: true,
    credentialScope: 'user' as const,
    connectionStatus: 'connected' as const,
    error: null,
    connectedByUserUuid: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('AgentChatInput Deep research mode', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        useAgentAiMcpServersMock.mockReturnValue({
            data: [connectedMcpServer],
            isLoading: false,
            isError: false,
            error: null,
        });
    });

    it('starts inline research instead of submitting a normal Ask message', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={onSubmit}
                        onStartDeepResearch={onStartDeepResearch}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="Why did enterprise retention fall in Q2?"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));

        expect(
            screen.getByRole('region', { name: 'Deep research settings' }),
        ).toBeInTheDocument();
        expect(screen.getAllByText('Beta')).toHaveLength(2);
        expect(
            screen.queryByRole('button', { name: 'Send message' }),
        ).not.toBeInTheDocument();
        expect(
            await screen.findByRole('checkbox', { name: /GitHub/ }),
        ).toBeChecked();

        await user.click(screen.getByText('High'));
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith({
            question: 'Why did enterprise retention fall in Q2?',
            depth: 'deep',
            mcpServerUuids: ['mcp-1'],
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('starts research after the conversation has started', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={onSubmit}
                        onStartDeepResearch={onStartDeepResearch}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        messageCount={1}
                        defaultValue="What changed this month?"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith({
            question: 'What changed this month?',
            depth: 'standard',
            mcpServerUuids: ['mcp-1'],
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not start research while the thread is busy', async () => {
        const user = userEvent.setup();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={onStartDeepResearch}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="What changed this month?"
                        loading
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));

        const startButton = screen.getByRole('button', {
            name: 'Start research',
        });
        expect(startButton).toBeDisabled();

        await user.click(startButton);
        await user.type(screen.getByRole('textbox'), '{Enter}');

        expect(onStartDeepResearch).not.toHaveBeenCalled();
    });

    it('is unavailable in embedded agent routes', () => {
        window.history.replaceState(
            {},
            '',
            '/embed/project-1/ai-agents/agent-1',
        );

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={vi.fn()}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="Investigate churn"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        expect(
            screen.queryByRole('button', { name: 'Deep research' }),
        ).not.toBeInTheDocument();
    });

    it('submits the exact per-run MCP selection', async () => {
        const user = userEvent.setup();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={onStartDeepResearch}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="Investigate churn"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));
        const serverCheckbox = await screen.findByRole('checkbox', {
            name: /GitHub/,
        });
        await user.click(serverCheckbox);
        expect(serverCheckbox).not.toBeChecked();
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith(
            expect.objectContaining({ mcpServerUuids: [] }),
        );
    });

    it('keeps the prompt available to retry when research fails to start', async () => {
        const user = userEvent.setup();
        const onStartDeepResearch = vi
            .fn()
            .mockRejectedValue(new Error('Could not enqueue run'));

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={onStartDeepResearch}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="Investigate churn"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledOnce();
        expect(screen.getByRole('textbox')).toHaveTextContent(
            'Investigate churn',
        );
    });

    it('blocks preflight while a selected MCP server needs reconnection', async () => {
        const user = userEvent.setup();
        useAgentAiMcpServersMock.mockReturnValue({
            data: [
                {
                    ...connectedMcpServer,
                    connectionStatus: 'not_connected',
                    hasCredentials: false,
                },
            ],
            isLoading: false,
            isError: false,
            error: null,
        });

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={vi.fn()}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="Investigate churn"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));

        expect(
            await screen.findByText('connection required'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Start research' }),
        ).toBeDisabled();
    });
});
