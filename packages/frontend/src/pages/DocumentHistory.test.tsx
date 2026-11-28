import {
    type Document,
    type DocumentVersionList,
    type DocumentVersionSummary,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { mockedLightdashApi } from '../testing/mockedLightdashApi';
import DocumentHistoryPage from './DocumentHistory';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    canEdit: true,
    flag: { data: { enabled: true }, isInitialLoading: false, isError: false },
}));

vi.unmock('@uiw/react-markdown-preview');
vi.mock('../api');
vi.mock('../features/documents/useCanEditDocument', () => ({
    useCanEditDocument: () => mocks.canEdit,
}));
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
    schemaVersion: 2,
    content: { markdown, charts: {} },
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
    verification: null,
    createdBy: null,
    owner: null,
    ownerUserUuid: null,
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
    return { router, queryClient };
};

describe('Document history page', () => {
    beforeEach(() => {
        mockedLightdashApi.mockReset();
        mocks.canEdit = true;
        mockedLightdashApi.mockImplementation(respond);
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
        expect(mockedLightdashApi).not.toHaveBeenCalledWith(
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
        const { router } = renderPage();
        const older = await screen.findByRole('button', {
            name: /^Version 1, saved/,
        });
        older.focus();
        fireEvent.click(older);
        expect(await screen.findByText('Earlier findings')).toBeInTheDocument();
        // The rail stays mounted while the version loads, so focus survives
        expect(
            screen.getByRole('button', { name: /^Version 1, saved/ }),
        ).toHaveFocus();
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

    test('compares an older version with the current one and keeps comparing across versions', async () => {
        const { router } = renderPage('?version=version-1');
        const compare = await screen.findByRole('button', {
            name: 'Compare with current version',
        });
        expect(compare).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(compare);
        expect(
            await screen.findByText(
                'Changes from version 1 to the current version 2.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('listitem', {
                name: 'removed: Earlier findings',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('listitem', { name: 'added: Current findings' }),
        ).toBeInTheDocument();
        expect(router.state.location.search).toBe(
            '?version=version-1&compare=1',
        );

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Compare with current version',
            }),
        );
        expect(await screen.findByText('Earlier findings')).toBeInTheDocument();
        expect(
            screen.queryByText(/^Changes from version/),
        ).not.toBeInTheDocument();
        expect(router.state.location.search).toBe('?version=version-1');
    });

    test('offers no comparison on the current version', async () => {
        renderPage('?compare=1');
        expect(await screen.findByText('Current findings')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Compare with current version',
            }),
        ).not.toBeInTheDocument();
    });

    test('opens a linked version directly', async () => {
        renderPage('?version=version-1');
        expect(await screen.findByText('Earlier findings')).toBeInTheDocument();
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/documents/document-uuid/versions/version-1',
            }),
        );
    });

    test('recovers from a version that cannot be loaded', async () => {
        const { router } = renderPage('?version=missing');
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
        const { router } = renderPage('?version=version-1');
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

    test('confirms a historical restore and posts its full content against the current version', async () => {
        mockedLightdashApi.mockImplementation((request) => {
            if (request.method === 'POST') {
                return Promise.resolve({
                    ...document,
                    version: versionOf(3, 'Earlier findings'),
                });
            }
            return respond(request);
        });
        const { router } = renderPage('?version=version-1&compare=1');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Restore this version' }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Restore document version',
        });
        expect(
            within(dialog).getByText(/Restore version 1 as a new version/),
        ).toBeInTheDocument();
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'POST',
            ),
        ).toHaveLength(0);
        fireEvent.click(
            within(dialog).getByRole('button', {
                name: 'Restore',
            }),
        );
        expect(await screen.findByText('Document reader')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(
            '/projects/project-slug/documents/weekly-review',
        );
        expect(mockedLightdashApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/documents/document-uuid/versions',
            method: 'POST',
            body: JSON.stringify({
                baseVersionUuid: current.versionUuid,
                content: previous.content,
            }),
        });
    });

    test('cancelling a restore never writes content', async () => {
        renderPage('?version=version-1');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Restore this version' }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Restore document version',
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'POST',
            ),
        ).toHaveLength(0);
    });

    test.each([409, 403, 400])(
        'keeps a failed restore open for HTTP %s without changing the document',
        async (statusCode) => {
            mockedLightdashApi.mockImplementation((request) =>
                request.method === 'POST'
                    ? Promise.reject({
                          status: 'error',
                          error: {
                              statusCode,
                              message: 'Cannot restore this content',
                          },
                      })
                    : respond(request),
            );
            const { router } = renderPage('?version=version-1');
            fireEvent.click(
                await screen.findByRole('button', {
                    name: 'Restore this version',
                }),
            );
            const dialog = await screen.findByRole('dialog', {
                name: 'Restore document version',
            });
            fireEvent.click(
                within(dialog).getByRole('button', {
                    name: 'Restore',
                }),
            );
            expect(
                await within(dialog).findByText(
                    statusCode === 409
                        ? /This document changed while you were restoring it/
                        : 'Cannot restore this content',
                ),
            ).toBeInTheDocument();
            expect(router.state.location.search).toBe('?version=version-1');
            expect(
                mockedLightdashApi.mock.calls.filter(
                    ([request]) => request.method === 'POST',
                ),
            ).toHaveLength(1);
            if (statusCode === 409)
                expect(
                    within(dialog).getByRole('button', {
                        name: 'Restore',
                    }),
                ).toBeDisabled();
        },
    );

    test.each(['', '?version=missing'])(
        'never offers restore for the current or unavailable version: %s',
        async (search) => {
            renderPage(search);
            await screen.findByText(
                search ? 'Version unavailable' : 'Current findings',
            );
            expect(
                screen.queryByRole('button', { name: 'Restore this version' }),
            ).not.toBeInTheDocument();
        },
    );

    test('confirmation keeps the original base version after a background document refresh', async () => {
        mockedLightdashApi.mockImplementation((request) =>
            request.method === 'POST'
                ? Promise.resolve({
                      ...document,
                      version: versionOf(4, 'Earlier findings'),
                  })
                : respond(request),
        );
        const { queryClient } = renderPage('?version=version-1');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Restore this version' }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Restore document version',
        });
        await act(() =>
            queryClient.setQueryData(
                ['document', 'project-uuid', 'weekly-review'],
                { ...document, version: versionOf(3, 'Concurrent edit') },
            ),
        );
        fireEvent.click(
            within(dialog).getByRole('button', {
                name: 'Restore',
            }),
        );
        await screen.findByText('Document reader');
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    baseVersionUuid: current.versionUuid,
                    content: previous.content,
                }),
            }),
        );
    });

    test('does not offer the previous selection while another historical version loads', async () => {
        const oldest = versionOf(0, 'Oldest findings');
        let finishLoading: (value: Document) => void = () => {};
        const pending = new Promise<Document>((resolve) => {
            finishLoading = resolve;
        });
        mockedLightdashApi.mockImplementation((request) => {
            if (request.url.endsWith('/versions/version-0')) return pending;
            if (request.url.includes('/versions?'))
                return Promise.resolve({
                    ...versionPage,
                    items: [...versionPage.items, summaryOf(oldest)],
                });
            return respond(request);
        });
        renderPage('?version=version-1');
        await screen.findByRole('button', { name: 'Restore this version' });
        fireEvent.click(
            await screen.findByRole('button', { name: /^Version 0, saved/ }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Restore this version' }),
            ).not.toBeInTheDocument(),
        );
        await act(async () => finishLoading({ ...document, version: oldest }));
        await screen.findByText('Oldest findings');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Restore this version' }),
        );
        expect(
            await screen.findByText(/Restore version 0 as a new version/),
        ).toBeInTheDocument();
    });

    test('keeps a pending restore open and prevents a second submission', async () => {
        let finishSaving: (value: Document) => void = () => {};
        const pending = new Promise<Document>((resolve) => {
            finishSaving = resolve;
        });
        mockedLightdashApi.mockImplementation((request) =>
            request.method === 'POST' ? pending : respond(request),
        );
        renderPage('?version=version-1');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Restore this version' }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Restore document version',
        });
        const restore = within(dialog).getByRole('button', {
            name: 'Restore',
        });
        fireEvent.click(restore);
        await waitFor(() => expect(restore).toBeDisabled());
        expect(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        ).toBeDisabled();
        fireEvent.click(restore);
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'POST',
            ),
        ).toHaveLength(1);
        await act(async () =>
            finishSaving({
                ...document,
                version: versionOf(3, 'Earlier findings'),
            }),
        );
        expect(await screen.findByText('Document reader')).toBeInTheDocument();
    });

    test('readers can preview history without a restore action', async () => {
        mocks.canEdit = false;
        renderPage('?version=version-1');
        expect(await screen.findByText('Earlier findings')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Restore this version' }),
        ).not.toBeInTheDocument();
    });
});
