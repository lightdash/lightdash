import { type AiAgentMessageAssistant } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview } from '../../store/aiArtifactSlice';
import { ContentLink } from './ContentLink';
import { MEMORY_CITATION_ALLOWED_TAGS } from './memoryCitationConfig';
import { isContentType, rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { rehypeQueryNodeReferences } from './rehypeQueryNodeReferences';

const message: AiAgentMessageAssistant = {
    role: 'assistant',
    status: 'idle',
    uuid: 'message-1',
    threadUuid: 'thread-1',
    message: null,
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-10-27T09:00:00.000Z',
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
    loadout: null,
};

const renderAnswer = (
    markdown: string,
    hasPreviewPane: boolean,
    isStreaming = false,
) => {
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <AiMarkdown
                    isStreaming={isStreaming}
                    allowedTags={MEMORY_CITATION_ALLOWED_TAGS}
                    rehypePlugins={[
                        rehypeAiAgentContentLinks,
                        rehypeQueryNodeReferences,
                    ]}
                    components={{
                        a: ({ node, children, ...props }) => (
                            <ContentLink
                                contentType={
                                    'data-content-type' in props &&
                                    isContentType(props['data-content-type'])
                                        ? props['data-content-type']
                                        : undefined
                                }
                                props={props}
                                message={message}
                                projectUuid="project-1"
                                agentUuid="agent-1"
                                hasPreviewPane={hasPreviewPane}
                            >
                                {children}
                            </ContentLink>
                        ),
                    }}
                >
                    {markdown}
                </AiMarkdown>
            ),
        },
    ]);
    renderWithProviders(
        <Provider store={store}>
            <RouterProvider router={router} />
        </Provider>,
    );
};

describe('Query node references', () => {
    beforeEach(() => store.dispatch(clearPreview()));

    it('renders numbered chips without the label and opens the query', () => {
        renderAnswer(
            'Revenue was $404 [revenue](#query-node-revenue) from 12 [orders](#query-node-orders), $404 [again](#query-node-revenue).',
            true,
        );
        const chips = screen.getAllByRole('button', { name: /Open query/ });
        expect(chips.map((chip) => chip.textContent)).toEqual(['1', '2', '1']);
        expect(screen.queryByText('orders')).not.toBeInTheDocument();

        fireEvent.click(chips[1]);
        expect(store.getState().aiArtifact.preview).toEqual({
            type: 'queryPipeline',
            nodeId: 'orders',
            messageUuid: 'message-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
        });
    });

    it('renders a static chip without a preview pane', () => {
        renderAnswer('Revenue was $404 [revenue](#query-node-revenue).', false);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('renders no chip for a link still streaming', () => {
        renderAnswer('Revenue was $404 [revenue](#query-node-rev', true, true);
        expect(screen.getByText(/Revenue was \$404/)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
