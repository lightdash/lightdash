import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

const { useAgentSuggestionsMock } = vi.hoisted(() => ({
    useAgentSuggestionsMock: vi.fn(),
}));

vi.mock('../../hooks/useAgentSuggestions', () => ({
    useAgentSuggestions: useAgentSuggestionsMock,
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: () => false,
}));

const agent = {
    uuid: 'agent-1',
    name: 'Aurora',
    imageUrl: null,
    adminOnly: false,
};

const renderEmptyStateInput = () =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AgentChatInput
                    onSubmit={vi.fn()}
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    agents={[agent]}
                    selectedAgent={agent}
                />
            </MemoryRouter>
        </Provider>,
    );

describe('AgentChatInput suggestions', () => {
    it('shows a skeleton while the suggestions are generated', () => {
        useAgentSuggestionsMock.mockReturnValue({
            data: undefined,
            isError: false,
            isLoading: true,
            isFetching: true,
        });

        renderEmptyStateInput();

        expect(
            screen.getByTestId('agent-suggestion-chips-skeleton'),
        ).toBeInTheDocument();
    });

    it('replaces the skeleton with the generated suggestions', () => {
        useAgentSuggestionsMock.mockReturnValue({
            data: {
                chips: [
                    {
                        kind: 'prompt',
                        label: 'Revenue by customer tier',
                        tool: 'generateVisualization',
                        defaults: {
                            explore: null,
                            dimensions: [],
                            metrics: [],
                            timeframe: null,
                        },
                    },
                ],
            },
            isError: false,
            isLoading: false,
            isFetching: false,
        });

        renderEmptyStateInput();

        expect(
            screen.queryByTestId('agent-suggestion-chips-skeleton'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Revenue by customer tier' }),
        ).toBeInTheDocument();
    });

    it('shows nothing when the suggestions fail to load', () => {
        useAgentSuggestionsMock.mockReturnValue({
            data: undefined,
            isError: true,
            isLoading: false,
            isFetching: false,
        });

        renderEmptyStateInput();

        expect(
            screen.queryByTestId('agent-suggestion-chips-skeleton'),
        ).not.toBeInTheDocument();
    });
});
