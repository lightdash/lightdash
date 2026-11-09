import { type AiAgentMessageAssistant } from '@lightdash/common';
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

const renderAnswer = (
    markdown: string,
    resolvedNodeIds: readonly string[] | null = ['revenue', 'orders'],
) =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AiMarkdown
                    rehypePlugins={[
                        rehypeAiAgentContentLinks,
                        [rehypeNodeCitations, { resolvedNodeIds }],
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

const markers = () =>
    screen.queryAllByRole('button').map((button) => button.textContent);

const openMarkerByLabel = (label: string) =>
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));

describe('node citation markers', () => {
    beforeEach(() => {
        store.dispatch(clearPreview());
    });

    it('numbers citations by first appearance and reuses a repeated node', () => {
        renderAnswer(
            'A $1 [Revenue](#query-node-revenue), B 2 [Orders](#query-node-orders), again $1 [Revenue](#query-node-revenue).',
        );
        expect(markers()).toEqual(['1', '2', '1']);
    });

    it('replaces the label with the marker and keeps it as the tooltip', () => {
        renderAnswer('A $1 [Total revenue](#query-node-revenue).');
        const marker = screen.getByRole('button', {
            name: 'Open query result Total revenue',
        });
        expect(marker).toHaveAttribute('title', 'Total revenue');
        expect(document.body).not.toHaveTextContent('Total revenue');
    });

    it('drops an unresolved citation without consuming a number', () => {
        renderAnswer(
            'A [Gone](#query-node-unknown) then [Revenue](#query-node-revenue).',
        );
        expect(markers()).toEqual(['1']);
        expect(document.body).not.toHaveTextContent('Gone');
    });

    it('drops a citation with a malformed node id', () => {
        renderAnswer('A [Bad](#query-node-1nope) end.');
        expect(markers()).toEqual([]);
        expect(document.body).toHaveTextContent('A end.');
    });

    it('ignores citation syntax inside code', () => {
        renderAnswer('`[Revenue](#query-node-revenue)`');
        expect(markers()).toEqual([]);
        expect(document.body).toHaveTextContent(
            '[Revenue](#query-node-revenue)',
        );
    });

    it('shows inert, unnumbered markers while the answer is unresolved', () => {
        renderAnswer('A [Unknown](#query-node-unknown).', null);
        const marker = screen.getByRole('button', {
            name: /Open query result/,
        });
        expect(marker).toBeDisabled();
        expect(marker).toHaveTextContent('·');
    });

    it('opens the cited node, closes on a second click, retargets on another', () => {
        renderAnswer(
            'A [Revenue](#query-node-revenue), B [Orders](#query-node-orders).',
        );

        openMarkerByLabel('Revenue');
        expect(selectPreview(store.getState())).toEqual({
            type: 'queryPipeline',
            nodeId: 'revenue',
            messageUuid: 'message-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
        });

        openMarkerByLabel('Orders');
        expect(selectPreview(store.getState())).toMatchObject({
            nodeId: 'orders',
        });

        openMarkerByLabel('Orders');
        expect(selectPreview(store.getState())).toBeNull();
    });
});
