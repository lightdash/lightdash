import { screen, waitFor } from '@testing-library/react';
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

        const modeButton = screen.getByRole('button', {
            name: 'Deep research',
        });
        const composer = modeButton.closest<HTMLElement>('[data-variant]');
        expect(composer).not.toBeNull();
        if (!composer) {
            throw new Error('Expected Deep research control inside composer');
        }

        const getStableComposerMarkup = () => {
            const clone = composer.cloneNode(true) as HTMLElement;
            clone.querySelector('[aria-label="Deep research"]')?.remove();
            clone
                .querySelector(
                    '[aria-label="Send message"], [aria-label="Start research"]',
                )
                ?.setAttribute('aria-label', 'Submit');
            return clone.innerHTML;
        };
        const composerMarkupBefore = getStableComposerMarkup();

        await user.click(modeButton);

        expect(
            await screen.findByRole('region', {
                name: 'Deep research settings',
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Start research' }),
        ).toBeInTheDocument();
        expect(
            await screen.findByRole('checkbox', { name: /GitHub/ }),
        ).not.toBeChecked();
        expect(getStableComposerMarkup()).toBe(composerMarkupBefore);

        await user.click(screen.getByText('High'));
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith({
            question: 'Why did enterprise retention fall in Q2?',
            depth: 'deep',
            mcpServerUuids: [],
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
            mcpServerUuids: [],
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

    it('is unavailable when the feature is disabled', () => {
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
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
        expect(
            screen.queryByRole('region', {
                name: 'Deep research settings',
            }),
        ).not.toBeInTheDocument();
    });

    it('places the control first in the card composer right actions', () => {
        const agent = {
            uuid: 'agent-1',
            name: 'Data agent',
            imageUrl: null,
            adminOnly: false,
        };
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={vi.fn()}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        agents={[agent]}
                        selectedAgent={agent}
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        const control = screen.getByRole('button', {
            name: 'Deep research',
        });
        expect(control.closest('[data-variant="card"]')).toBeInTheDocument();
        expect(control.parentElement?.firstElementChild).toBe(control);
    });

    it('places the control first in the inline composer right actions', () => {
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        onStartDeepResearch={vi.fn()}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        threadUuid="thread-1"
                        messageCount={1}
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        const control = screen.getByRole('button', {
            name: 'Deep research',
        });
        expect(control.closest('[data-variant="inline"]')).toBeInTheDocument();
        expect(control.parentElement?.firstElementChild).toBe(control);
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
        expect(serverCheckbox).toBeChecked();
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith(
            expect.objectContaining({ mcpServerUuids: ['mcp-1'] }),
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

    it('only shows MCP servers that are available to use', async () => {
        const user = userEvent.setup();
        useAgentAiMcpServersMock.mockReturnValue({
            data: [
                connectedMcpServer,
                {
                    ...connectedMcpServer,
                    uuid: 'mcp-2',
                    name: 'Attio',
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
            await screen.findByRole('checkbox', { name: /GitHub/ }),
        ).not.toBeChecked();
        expect(
            screen.queryByRole('checkbox', { name: /Attio/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('connection required'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Start research' }),
        ).toBeEnabled();
    });

    it('removes a selected MCP when it becomes unavailable', async () => {
        const user = userEvent.setup();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);
        const renderInput = () => (
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
            </Provider>
        );
        const rendered = renderWithProviders(renderInput());

        await user.click(screen.getByRole('button', { name: 'Deep research' }));
        await user.click(
            await screen.findByRole('checkbox', { name: /GitHub/ }),
        );

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
        rendered.rerender(renderInput());

        await waitFor(() => {
            expect(
                screen.queryByRole('checkbox', { name: /GitHub/ }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Start research' }),
            ).toBeEnabled();
        });

        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );
        expect(onStartDeepResearch).toHaveBeenCalledWith(
            expect.objectContaining({ mcpServerUuids: [] }),
        );
    });
});
