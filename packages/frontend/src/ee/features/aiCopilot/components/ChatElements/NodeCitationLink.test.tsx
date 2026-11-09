import {
    type AiAgentMessageAssistant,
    type AiAgentThreadComposerNode,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview, selectPreview } from '../../store/aiArtifactSlice';
import { ContentLink } from './ContentLink';
import { isContentType, rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { rehypeNodeCitations } from './rehypeNodeCitations';

const message = {
    role: 'assistant',
    uuid: 'message-1',
    threadUuid: 'thread-1',
} as AiAgentMessageAssistant;

const threadNodes = [
    { nodeId: 'revenue', title: 'Total revenue' },
    { nodeId: 'orders', title: null },
];

const renderAnswer = (
    markdown: string,
    resolvedNodes: readonly AiAgentThreadComposerNode[] = threadNodes,
) =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AiMarkdown
                    rehypePlugins={[
                        rehypeAiAgentContentLinks,
                        [rehypeNodeCitations, { resolvedNodes }],
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
                            >
                                {children}
                            </ContentLink>
                        ),
                    }}
                >
                    {markdown}
                </AiMarkdown>
            </MemoryRouter>
        </Provider>,
    );

const citations = () =>
    screen.queryAllByRole('button').map((button) => button.textContent);

const openCitation = (figure: string) =>
    fireEvent.click(
        screen.getByRole('button', {
            name: `Open query result ${figure}`,
        }),
    );

describe('node citations in an answer', () => {
    beforeEach(() => {
        store.dispatch(clearPreview());
    });

    it('keeps the figure as the link text, with the node title as tooltip', () => {
        renderAnswer('Revenue was [**$404**](#query-node-revenue) in total.');

        const citation = screen.getByRole('button', {
            name: 'Open query result $404',
        });
        expect(citation).toHaveAttribute('title', 'Total revenue');
        expect(
            citation.querySelector('[data-streamdown="strong"]'),
        ).toHaveTextContent('$404');
        expect(document.body).toHaveTextContent('Revenue was $404 in total.');
    });

    it('falls back to a generic tooltip for an untitled node', () => {
        renderAnswer('[12](#query-node-orders) orders.');
        expect(
            screen.getByRole('button', { name: 'Open query result 12' }),
        ).toHaveAttribute('title', 'Query result');
    });

    it('renders an unresolved citation as plain text', () => {
        renderAnswer(
            'A [$9](#query-node-unknown) then [$1](#query-node-revenue).',
        );
        expect(citations()).toEqual(['$1']);
        expect(document.body).toHaveTextContent('A $9 then $1.');
    });

    it('renders a malformed citation as plain text', () => {
        renderAnswer('A [$9](#query-node-1nope) end.');
        expect(citations()).toEqual([]);
        expect(document.body).toHaveTextContent('A $9 end.');
    });

    it('renders every citation as plain text before the nodes are read', () => {
        renderAnswer('A [$1](#query-node-revenue).', []);
        expect(citations()).toEqual([]);
        expect(document.body).toHaveTextContent('A $1.');
    });

    it('ignores citation syntax inside code', () => {
        renderAnswer('`[Revenue](#query-node-revenue)`');
        expect(citations()).toEqual([]);
        expect(document.body).toHaveTextContent(
            '[Revenue](#query-node-revenue)',
        );
    });

    it('opens the cited node, closes on a second click, retargets on another', () => {
        renderAnswer(
            'A [$1](#query-node-revenue), B [$2](#query-node-orders).',
        );

        openCitation('$1');
        expect(selectPreview(store.getState())).toEqual({
            type: 'queryPipeline',
            nodeId: 'revenue',
            messageUuid: 'message-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
        });

        openCitation('$2');
        expect(selectPreview(store.getState())).toMatchObject({
            nodeId: 'orders',
        });

        openCitation('$2');
        expect(selectPreview(store.getState())).toBeNull();
    });
});
