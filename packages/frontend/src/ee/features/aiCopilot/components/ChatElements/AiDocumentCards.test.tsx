import { type AiAgentMessageAssistant } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import AiDocumentCards from './AiDocumentCards';

const DOCUMENT_UUID = '591eb352-180d-4cfd-b2ce-b4c004edb6ce';
const DOCUMENT_HREF = '/projects/jaffle-shop/documents/hello-world';
const mocks = vi.hoisted(() => ({
    projects: vi.fn(),
    projectRoute: vi.fn(),
}));
vi.mock('../../../../../hooks/useProjects', () => ({
    useProjects: mocks.projects,
}));
vi.mock('../../../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: mocks.projectRoute,
}));
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
    beforeEach(() => {
        mocks.projectRoute.mockReset();
        mocks.projectRoute.mockReturnValue(null);
        mocks.projects.mockReset();
        mocks.projects.mockReturnValue({
            data: [
                { projectUuid: 'project-1', slug: 'jaffle-shop' },
                { projectUuid: 'other-project', slug: 'other-project-slug' },
            ],
        });
    });

    it('renders saved successful results without needing model prose', () => {
        renderCards();
        expect(
            screen.getByRole('link', { name: 'Document Hello World' }),
        ).toHaveAttribute('href', DOCUMENT_HREF);
    });

    it('renders older UUID result links as canonical slug links', () => {
        renderCards([
            {
                ...result,
                metadata: {
                    ...metadata,
                    href: `/projects/project-1/documents/${DOCUMENT_UUID}`,
                },
            },
        ]);
        expect(screen.getByRole('link')).toHaveAttribute('href', DOCUMENT_HREF);
    });

    it('uses the real document UUID when its slug has a UUID shape', () => {
        const href = `/projects/jaffle-shop/documents/${DOCUMENT_UUID}`;
        renderCards([
            {
                ...result,
                metadata: {
                    ...metadata,
                    slug: '2a036ad2-36a1-43b9-bd3b-0a3b08701235',
                    href,
                },
            },
        ]);
        expect(screen.getByRole('link')).toHaveAttribute('href', href);
    });

    it('waits for a trusted project slug before rendering a slug result', () => {
        const resolved = mocks.projects();
        mocks.projects.mockReturnValue({ data: undefined });
        const content = () => (
            <MemoryRouter>
                <AiDocumentCards
                    projectUuid="project-1"
                    toolResults={[result]}
                />
            </MemoryRouter>
        );
        const { rerender } = renderWithProviders(content());
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        mocks.projects.mockReturnValue(resolved);
        rerender(content());
        expect(screen.getByRole('link')).toHaveAttribute('href', DOCUMENT_HREF);
    });

    it('does not trust a slug result when project discovery fails', () => {
        mocks.projects.mockReturnValue({ data: undefined, isError: true });
        renderCards();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('does not trust a route context from another project', () => {
        mocks.projectRoute.mockReturnValue({
            projectUuid: 'other-project',
            projectUrlIdentifier: 'other-project-slug',
        });
        renderCards([
            {
                ...result,
                metadata: {
                    ...metadata,
                    href: '/projects/other-project-slug/documents/hello-world',
                },
            },
        ]);
        expect(mocks.projects).toHaveBeenCalledWith({ enabled: true });
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('uses a matching resolved project context without fetching projects', () => {
        mocks.projectRoute.mockReturnValue({
            projectUuid: 'project-1',
            projectUrlIdentifier: 'jaffle-shop',
        });
        mocks.projects.mockReturnValue({ data: undefined });
        renderCards();
        expect(mocks.projects).toHaveBeenCalledWith({ enabled: false });
        expect(screen.getByRole('link')).toHaveAttribute('href', DOCUMENT_HREF);
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
        '/projects/other-project-slug/documents/hello-world',
        `https://external.example${DOCUMENT_HREF}`,
        `//external.example${DOCUMENT_HREF}`,
        `${DOCUMENT_HREF}/../other`,
        `${DOCUMENT_HREF}?redirect=external`,
        '/projects/project-1/documents/another-id',
    ])('excludes noncanonical or non-Document href %s', (href) => {
        renderCards([{ ...result, metadata: { ...metadata, href } }]);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it.each(['../other', '..', 'hello/world', 'hello?redirect=other', ''])(
        'rejects unsafe document slug %s even when href matches',
        (slug) => {
            renderCards([
                {
                    ...result,
                    metadata: {
                        ...metadata,
                        slug,
                        href: `/projects/jaffle-shop/documents/${slug}`,
                    },
                },
            ]);
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        },
    );

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
