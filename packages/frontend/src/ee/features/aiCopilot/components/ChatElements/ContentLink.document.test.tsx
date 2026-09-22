import { type AiAgentMessageAssistant } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview } from '../../store/aiArtifactSlice';
import { ContentLink } from './ContentLink';

const DOCUMENT_HREF = '/projects/project-1/documents/document-1';
const THREAD_HREF = '/projects/project-1/ai-agents/agent-1/threads/thread-1';
const message: AiAgentMessageAssistant = {
    role: 'assistant',
    status: 'idle',
    uuid: 'message-1',
    threadUuid: 'thread-1',
    message: 'Here is your document',
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-09-16T09:00:00.000Z',
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
    quickReplies: [],
};

const renderDocumentLink = () => {
    const onDashboardLinkClick = vi.fn();
    const router = createMemoryRouter(
        [
            {
                path: THREAD_HREF,
                element: (
                    <ContentLink
                        contentType="document-link"
                        props={{ href: DOCUMENT_HREF }}
                        message={message}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        onDashboardLinkClick={onDashboardLinkClick}
                    >
                        Hello World
                    </ContentLink>
                ),
            },
            { path: DOCUMENT_HREF, element: <div>Document page</div> },
        ],
        { initialEntries: [THREAD_HREF] },
    );
    renderWithProviders(
        <Provider store={store}>
            <RouterProvider router={router} />
        </Provider>,
    );
    return { router, onDashboardLinkClick };
};

describe('Document content links', () => {
    beforeEach(() => store.dispatch(clearPreview()));

    it('opens the dedicated page without preview state or dashboard callbacks', async () => {
        const { router, onDashboardLinkClick } = renderDocumentLink();
        const link = screen.getByRole('link', { name: 'Hello World' });
        expect(link).toHaveAttribute('href', DOCUMENT_HREF);
        expect(link).not.toHaveAttribute('target');
        fireEvent.click(link);

        expect(await screen.findByText('Document page')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(DOCUMENT_HREF);
        expect(router.state.location.state).toBeNull();
        expect(store.getState().aiArtifact.preview).toBeNull();
        expect(onDashboardLinkClick).not.toHaveBeenCalled();

        await router.navigate(-1);
        expect(
            await screen.findByRole('link', { name: 'Hello World' }),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(THREAD_HREF);
    });

    it.each([{ ctrlKey: true }, { metaKey: true }, { button: 1 }])(
        'preserves modified-click browser behavior (%j)',
        (event) => {
            const { router } = renderDocumentLink();
            expect(
                fireEvent.click(
                    screen.getByRole('link', { name: 'Hello World' }),
                    event,
                ),
            ).toBe(true);
            expect(router.state.location.pathname).toBe(THREAD_HREF);
            expect(store.getState().aiArtifact.preview).toBeNull();
        },
    );
});
