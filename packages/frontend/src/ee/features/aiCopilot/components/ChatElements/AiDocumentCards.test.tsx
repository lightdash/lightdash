import { type AiAgentMessageAssistant } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import AiDocumentCards from './AiDocumentCards';

const DOCUMENT_UUID = '591eb352-180d-4cfd-b2ce-b4c004edb6ce';
const DOCUMENT_HREF = `/projects/project-1/documents/${DOCUMENT_UUID}`;
const metadata = {
    status: 'success' as const,
    uuid: DOCUMENT_UUID,
    name: 'Hello World',
    href: DOCUMENT_HREF,
    slug: 'hello-world',
    warnings: [],
};
const result: AiAgentMessageAssistant['toolResults'][number] = {
    uuid: 'result-1',
    promptUuid: 'prompt-1',
    toolCallId: 'call-1',
    toolType: 'built-in',
    toolName: 'createContent',
    createdAt: new Date(),
    result: '',
    metadata,
};
const streamPart = {
    type: 'toolCall',
    toolName: 'createContent',
    toolCallId: 'call-1',
    toolArgs: {
        type: 'dashboard',
        content: {
            name: 'Hello World',
            slug: 'hello-world',
            description: null,
            spaceSlug: 'jaffle-shop',
            version: 1,
            contentType: 'dashboard',
            verified: false,
            tiles: [],
            tabs: [],
        },
    },
    toolResult: { result: '', metadata },
} satisfies StreamPart;

const renderCards = (
    toolResults: AiAgentMessageAssistant['toolResults'] = [result],
    streamParts?: StreamPart[],
) => {
    const router = createMemoryRouter(
        [
            {
                path: '/thread',
                element: (
                    <AiDocumentCards
                        projectUuid="project-1"
                        toolResults={toolResults}
                        streamParts={streamParts}
                    />
                ),
            },
            { path: DOCUMENT_HREF, element: <div>Document page</div> },
        ],
        { initialEntries: ['/thread'] },
    );
    renderWithProviders(<RouterProvider router={router} />);
    return router;
};

describe('native Document result cards', () => {
    it('renders saved successful results without needing model prose', () => {
        renderCards();
        expect(
            screen.getByRole('link', { name: 'Document Hello World' }),
        ).toHaveAttribute('href', DOCUMENT_HREF);
    });

    it('renders completed streaming results before message persistence', () => {
        renderCards([], [streamPart]);
        expect(screen.getByRole('link')).toHaveAttribute('href', DOCUMENT_HREF);
    });

    it('deduplicates saved and streamed results and uses the latest title', () => {
        renderCards(
            [result, result],
            [
                {
                    ...streamPart,
                    toolName: 'editContent',
                    toolArgs: {
                        type: 'dashboard',
                        slug: 'hello-world',
                        patch: [],
                    },
                    toolResult: {
                        result: '',
                        metadata: {
                            ...metadata,
                            name: 'Updated title',
                            versionUuids: {
                                before: 'version-1',
                                after: 'version-2',
                            },
                        },
                    },
                },
            ],
        );
        expect(screen.getAllByRole('link')).toHaveLength(1);
        expect(screen.getByRole('link')).toHaveTextContent('Updated title');
    });

    it('renders successful edits', () => {
        renderCards([{ ...result, toolName: 'editContent' }]);
        expect(screen.getByRole('link')).toHaveAttribute('href', DOCUMENT_HREF);
    });

    it('excludes failed, read-only, and preliminary outputs', () => {
        renderCards(
            [
                { ...result, metadata: { status: 'error' } },
                { ...result, toolName: 'readContent' },
            ],
            [
                { ...streamPart, isPreliminary: true },
                { ...streamPart, toolResult: undefined },
            ],
        );
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('rejects traversal in the result identifier even when href matches', () => {
        renderCards([
            {
                ...result,
                metadata: {
                    ...metadata,
                    uuid: '../other',
                    href: '/projects/project-1/documents/../other',
                },
            },
        ]);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it.each([
        '/projects/project-1/dashboards/dashboard-1',
        `/projects/other-project/documents/${DOCUMENT_UUID}`,
        `https://external.example${DOCUMENT_HREF}`,
        `//external.example${DOCUMENT_HREF}`,
        `${DOCUMENT_HREF}/../other`,
        `${DOCUMENT_HREF}?redirect=external`,
        '/projects/project-1/documents/another-id',
    ])('excludes noncanonical or non-Document href %s', (href) => {
        renderCards([{ ...result, metadata: { ...metadata, href } }]);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('navigates directly and preserves browser Back', async () => {
        const router = renderCards();
        fireEvent.click(screen.getByRole('link'));
        expect(await screen.findByText('Document page')).toBeInTheDocument();
        expect(router.state.location.state).toBeNull();
        await router.navigate(-1);
        expect(await screen.findByRole('link')).toHaveAttribute(
            'href',
            DOCUMENT_HREF,
        );
    });

    it.each([{ ctrlKey: true }, { metaKey: true }, { button: 1 }])(
        'preserves native modified-click behavior (%j)',
        (event) => {
            const router = renderCards();
            expect(fireEvent.click(screen.getByRole('link'), event)).toBe(true);
            expect(router.state.location.pathname).toBe('/thread');
        },
    );
});
