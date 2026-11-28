import { type AiAgentMessageAssistant } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview } from '../../store/aiArtifactSlice';
import { ContentLink } from './ContentLink';

const COMPOSER_CHART_HREF = '/projects/project-1/composer-charts/composer-1';
const THREAD_HREF = '/projects/project-1/ai-agents/agent-1/threads/thread-1';
const message: AiAgentMessageAssistant = {
    role: 'assistant',
    status: 'idle',
    uuid: 'message-1',
    threadUuid: 'thread-1',
    message: 'Here is your chart',
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-11-28T09:00:00.000Z',
    humanScore: null,
    humanFeedback: null,
    toolCalls: [],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    modelConfig: null,
    tokenUsage: null,
    responseTiming: null,
    jevDecision: null,
    loadout: null,
};

describe('Composer chart content links', () => {
    beforeEach(() => store.dispatch(clearPreview()));

    it('links to the chart page in a new tab, without opening a saved chart preview', () => {
        const router = createMemoryRouter(
            [
                {
                    path: THREAD_HREF,
                    element: (
                        <ContentLink
                            contentType="chart-link"
                            props={{
                                href: COMPOSER_CHART_HREF,
                                'data-chart-uuid': 'composer-1',
                                'data-chart-source': 'composer-chart',
                            }}
                            message={message}
                            projectUuid="project-1"
                            agentUuid="agent-1"
                        >
                            Orders by status
                        </ContentLink>
                    ),
                },
            ],
            { initialEntries: [THREAD_HREF] },
        );
        renderWithProviders(
            <Provider store={store}>
                <RouterProvider router={router} />
            </Provider>,
        );

        const link = screen.getByRole('link', { name: /Orders by status/ });
        expect(link).toHaveAttribute('href', COMPOSER_CHART_HREF);
        expect(link).toHaveAttribute('target', '_blank');
        fireEvent.click(link);

        expect(store.getState().aiArtifact.preview).toBeNull();
    });
});
