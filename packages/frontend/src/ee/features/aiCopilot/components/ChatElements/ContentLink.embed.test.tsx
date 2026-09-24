import { type AiAgentMessageAssistant } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview } from '../../store/aiArtifactSlice';
import { ContentLink } from './ContentLink';
import { type ContentType } from './rehypeContentLinks';

vi.mock('../../hooks/aiAgentRouting', async (original) => ({
    ...(await original<object>()),
    isEmbedAiAgentRoute: () => true,
}));

const THREAD_PATH = '/embed/project-1/ai-agents/agent-1/threads/thread-1';
const DASHBOARD_PATH =
    '/embed/project-1/ai-agents/agent-1/dashboards/dashboard-1';
const message: AiAgentMessageAssistant = {
    role: 'assistant',
    status: 'idle',
    uuid: 'message-1',
    threadUuid: 'thread-1',
    message: 'Here you go',
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-09-22T09:00:00.000Z',
    humanScore: null,
    humanFeedback: null,
    toolCalls: [],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    referencedArtifacts: null,
    modelConfig: null,
    tokenUsage: null,
    responseTiming: null,
    jevDecision: null,
};

const renderEmbedLink = (
    contentType: ContentType,
    props: Record<string, unknown>,
) => {
    const router = createMemoryRouter(
        [
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid/threads/:threadUuid',
                element: (
                    <ContentLink
                        contentType={contentType}
                        props={props}
                        message={message}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                    >
                        Reference
                    </ContentLink>
                ),
            },
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid/dashboards/:agentDashboardUuid',
                element: <div>Embedded dashboard</div>,
            },
        ],
        { initialEntries: [`${THREAD_PATH}?theme=dark`] },
    );
    renderWithProviders(
        <Provider store={store}>
            <RouterProvider router={router} />
        </Provider>,
    );
    return router;
};

describe('content links inside an embedded AI agent', () => {
    beforeEach(() => store.dispatch(clearPreview()));

    it('opens a dashboard on the embed route and remembers the conversation', async () => {
        const router = renderEmbedLink('dashboard-link', {
            href: '/projects/project-1/dashboards/dashboard-1/view',
            'data-dashboard-uuid': 'dashboard-1',
        });

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reference' }));

        expect(
            await screen.findByText('Embedded dashboard'),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(DASHBOARD_PATH);
        expect(
            new URLSearchParams(router.state.location.search).get(
                'embedBackUrl',
            ),
        ).toBe(`${THREAD_PATH}?theme=dark`);
    });

    it('opens a saved chart in the side panel without a full-app link', () => {
        renderEmbedLink('chart-link', {
            href: '/projects/project-1/saved/chart-1/view',
            'data-chart-uuid': 'chart-1',
            'data-chart-source': 'saved-chart',
        });

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reference' }));

        expect(store.getState().aiArtifact.preview).toMatchObject({
            type: 'savedChart',
            savedChartUuid: 'chart-1',
            agentUuid: 'agent-1',
        });
    });

    it.each([
        ['document-link', { href: '/projects/project-1/documents/doc-1' }],
        [
            'scheduled-delivery-link',
            { href: '/projects/project-1/dashboards/d/view?scheduler_uuid=s' },
        ],
    ] satisfies [ContentType, Record<string, unknown>][])(
        'renders %s as a static reference',
        (contentType, props) => {
            renderEmbedLink(contentType, props);

            expect(screen.getByText('Reference')).toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        },
    );

    it('hides the SQL runner link', () => {
        renderEmbedLink('sql-runner-link', { href: '#' });

        expect(screen.queryByText('Reference')).not.toBeInTheDocument();
    });
});
