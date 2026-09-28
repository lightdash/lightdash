import {
    type Document,
    type DocumentVersionList,
    type DocumentVersionSummary,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import DocumentHistoryPage from './DocumentHistory';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    flag: { data: { enabled: true }, isInitialLoading: false, isError: false },
}));

vi.unmock('@uiw/react-markdown-preview');
vi.mock('../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-slug',
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => mocks.flag,
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({
        children,
        header,
    }: {
        children: ReactNode;
        header: ReactNode;
    }) => (
        <main>
            {header}
            {children}
        </main>
    ),
}));

const author = {
    userUuid: 'user-uuid',
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatarUrl: null,
    avatarGradient: null,
};

const versionOf = (
    versionNumber: number,
    markdown: string,
): Document['version'] => ({
    versionUuid: `version-${versionNumber}`,
    versionNumber,
    schemaVersion: 1,
    content: { cells: [{ type: 'markdown', content: { markdown } }] },
    createdAt: new Date(`2026-09-1${versionNumber}T10:00:00`),
    createdByUserUuid: author.userUuid,
});

const summaryOf = (
    version: Document['version'],
    createdBy: DocumentVersionSummary['createdBy'] = author,
): DocumentVersionSummary => ({
    versionUuid: version.versionUuid,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt,
    createdBy,
});

const current = versionOf(2, 'Current findings');
const previous = versionOf(1, 'Earlier findings');

const document: Document = {
    pinnedListUuid: null,
    createdBy: null,
    documentUuid: 'document-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    spaceUuid: 'space-uuid',
    name: 'Weekly review',
    slug: 'weekly-review',
    description: '',
    createdAt: new Date('2026-09-11'),
    updatedAt: new Date('2026-09-12'),
    createdByUserUuid: null,
    version: current,
};

const versionPage: DocumentVersionList = {
    items: [summaryOf(current), summaryOf(previous, null)],
    nextOffset: null,
};

const respond = ({ url }: { url: string }) => {
    if (url.endsWith('/documents/weekly-review')) {
        return Promise.resolve(document);
    }
    if (url.includes('/versions?')) {
        return Promise.resolve(versionPage);
    }
    if (url.endsWith('/versions/version-1')) {
        return Promise.resolve({ ...document, version: previous });
    }
    return Promise.reject(new Error('Version not found'));
};

const renderPage = (search = '') => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/documents/:documentUuidOrSlug/history',
                element: <DocumentHistoryPage />,
            },
            {
                path: '/projects/:projectUuid/documents/:documentUuidOrSlug',
                element: <div>Document reader</div>,
            },
            {
                path: '/projects/:projectUuid/home',
                element: <div>Project home</div>,
            },
        ],
        {
            initialEntries: [
                `/projects/project-slug/documents/weekly-review/history${search}`,
            ],
        },
    );
    render(
        <QueryClientProvider client={queryClient}>
            <MantineProvider env="test">
                <RouterProvider router={router} />
            </MantineProvider>
        </QueryClientProvider>,
    );
    return router;
};

describe('Document history page', () => {
    beforeEach(() => {
        mocks.api.mockReset();
        mocks.api.mockImplementation(respond);
        mocks.flag = {
            data: { enabled: true },
            isInitialLoading: false,
            isError: false,
        };
    });

    test('shows the current version by default without a version request', async () => {
        renderPage();
        expect(await screen.findByText('Current findings')).toBeInTheDocument();
        expect(
            (await screen.findByText('Current version 2')).closest(
                '[role="status"]',
            ),
        ).not.toBeNull();
        const versions = screen.getByRole('group', {
            name: 'Document versions',
        });
        expect(versions).toHaveTextContent('Current');
        expect(
            screen.getByRole('button', { name: /^Version 2, saved/ }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: /^Version 1, saved/ }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(mocks.api).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining('/versions/'),
            }),
        );
    });

    test('names authors and falls back for a deleted author', async () => {
        renderPage();
        expect(
            await screen.findByRole('button', {
                name: /^Version 2, saved .+ by Ada Lovelace$/,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: /^Version 1, saved .+ by Unknown user$/,
            }),
        ).toBeInTheDocument();
    });

    test('selecting an older version renders its content and records it in the URL', async () => {
        const router = renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: /^Version 1, saved/ }),
        );
        expect(await screen.findByText('Earlier findings')).toBeInTheDocument();
        expect(screen.queryByText('Current findings')).not.toBeInTheDocument();
        expect(router.state.location.search).toBe('?version=version-1');
        expect(
            (await screen.findByText('Version 1')).closest('[role="status"]'),
        ).not.toBeNull();
        expect(
            screen.getByRole('heading', { name: 'Weekly review', level: 1 }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit document' }),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: /^Version 2, saved/ }),
        );
        expect(await screen.findByText('Current findings')).toBeInTheDocument();
        expect(router.state.location.search).toBe('');
    });

    test('opens a linked version directly', async () => {
        renderPage('?version=version-1');
        expect(await screen.findByText('Earlier findings')).toBeInTheDocument();
        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/documents/document-uuid/versions/version-1',
            }),
        );
    });

    test('recovers from a version that cannot be loaded', async () => {
        const router = renderPage('?version=missing');
        expect(
            await screen.findByText('Version unavailable'),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Show current version' }),
        );
        expect(await screen.findByText('Current findings')).toBeInTheDocument();
        expect(router.state.location.search).toBe('');
    });

    test('closes back to the document reader', async () => {
        const router = renderPage('?version=version-1');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Close version history',
            }),
        );
        expect(await screen.findByText('Document reader')).toBeInTheDocument();
        await waitFor(() =>
            expect(router.state.location.pathname).toBe(
                '/projects/project-slug/documents/weekly-review',
            ),
        );
    });

    test('fails closed when the feature flag is off', async () => {
        mocks.flag = {
            data: { enabled: false },
            isInitialLoading: false,
            isError: false,
        };
        renderPage();
        expect(await screen.findByText('Project home')).toBeInTheDocument();
        expect(mocks.api).not.toHaveBeenCalled();
    });
});
